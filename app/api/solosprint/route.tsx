import { NextRequest, NextResponse } from "next/server";
import { ChatOllama } from "@langchain/ollama";
import { SystemMessage } from "@langchain/core/messages";

type Role = "student" | "facilitator";
type SessionPhase = "waiting" | "discussion_3min" | "personal_feedback";
type Verdict = "good" | "bad" | "neutral";
type Listener = (msg: Msg) => void;

interface Msg {
  id: string;
  role: Role;
  username: string;
  content: string;
  timestamp: number;
}

interface RoomState {
  id: string;
  topic: string;
  language: string;
  createdAt: number;
  phase: SessionPhase;
  discussionStartAt: number | null;
  discussionEndsAt: number | null;
  participants: Set<string>;
  msgs: Msg[];
  subs: Set<Listener>;
  busy: boolean;
  busySince: number;
  feedbackGenerated: boolean;
  privateFeedbackByStudent: Record<string, string>;
  privateFeedbackReady: boolean;
  treeScore: number;
  lastTreeEvalAt: number;
}

const TOPIC_POOL = [
  "Newton's First Law of Motion (Inertia)",
  "Photosynthesis — how plants convert sunlight to energy",
  "Supply and Demand in Economics",
  "The Water Cycle",
  "How does DNA replication work?",
  "What causes the seasons on Earth?",
  "Ohm's Law in electricity",
  "The concept of recursion in computer science",
];

const MIN_STUDENTS_TO_START = 1; // CHANGED: now starts with 1 student
const MAX_PER_ROOM = 3;
const DISCUSSION_MS = 3 * 60 * 1000;
const HEARTBEAT_MS = 1200;

const llm = new ChatOllama({ model: "llama3.2", temperature: 0.25 });
const llmFast = new ChatOllama({ model: "llama3.2", temperature: 0, numPredict: 90 });

const g = globalThis as unknown as {
  rooms: Map<string, RoomState>;
  userRoom: Map<string, string>;
  heartbeatStarted: boolean;
};

if (!g.rooms) g.rooms = new Map();
if (!g.userRoom) g.userRoom = new Map();
if (!g.heartbeatStarted) g.heartbeatStarted = false;

// ---------- utils ----------
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const now = () => Date.now();
const makeRoomId = (topic: string, idx: number) => `${topic}::${idx}`;
const students = (room: RoomState) => [...room.participants];
const trim = (v: unknown) => String(v ?? "").trim();

const jsonSessionEmpty = {
  phase: "waiting",
  topic: "",
  students: [],
  roomId: null,
  language: "English",
  discussionEndsAt: null,
  privateFeedbackReady: false,
  treeScore: 0,
};

function createRoom(topic: string, language: string, index: number): RoomState {
  return {
    id: makeRoomId(topic, index),
    topic,
    language,
    createdAt: now(),
    phase: "waiting",
    discussionStartAt: null,
    discussionEndsAt: null,
    participants: new Set(),
    msgs: [],
    subs: new Set(),
    busy: false,
    busySince: 0,
    feedbackGenerated: false,
    privateFeedbackByStudent: {},
    privateFeedbackReady: false,
    treeScore: 0,
    lastTreeEvalAt: 0,
  };
}

function getOrCreateRoom(topic: string, language: string): RoomState {
  const same = [...g.rooms.values()].filter((r) => r.topic === topic);
  const open = same.find((r) => r.participants.size < MAX_PER_ROOM);
  if (open) return open;
  const room = createRoom(topic, language, same.length + 1);
  g.rooms.set(room.id, room);
  return room;
}

function getRoomByUser(username: string): RoomState | null {
  const id = g.userRoom.get(username);
  return id ? g.rooms.get(id) ?? null : null;
}

function broadcast(room: RoomState, msg: Msg) {
  room.msgs.push(msg);
  room.subs.forEach((fn) => fn(msg));
}

async function postFacilitator(room: RoomState, content: string, suffix = "") {
  const text = trim(content);
  if (!text) return;
  broadcast(room, {
    id: `f-${now()}${suffix ? `-${suffix}` : ""}`,
    role: "facilitator",
    username: "Dr. Feynman",
    content: text,
    timestamp: now(),
  });
}

function buildTranscript(room: RoomState, limit = 260) {
  return room.msgs
    .slice(-limit)
    .map((m) => (m.role === "facilitator" ? `System: ${m.content}` : `${m.username}: ${m.content}`))
    .join("\n");
}

function studentMsgs(room: RoomState, username: string) {
  return room.msgs.filter((m) => m.role === "student" && m.username === username);
}

function studentOnlyTranscript(room: RoomState, username: string, limit = 180) {
  return studentMsgs(room, username)
    .slice(-limit)
    .map((m) => `${m.username}: ${m.content}`)
    .join("\n");
}

function studentEvidence(room: RoomState, username: string) {
  return [...studentMsgs(room, username)]
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 3)
    .map((m) => `- "${m.content.slice(0, 160)}"`)
    .join("\n") || "- (No substantial message captured)";
}

function studentStats(room: RoomState, username: string) {
  const mine = studentMsgs(room, username);
  const total = mine.length;
  const avgLen = total ? Math.round(mine.reduce((n, m) => n + m.content.length, 0) / total) : 0;
  const conceptual = mine.filter((m) => /(because|therefore|means|process|input|output|example|energy|sunlight|oxygen|glucose|water|carbon dioxide|law|force|demand|supply)/i.test(m.content)).length;
  const uncertain = mine.filter((m) => /(idk|not sure|i don't know|no idea|confused|maybe)/i.test(m.content)).length;
  return { total, avgLen, conceptual, uncertain };
}

// ---------- tree scoring ----------
const TREE_EVAL_PROMPT = `Evaluate one student message in a collaborative learning chat.

Topic: {TOPIC}
Message: {MESSAGE}

Return ONLY JSON:
{"verdict":"good"|"bad"|"neutral"}

good = mostly correct/helpful concept explanation
bad = incorrect/confused/misleading concept statement
neutral = social/chit-chat/too short/unclear`;

function heuristicVerdict(message: string): Verdict {
  const t = message.toLowerCase().trim();
  if (t.length < 12) return "neutral";
  if (/^(ok|okay|yes|no|idk|i don't know|not sure|maybe)\b/.test(t)) return "neutral";
  if (/(not sure|i don't know|no idea|confused|wrong|nonsense|don't understand)/.test(t)) return "bad";
  if (/(because|therefore|means|process|input|output|example|chlorophyll|sunlight|glucose|oxygen|carbon dioxide|water|energy|inertia|force|demand|supply)/.test(t)) return "good";
  return "neutral";
}

function parseVerdict(raw: string): Verdict | null {
  try {
    const parsed = JSON.parse(raw) as { verdict?: string };
    if (parsed.verdict === "good" || parsed.verdict === "bad" || parsed.verdict === "neutral") return parsed.verdict;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]) as { verdict?: string };
        if (parsed.verdict === "good" || parsed.verdict === "bad" || parsed.verdict === "neutral") return parsed.verdict;
      } catch {}
    }
  }
  return null;
}

async function evaluateContribution(topic: string, message: string): Promise<Verdict> {
  const text = message.trim();
  if (text.length < 10) return "neutral";
  try {
    const out = await llmFast.invoke([new SystemMessage(TREE_EVAL_PROMPT.replace("{TOPIC}", topic).replace("{MESSAGE}", text))]);
    const raw = typeof out.content === "string" ? out.content : JSON.stringify(out.content);
    return parseVerdict(raw) ?? heuristicVerdict(text);
  } catch {
    return heuristicVerdict(text);
  }
}

// ---------- feedback ----------
const FEEDBACK_PROMPT = `You are Dr. Feynman writing personalized feedback for ONE student.

Language: {LANG}
Topic: {TOPIC}
Student: {STUDENT}

Student-only transcript:
{STUDENT_ONLY}

Evidence snippets from this student:
{EVIDENCE}

Class transcript:
{FULL_TRANSCRIPT}

Student stats:
- total_messages={TOTAL}
- avg_message_length={AVG}
- conceptual_messages={CONCEPT}
- uncertainty_signals={UNCERTAIN}

Return STRICTLY in this exact markdown structure:

**✅ What went well**
1) Message contribution: mention exact number of messages and what that suggests about engagement.
2) Thinking style: describe the student's response style (e.g., concise, exploratory, corrective, cause-effect).
3) Correct content: mention at least one thing they got correct in topic content (if none, say "No clearly correct claim yet").

**🛠️ Improvements**
- Mention what was missing in the student's explanation (precision, sequence, terminology, mechanism, examples).
- Mention one concept correction if needed.
- You may include one shared class-level gap if applicable.

**🌟 Encouragement**
- 2–3 sentences of motivation tailored to this student's effort and style.

Rules:
- Must reference this student's actual messages (quote/paraphrase).
- Must be specific and different per student.
- Keep concise but meaningful (8-12 sentences total).`;

function fallbackStructuredFeedback(
  name: string,
  stats: ReturnType<typeof studentStats>,
  evidence: string,
  topic: string
) {
  return `**✅ What went well**
1) Message contribution: You sent ${stats.total} message(s), which shows you stayed involved in the collaboration.
2) Thinking style: Your responses were ${stats.avgLen < 30 ? "brief and direct" : "detailed and explanatory"}, showing how you process ideas during discussion.
3) Correct content: You made attempts to connect key ideas to ${topic}. ${stats.conceptual > 0 ? "Some parts showed conceptual intent." : "No clearly correct claim yet."}

**🛠️ Improvements**
- Your explanations need clearer step-by-step logic and more precise scientific wording.
- Add one concrete example after each major claim to show understanding.
- Class-level gap: both students should explain the process flow more accurately and avoid unsupported statements.

**🌟 Encouragement**
${name}, your participation is a strong foundation.
If you keep explaining with clearer cause-and-effect links, your understanding will improve quickly.
You are close—focus on precision and examples in your next round.`;
}

async function generatePrivateFeedbackForAll(room: RoomState) {
  const fullTranscript = buildTranscript(room, 300);
  const map: Record<string, string> = {};

  for (const name of students(room)) {
    const own = studentOnlyTranscript(room, name, 180);
    const evidence = studentEvidence(room, name);
    const stats = studentStats(room, name);

    if (!own.trim()) {
      map[name] = `**✅ What went well**
1) Message contribution: You joined the room, which is a good first step.
2) Thinking style: There were too few responses to infer your thinking style clearly.
3) Correct content: No clearly correct claim yet.

**🛠️ Improvements**
- Share at least 2-3 content messages so your understanding can be assessed.
- Explain one concept in sequence: definition → mechanism → example.
- Class-level gap: both students should provide clearer process-based explanations.

**🌟 Encouragement**
You can improve very fast once you start sharing your reasoning openly.
Your next session can be much stronger with just a few clear concept explanations.`;
      continue;
    }

    const prompt = FEEDBACK_PROMPT
      .replace("{LANG}", room.language || "English")
      .replace("{TOPIC}", room.topic)
      .replace("{STUDENT}", name)
      .replace("{STUDENT_ONLY}", own)
      .replace("{EVIDENCE}", evidence)
      .replace("{FULL_TRANSCRIPT}", fullTranscript || "(No transcript)")
      .replace("{TOTAL}", String(stats.total))
      .replace("{AVG}", String(stats.avgLen))
      .replace("{CONCEPT}", String(stats.conceptual))
      .replace("{UNCERTAIN}", String(stats.uncertain));

    try {
      const out = await llm.invoke([new SystemMessage(prompt)]);
      const text = typeof out.content === "string" ? out.content.trim() : JSON.stringify(out.content);
      const validStructure = text.includes("**✅ What went well**") && text.includes("**🛠️ Improvements**") && text.includes("**🌟 Encouragement**");
      map[name] = validStructure ? text : fallbackStructuredFeedback(name, stats, evidence, room.topic);
    } catch {
      map[name] = fallbackStructuredFeedback(name, stats, evidence, room.topic);
    }
  }

  room.privateFeedbackByStudent = map;
  room.privateFeedbackReady = true;
}

// ---------- timer ----------
async function maybeAdvanceRoom(room: RoomState) {
  if (room.busy && now() - room.busySince < HEARTBEAT_MS) return;
  room.busy = true;
  room.busySince = now();

  try {
    const ended = room.phase === "discussion_3min" && room.discussionEndsAt && now() >= room.discussionEndsAt;
    if (ended && !room.feedbackGenerated) {
      room.phase = "personal_feedback";
      room.feedbackGenerated = true;
      await generatePrivateFeedbackForAll(room);
      await postFacilitator(room, "✅ Time is up. Personalized feedback is ready. Click \"View My Feedback\".", "feedback-ready");
    }
  } catch (e) {
    console.error("[ROOM_HEARTBEAT]", e);
  } finally {
    room.busy = false;
  }
}

function startHeartbeat() {
  if (g.heartbeatStarted) return;
  g.heartbeatStarted = true;
  setInterval(() => {
    for (const room of g.rooms.values()) {
      if (room.participants.size > 0) maybeAdvanceRoom(room).catch(console.error);
    }
  }, HEARTBEAT_MS);
}
startHeartbeat();

// ---------- dto ----------
function sessionDto(room: RoomState) {
  return {
    phase: room.phase,
    topic: room.topic,
    students: [...room.participants],
    roomId: room.id,
    language: room.language,
    discussionEndsAt: room.discussionEndsAt,
    privateFeedbackReady: room.privateFeedbackReady,
    treeScore: room.treeScore,
  };
}

function lobbyDto() {
  return TOPIC_POOL.map((topic) => {
    const rooms = [...g.rooms.values()].filter((r) => r.topic === topic);
    const totalStudents = rooms.reduce((n, r) => n + r.participants.size, 0);
    const nextRoomCount = rooms.length === 0 ? 0 : rooms.find((r) => r.participants.size < MAX_PER_ROOM)?.participants.size ?? 0;
    return {
      topic,
      openSeats: rooms.length === 0 || rooms.some((r) => r.participants.size < MAX_PER_ROOM),
      activeRooms: rooms.length,
      totalStudents,
      nextRoomCount,
      maxPerRoom: MAX_PER_ROOM,
    };
  });
}

// ---------- API ----------
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  if (q.has("topics")) return NextResponse.json({ topics: lobbyDto() });

  if (q.has("session")) {
    const username = trim(q.get("username"));
    const room = username ? getRoomByUser(username) : null;
    return NextResponse.json(room ? sessionDto(room) : jsonSessionEmpty);
  }

  if (q.has("history")) {
    const username = trim(q.get("username"));
    const room = username ? getRoomByUser(username) : null;
    return NextResponse.json({
      messages: room?.msgs ?? [],
      phase: room?.phase ?? "waiting",
      topic: room?.topic ?? "",
      language: room?.language ?? "English",
      treeScore: room?.treeScore ?? 0,
    });
  }

  if (q.has("my_feedback")) {
    const username = trim(q.get("username"));
    const room = username ? getRoomByUser(username) : null;
    if (!room) return NextResponse.json({ ready: false, feedback: "" });
    return NextResponse.json({ ready: room.privateFeedbackReady, feedback: room.privateFeedbackByStudent[username] || "" });
  }

  if (q.has("stream")) {
    const username = trim(q.get("username"));
    const room = username ? getRoomByUser(username) : null;
    if (!room) return new Response("No room", { status: 400 });

    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(enc.encode(": ok\n\n"));
        const fn = (msg: Msg) => {
          try {
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`));
          } catch {
            room.subs.delete(fn);
          }
        };
        room.subs.add(fn);
        
        const hb = setInterval(() => {
          try {
            ctrl.enqueue(enc.encode(": hb\n\n"));
          } catch {
            clearInterval(hb);
            room.subs.delete(fn);
          }
        }, 15000);

        (ctrl as any)._cleanup = () => {
          clearInterval(hb);
          room.subs.delete(fn);
        };
      },
      cancel(ctrl) {
        (ctrl as any)?._cleanup?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "join_room") {
    const username = trim(body.username);
    const topic = trim(body.topic);
    const language = trim(body.language || "English");
    if (!username || !topic) return NextResponse.json({ error: "username and topic required" }, { status: 400 });

    const room = getOrCreateRoom(topic, language);
    const prev = getRoomByUser(username);
    if (prev && prev.id !== room.id) prev.participants.delete(username);

    room.participants.add(username);
    g.userRoom.set(username, room.id);

    // CHANGED: Always start discussion when first student joins
    if (room.phase === "waiting") {
      // Welcome message
      await postFacilitator(room, `👋 Welcome ${username}! Let's explore ${topic} together.`, "welcome");
      
      // Start discussion immediately (no waiting for second student)
      room.phase = "discussion_3min";
      room.discussionStartAt = now();
      room.discussionEndsAt = room.discussionStartAt + DISCUSSION_MS;
      room.feedbackGenerated = false;
      room.privateFeedbackReady = false;
      room.privateFeedbackByStudent = {};
      room.treeScore = 0;
      room.lastTreeEvalAt = 0;

      await postFacilitator(
        room,
        `🧠 Let's begin! You have 3 minutes to explore this topic.
Instructions:
1) Explain concepts clearly with examples.
2) Build on your ideas step by step.
3) Use cause-effect reasoning.
🌳 The tree grows when you explain accurately and shrinks when statements are misleading.
Start now!`,
        "instructions"
      );
    } else if (room.phase === "discussion_3min" && room.participants.size > 0) {
      // Additional student joins during active discussion
      await postFacilitator(room, `👋 Welcome ${username}! Join the discussion—you have ${Math.max(0, Math.floor((room.discussionEndsAt! - now()) / 1000))} seconds left.`, "late-join");
    }

    return NextResponse.json({ ok: true, ...sessionDto(room) });
  }

  if (body.action === "reset_room") {
    const username = trim(body.username);
    const room = username ? getRoomByUser(username) : null;
    if (!room) return NextResponse.json({ ok: true });

    room.phase = "waiting";
    room.discussionStartAt = null;
    room.discussionEndsAt = null;
    room.feedbackGenerated = false;
    room.msgs = [];
    room.privateFeedbackByStudent = {};
    room.privateFeedbackReady = false;
    room.treeScore = 0;
    room.lastTreeEvalAt = 0;
    room.busy = false;

    return NextResponse.json({ ok: true });
  }

  const username = trim(body.username);
  const content = trim(body.content);
  if (!username || !content) return NextResponse.json({ error: "username and content required" }, { status: 400 });

  const room = getRoomByUser(username);
  if (!room) return NextResponse.json({ error: "Join a topic room first." }, { status: 400 });
  if (room.phase === "personal_feedback") return NextResponse.json({ error: "Discussion ended. Click View My Feedback." }, { status: 400 });

  broadcast(room, {
    id: `m-${now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: "student",
    username,
    content,
    timestamp: now(),
  });

  if (room.phase === "discussion_3min") {
    const prevMsg = [...room.msgs].slice(0, -1).reverse().find((m) => m.role === "student" && m.username === username);
    const repeated = !!prevMsg && prevMsg.content.trim().toLowerCase() === content.toLowerCase();
    if (!repeated) {
      const verdict = await evaluateContribution(room.topic, content);
      if (verdict === "good") room.treeScore = clamp(room.treeScore + 10, 0, 100);
      if (verdict === "bad") room.treeScore = clamp(room.treeScore - 7, 0, 100);
      room.lastTreeEvalAt = now();
    }
  }

  maybeAdvanceRoom(room).catch(console.error);
  return NextResponse.json({ ok: true, treeScore: room.treeScore });
}