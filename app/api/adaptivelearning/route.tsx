import { createUIMessageStreamResponse, UIMessage } from "ai";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import path from "path";
import fsp from "fs/promises";

const model = new ChatOllama({
  model: "llama3.2",
  temperature: 0.1,
});

// ─── Prompts: one simple job each ────────────────────────────────────────────
// Short, direct prompts work better than long instructions for small models.
// The Socratic/Feynman decision is made in code, not delegated to the model.

const SOCRATIC_PROMPTS: Record<string, string> = {
  playful: `You are Dr Feynman, a fun and encouraging teaching assistant.
You will be given the lecture title and an overview of the topic so you know what the student is studying.

The student's latest message is either a question or an attempt to answer your previous question.
- If it is an ANSWER: give ONE sentence of feedback (correct / partially correct / incorrect, and why). Then ask ONE short guiding question to push their thinking further.
- If it is a QUESTION (including "what is our topic?", "what are we studying?", etc.): answer it briefly using the lecture context, then ask ONE guiding question.
Do NOT give a full explanation of the concept. Max 3 sentences total. Be warm and encouraging.`,

  guided: `You are a teaching assistant using the Socratic method.
You will be given the lecture title and an overview of the topic so you know what the student is studying.

The student's latest message is either a question or an attempt to answer your previous question.
- If it is an ANSWER: give ONE sentence of feedback (correct / partially correct / incorrect, and why). Then ask ONE focused guiding question to push their thinking further.
- If it is a QUESTION (including "what is our topic?", "what are we studying?", etc.): answer it briefly using the lecture context, then ask ONE guiding question.
Do NOT give a full explanation of the concept. Max 3 sentences total.`,

  accurate: `You are a precise teaching assistant using the Socratic method.
You will be given the lecture title and an overview of the topic so you know what the student is studying.

The student's latest message is either a question or an attempt to answer your previous question.
- If it is an ANSWER: give ONE sentence of feedback (correct / partially correct / incorrect, and the precise error or gap). Then ask ONE targeted question to push their thinking further.
- If it is a QUESTION (including "what is our topic?", "what are we studying?", etc.): answer it briefly using the lecture context, then ask ONE guiding question.
Do NOT give a full explanation of the concept. Use correct technical terminology. Max 3 sentences total.`,
};

const FEYNMAN_PROMPTS: Record<string, string> = {
  playful: `You are Dr Feynman, a fun and encouraging teaching assistant.
The student is stuck. Use the lecture context provided to explain the concept in a friendly, engaging way.
Break it into small steps and use a relatable analogy if helpful.
End with ONE simple check-for-understanding question. Keep it concise.`,

  guided: `You are a teaching assistant.
The student is stuck. Use the lecture context provided to explain the concept clearly and simply.
Break it into small steps. Use one example if helpful.
End with ONE check-for-understanding question. Keep it concise.`,

  accurate: `You are a precise teaching assistant.
The student is stuck. Use the lecture context provided to explain the concept with technical accuracy.
Break it into ordered steps. Flag any simplifications explicitly.
End with ONE rigorous check-for-understanding question. No emojis. Be direct.`,
};

// ─── Retrieval helpers ───────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");
const STUDENT_LIBRARY_PATH = path.join(DATA_DIR, "library.json");
const TEACHER_LIBRARY_PATH = path.join(DATA_DIR, "teachersdata", "library.json");
const WORD_RE = /[A-Za-z0-9']+/g;

type CreatorType = "teacher" | "student";

type LectureEntry = {
  lecture_id: string;
  title: string;
  status: "Uploaded" | "Audio Ready" | "Ready";
  memory_path: string | null;
  chunks_path: string | null;
};

function getLibraryPath(creator?: string): string {
  return creator === "teacher" ? TEACHER_LIBRARY_PATH : STUDENT_LIBRARY_PATH;
}

function normalizeTokens(text: string) {
  return (text.match(WORD_RE) || []).map((x) => x.toLowerCase());
}

function scoreChunk(query: string, chunk: string) {
  const q = normalizeTokens(query);
  const c = normalizeTokens(chunk);
  if (!q.length || !c.length) return 0;
  const qset = new Set(q);
  const counts = new Map<string, number>();
  for (const t of c) counts.set(t, (counts.get(t) || 0) + 1);
  let score = 0;
  for (const t of qset) {
    const n = counts.get(t);
    if (n) score += 1 + Math.log(1 + n);
  }
  return score;
}

function retrieveTopK(query: string, chunks: string[], k = 4) {
  const scored = chunks.map((ch, i) => ({ i, s: scoreChunk(query, ch) }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored
    .slice(0, k)
    .filter((x) => x.s > 0)
    .map((x) => ({ i: x.i, text: chunks[x.i] }));
  return top.length ? top : chunks.slice(0, k).map((text, i) => ({ i, text }));
}

// Title only — tells the model what topic is being studied without providing
// any explanatory content that would cause it to explain instead of ask.
async function getLectureMeta(lectureId: string, creator: CreatorType) {
  try {
    const libraryPath = getLibraryPath(creator);
    const raw = await fsp.readFile(libraryPath, "utf-8");
    const lib = JSON.parse(raw) as LectureEntry[];
    const lecture = lib.find((x) => x.lecture_id === lectureId);
    if (!lecture) return "";
    return `\n\nThe student is currently studying: "${lecture.title}".`;
  } catch (err) {
    console.error("[adaptivelearning] Error loading lecture meta:", err);
    return "";
  }
}

async function getLectureContext(lectureId: string, userText: string, creator: CreatorType) {
  try {
    const libraryPath = getLibraryPath(creator);
    const raw = await fsp.readFile(libraryPath, "utf-8");
    const lib = JSON.parse(raw) as LectureEntry[];
    const lecture = lib.find((x) => x.lecture_id === lectureId);

    if (!lecture || lecture.status !== "Ready" || !lecture.memory_path || !lecture.chunks_path) {
      console.warn("[adaptivelearning] lecture not ready/missing files:", lectureId, creator);
      return "";
    }

    const memory = await fsp.readFile(lecture.memory_path, "utf-8");
    const chunksRaw = JSON.parse(await fsp.readFile(lecture.chunks_path, "utf-8"));
    const chunks: string[] = Array.isArray(chunksRaw)
      ? chunksRaw.map((x: any) => x?.text).filter(Boolean)
      : [];

    if (!chunks.length) return "";

    const top = retrieveTopK(userText, chunks, 4);
    const ctx = top.map((x) => `(Chunk ${x.i})\n${x.text}`).join("\n\n---\n\n");

    return `\n\nLecture title: ${lecture.title}\n\nLecture memory:\n${memory}\n\nRelevant context from selected lecture:\n${ctx}`;
  } catch (err) {
    console.error("[adaptivelearning] Error loading lecture context:", err);
    return "";
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLastUserText(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
  if (!lastUser) return "";
  const parts = (lastUser as any).parts ?? [];
  return parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join(" ");
}

function getMessageText(msg: UIMessage): string {
  const parts = (msg as any).parts ?? [];
  return parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join(" ");
}

// ─── Code-driven phase detection ─────────────────────────────────────────────

// Word-boundary patterns avoid false matches like "not confused" or "I understand".
const STUCK_PATTERNS: RegExp[] = [
  /\bi\s*don'?t\s*know\b/,
  /\bidk\b/,
  /\bno\s+idea\b/,
  /\bnot\s+sure\b/,
  /\bstill\s+confused\b/,
  /\bdon'?t\s+understand\b/,
  /\bcan'?t\s+understand\b/,
  /\bdo\s+not\s+understand\b/,
  /\bi'?m\s+confused\b/,
  /\bcan\s+you\s+explain\b/,
  /\bplease\s+explain\b/,
  /\bwhat\s+do\s+you\s+mean\b/,
  /\bcan\s+you\s+clarify\b/,
  /\bi'?m\s+lost\b/,
  /\bi\s+give\s+up\b/,
  /\bno\s+clue\b/,
  /\bi\s+have\s+no\s+idea\b/,
  /\bhelp\s+me\s+(understand|with\s+this)\b/,
];

// Negation guard: "I'm NOT confused" should not trigger stuck detection.
function isPrecededByNegation(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 25), matchIndex);
  return /\b(not|never|no\s+longer|don'?t\s+think\s+i'?m)\s*$/i.test(before);
}

// Short or meaningless responses after at least one exchange signal confusion.
function isShortUnhelpfulResponse(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (t.length <= 4) return true;                      // "?", "idk", "no", "huh"
  if (/^[?.!\s]+$/.test(t)) return true;               // only punctuation
  if (/^(uh+|um+|hmm+|huh\??|wut|eh\??)$/i.test(t)) return true;
  return false;
}

// Check a single user message text for stuck signals.
function isSingleMessageStuck(text: string, hasHadExchange: boolean): boolean {
  const t = text.toLowerCase().trim();
  if (hasHadExchange && isShortUnhelpfulResponse(t)) return true;
  for (const pattern of STUCK_PATTERNS) {
    const match = pattern.exec(t);
    if (match && !isPrecededByNegation(t, match.index)) return true;
  }
  return false;
}

// Count consecutive stuck user messages from the end of history.
// Walking backwards stops at the first non-stuck user message, so the count
// resets naturally whenever the student engages or asks a fresh question.
function countConsecutiveStuck(messages: UIMessage[]): number {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") continue;
    const text = getMessageText(messages[i]);
    const hasHadExchange = messages.slice(0, i).some((m) => m.role === "assistant");
    if (isSingleMessageStuck(text, hasHadExchange)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("[adaptivelearning] body keys:", Object.keys(body || {}));

    const messages: UIMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    const mode: string = body?.mode ?? "guided";
    const lectureId: string | undefined = body?.lectureId;
    const creatorRaw: string | undefined = body?.creator;
    const creator: CreatorType = creatorRaw === "teacher" ? "teacher" : "student";

    if (!messages.length) {
      console.warn("[adaptivelearning] No messages received");
      return new Response("No messages received", { status: 400 });
    }

    const userText = getLastUserText(messages);

    const greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"];
    const isGreeting =
      greetings.some((g) => userText.trim().toLowerCase().includes(g)) &&
      userText.trim().length < 30;

    // Randomly require 1 or 2 consecutive stuck turns before escalating to Feynman.
    // This creates variability so the student gets at least one extra Socratic push
    // ~50% of the time, encouraging more thinking before answers are given.
    // The count resets automatically when the student sends any non-stuck message.
    const consecutiveStuck = countConsecutiveStuck(messages);
    const stuckThreshold = Math.random() < 0.5 ? 1 : 2;
    const useFeynman = !isGreeting && consecutiveStuck >= stuckThreshold;

    console.log(`[adaptivelearning] phase=${useFeynman ? "feynman" : "socratic"} consecutiveStuck=${consecutiveStuck} threshold=${stuckThreshold}`);

    // Socratic: inject title + overview only (no chunks) so the model knows the topic
    // but doesn't have the answers in front of it.
    // Feynman: inject full context with retrieved chunks so the model can explain properly.
    let context = "";
    if (lectureId && !isGreeting) {
      if (useFeynman) {
        context = await getLectureContext(lectureId, userText, creator);
      } else {
        context = await getLectureMeta(lectureId, creator);
      }
    }

    const promptSet = useFeynman ? FEYNMAN_PROMPTS : SOCRATIC_PROMPTS;
    const selectedPrompt = promptSet[mode] ?? promptSet["guided"];
    const systemMessage = new SystemMessage(selectedPrompt + (context ? context : ""));

    const chatMessages = messages.map((msg: UIMessage) => {
      const textContent = getMessageText(msg);
      if (msg.role === "user") return new HumanMessage(textContent);
      if (msg.role === "assistant") return new AIMessage(textContent);
      return new HumanMessage(textContent);
    });

    const allMessages = [systemMessage, ...chatMessages];

    try {
      const response = await model.stream(allMessages);
      return createUIMessageStreamResponse({
        stream: toUIMessageStream(response),
      });
    } catch (e: any) {
      console.error("[adaptivelearning] stream error:", e);
      return new Response(`Adaptive stream error: ${e?.message || "unknown"}`, { status: 500 });
    }
  } catch (e: any) {
    console.error("[adaptivelearning] fatal error:", e);
    return new Response(`Adaptive route error: ${e?.message || "unknown"}`, { status: 500 });
  }
}
