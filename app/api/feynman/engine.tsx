// app/api/feynman/engine.tsx
// ─────────────────────────────────────────────────────────────────────────────
// THE ENGINE. Owns the session lifecycle + tree/score math + the countdown timer,
// and wires the agents together. Exposes the four actions the route calls.
// In-memory rooms are mirrored to the session file and rehydrated on demand, so
// feedback/hints survive dev hot-reloads.
// ─────────────────────────────────────────────────────────────────────────────

import { DIFFICULTY, Difficulty, Concept, Grade, Turn, Room, FeedbackReport, slug } from "./config";
import { getContent, extractConcepts, loadSessionFile, saveSessionFile } from "./store";
import { teacherTurn, makeHint, makeFeedback, cheerUp } from "./agents";

const G = globalThis as any;
if (!G.feynRooms) G.feynRooms = new Map<string, Room>();
const rooms: Map<string, Room> = G.feynRooms;

const nowMs = () => Date.now();
// TIMER: seconds left = level duration minus elapsed
const timeLeft = (r: Room) => Math.max(0, DIFFICULTY[r.difficulty].duration - Math.floor((nowMs() - r.startTime) / 1000));

// tree = quality-weighted coverage (covered fully, weak counts only a little)
function coverageOf(r: Room) {
  const total = Math.max(1, r.concepts.length);
  const weighted = r.covered.size * 1.0 + r.weak.size * 0.3;
  return { covered: r.covered.size, total, percent: Math.min(100, Math.round((weighted / total) * 100)) };
}
function masteryOf(r: Room) {
  const pct = coverageOf(r).percent / 100, th = DIFFICULTY[r.difficulty].threshold;
  return pct >= th ? "Mastered" : pct >= th * 0.6 ? "Developing" : "Emerging";
}
function states(r: Room) {
  const out: Record<string, string> = {};
  for (const c of r.concepts) out[c.id] = r.covered.has(c.id) ? "covered" : r.weak.has(c.id) ? "weak" : "uncovered";
  return out;
}
// the exact JSON the UI reads — keep these field names stable
function snapshot(r: Room, extra: Record<string, any> = {}) {
  const cov = coverageOf(r);
  return {
    ok: true, message: r.lastMessage, coveredNow: [], weakNow: [],
    states: states(r), coverage: cov, treePoints: cov.percent,
    score: r.score, mastery: masteryOf(r), remainingTime: timeLeft(r),
    done: r.ended, endReason: r.endReason, ...extra,
  };
}

async function persist(r: Room) {
  const s = (await loadSessionFile(r.sessionId)) || { sessionId: r.sessionId, studentName: r.studentName, lectureId: r.lectureId, creator: r.creator, createdAt: nowMs() };
  s.feynman = {
    topic: r.topic, difficulty: r.difficulty, mood: r.mood, concepts: r.concepts,
    covered: [...r.covered], weak: [...r.weak], score: r.score,
    avgQuality: r.qualityCount ? r.qualitySum / r.qualityCount : 0,
    coverage: coverageOf(r), mastery: masteryOf(r),
    startTime: r.startTime, ended: r.ended, endReason: r.endReason,
    turns: r.turns, report: r.report || null, updatedAt: nowMs(),
  };
  s.treePoints = coverageOf(r).percent;
  await saveSessionFile(s);
}

// get the live room, or rebuild it from disk if the server dropped it
async function loadRoom(sessionId: string): Promise<Room | null> {
  const live = rooms.get(sessionId);
  if (live) return live;
  const s = await loadSessionFile(sessionId);
  if (!s || !s.feynman) return null;
  const f = s.feynman;
  const content = await getContent(s.lectureId, s.creator).catch(() => null);
  const turns: Turn[] = Array.isArray(f.turns) ? f.turns : [];
  const r: Room = {
    sessionId, studentName: s.studentName || "anon", creator: s.creator || "student", lectureId: s.lectureId || "",
    topic: f.topic || "this topic", difficulty: (["kid", "teen", "adult"].includes(f.difficulty) ? f.difficulty : "teen") as Difficulty, mood: f.mood || "",
    memory: content?.memory || "", chunks: content?.chunks || [],
    concepts: Array.isArray(f.concepts) ? f.concepts : [],
    covered: new Set(f.covered || []), weak: new Set(f.weak || []),
    startTime: f.startTime || nowMs(), ended: !!f.ended, endReason: f.endReason, score: f.score || 0,
    qualitySum: turns.reduce((a, t) => a + (t.quality || 0), 0), qualityCount: turns.length,
    turns, lastMessage: "", report: f.report || undefined,
  };
  rooms.set(sessionId, r);
  return r;
}

function applyGrade(r: Room, g: Grade): string[] {
  const newly: string[] = [];
  for (const id of g.covered) { r.weak.delete(id); if (!r.covered.has(id)) { r.covered.add(id); newly.push(id); } }
  for (const id of g.weak) if (!r.covered.has(id)) r.weak.add(id);
  r.score = Math.round(r.score + g.quality * DIFFICULTY[r.difficulty].multiplier);
  r.qualitySum += g.quality; r.qualityCount += 1;
  return newly;
}

async function endRoom(r: Room, reason: string) {
  if (r.ended) return;
  r.ended = true; r.endReason = reason;
  r.report = await makeFeedback(r);
  await persist(r);
}

// ── the four actions the route exposes ───────────────────────────────────────
export async function start(body: any) {
  const lectureId = String(body?.lectureId || "");
  const creator = body?.creator === "teacher" ? "teacher" : "student";
  const difficulty: Difficulty = (["kid", "teen", "adult"].includes(body?.difficulty) ? body.difficulty : "teen") as Difficulty;
  if (!lectureId) return { status: 400, ok: false, error: "lectureId required" };
  const content = await getContent(lectureId, creator);
  if (!content) return { status: 404, ok: false, error: "lecture not found or not ready" };

  const topic = String(body?.topic || content.title);
  const studentName = String(body?.studentName || "anon");
  const mood = String(body?.mood || "").slice(0, 40);
  const sessionId = String(body?.sessionId || `feyn:${creator}:${lectureId}:${slug(studentName)}:${nowMs().toString(36)}`);
  const concepts: Concept[] = await extractConcepts(topic, content.memory, DIFFICULTY[difficulty].concepts);
  const cfg = DIFFICULTY[difficulty];

  const r: Room = {
    sessionId, studentName, creator, lectureId, topic, difficulty, mood,
    memory: content.memory, chunks: content.chunks, concepts, covered: new Set(), weak: new Set(),
    startTime: nowMs(), ended: false, score: 0, qualitySum: 0, qualityCount: 0, turns: [], lastMessage: "",
  };
  const opening = `Alright${studentName !== "anon" ? `, ${studentName}` : ""}, let's begin! Teach me about "${topic}" in your own words, like you're explaining it to a friend.${difficulty === "kid" ? " 😊" : ""}`;
  r.lastMessage = opening;
  rooms.set(sessionId, r);
  await persist(r);

  return {
    ok: true, sessionId, topic, difficulty, difficultyLabel: cfg.label, who: cfg.who,
    duration: cfg.duration, startTime: r.startTime,        // ← timer info for the UI
    concepts: concepts.map((c) => ({ id: c.id, name: c.name })),
    opening, message: opening, ...snapshot(r),
  };
}

export async function explain(sessionId: string, text: string) {
  const r = await loadRoom(sessionId);
  if (!r) return { status: 404, ok: false, error: "no session" };
  if (r.ended) return snapshot(r);
  if (timeLeft(r) <= 0) { await endRoom(r, "time"); return snapshot(r, { message: "Time's up — look how your tree has grown! 🌳" }); }
  if (!text.trim()) return { status: 400, ok: false, error: "content required" };

  // run the teaching agent (it grades + grounds + asks via tools), then update state
  const { reply, grade } = await teacherTurn(r, text.trim());
  const newly = applyGrade(r, grade);
  r.lastMessage = reply;
  r.turns.push({ explanation: text.trim(), quality: grade.quality, coveredNow: newly, message: reply });

  // end conditions (mastered · time up · too many turns)
  const cov = coverageOf(r);
  let reason: string | undefined;
  if (cov.covered === cov.total && cov.percent >= Math.round(DIFFICULTY[r.difficulty].threshold * 100)) reason = "mastered";
  else if (timeLeft(r) <= 0) reason = "time";
  else if (r.turns.length >= 16) reason = "exhausted";
  if (reason) await endRoom(r, reason); else await persist(r);

  return snapshot(r, { message: reply, coveredNow: newly, weakNow: grade.weak });
}

export async function hint(sessionId: string) {
  const r = await loadRoom(sessionId);
  if (!r) return { status: 404, ok: false, error: "no session" };
  const msg = await makeHint(r);
  r.lastMessage = msg;
  return snapshot(r, { message: msg });
}

export async function end(sessionId: string) {
  const r = await loadRoom(sessionId);
  if (!r) return { status: 404, ok: false, error: "no session" };
  await endRoom(r, r.endReason || "manual");
  return snapshot(r, { report: r.report as FeedbackReport });
}

export async function snapshotFor(sessionId: string) {
  const r = await loadRoom(sessionId);
  if (!r) return { status: 404, ok: false, error: "no session" };
  return snapshot(r, { concepts: r.concepts, report: r.report || null });
}

// sessionless: a mood-aware cheer-up before the lesson starts
export async function cheer(mood: string) {
  return { ok: true, quote: await cheerUp(mood) };
}