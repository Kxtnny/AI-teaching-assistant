import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import fs from "fs/promises";
import path from "path";

// Types
type Verdict = "good" | "bad" | "neutral";
type QuestionType = "clarity" | "precision" | "accuracy" | "relevance" | "depth" | "breadth" | "logic";
type Listener = (msg: any) => void;

interface Turn {
  questionType: QuestionType;
  question: string;
  answer: string;
  verdict: Verdict;
  points: number;
  feedback: string;
}

interface RoomState {
  id: string;
  topic: string;
  lectureId: string;
  msgs: any[];
  subs: Set<Listener>;
  phase: "init" | "explaining" | "feedback";
  startTime: number;
  summary: string | null;
  turns: Turn[];
  totalPoints: number;
  lastQuestion: string | null;
  lastType: QuestionType | null;
}

// Paths
const DATA_DIR = path.resolve(process.cwd(), "data", "teachersdata");
const LIBRARY_PATH = path.join(DATA_DIR, "library.json");
const QUESTION_TYPES: QuestionType[] = ["clarity", "precision", "accuracy", "relevance", "depth", "breadth", "logic"];
const SESSION_DURATION = 180;
const MAX_POINTS = 100;

// LLM
const llm = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature: 0.3,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

const llmFast = new ChatOpenAI({
  modelName: process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature: 0,
  maxTokens: 300,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Global state
const g = globalThis as any;
if (!g.rooms) g.rooms = new Map<string, RoomState>();
if (!g.userRoom) g.userRoom = new Map<string, string>();

// ---------------- Retrieval ----------------
function retrieveTopK(query: string, chunks: string[], k = 3) {
  const WORD_RE = /[A-Za-z0-9']+/g;
  const normalize = (t: string) => (t.match(WORD_RE) || []).map(x => x.toLowerCase());
  const q = normalize(query);
  const qset = new Set(q);
  
  const scored = chunks.map((ch, i) => {
    const c = normalize(ch);
    const counts = new Map<string, number>();
    for (const t of c) counts.set(t, (counts.get(t) || 0) + 1);
    let score = 0;
    for (const t of qset) {
      const n = counts.get(t);
      if (n) score += 1 + Math.log(1 + n);
    }
    return { i, s: score, text: ch };
  });
  
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, k).filter(x => x.s > 0);
}

function extractJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
    try {
      return JSON.parse(match[0]
        .replace(/(\w+):/g, '"$1":')
        .replace(/:\s*'([^']*)'/g, ':"$1"')
        .replace(/,\s*}/g, '}'));
    } catch {}
  }
  throw new Error("No JSON found");
}

// ---------------- Storage ----------------
async function loadLibrary() {
  try { return JSON.parse(await fs.readFile(LIBRARY_PATH, "utf-8")); }
  catch { return []; }
}

async function getProcessedLectures() {
  return (await loadLibrary())
    .filter((l: any) => l.status === "Ready")
    .map((l: any) => ({ topic: l.title, lectureId: l.lecture_id }));
}

async function getLectureData(lectureId: string) {
  const lib = await loadLibrary();
  const lec = lib.find((l: any) => l.lecture_id === lectureId);
  if (!lec?.memory_path || !lec?.chunks_path) return null;
  return {
    memory: await fs.readFile(lec.memory_path, "utf-8"),
    chunks: JSON.parse(await fs.readFile(lec.chunks_path, "utf-8")).map((c: any) => c.text).filter(Boolean)
  };
}

// ---------------- Socratic Logic ----------------
function pickNextType(turns: Turn[], lastType: QuestionType | null): QuestionType {
  const recent = turns.slice(-4);
  const good = recent.filter(t => t.verdict === "good").length;
  const bad = recent.length - good;
  
  const pool = bad >= 3 ? ["clarity", "precision", "accuracy", "relevance"] :
               good >= 2 ? ["depth", "breadth", "logic", "precision"] :
               QUESTION_TYPES;
  
  const filtered = lastType ? pool.filter(t => t !== lastType) : pool;
  return (filtered.length ? filtered : pool)[Math.floor(Math.random() * (filtered.length || pool.length))] as QuestionType;
}

async function generateQuestion(topic: string, targetType: QuestionType, summary: string | null, lastQ: string | null, turns: Turn[], memory: string): Promise<{ type: QuestionType; question: string }> {
  const recent = turns.slice(-3).map((t, i) => 
    `Q: "${t.question}" → A: "${t.answer}" (${t.verdict})`
  ).join("\n");

  const prompt = `You are an encouraging tutor. Generate ONE simple, short Socratic question (max 15 words) about "${topic}".

Question type: ${targetType}
Student's understanding: ${summary || "beginner"}
${recent ? `Recent conversation:\n${recent}` : ""}
Last question: ${lastQ || "none"}

Make the question:
- Short and clear (under 15 words)
- Encouraging tone
- Based on the lecture content below
- Different from the last question

Lecture context: ${memory.slice(0, 1000)}

Return ONLY: {"questionType":"${targetType}","question":"your short question here"}`;

  try {
    const res = await llmFast.invoke([new SystemMessage(prompt)]);
    const obj = extractJSON(res.content as string);
    return {
      type: QUESTION_TYPES.includes(obj.questionType) ? obj.questionType : targetType,
      question: String(obj.question || "What else can you tell me about this topic?").slice(0, 150)
    };
  } catch {
    const fallbacks: Record<string, string[]> = {
      clarity: ["Can you explain that in simpler terms?"],
      precision: ["Can you give an example?"],
      accuracy: ["How do you know this?"],
      relevance: ["Why is this important?"],
      depth: ["Can you go deeper into that?"],
      breadth: ["What's another way to look at this?"],
      logic: ["How does this connect to what we discussed?"]
    };
    const qs = fallbacks[targetType] || ["Tell me more!"];
    return { type: targetType, question: qs[Math.floor(Math.random() * qs.length)] };
  }
}

async function evaluateAnswer(topic: string, question: string, answer: string, summary: string | null, memory: string): Promise<{ verdict: Verdict; score: number; feedback: string }> {
  const prompt = `Grade this student answer about "${topic}" against the lecture content. Be GENEROUS and ENCOURAGING.

Lecture: ${memory.slice(0, 2500)}
Student Summary: ${summary || "none"}
Question: "${question}"
Answer: "${answer}"

GRADING GUIDELINES (be lenient):
- "good": Answer is mostly correct, shows understanding, even if not perfectly detailed. Score 7-10.
- "neutral": Answer has some correct elements but could be more specific. Score 4-7.
- "bad": Only if completely wrong or off-topic. Score 1-4.

IMPORTANT:
- If the student shows ANY understanding, lean toward "good" or "neutral"
- Give partial credit for partial understanding
- Encourage the student even when correcting
- Short answers with correct info can still be "good"

Return ONLY: {"verdict":"good|neutral|bad","score":0-10,"feedback":"short encouraging feedback max 25 words"}`;

  try {
    const res = await llm.invoke([new SystemMessage(prompt)]);
    const obj = extractJSON(res.content as string);
    const verdict = ["good", "neutral", "bad"].includes(obj.verdict) ? obj.verdict : "neutral";
    let score = Math.max(0, Math.min(10, Number(obj.score) || 5));
    
    // Boost scores to be more generous
    if (verdict === "neutral" && score >= 5) score = Math.min(7, score + 1);
    if (verdict === "good" && score < 8) score = Math.max(7, score);
    
    return {
      verdict,
      score,
      feedback: String(obj.feedback || "Good effort! Keep going.").slice(0, 200)
    };
  } catch {
    return { verdict: "neutral", score: 5, feedback: "Good effort! Try adding more specific details from the lecture." };
  }
}

async function generateFeedback(topic: string, summary: string | null, turns: Turn[], totalPoints: number, timeSpent: number, memory: string): Promise<string> {
  const mins = Math.floor(timeSpent / 60);
  const secs = timeSpent % 60;
  
  const goodCount = turns.filter(t => t.verdict === "good").length;
  const neutralCount = turns.filter(t => t.verdict === "neutral").length;
  const badCount = turns.filter(t => t.verdict === "bad").length;
  
  const turnsText = turns.map((t, i) => {
    const e = t.verdict === "good" ? "✅" : t.verdict === "bad" ? "❌" : "⚠️";
    return `${i+1}. ${e} Q: ${t.question}\n   A: ${t.answer}\n   Feedback: ${t.feedback} (+${t.points}pts)`;
  }).join("\n\n");

  const prompt = `Write an encouraging learning report for a student who practiced explaining "${topic}".

Time: ${mins}m ${secs}s | Score: ${totalPoints}/${MAX_POINTS}
Answers: ${goodCount} great, ${neutralCount} okay, ${badCount} needs work
Summary: ${summary || "none"}
Turns:\n${turnsText || "none"}
Lecture Reference:\n${memory.slice(0, 1500)}

Write EXACT sections:
1) Overall (2-3 sentences, encouraging tone)
2) Strengths (3 bullets, be specific and positive)
3) Areas to grow (2-3 bullets, gentle suggestions)
4) Key concepts from the lecture (2-3 paragraphs, Feynman style - simple and clear)
5) Practice plan (3-5 numbered steps, concrete and achievable)

Tone: Warm, encouraging, specific. Celebrate effort. No markdown.`;

  try {
    const res = await llmFast.invoke([new SystemMessage(prompt)]);
    return (res.content as string)?.trim() || `Great effort on "${topic}"! You scored ${totalPoints}/${MAX_POINTS}. Keep practicing and you'll master this topic!`;
  } catch {
    return `🌟 Excellent work on "${topic}"!\n\nScore: ${totalPoints}/${MAX_POINTS}\n\nYou showed great effort and understanding. Review the lecture material and practice explaining the main ideas aloud. You're making good progress!`;
  }
}

// ---------------- Messaging ----------------
const now = () => Date.now();

function getRoom(username: string): RoomState | null {
  return g.userRoom.has(username) ? g.rooms.get(g.userRoom.get(username)) : null;
}

function broadcast(room: RoomState, msg: any) {
  room.msgs.push(msg);
  room.subs.forEach(fn => fn(msg));
}

async function sendBot(room: RoomState, content: string) {
  broadcast(room, { id: `f-${now()}`, role: "facilitator", username: "Dr. Feynman", content, timestamp: now() });
}

function timeLeft(room: RoomState) {
  if (!room.startTime) return SESSION_DURATION;
  return Math.max(0, SESSION_DURATION - Math.floor((now() - room.startTime) / 1000));
}

// ---------------- API ----------------
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const username = q.get("username")?.trim();

  if (q.has("topics")) {
    return NextResponse.json({ topics: await getProcessedLectures() });
  }

  if (q.has("session")) {
    const room = username ? getRoom(username) : null;
    if (!room) return NextResponse.json({ inSession: false });
    return NextResponse.json({
      inSession: true,
      topic: room.topic,
      phase: room.phase,
      totalPoints: room.totalPoints,
      maxPoints: MAX_POINTS,
      remainingTime: timeLeft(room),
      timeLimit: SESSION_DURATION,
      feedbackReady: room.phase === "feedback"
    });
  }

  if (q.has("history")) {
    const room = username ? getRoom(username) : null;
    return NextResponse.json({ messages: room?.msgs || [] });
  }

  if (q.has("feedback")) {
    const room = username ? getRoom(username) : null;
    return NextResponse.json({ 
      ready: room?.phase === "feedback", 
      feedback: room?.phase === "feedback" ? room.msgs.find(m => m.feedback)?.content || "" : "" 
    });
  }

  if (q.has("stream")) {
    if (!username) return new Response("Username required", { status: 400 });
    const room = getRoom(username);
    if (!room) return new Response("No session", { status: 400 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(": connected\n\n"));
        const listener = (msg: any) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`)); }
          catch { room.subs.delete(listener); }
        };
        room.subs.add(listener);
        const interval = setInterval(() => controller.enqueue(encoder.encode(": heartbeat\n\n")), 30000);
        (controller as any)._cleanup = () => { clearInterval(interval); room.subs.delete(listener); };
      },
      cancel(controller) { (controller as any)._cleanup?.(); }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }
    });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Start session
    if (body.action === "start_session") {
      const { username, topic, lectureId } = body;
      if (!username || !topic || !lectureId) {
        return NextResponse.json({ error: "username, topic, lectureId required" }, { status: 400 });
      }

      const room: RoomState = {
        id: `${topic}::${Math.random().toString(36).slice(2, 8)}`,
        topic, lectureId,
        msgs: [], subs: new Set(),
        phase: "init", startTime: 0,
        summary: null, turns: [], totalPoints: 0,
        lastQuestion: null, lastType: null
      };

      g.rooms.set(room.id, room);
      g.userRoom.set(username, room.id);

      await sendBot(room, `👋 Welcome ${username}! I'm Dr. Feynman.`);
      await sendBot(room, `📚 Topic: "${topic}"`);
      await sendBot(room, `⏱️ You have 3 minutes.`);
      await sendBot(room, `Step 1) Summarize what "${topic}" is about in your own words.`);
      await sendBot(room, `Then I'll ask Socratic questions to deepen your understanding.`);
      await sendBot(room, `Type "start" when ready.`);

      return NextResponse.json({ ok: true, roomId: room.id });
    }

    // Reset
    if (body.action === "reset") {
      const { username } = body;
      if (username) g.userRoom.delete(username);
      return NextResponse.json({ ok: true });
    }

    // Messages
    const { username, content } = body;
    if (!username || !content) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const room = getRoom(username);
    if (!room) return NextResponse.json({ error: "No session" }, { status: 400 });

    // Check timeout
    if (room.phase === "explaining" && timeLeft(room) <= 0) {
      room.phase = "feedback";
      const data = await getLectureData(room.lectureId);
      const timeSpent = SESSION_DURATION - timeLeft(room);
      const fb = await generateFeedback(room.topic, room.summary, room.turns, room.totalPoints, timeSpent, data?.memory || "");
      await sendBot(room, `⏰ Time's up! Great effort!\n\n${fb}`);
      return NextResponse.json({ ok: true, sessionEnded: true });
    }

    // Commands
    const cmd = content.toLowerCase().trim();

    if (cmd === "start" && room.phase === "init") {
      room.phase = "explaining";
      room.startTime = now();
      await sendBot(room, `🎯 Summarize "${room.topic}" in your own words.`);
      return NextResponse.json({ ok: true });
    }

    if (cmd === "feedback" && room.phase === "feedback") {
      const fb = room.msgs.find(m => m.content?.includes("1) Overall"));
      if (fb) {
        const chunks = fb.content.match(/.{1,500}/g) || [fb.content];
        for (const c of chunks) await sendBot(room, c);
      }
      return NextResponse.json({ ok: true });
    }

    if (cmd === "hint" && room.phase === "explaining") {
      if (room.lastQuestion) {
        await sendBot(room, `💡 Think about: ${room.lastQuestion}\nTry to use specific terms from the lecture.`);
      } else {
        await sendBot(room, `💡 Try to explain "${room.topic}" in your own words first.`);
      }
      return NextResponse.json({ ok: true });
    }

    // Broadcast student message
    broadcast(room, { id: `m-${now()}`, role: "student", username, content, timestamp: now() });

    // Explaining phase
    if (room.phase === "explaining") {
      const data = await getLectureData(room.lectureId);
      if (!data) { await sendBot(room, "Lecture not found."); return NextResponse.json({ ok: true }); }

      // First message = summary (give 5 free points for starting)
      if (!room.summary) {
        room.summary = content;
        room.totalPoints = 5; // Give 5 points just for providing a summary
        
        const nextType = pickNextType(room.turns, null);
        const q = await generateQuestion(room.topic, nextType, room.summary, null, room.turns, data.memory);
        room.lastQuestion = q.question;
        room.lastType = q.type;
        
        await sendBot(room, `🌟 Great summary! +5 points to start your tree!`);
        await sendBot(room, `${"🌳" + "🌿".repeat(Math.floor(room.totalPoints / 10)) + "⬜".repeat(10 - Math.floor(room.totalPoints / 10))} ${room.totalPoints}/${MAX_POINTS}`);
        await sendBot(room, `Now let's deepen your understanding.`);
        await sendBot(room, `(${q.type}) ${q.question}`);
        return NextResponse.json({ ok: true });
      }

      // Evaluate answer - LENIENT SCORING
      const evalResult = await evaluateAnswer(room.topic, room.lastQuestion!, content, room.summary, data.memory);

      // Generous scoring: neutral gets partial credit too
      let points = 0;
      if (evalResult.verdict === "good") {
        points = Math.min(14, 8 + Math.floor(evalResult.score * 0.6));
      } else if (evalResult.verdict === "neutral") {
        points = Math.min(7, Math.floor(evalResult.score * 0.7)); // 2-7 points for neutral
      }
      // Only truly bad answers get 0, but even then give 1 point for trying
      if (evalResult.verdict === "bad" && evalResult.score >= 3) {
        points = 1; // 1 pity point for trying
      }
      
      room.totalPoints = Math.min(MAX_POINTS, room.totalPoints + points);
      room.turns.push({
        questionType: room.lastType!,
        question: room.lastQuestion!,
        answer: content,
        verdict: evalResult.verdict,
        points,
        feedback: evalResult.feedback
      });

      const tree = "🌳" + "🌿".repeat(Math.floor(room.totalPoints / 10)) + "⬜".repeat(10 - Math.floor(room.totalPoints / 10));
      const emoji = evalResult.verdict === "good" ? "✅" : evalResult.verdict === "bad" ? "❌" : "⚠️";
      
      const pointMsg = points > 0 ? `+${points} pts! ` : "";
      const encouragement = points > 0 ? "🌱" : "💪 Keep trying!";
      
      await sendBot(room, `${emoji} ${pointMsg}${evalResult.feedback} ${encouragement}`);
      await sendBot(room, `${tree} ${room.totalPoints}/${MAX_POINTS}`);

      // Max points reached
      if (room.totalPoints >= MAX_POINTS) {
        room.phase = "feedback";
        const timeSpent = SESSION_DURATION - timeLeft(room);
        const fb = await generateFeedback(room.topic, room.summary, room.turns, room.totalPoints, timeSpent, data.memory);
        await sendBot(room, `🎉 Amazing! Perfect score!\n\n${fb}`);
        return NextResponse.json({ ok: true, sessionEnded: true });
      }

      // Next question
      const nextType = pickNextType(room.turns, room.lastType);
      const q = await generateQuestion(room.topic, nextType, room.summary, room.lastQuestion, room.turns, data.memory);
      room.lastQuestion = q.question;
      room.lastType = q.type;
      await sendBot(room, `(${q.type}) ${q.question}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SOLOSPRINT]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}