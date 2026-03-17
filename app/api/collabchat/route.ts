import { NextRequest, NextResponse } from "next/server";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";

interface Msg {
  id: string;
  role: "student" | "facilitator";
  username: string;
  content: string;
  timestamp: number;
}

type Listener = (msg: Msg) => void;
type SessionPhase = "waiting" | "discussion_3min" | "adaptive_questions" | "personal_feedback";

interface StudentProfile {
  name: string;
  messageCount: number;
  lastMessageAt: number;
  consecutiveSilence: number;
  failedAttempts: number;
  explicitConfusions: number;
  wasNudged: boolean;
  wasNudgedTwice: boolean;
}

interface RoomState {
  id: string;
  topic: string;
  language: string;
  createdAt: number;
  phase: SessionPhase;
  discussionStartAt: number | null;
  feedbackGenerated: boolean;
  msgs: Msg[];
  subs: Set<Listener>;
  busy: boolean;
  busySince: number;
  profiles: Map<string, StudentProfile>;
  participants: Set<string>;
  facilitatorRounds: number;
  lastSilencePromptAt: number;
  adaptiveKickoffDone: boolean;
  discussionFeedbackDone: boolean;
  discussionTransitionDone: boolean;
  transitionLock: boolean;

  adaptiveQuestionCount: number;
  adaptiveTarget: string | null;
  privateFeedbackByStudent: Record<string, string>;
  privateFeedbackReady: boolean;
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

const DISCUSSION_MS = 3 * 60 * 1000;
const SILENCE_MS = 35 * 1000;
const MIN_STUDENTS_TO_START = 2;
const MAX_ADAPTIVE_QUESTIONS = 4;

const g = globalThis as unknown as {
  rooms: Map<string, RoomState>;
  userRoom: Map<string, string>;
  heartbeatStarted: boolean;
};

if (!g.rooms) g.rooms = new Map();
if (!g.userRoom) g.userRoom = new Map();
if (!g.heartbeatStarted) g.heartbeatStarted = false;

function roomId(topic: string, index: number) {
  return `${topic}::${index}`;
}

function getOrCreateRoom(topic: string, language: string): RoomState {
  const sameTopicRooms = [...g.rooms.values()].filter((r) => r.topic === topic);
  for (const r of sameTopicRooms) {
    if (r.participants.size < 3) {
      if (!r.language) r.language = language;
      return r;
    }
  }

  const idx = sameTopicRooms.length + 1;
  const id = roomId(topic, idx);
  const r: RoomState = {
    id,
    topic,
    language,
    createdAt: Date.now(),
    phase: "waiting",
    discussionStartAt: null,
    feedbackGenerated: false,
    msgs: [],
    subs: new Set(),
    busy: false,
    busySince: 0,
    profiles: new Map(),
    participants: new Set(),
    facilitatorRounds: 0,
    lastSilencePromptAt: 0,
    adaptiveKickoffDone: false,
    discussionFeedbackDone: false,
    discussionTransitionDone: false,
    transitionLock: false,
    adaptiveQuestionCount: 0,
    adaptiveTarget: null,
    privateFeedbackByStudent: {},
    privateFeedbackReady: false,
  };
  g.rooms.set(id, r);
  return r;
}

function getRoomByUser(username: string) {
  const id = g.userRoom.get(username);
  if (!id) return null;
  return g.rooms.get(id) ?? null;
}

function occupancyForTopic(topic: string) {
  const rooms = [...g.rooms.values()].filter((r) => r.topic === topic);
  const totalStudents = rooms.reduce((n, r) => n + r.participants.size, 0);
  return {
    rooms: rooms.map((r) => ({
      roomId: r.id,
      count: r.participants.size,
      max: 3,
      phase: r.phase,
      language: r.language,
    })),
    totalStudents,
  };
}

function topicLobbyView() {
  return TOPIC_POOL.map((topic) => {
    const occ = occupancyForTopic(topic);
    const nextRoomCount =
      occ.rooms.length === 0 ? 0 : occ.rooms.find((r) => r.count < 3)?.count ?? 0;
    return {
      topic,
      openSeats: occ.rooms.some((r) => r.count < 3) || occ.rooms.length === 0,
      activeRooms: occ.rooms.length,
      totalStudents: occ.totalStudents,
      nextRoomCount,
      maxPerRoom: 3,
    };
  });
}

function broadcast(room: RoomState, msg: Msg) {
  room.msgs.push(msg);
  room.subs.forEach((fn) => fn(msg));
}

function subscribe(room: RoomState, fn: Listener) {
  room.subs.add(fn);
  return () => room.subs.delete(fn);
}

function msgsSinceLastFacilitator(room: RoomState): Msg[] {
  for (let i = room.msgs.length - 1; i >= 0; i--) {
    if (room.msgs[i].role === "facilitator") return room.msgs.slice(i + 1);
  }
  return [...room.msgs];
}

function studentNames(room: RoomState): string[] {
  return [...room.participants];
}

function buildTranscript(room: RoomState, limit = 50): string {
  return room.msgs
    .slice(-limit)
    .map((m) => (m.role === "facilitator" ? `Dr. Feynman: ${m.content}` : `${m.username}: ${m.content}`))
    .join("\n");
}

function getProfile(room: RoomState, name: string): StudentProfile {
  if (!room.profiles.has(name)) {
    room.profiles.set(name, {
      name,
      messageCount: 0,
      lastMessageAt: 0,
      consecutiveSilence: 0,
      failedAttempts: 0,
      explicitConfusions: 0,
      wasNudged: false,
      wasNudgedTwice: false,
    });
  }
  return room.profiles.get(name)!;
}

function isConfusedText(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes("i don't know") ||
    t.includes("no idea") ||
    t.includes("still confused") ||
    t.includes("confused") ||
    t.includes("help") ||
    t.includes("i give up") ||
    t.includes("not sure")
  );
}

function isWeakAnswer(text: string) {
  const t = text.trim().toLowerCase();
  return t.length < 8 || t === "idk" || t === "?" || t === "okay" || t === "not sure";
}

function recordStudentMessage(room: RoomState, name: string, content: string) {
  const p = getProfile(room, name);
  p.messageCount++;
  p.lastMessageAt = Date.now();
  p.consecutiveSilence = 0;
  p.wasNudged = false;
  p.wasNudgedTwice = false;

  if (isConfusedText(content) || isWeakAnswer(content)) p.failedAttempts++;
  else p.failedAttempts = Math.max(0, p.failedAttempts - 1);

  if (isConfusedText(content)) p.explicitConfusions++;
  else p.explicitConfusions = Math.max(0, p.explicitConfusions - 1);
}

function tickSilenceCounters(room: RoomState) {
  const spoke = new Set(
    msgsSinceLastFacilitator(room)
      .filter((m) => m.role === "student")
      .map((m) => m.username)
  );
  for (const [, p] of room.profiles) {
    if (spoke.has(p.name)) {
      p.consecutiveSilence = 0;
      p.wasNudged = false;
      p.wasNudgedTwice = false;
    } else {
      p.consecutiveSilence++;
    }
  }
}

function engagementSummary(room: RoomState): string {
  const lines: string[] = [];
  const now = Date.now();
  for (const [, p] of room.profiles) {
    const agoSec = p.lastMessageAt ? Math.round((now - p.lastMessageAt) / 1000) : -1;
    const agoLabel = agoSec < 0 ? "hasn't spoken yet" : `${agoSec}s ago`;
    lines.push(
      `• ${p.name}: msgs=${p.messageCount}, last=${agoLabel}, quiet=${p.consecutiveSilence}, fails=${p.failedAttempts}, confused=${p.explicitConfusions}`
    );
  }
  return lines.join("\n");
}

function secondsSinceLastStudentMsg(room: RoomState): number {
  const last = [...room.msgs].reverse().find((m) => m.role === "student");
  if (!last) return Infinity;
  return Math.floor((Date.now() - last.timestamp) / 1000);
}

// pick most unresponsive student
function pickUnresponsiveStudent(room: RoomState): string | null {
  const arr = [...room.profiles.values()];
  if (!arr.length) return null;
  arr.sort((a, b) => {
    const aLast = a.lastMessageAt || 0;
    const bLast = b.lastMessageAt || 0;
    if (aLast !== bLast) return aLast - bLast;
    if (a.messageCount !== b.messageCount) return a.messageCount - b.messageCount;
    return b.consecutiveSilence - a.consecutiveSilence;
  });
  return arr[0]?.name ?? null;
}

function otherStudent(room: RoomState, target: string | null) {
  const names = studentNames(room);
  return names.find((n) => n !== target) || names[0] || "the other student";
}

function sanitizeFacilitatorText(text: string) {
  return text
    .replace(/^\[?Dr\.?\s*Feynman\]?[:\s]*/i, "")
    .replace(/\(.*?wait.*?\)/gi, "")
    .replace(/\(.*?note:.*?\)/gi, "")
    .trim();
}

const llm = new ChatOllama({ model: "llama3.2", temperature: 0.7 });
const llmFast = new ChatOllama({ model: "llama3.2", temperature: 0, numPredict: 180 });

const DISCUSSION_INTRO = `You are Dr. Feynman 🎓 facilitating a timed 3-minute peer discussion.
Introduce topic warmly and ask students to explain to each other in their own words.
Keep it 3-4 sentences. No stage notes.`;

const DISCUSSION_FEEDBACK_PROMPT = `You are Dr. Feynman 🎓 ending a timed discussion.

Language: {LANG}
Topic: {TOPIC}
Students: {STUDENTS}
Transcript:
{TRANSCRIPT}

Write one clear feedback message with this exact structure:
What went well:
- {student1}: ...
- {student2}: ...

What needs correction:
- {student1}: ...
- {student2}: ...

How to improve next:
- {student1}: ...
- {student2}: ...

Use concrete examples from what they said. Slightly in-depth but concise (8-12 lines).`;

const ADAPTIVE_KICKOFF_PROMPT = `You are Dr. Feynman 🎓.
Start adaptive questioning now.

Language: {LANG}
Topic: {TOPIC}
Students: {STUDENTS}
Engagement:
{ENGAGEMENT}

Message must:
1) say: "Now I am going to ask you some questions to deepen understanding."
2) ask one conceptual question
3) call one specific student to answer first
4) ask the other student to build on it
2-4 sentences only.`;

const ADAPTIVE_QUESTION_PROMPT = `You are Dr. Feynman 🎓 running adaptive questioning.
Language: {LANG}
Topic: {TOPIC}
Target student: {TARGET}
Other student: {OTHER}
Engagement:
{ENGAGEMENT}
Recent transcript:
{TRANSCRIPT}

Rules:
- Ask exactly ONE new adaptive question.
- Mention TARGET student by name to answer first.
- Ask OTHER student to add/correct after.
- Use Socratic by default; if target seems stuck, explain briefly then ask one check question.
- Keep 2-4 sentences.`;

const FINAL_PRIVATE_FEEDBACK_PROMPT = `You are Dr. Feynman 🎓 generating private feedback for one student.

Language: {LANG}
Topic: {TOPIC}
Student: {STUDENT}
Transcript:
{TRANSCRIPT}
Engagement:
{ENGAGEMENT}

Output private feedback for this student:
1) What you did well
2) What you misunderstood
3) How to improve (2 practical steps)
4) One encouragement sentence
5-8 sentences, specific and actionable.`;

const FacilitatorState = Annotation.Root({
  roomId: Annotation<string>,
  transcript: Annotation<string>,
  decision: Annotation<string>,
  interjectType: Annotation<string>,
  target: Annotation<string>,
  reason: Annotation<string>,
  response: Annotation<string>,
});

type DecideOut = {
  decision: "YES" | "NO";
  type:
    | "direct_call"
    | "correction"
    | "stuck_help"
    | "silence_nudge"
    | "participation_nudge"
    | "none";
  target: string | null;
  reason: string;
};

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const DECIDE_PROMPT = `You monitor a collaborative learning chat.
Default decision = NO.

Return ONLY valid JSON:
{
  "decision":"YES"|"NO",
  "type":"direct_call"|"correction"|"stuck_help"|"silence_nudge"|"participation_nudge"|"none",
  "target":"name or null",
  "reason":"<=15 words"
}`;

const DISCUSSION_REPLY_PROMPT = `You are Dr. Feynman 🎓 in discussion.
Language: {LANG}
Topic: {TOPIC}
Type: {TYPE}
Target: {TARGET}
Reason: {REASON}
Engagement:
{ENGAGEMENT}

Rules:
- 2-4 sentences.
- If silence/participation nudge: mention TARGET by name and ask them specifically.
- Ask the other student to respond after target.
- If correction: be gentle and precise.
- No stage notes.`;

async function decideNode(state: typeof FacilitatorState.State) {
  const room = g.rooms.get(state.roomId);
  if (!room) return { decision: "NO", interjectType: "none", target: "", reason: "" };
  if (room.phase === "waiting" || room.phase === "personal_feedback")
    return { decision: "NO", interjectType: "none", target: "", reason: "" };

  // silence nudge targeting specific unresponsive student
  if (
    secondsSinceLastStudentMsg(room) >= 35 &&
    room.msgs.some((m) => m.role === "student") &&
    Date.now() - room.lastSilencePromptAt > SILENCE_MS
  ) {
    room.lastSilencePromptAt = Date.now();
    const target = pickUnresponsiveStudent(room) || studentNames(room)[0] || "";
    return {
      decision: "YES",
      interjectType: "silence_nudge",
      target,
      reason: "No response for ~35s",
    };
  }

  const transcript = buildTranscript(room, 45);
  const targetCandidate = pickUnresponsiveStudent(room) || "";

  const res = await llmFast.invoke([
    new SystemMessage(DECIDE_PROMPT),
    new HumanMessage(
      `Topic: ${room.topic}
Phase: ${room.phase}
Suggested target: ${targetCandidate}
Active students: ${studentNames(room).join(", ")}
Engagement:
${engagementSummary(room)}

Transcript:
${transcript}`
    ),
  ]);

  const raw = typeof res.content === "string" ? res.content.trim() : "";
  const parsed = safeParse<DecideOut>(raw);

  if (!parsed) return { decision: "NO", interjectType: "none", target: "", reason: "" };

  return {
    decision: parsed.decision === "YES" ? "YES" : "NO",
    interjectType: parsed.decision === "YES" ? parsed.type : "none",
    target: parsed.target || targetCandidate,
    reason: parsed.decision === "YES" ? parsed.reason : "",
  };
}

async function replyNode(state: typeof FacilitatorState.State) {
  const room = g.rooms.get(state.roomId);
  if (!room) return { response: "" };

  const history = room.msgs.slice(-30).map((m) =>
    m.role === "facilitator" ? new AIMessage(m.content) : new HumanMessage(`${m.username}: ${m.content}`)
  );

  let systemPrompt = "";

  if (room.phase === "discussion_3min") {
    systemPrompt = DISCUSSION_REPLY_PROMPT
      .replace("{LANG}", room.language || "English")
      .replace("{TOPIC}", room.topic)
      .replace("{TYPE}", state.interjectType || "none")
      .replace("{TARGET}", state.target || "none")
      .replace("{REASON}", state.reason || "")
      .replace("{ENGAGEMENT}", engagementSummary(room));
  } else if (room.phase === "adaptive_questions") {
    systemPrompt = ADAPTIVE_QUESTION_PROMPT
      .replace("{LANG}", room.language || "English")
      .replace("{TOPIC}", room.topic)
      .replace("{TARGET}", state.target || pickUnresponsiveStudent(room) || studentNames(room)[0] || "student")
      .replace("{OTHER}", otherStudent(room, state.target || null))
      .replace("{ENGAGEMENT}", engagementSummary(room))
      .replace("{TRANSCRIPT}", buildTranscript(room, 45));
  } else {
    return { response: "" };
  }

  const res = await llm.invoke([new SystemMessage(systemPrompt), ...history]);
  const text = sanitizeFacilitatorText(typeof res.content === "string" ? res.content : JSON.stringify(res.content));

  tickSilenceCounters(room);
  room.facilitatorRounds++;
  return { response: text || "" };
}

function routeDecision(state: typeof FacilitatorState.State): "reply" | typeof END {
  return state.decision === "YES" ? "reply" : END;
}

const graph = new StateGraph(FacilitatorState)
  .addNode("decide", decideNode)
  .addNode("reply", replyNode)
  .addEdge(START, "decide")
  .addConditionalEdges("decide", routeDecision, ["reply", END])
  .addEdge("reply", END)
  .compile();

async function postFacilitator(room: RoomState, content: string, idSuffix = "") {
  const clean = sanitizeFacilitatorText(content || "");
  if (!clean) return;
  broadcast(room, {
    id: `f-${Date.now()}${idSuffix ? `-${idSuffix}` : ""}`,
    role: "facilitator",
    username: "Dr. Feynman",
    content: clean,
    timestamp: Date.now(),
  });
}

async function runDiscussionToAdaptiveTransition(room: RoomState) {
  if (room.phase !== "discussion_3min" || !room.discussionStartAt) return;
  if (room.discussionTransitionDone || room.transitionLock) return;
  if (Date.now() - room.discussionStartAt < DISCUSSION_MS) return;

  room.transitionLock = true;
  try {
    room.discussionTransitionDone = true;

    const students = studentNames(room);
    const studentsCsv = students.join(", ");

    // Detailed discussion feedback
    const feedbackPrompt = DISCUSSION_FEEDBACK_PROMPT
      .replace("{LANG}", room.language || "English")
      .replace("{TOPIC}", room.topic)
      .replace("{STUDENTS}", studentsCsv)
      .replace("{TRANSCRIPT}", buildTranscript(room, 140));

    const fb = await llm.invoke([new SystemMessage(feedbackPrompt)]);
    const fbText = sanitizeFacilitatorText(typeof fb.content === "string" ? fb.content : JSON.stringify(fb.content));

    await postFacilitator(
      room,
      fbText ||
        `What went well:
- ${students[0] || "Student 1"}: made clear effort identifying photosynthesis inputs.
- ${students[1] || "Student 2"}: contributed examples and tried to refine the explanation.

What needs correction:
- ${students[0] || "Student 1"}: mixed up CO2 and oxygen transformation.
- ${students[1] || "Student 2"}: unclear sequence of process steps.

How to improve next:
- ${students[0] || "Student 1"}: explain photosynthesis as light + water + CO2 -> glucose + oxygen.
- ${students[1] || "Student 2"}: describe the process in order with one concrete example.`,
      "discussion-feedback"
    );

    room.discussionFeedbackDone = true;

    // Required transition sentence
    await postFacilitator(room, "Now I am going to ask you some questions to deepen understanding.", "to-adaptive-line");

    // switch phase + kickoff question
    room.phase = "adaptive_questions";

    const kickPrompt = ADAPTIVE_KICKOFF_PROMPT
      .replace("{LANG}", room.language || "English")
      .replace("{TOPIC}", room.topic)
      .replace("{STUDENTS}", studentsCsv)
      .replace("{ENGAGEMENT}", engagementSummary(room));

    const kick = await llm.invoke([new SystemMessage(kickPrompt)]);
    const kickText = sanitizeFacilitatorText(typeof kick.content === "string" ? kick.content : JSON.stringify(kick.content));

    const first = pickUnresponsiveStudent(room) || students[0] || "Student A";
    const second = students.find((s) => s !== first) || students[1] || "Student B";
    const fallbackKick = `Now I am going to ask you some questions to deepen understanding. What are the inputs and outputs of photosynthesis? ${first}, answer first. ${second}, add or correct after.`;

    await postFacilitator(room, kickText || fallbackKick, "adaptive-kickoff");
    room.adaptiveKickoffDone = true;
  } finally {
    room.transitionLock = false;
  }
}

async function generatePrivateFeedbackForAll(room: RoomState) {
  const students = studentNames(room);
  const transcript = buildTranscript(room, 160);
  const engagement = engagementSummary(room);

  const feedbackMap: Record<string, string> = {};
  for (const s of students) {
    const p = FINAL_PRIVATE_FEEDBACK_PROMPT
      .replace("{LANG}", room.language || "English")
      .replace("{TOPIC}", room.topic)
      .replace("{STUDENT}", s)
      .replace("{TRANSCRIPT}", transcript)
      .replace("{ENGAGEMENT}", engagement);

    const out = await llm.invoke([new SystemMessage(p)]);
    const text = sanitizeFacilitatorText(typeof out.content === "string" ? out.content : JSON.stringify(out.content));
    feedbackMap[s] = text || `For ${s}: Good effort. Keep practicing correct input/output flow in photosynthesis.`;
  }

  room.privateFeedbackByStudent = feedbackMap;
  room.privateFeedbackReady = true;
}

async function maybeFacilitate(room: RoomState) {
  if (room.busy) {
    if (Date.now() - room.busySince > 30_000) room.busy = false;
    else return;
  }

  room.busy = true;
  room.busySince = Date.now();

  try {
    if (room.phase === "waiting" && room.participants.size >= MIN_STUDENTS_TO_START) {
      room.phase = "discussion_3min";
      room.discussionStartAt = Date.now();
      room.lastSilencePromptAt = 0;
      room.discussionFeedbackDone = false;
      room.discussionTransitionDone = false;
      room.adaptiveKickoffDone = false;
      room.feedbackGenerated = false;
      room.privateFeedbackReady = false;
      room.privateFeedbackByStudent = {};
      room.facilitatorRounds = 0;
      room.adaptiveQuestionCount = 0;
      room.adaptiveTarget = null;

      const intro = await llm.invoke([
        new SystemMessage(DISCUSSION_INTRO),
        new HumanMessage(`Topic: ${room.topic}. Language: ${room.language}. Students: ${studentNames(room).join(", ")}`),
      ]);
      await postFacilitator(room, typeof intro.content === "string" ? intro.content : JSON.stringify(intro.content), "intro");
      return;
    }

    const before = room.phase;
    await runDiscussionToAdaptiveTransition(room);
    if (before === "discussion_3min" && room.phase === "adaptive_questions") return;

    // adaptive controlled sequence (no timer-based repeated 30s chain)
    if (room.phase === "adaptive_questions") {
      // only ask next adaptive question after at least one student response since last facilitator
      const sinceFac = msgsSinceLastFacilitator(room);
      const hasStudentReply = sinceFac.some((m) => m.role === "student");

      if (hasStudentReply) {
        const target = pickUnresponsiveStudent(room) || studentNames(room)[0] || "";
        room.adaptiveTarget = target;

        const reply = await replyNode({
          roomId: room.id,
          transcript: buildTranscript(room, 45),
          decision: "YES",
          interjectType: "participation_nudge",
          target,
          reason: "continue adaptive",
          response: "",
        } as typeof FacilitatorState.State);

        await postFacilitator(room, reply.response, "adaptive-next");
        room.adaptiveQuestionCount++;
      }

      if (room.adaptiveQuestionCount >= MAX_ADAPTIVE_QUESTIONS && !room.feedbackGenerated) {
        room.phase = "personal_feedback";
        room.feedbackGenerated = true;

        await generatePrivateFeedbackForAll(room);

        await postFacilitator(
          room,
          "✅ Personalized feedback is ready for each student. Click “View My Feedback” to see your private feedback.",
          "private-feedback-ready"
        );
      }

      return;
    }

    if (room.phase === "discussion_3min") {
      const result = await graph.invoke({
        roomId: room.id,
        transcript: buildTranscript(room, 45),
        decision: "",
        interjectType: "none",
        target: "",
        reason: "",
        response: "",
      });

      if (result.response) {
        await postFacilitator(room, result.response, "discussion-live");
      }
    }
  } catch (e) {
    console.error("[FACILITATE] Error:", e);
  } finally {
    room.busy = false;
  }
}

function startHeartbeat() {
  if (g.heartbeatStarted) return;
  g.heartbeatStarted = true;

  setInterval(() => {
    for (const room of g.rooms.values()) {
      if (room.participants.size === 0) continue;
      maybeFacilitate(room).catch(console.error);
    }
  }, 5000);
}
startHeartbeat();

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  if (q.has("topics")) {
    return NextResponse.json({ topics: topicLobbyView() });
  }

  if (q.has("session")) {
    const username = (q.get("username") || "").trim();
    const room = username ? getRoomByUser(username) : null;
    if (!room) {
      return NextResponse.json({
        phase: "waiting",
        topic: "",
        students: [],
        roomId: null,
        language: "English",
        discussionEndsAt: null,
        privateFeedbackReady: false,
      });
    }

    const discussionEndsAt =
      room.phase === "discussion_3min" && room.discussionStartAt ? room.discussionStartAt + DISCUSSION_MS : null;

    return NextResponse.json({
      phase: room.phase,
      topic: room.topic,
      students: [...room.participants],
      roomId: room.id,
      language: room.language,
      discussionEndsAt,
      privateFeedbackReady: room.privateFeedbackReady,
    });
  }

  if (q.has("history")) {
    const username = (q.get("username") || "").trim();
    const room = username ? getRoomByUser(username) : null;
    return NextResponse.json({
      messages: room?.msgs ?? [],
      phase: room?.phase ?? "waiting",
      topic: room?.topic ?? "",
      language: room?.language ?? "English",
    });
  }

  if (q.has("my_feedback")) {
    const username = (q.get("username") || "").trim();
    const room = username ? getRoomByUser(username) : null;
    if (!room) return NextResponse.json({ ready: false, feedback: "" });

    return NextResponse.json({
      ready: room.privateFeedbackReady,
      feedback: room.privateFeedbackByStudent[username] || "",
    });
  }

  if (q.has("stream")) {
    const username = (q.get("username") || "").trim();
    const room = username ? getRoomByUser(username) : null;
    if (!room) return new Response("No room", { status: 400 });

    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(enc.encode(": ok\n\n"));
        const unsub = subscribe(room, (msg) => {
          try {
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`));
          } catch {
            unsub();
          }
        });
        const hb = setInterval(() => {
          try {
            ctrl.enqueue(enc.encode(": hb\n\n"));
          } catch {
            clearInterval(hb);
            unsub();
          }
        }, 15_000);
        (ctrl as any)._c = () => {
          unsub();
          clearInterval(hb);
        };
      },
      cancel(ctrl) {
        (ctrl as any)?._c?.();
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
    const username = String(body.username || "").trim();
    const topic = String(body.topic || "").trim();
    const language = String(body.language || "English").trim();

    if (!username || !topic) {
      return NextResponse.json({ error: "username and topic required" }, { status: 400 });
    }

    const room = getOrCreateRoom(topic, language);
    const prev = getRoomByUser(username);

    if (prev && prev.id !== room.id) {
      prev.participants.delete(username);
      prev.profiles.delete(username);
    }

    room.participants.add(username);
    getProfile(room, username);
    g.userRoom.set(username, room.id);

    if (room.participants.size < MIN_STUDENTS_TO_START) {
      await postFacilitator(
        room,
        `👋 Welcome ${username}! Waiting for one more student to join before we start the 3-minute discussion.`,
        "waiting-peer"
      );
    }

    maybeFacilitate(room).catch(console.error);

    return NextResponse.json({
      ok: true,
      roomId: room.id,
      phase: room.phase,
      topic: room.topic,
      language: room.language,
      students: [...room.participants],
    });
  }

  if (body.action === "reset_room") {
    const username = String(body.username || "").trim();
    const room = username ? getRoomByUser(username) : null;
    if (!room) return NextResponse.json({ ok: true });

    room.phase = "waiting";
    room.discussionStartAt = null;
    room.feedbackGenerated = false;
    room.discussionFeedbackDone = false;
    room.discussionTransitionDone = false;
    room.adaptiveKickoffDone = false;
    room.transitionLock = false;
    room.msgs = [];
    room.profiles = new Map();
    room.facilitatorRounds = 0;
    room.lastSilencePromptAt = 0;
    room.adaptiveQuestionCount = 0;
    room.adaptiveTarget = null;
    room.privateFeedbackByStudent = {};
    room.privateFeedbackReady = false;
    room.busy = false;

    return NextResponse.json({ ok: true });
  }

  const username = String(body.username || "").trim();
  const content = String(body.content || "").trim();
  if (!username || !content) {
    return NextResponse.json({ error: "username and content required" }, { status: 400 });
  }

  const room = getRoomByUser(username);
  if (!room) return NextResponse.json({ error: "Join a topic room first." }, { status: 400 });

  recordStudentMessage(room, username, content);

  broadcast(room, {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: "student",
    username,
    content,
    timestamp: Date.now(),
  });

  maybeFacilitate(room).catch(console.error);

  return NextResponse.json({ ok: true });
}