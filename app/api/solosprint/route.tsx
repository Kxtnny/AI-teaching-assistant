import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ChatOllama } from "@langchain/ollama";
import { SystemMessage } from "@langchain/core/messages";

type Verdict = "good" | "bad" | "neutral";
type CreatorType = "teacher" | "student";

type LectureEntry = {
  lecture_id: string;
  title: string;
  status: "Uploaded" | "Audio Ready" | "Ready";
  memory_path: string | null;
  chunks_path: string | null;
};

const llm = new ChatOllama({ model: "llama3.2", temperature: 0.2 });

const DATA_DIR = path.resolve(process.cwd(), "data");
const STUDENT_LIBRARY_PATH = path.join(DATA_DIR, "library.json");
const TEACHER_LIBRARY_PATH = path.join(DATA_DIR, "teachersdata", "library.json");
const STUDENT_LECTURES_DIR = path.join(DATA_DIR, "lectures");
const TEACHER_LECTURES_DIR = path.join(DATA_DIR, "teachersdata", "lectures");

function getLibraryPath(creator: CreatorType) {
  return creator === "teacher" ? TEACHER_LIBRARY_PATH : STUDENT_LIBRARY_PATH;
}
function getFallbackLectureDir(creator: CreatorType) {
  return creator === "teacher" ? TEACHER_LECTURES_DIR : STUDENT_LECTURES_DIR;
}
function normalize(s: string) {
  return String(s || "").trim().toLowerCase();
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
async function readFileIfExists(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}
function parseChunks(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => x?.text).filter((x: any) => typeof x === "string" && x.trim());
}

function tokenize(s: string) {
  return (s.match(/[A-Za-z0-9_]+/g) || []).map((t) => t.toLowerCase());
}

function pickRelevantContext(chunks: string[], query: string, k = 3): string {
  if (!chunks.length) return "";
  const q = new Set(tokenize(query));
  const scored = chunks.map((ch, i) => {
    const toks = tokenize(ch);
    let overlap = 0;
    for (const t of toks) if (q.has(t)) overlap++;
    return { i, overlap, text: ch };
  });
  scored.sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, k).map((x) => x.text).join("\n\n---\n\n");
}

async function loadLectureMemory(lectureId: string, creator: CreatorType) {
  const target = normalize(lectureId);

  // library lookup
  try {
    const raw = await fs.readFile(getLibraryPath(creator), "utf-8");
    const lib = JSON.parse(raw) as LectureEntry[];
    let lecture =
      lib.find((x) => normalize(x.lecture_id) === target) ||
      lib.find((x) => normalize(x.lecture_id).startsWith(target) || target.startsWith(normalize(x.lecture_id)));

    if (lecture) {
      const memPath = lecture.memory_path || path.join(getFallbackLectureDir(creator), lecture.lecture_id, "memory.txt");
      const chunksPath = lecture.chunks_path || path.join(getFallbackLectureDir(creator), lecture.lecture_id, "chunks.json");

      const memory = await readFileIfExists(memPath);
      let chunks: string[] = [];
      try {
        chunks = parseChunks(JSON.parse((await readFileIfExists(chunksPath)) || "[]"));
      } catch {}

      if (memory.trim() && chunks.length) return { memory, chunks, title: lecture.title || "" };
    }
  } catch {}

  // folder fallback
  const dir = path.join(getFallbackLectureDir(creator), lectureId);
  const memory = await readFileIfExists(path.join(dir, "memory.txt"));
  let chunks: string[] = [];
  try {
    chunks = parseChunks(JSON.parse((await readFileIfExists(path.join(dir, "chunks.json"))) || "[]"));
  } catch {}
  return { memory, chunks, title: "" };
}

function extractPreviousTutorQuestions(transcript: string): string[] {
  return transcript
    .split("\n")
    .filter((line) => line.startsWith("system:"))
    .map((line) => line.replace(/^system:\s*/i, "").trim())
    .filter(Boolean)
    .slice(-12);
}

function subtopicPrompt(memory: string, chunks: string[]) {
  return `You are a tutor. From lecture memory + chunks, propose exactly 6 subtopics.

Return ONLY valid JSON array of objects:
[
  {"title":"...", "description":"..."},
  ...
]

Rules:
- titles must be specific (2-6 words)
- descriptions max 14 words
- no generic title like "Basics" or "Overview"

Lecture memory:
${memory}

Chunks:
${chunks.slice(0, 5).join("\n\n---\n\n")}`;
}

function questionPrompt(memory: string, context: string, subtopic: string, previousQuestions: string[]) {
  return `You are an expert Socratic tutor.

Subtopic focus: ${subtopic}

Ask ONE specific conceptual question.
Rules:
- must be about the subtopic
- must use concrete lecture terminology
- must not repeat prior questions
- one sentence only
- return ONLY question text

Prior questions:
${previousQuestions.join("\n") || "None"}

Lecture memory:
${memory}

Relevant context:
${context}`;
}

function evaluatePrompt(memory: string, context: string, subtopic: string, question: string, answer: string) {
  return `Grade the student answer for subtopic: ${subtopic}

Return ONLY valid JSON:
{
  "verdict":"good"|"bad"|"neutral",
  "tip":"one short actionable tip",
  "feedback":"1-2 sentence explanation",
  "scoreDelta": number
}

Scoring:
- good => +10
- neutral => +3
- bad => 0

Question: ${question}
Answer: ${answer}

Lecture memory:
${memory}

Context:
${context}`;
}

function finalFeedbackPrompt(memory: string, transcript: string, score: number, subtopic: string) {
  return `You are Dr. Feynman. Give specific personalized review.

Return ONLY valid JSON:
{
  "summary":"2-3 sentence summary",
  "strengths":["...", "...", "..."],
  "gaps":["...", "...", "..."],
  "improvements":[
    {"action":"...", "why":"...", "example":"..."},
    {"action":"...", "why":"...", "example":"..."}
  ],
  "nextQuestion":"one hard follow-up question on ${subtopic}"
}

Rules:
- Must reference concrete details from student transcript.
- Avoid generic wording.
- Mention at least 2 concept mistakes or missing links.

Lecture memory:
${memory}

Transcript:
${transcript}

Score: ${score}/100
Subtopic: ${subtopic}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const creator: CreatorType = body.creator === "teacher" ? "teacher" : "student";

    // 1) Subtopics
    if (body.action === "subtopics") {
      const { lectureId } = body;
      if (!lectureId) return NextResponse.json({ error: "Missing lectureId" }, { status: 400 });

      const { memory, chunks } = await loadLectureMemory(lectureId, creator);
      if (!memory.trim() || !chunks.length) {
        return NextResponse.json({ error: `Lecture not processed yet for creator=${creator}` }, { status: 400 });
      }

      const out = await llm.invoke([new SystemMessage(subtopicPrompt(memory, chunks))]);
      const raw = typeof out.content === "string" ? out.content : JSON.stringify(out.content);

      try {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed.slice(0, 6) : [];
        if (!items.length) throw new Error("No subtopics");
        return NextResponse.json({ ok: true, items });
      } catch {
        return NextResponse.json({
          ok: true,
          items: [
            { title: "Core Concept", description: "Main mechanism behind this lecture topic" },
            { title: "Pipeline Flow", description: "How components interact step-by-step" },
            { title: "Key Terminology", description: "Critical definitions and where they apply" },
            { title: "Failure Cases", description: "What breaks and why" },
            { title: "Optimization Ideas", description: "How to improve quality or output" },
            { title: "Practical Example", description: "Applying concept to realistic scenario" },
          ],
        });
      }
    }

    // 2) Next question
    if (body.action === "next_question") {
      const { lectureId, transcript = "", subtopic = "" } = body;
      if (!lectureId) return NextResponse.json({ error: "Missing lectureId" }, { status: 400 });
      if (!subtopic) return NextResponse.json({ error: "Missing subtopic" }, { status: 400 });

      const { memory, chunks } = await loadLectureMemory(lectureId, creator);
      if (!memory.trim() || !chunks.length) {
        return NextResponse.json({ error: `Lecture not processed yet for creator=${creator}` }, { status: 400 });
      }

      const previousQuestions = extractPreviousTutorQuestions(transcript);
      const context = pickRelevantContext(chunks, `${subtopic}\n${transcript}`, 3);

      const out = await llm.invoke([new SystemMessage(questionPrompt(memory, context, subtopic, previousQuestions))]);
      let question = (typeof out.content === "string" ? out.content : JSON.stringify(out.content)).trim();

      if (!question || previousQuestions.some((q) => normalize(q) === normalize(question))) {
        question = `Within ${subtopic}, explain one mechanism and why it matters in this lecture context.`;
      }

      return NextResponse.json({ ok: true, question });
    }

    // 3) Grade
    if (body.action === "grade") {
      const { lectureId, question, answer, subtopic = "" } = body;
      if (!lectureId || !question || !answer) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }

      const { memory, chunks } = await loadLectureMemory(lectureId, creator);
      if (!memory.trim() || !chunks.length) {
        return NextResponse.json({ error: `Lecture not processed yet for creator=${creator}` }, { status: 400 });
      }

      const context = pickRelevantContext(chunks, `${subtopic}\n${question}\n${answer}`, 3);

      const out = await llm.invoke([
        new SystemMessage(evaluatePrompt(memory, context, subtopic || "selected topic", question, answer)),
      ]);
      const raw = typeof out.content === "string" ? out.content : JSON.stringify(out.content);

      try {
        const parsed = JSON.parse(raw) as {
          verdict?: Verdict;
          tip?: string;
          feedback?: string;
          scoreDelta?: number;
        };

        const verdict: Verdict =
          parsed.verdict === "good" || parsed.verdict === "bad" || parsed.verdict === "neutral"
            ? parsed.verdict
            : "neutral";

        let scoreDelta = typeof parsed.scoreDelta === "number" ? parsed.scoreDelta : verdict === "good" ? 10 : verdict === "neutral" ? 3 : 0;
        scoreDelta = verdict === "good" ? 10 : verdict === "neutral" ? 3 : 0; // force your policy

        return NextResponse.json({
          ok: true,
          verdict,
          tip: parsed.tip || "Name one concrete term, then explain its role.",
          feedback: parsed.feedback || "",
          scoreDelta,
        });
      } catch {
        return NextResponse.json({
          ok: true,
          verdict: "neutral",
          tip: "Use one key term and one cause-effect relation.",
          feedback: "Partially relevant. Add mechanism-level detail.",
          scoreDelta: 3,
        });
      }
    }

    // 4) Final feedback
    if (body.action === "final_feedback") {
      const { lectureId, transcript = "", score = 0, subtopic = "" } = body;
      if (!lectureId) return NextResponse.json({ error: "Missing lectureId" }, { status: 400 });

      const { memory } = await loadLectureMemory(lectureId, creator);
      if (!memory.trim()) {
        return NextResponse.json({ error: `Lecture not processed yet for creator=${creator}` }, { status: 400 });
      }

      const out = await llm.invoke([
        new SystemMessage(finalFeedbackPrompt(memory, transcript, score, subtopic || "chosen topic")),
      ]);
      const raw = typeof out.content === "string" ? out.content : JSON.stringify(out.content);

      try {
        const parsed = JSON.parse(raw);
        return NextResponse.json({ ok: true, feedback: parsed });
      } catch {
        return NextResponse.json({
          ok: true,
          feedback: {
            summary: "You showed partial understanding, but several answers stayed surface-level.",
            strengths: ["Stayed mostly on topic", "Attempted technical language", "Responded consistently"],
            gaps: ["Weak mechanism explanation", "Missing cause-effect links", "Insufficient examples"],
            improvements: [
              {
                action: "Use structure: definition → mechanism → implication.",
                why: "This forces depth over generic responses.",
                example: "‘X is..., it works by..., therefore it improves...’",
              },
              {
                action: "Include one exact lecture term each answer.",
                why: "Grounding increases specificity and correctness.",
                example: "Use explicit terms from the subtopic context.",
              },
            ],
            nextQuestion: `In ${subtopic || "this topic"}, explain one mechanism with a concrete example and one limitation.`,
          },
        });
      }
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error in solosprint route" }, { status: 500 });
  }
}