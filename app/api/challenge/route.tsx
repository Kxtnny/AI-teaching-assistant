// app/api/challenge/route.tsx  (v9)
// GROVE · Challenge — refactored:
//   - MCQ mode: student picks how many questions (5 / 7 / 10). No timer.
//     Per-correct points scale so a perfect run = 100. Dedup of stems prevents repeats.
//   - Open mode: student picks an "explain like I'm a ___" level (kid / teen / adult).
//     The LLM's question and grading rubric vary by level; per-turn points vary naturally
//     since the rubric is stricter for higher levels.
//   - No timer. Open mode also accepts a manual `end_session` action so the student can
//     wrap up whenever they're satisfied with their tree.
//   - Tree maxes at 100 (unchanged), so stage progression and visuals stay identical.

import { NextRequest, NextResponse } from "next/server";
import { SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import path from "path";
import fsp from "fs/promises";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const llm = new ChatOpenAI({ modelName: MODEL, temperature: 0.3, openAIApiKey: process.env.OPENAI_API_KEY });
const llmFast = new ChatOpenAI({ modelName: MODEL, temperature: 0.7, maxTokens: 400, openAIApiKey: process.env.OPENAI_API_KEY });
// note: bumped temperature slightly for more question variety

const MAX_POINTS = 100;
const OPEN_DURATION = 180;   // open mode is timed (3 minutes); MCQ is untimed
const MAX_TURNS_OPEN = 20;   // safety cap so open mode doesn't run forever within the timer
type Verdict = "good" | "bad" | "neutral";
type QType = "clarity" | "precision" | "accuracy" | "relevance" | "depth" | "breadth" | "logic";
type Level = "kid" | "teen" | "adult";
const QUESTION_TYPES: QType[] = ["clarity", "precision", "accuracy", "relevance", "depth", "breadth", "logic"];

// ── storage ───────────────────────────────────────────────────────────────────
const DATA_DIR = path.resolve(process.cwd(), "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
function libPath(creator?: string) {
  return creator === "teacher" ? path.join(DATA_DIR, "teachersdata", "library.json") : path.join(DATA_DIR, "library.json");
}
async function loadLibrary(creator?: string): Promise<any[]> {
  try { return JSON.parse(await fsp.readFile(libPath(creator), "utf-8")); } catch { return []; }
}
async function getMemory(lectureId: string, creator: string): Promise<{ title: string; memory: string } | null> {
  const lec = (await loadLibrary(creator)).find((l: any) => l.lecture_id === lectureId);
  if (!lec || lec.status !== "Ready" || !lec.memory_path) return null;
  try { return { title: lec.title, memory: await fsp.readFile(lec.memory_path, "utf-8") }; } catch { return null; }
}
function sPath(id: string) { return path.join(SESSIONS_DIR, id.replace(/[:]/g, "_") + ".json"); }
async function loadSession(id: string): Promise<any | null> {
  try { return JSON.parse(await fsp.readFile(sPath(id), "utf-8")); } catch { return null; }
}
async function saveSession(s: any) { await fsp.mkdir(SESSIONS_DIR, { recursive: true }); await fsp.writeFile(sPath(s.sessionId), JSON.stringify(s, null, 2)); }
function extractJSON(text: string): any {
  const c = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(c); } catch {}
  const m = c.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error("no json");
}

// ── runtime ───────────────────────────────────────────────────────────────────
type Listener = (msg: any) => void;
interface Room {
  sessionId: string; topic: string; lectureId: string; creator: string; studentName: string;
  memory: string; transcript: string;
  format: "mcq" | "open"; phase: "explaining" | "feedback";
  startTime: number; totalPoints: number;
  turns: any[]; lastQuestion: string | null; lastType: QType | null; lastMCQ: any | null; summary: string | null;
  msgs: any[];
  // mcq-specific
  questionCount: number;       // total to ask (5 / 7 / 10)
  askedCount: number;          // how many we've already asked
  askedStems: string[];        // dedup memory (lowercase, trimmed)
  // open-specific
  level: Level;
}
const g = globalThis as any;
if (!g.gRooms) g.gRooms = new Map<string, Room>();
if (!g.gSubs) g.gSubs = new Map<string, Set<Listener>>();
const rooms: Map<string, Room> = g.gRooms;
const subs: Map<string, Set<Listener>> = g.gSubs;

const now = () => Date.now();
// open mode only — seconds remaining; mcq has no timer
const timeLeft = (r: Room) => (r.format !== "open" || !r.startTime ? 0 : Math.max(0, OPEN_DURATION - Math.floor((now() - r.startTime) / 1000)));
function broadcast(r: Room, msg: any) { r.msgs.push(msg); subs.get(r.sessionId)?.forEach((fn) => fn(msg)); }
const sendBot = (r: Room, content: string) => broadcast(r, { id: `f-${now()}-${Math.random().toString(36).slice(2, 6)}`, role: "facilitator", kind: "text", content, ts: now() });
const sendStatus = (r: Room) => broadcast(r, {
  kind: "status",
  totalPoints: r.totalPoints, maxPoints: MAX_POINTS,
  progress: r.format === "mcq" ? { asked: r.askedCount, total: r.questionCount } : null,
  level: r.format === "open" ? r.level : null,
  remainingTime: r.format === "open" ? timeLeft(r) : null,
  ts: now(),
});
const sendMCQ = (r: Room, mcq: any, qType: QType) => broadcast(r, {
  id: `q-${now()}`, role: "facilitator", kind: "mcq",
  content: mcq.stem, options: mcq.options, qType,
  number: r.askedCount + 1, total: r.questionCount,
  ts: now(),
});

async function persist(r: Room, phase: "challenge" | "summary" = "challenge") {
  let s = await loadSession(r.sessionId);
  if (!s) s = { sessionId: r.sessionId, studentName: r.studentName, lectureId: r.lectureId, creator: r.creator, topic: r.topic, createdAt: now(), primer: null };
  s.treePoints = r.totalPoints;
  s.phase = phase;
  s.assessment = {
    format: r.format, phase: r.phase, startTime: r.startTime,
    turns: r.turns, totalPoints: r.totalPoints, summary: r.summary,
    questionCount: r.questionCount, askedCount: r.askedCount, level: r.level,
  };
  await saveSession(s);
}

function pickNextType(turns: any[], lastType: QType | null): QType {
  const recent = turns.slice(-4);
  const good = recent.filter((t) => t.verdict === "good").length;
  const bad = recent.length - good;
  const pool: QType[] = bad >= 3 ? ["clarity", "precision", "accuracy", "relevance"] : good >= 2 ? ["depth", "breadth", "logic", "precision"] : QUESTION_TYPES;
  const filtered = lastType ? pool.filter((t) => t !== lastType) : pool;
  const arr = filtered.length ? filtered : pool;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Level guide — used in both question generation and answer grading.
function levelGuide(level: Level): string {
  return level === "kid"
    ? "The student wants questions and grading suited to a curious 8–10 year old. Use simple, everyday language. Reward concrete examples and analogies; do NOT expect technical terminology or depth."
    : level === "teen"
    ? "The student wants questions and grading suited to a high-school learner. Allow some technical terms but keep them grounded. Reward clear reasoning over jargon."
    : "The student wants questions and grading suited to a college/adult learner. Expect precise terminology, conceptual depth, and accurate technical detail.";
}

// ── question generation ──────────────────────────────────────────────────────
async function generateQuestion(r: Room, targetType: QType) {
  const recent = r.turns.slice(-3).map((t) => `Q: "${t.question}" → A: "${t.answer}" (${t.verdict})`).join("\n");
  const avoid = r.askedStems.length
    ? `\nAVOID these previously-asked questions (must be meaningfully different):\n${r.askedStems.slice(-8).map((s) => `- "${s}"`).join("\n")}`
    : "";
  const prompt = `You are an encouraging tutor. Generate ONE short Socratic question (max 15 words) about "${r.topic}".
${levelGuide(r.level)}
Question type: ${targetType}
Student's understanding so far: ${r.summary || "beginner"}
${recent ? `Recent answers:\n${recent}` : ""}${avoid}
Make it short, clear, encouraging, based on the lecture, and meaningfully different from any prior question.
Lecture context: ${r.memory.slice(0, 1000)}
Recently discussed (student's own words): ${r.transcript.slice(-600)}
Return ONLY: {"questionType":"${targetType}","question":"..."}`;
  try {
    const res = await llmFast.invoke([new SystemMessage(prompt)]);
    const obj = extractJSON(res.content as string);
    return { type: QUESTION_TYPES.includes(obj.questionType) ? obj.questionType : targetType, question: String(obj.question || "What else can you tell me?").slice(0, 150) };
  } catch {
    return { type: targetType, question: "Can you tell me more about that?" };
  }
}

async function generateMCQ(r: Room, targetType: QType) {
  const avoid = r.askedStems.length
    ? `\nAVOID these previously-asked stems (must be meaningfully different — different concept, not just rephrased):\n${r.askedStems.map((s) => `- "${s}"`).join("\n")}`
    : "";
  const prompt = `Generate ONE multiple-choice question about "${r.topic}" grounded in the lecture content.
Focus: ${targetType}.${avoid}
Rules: stem under 20 words; exactly 4 options; only ONE correct; plausible distractors; correctIndex is 0-based.
Lecture context: ${r.memory.slice(0, 1200)}
Recently discussed: ${r.transcript.slice(-500)}
Return ONLY: {"stem":"...","options":["a","b","c","d"],"correctIndex":0,"rationale":"one sentence"}`;
  try {
    const res = await llmFast.invoke([new SystemMessage(prompt)]);
    const obj = extractJSON(res.content as string);
    const options = Array.isArray(obj.options) ? obj.options.slice(0, 4).map((o: any) => String(o)) : [];
    while (options.length < 4) options.push("None of the above");
    let ci = Number(obj.correctIndex); if (!(ci >= 0 && ci < 4)) ci = 0;
    return { stem: String(obj.stem || `What is a key idea in ${r.topic}?`).slice(0, 160), options, correctIndex: ci, rationale: String(obj.rationale || "").slice(0, 200) };
  } catch {
    return { stem: `Which statement best relates to "${r.topic}"?`, options: ["A core concept from the lecture", "Unrelated to the lecture", "Never mentioned", "Contradicts the lecture"], correctIndex: 0, rationale: "The lecture introduces this as a core concept." };
  }
}

// ── grading ──────────────────────────────────────────────────────────────────
function mcqPointsCorrect(r: Room) { return Math.floor(MAX_POINTS / Math.max(1, r.questionCount)); }
function gradeMCQ(picked: number, correct: number, perCorrect: number) {
  return picked === correct
    ? { verdict: "good" as Verdict, points: perCorrect, feedback: "Correct — nicely done!" }
    : { verdict: "neutral" as Verdict, points: 2, feedback: "Not quite — review the idea." };
}

async function evaluateAnswer(r: Room, question: string, answer: string) {
  const prompt = `Grade this answer about "${r.topic}" against the lecture. Be GENEROUS and ENCOURAGING within the level expectations below.
${levelGuide(r.level)}
Lecture: ${r.memory.slice(0, 2500)}
Student Summary: ${r.summary || "none"}
Question: "${question}"
Answer: "${answer}"
"good" = meets the level's expectations (score 7-10), "neutral" = partial (4-7), "bad" = only if clearly wrong or off-topic (1-4).
Return ONLY: {"verdict":"good|neutral|bad","score":0-10,"feedback":"max 25 words, encouraging"}`;
  try {
    const res = await llm.invoke([new SystemMessage(prompt)]);
    const obj = extractJSON(res.content as string);
    const verdict: Verdict = ["good", "neutral", "bad"].includes(obj.verdict) ? obj.verdict : "neutral";
    let score = Math.max(0, Math.min(10, Number(obj.score) || 5));
    if (verdict === "neutral" && score >= 5) score = Math.min(7, score + 1);
    if (verdict === "good" && score < 8) score = Math.max(7, score);
    return { verdict, score, feedback: String(obj.feedback || "Good effort!").slice(0, 200) };
  } catch {
    return { verdict: "neutral" as Verdict, score: 5, feedback: "Good effort! Add more specifics from the lecture." };
  }
}
const pointsFor = (verdict: Verdict, score: number) =>
  verdict === "good" ? Math.min(14, 8 + Math.floor(score * 0.6)) : verdict === "neutral" ? Math.min(7, Math.floor(score * 0.7)) : score >= 3 ? 1 : 0;

// ── feedback ─────────────────────────────────────────────────────────────────
async function generateFeedback(r: Room, timeSpent: number) {
  const good = r.turns.filter((t) => t.verdict === "good").length;
  const neutral = r.turns.filter((t) => t.verdict === "neutral").length;
  const bad = r.turns.filter((t) => t.verdict === "bad").length;
  const turnsText = r.turns.map((t, i) => `${i + 1}. [${t.verdict}] Q: ${t.question}\n   A: ${t.answer}\n   ${t.feedback} (+${t.points})`).join("\n\n");
  const mins = Math.floor(timeSpent / 60), secs = timeSpent % 60;
  const modeNote = r.format === "mcq"
    ? `Format: multiple choice — ${r.askedCount} of ${r.questionCount} questions answered`
    : `Format: open reflection at "${r.level}" level (explain like I'm a ${r.level})`;
  const prompt = `Write an encouraging learning report for a student who practiced "${r.topic}".
${modeNote}
Time: ${mins}m ${secs}s | Score: ${r.totalPoints}/${MAX_POINTS} | Answers: ${good} great, ${neutral} okay, ${bad} needs work
Summary: ${r.summary || "none"}
Turns:\n${turnsText || "none"}
Lecture Reference:\n${r.memory.slice(0, 1500)}
Write EXACT sections: 1) Overall (2-3 sentences) 2) Strengths (3 bullets) 3) Areas to grow (2-3 bullets) 4) Key concepts (2-3 simple paragraphs) 5) Practice plan (3-5 numbered steps). Warm, specific, no markdown.`;
  try {
    const res = await llmFast.invoke([new SystemMessage(prompt)]);
    return (res.content as string)?.trim() || `Great effort on "${r.topic}"! Score: ${r.totalPoints}/${MAX_POINTS}.`;
  } catch {
    return `Great work on "${r.topic}"! Score: ${r.totalPoints}/${MAX_POINTS}. Review the lecture and practice explaining the main ideas aloud.`;
  }
}

async function endSession(r: Room, headline: string) {
  r.phase = "feedback";
  const timeSpent = Math.floor((now() - r.startTime) / 1000);
  const fb = await generateFeedback(r, timeSpent);
  broadcast(r, { kind: "ended", headline, feedback: fb, totalPoints: r.totalPoints, ts: now() });
  await persist(r, "summary");
}

// ── ask-next helpers ─────────────────────────────────────────────────────────
async function askNextMCQ(r: Room) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = pickNextType(r.turns, r.lastType);
    const mcq = await generateMCQ(r, t);
    const key = mcq.stem.toLowerCase().trim();
    if (!r.askedStems.includes(key) || attempt === 2) {
      r.askedStems.push(key);
      r.lastMCQ = mcq; r.lastQuestion = mcq.stem; r.lastType = t;
      sendMCQ(r, mcq, t);
      return;
    }
  }
}
async function askNextOpen(r: Room) {
  const t = pickNextType(r.turns, r.lastType);
  const q = await generateQuestion(r, t);
  r.askedStems.push(q.question.toLowerCase().trim());
  r.lastQuestion = q.question; r.lastType = q.type;
  sendBot(r, `(${q.type}) ${q.question}`);
}

// ── API ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const sessionId = q.get("sessionId")?.trim() || "";

  if (q.has("session")) {
    const r = rooms.get(sessionId);
    if (!r) return NextResponse.json({ inSession: false });
    return NextResponse.json({
      inSession: true, phase: r.phase,
      totalPoints: r.totalPoints, maxPoints: MAX_POINTS,
      progress: r.format === "mcq" ? { asked: r.askedCount, total: r.questionCount } : null,
      level: r.format === "open" ? r.level : null,
      remainingTime: r.format === "open" ? timeLeft(r) : null,
      feedbackReady: r.phase === "feedback",
    });
  }

  if (q.has("stream")) {
    if (!sessionId) return new Response("sessionId required", { status: 400 });
    const r = rooms.get(sessionId);
    if (!r) return new Response("No session", { status: 400 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(": connected\n\n"));
        for (const m of r.msgs) controller.enqueue(encoder.encode(`data: ${JSON.stringify(m)}\n\n`));
        const listener: Listener = (msg) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`)); } catch { subs.get(sessionId)?.delete(listener); } };
        if (!subs.has(sessionId)) subs.set(sessionId, new Set());
        subs.get(sessionId)!.add(listener);
        const hb = setInterval(() => { try { controller.enqueue(encoder.encode(": hb\n\n")); } catch {} }, 30000);
        (controller as any)._cleanup = () => { clearInterval(hb); subs.get(sessionId)?.delete(listener); };
      },
      cancel(controller) { (controller as any)._cleanup?.(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const action: string = b?.action;
    const sessionId: string = b?.sessionId;

    // ── start ────────────────────────────────────────────────────────────
    if (action === "start_session") {
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      const format: "mcq" | "open" = b?.format === "mcq" ? "mcq" : "open";
      const creator = b?.creator === "teacher" ? "teacher" : "student";
      const lectureId = String(b?.lectureId || "");
      const session = await loadSession(sessionId);
      const lec = await getMemory(lectureId || session?.lectureId, creator || session?.creator);
      if (!lec) return NextResponse.json({ error: "lecture not found" }, { status: 404 });

      const reqCount = Number(b?.questionCount);
      const questionCount = [5, 7, 10].includes(reqCount) ? reqCount : 7;
      const reqLevel = b?.level;
      const level: Level = ["kid", "teen", "adult"].includes(reqLevel) ? reqLevel : "teen";

      const r: Room = {
        sessionId,
        topic: String(b?.topic || session?.topic || lec.title),
        lectureId: lectureId || session?.lectureId,
        creator: creator || session?.creator || "student",
        studentName: String(b?.studentName || session?.studentName || "anon"),
        memory: lec.memory,
        transcript: String(b?.transcript || ""),
        format, phase: "explaining", startTime: now(),
        totalPoints: Number(session?.treePoints) || 0,
        turns: [], lastQuestion: null, lastType: null, lastMCQ: null, summary: null, msgs: [],
        questionCount, askedCount: 0, askedStems: [],
        level,
      };
      rooms.set(sessionId, r);
      await persist(r);

      if (format === "mcq") {
        sendBot(r, `Welcome ${r.studentName}. ${questionCount} questions on "${r.topic}" — pick the best answer for each.`);
        await askNextMCQ(r);
      } else {
        const audience = level === "kid" ? "kid" : level === "teen" ? "teenager" : "fellow adult";
        sendBot(r, `Welcome ${r.studentName}. Topic: "${r.topic}". You have 3 minutes — explain it to me as if I were a ${audience}.`);
        sendBot(r, `Start with a brief summary of "${r.topic}" in your own words.`);
      }
      sendStatus(r);
      await persist(r);
      return NextResponse.json({ ok: true, startTime: r.startTime, duration: format === "open" ? OPEN_DURATION : null, totalPoints: r.totalPoints, format, questionCount, level });
    }

    if (action === "reset") { if (sessionId) rooms.delete(sessionId); return NextResponse.json({ ok: true }); }

    const r = rooms.get(sessionId);
    if (!r) return NextResponse.json({ error: "No session" }, { status: 400 });

    // ── manual end (open mode "Done" button, or early exit) ──────────────
    if (action === "end_session") {
      if (r.phase === "feedback") return NextResponse.json({ ok: true, alreadyEnded: true });
      await endSession(r, r.format === "mcq" ? "Challenge ended." : "Wrapping up — let's see your tree.");
      return NextResponse.json({ ok: true, sessionEnded: true });
    }

    // ── MCQ answer ───────────────────────────────────────────────────────
    if (r.format === "mcq") {
      const picked = Number(b?.pickedIndex);
      const mcq = r.lastMCQ;
      if (!mcq || !(picked >= 0 && picked < mcq.options.length)) return NextResponse.json({ error: "pickedIndex required" }, { status: 400 });
      broadcast(r, { id: `s-${now()}`, role: "student", content: mcq.options[picked], ts: now() });

      const perCorrect = mcqPointsCorrect(r);
      const res = gradeMCQ(picked, mcq.correctIndex, perCorrect);
      r.totalPoints = Math.min(MAX_POINTS, r.totalPoints + res.points);
      r.askedCount += 1;
      r.turns.push({ questionType: r.lastType || "accuracy", question: mcq.stem, answer: mcq.options[picked], verdict: res.verdict, points: res.points, feedback: res.feedback });
      sendBot(r, `${res.feedback}${mcq.rationale ? ` ${mcq.rationale}` : ""} ${res.points > 0 ? `+${res.points}` : ""}`);
      sendStatus(r); await persist(r);

      if (r.askedCount >= r.questionCount) {
        const headline = r.totalPoints >= MAX_POINTS ? "Perfect — your tree is in full bloom!" : "All questions complete — well done!";
        await endSession(r, headline);
        return NextResponse.json({ ok: true, sessionEnded: true });
      }
      await askNextMCQ(r); sendStatus(r); await persist(r);
      return NextResponse.json({ ok: true });
    }

    // ── Open answer ──────────────────────────────────────────────────────
    // timer enforcement: if the 3 minutes elapsed, wrap up instead of grading
    if (r.format === "open" && timeLeft(r) <= 0) {
      await endSession(r, "Time's up — great effort!");
      return NextResponse.json({ ok: true, sessionEnded: true });
    }
    const content = String(b?.content || "").trim();
    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
    broadcast(r, { id: `s-${now()}`, role: "student", content, ts: now() });

    if (!r.summary) {
      r.summary = content;
      const bonus = r.level === "kid" ? 3 : r.level === "teen" ? 5 : 7;
      r.totalPoints = Math.min(MAX_POINTS, r.totalPoints + bonus);
      sendBot(r, `Great start — +${bonus} to get your tree going. Now let's deepen it.`);
      sendStatus(r); await askNextOpen(r); sendStatus(r); await persist(r);
      return NextResponse.json({ ok: true });
    }

    const ev = await evaluateAnswer(r, r.lastQuestion || "", content);
    const pts = pointsFor(ev.verdict, ev.score);
    r.totalPoints = Math.min(MAX_POINTS, r.totalPoints + pts);
    r.turns.push({ questionType: r.lastType || "accuracy", question: r.lastQuestion || "", answer: content, verdict: ev.verdict, points: pts, feedback: ev.feedback });
    sendBot(r, `${pts > 0 ? `+${pts} · ` : ""}${ev.feedback}`);
    sendStatus(r); await persist(r);

    if (r.totalPoints >= MAX_POINTS) {
      await endSession(r, "Amazing — perfect score!");
      return NextResponse.json({ ok: true, sessionEnded: true });
    }
    if (r.turns.length >= MAX_TURNS_OPEN) {
      await endSession(r, "Great session — let's review your tree.");
      return NextResponse.json({ ok: true, sessionEnded: true });
    }
    await askNextOpen(r); sendStatus(r); await persist(r);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[challenge] error:", e);
    return NextResponse.json({ error: e?.message || "server error" }, { status: 500 });
  }
}