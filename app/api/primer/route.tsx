// app/api/primer/route.tsx  (v11)
// GROVE · Feature 1 — "Lecture / Primer": teaches the lecture before the dialogue.
// v11 change: each section is now a short TITLE + a list of concise BULLETS
// (lecture-slide style) rather than a prose paragraph. The UI reveals the bullets
// one at a time while a tutor avatar "speaks" them.
// Still self-contained; still creates the shared session record.

import { NextRequest, NextResponse } from "next/server";
import { SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import path from "path";
import fsp from "fs/promises";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const fastModel = new ChatOpenAI({ modelName: MODEL, temperature: 0, maxTokens: 700, openAIApiKey: process.env.OPENAI_API_KEY });

const DATA_DIR = path.resolve(process.cwd(), "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");

function libPath(creator?: string) {
  return creator === "teacher" ? path.join(DATA_DIR, "teachersdata", "library.json") : path.join(DATA_DIR, "library.json");
}
async function loadLibrary(creator?: string): Promise<any[]> {
  try { return JSON.parse(await fsp.readFile(libPath(creator), "utf-8")); } catch { return []; }
}
async function getLecture(lectureId: string, creator: string): Promise<{ title: string; memory: string } | null> {
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
const slug = (s: string) => (s || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "anon";

// Split a prose body into bullet-sized lines (fallback only).
function splitToBullets(text: string): string[] {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function buildPrimerPrompt(topic: string, memory: string) {
  return `You are a teacher giving a short, friendly lecture on "${topic}". Using ONLY the lecture content below, produce a slide-style primer the student can absorb in about 60-90 seconds BEFORE you discuss it together.

Requirements:
- 3 to 5 sections, ordered so understanding builds naturally.
- Each section has a SHORT title (max 6 words) and 2-4 BULLET POINTS.
- Each bullet is ONE short, plain-language idea (max 16 words). No sub-bullets, no markdown symbols, no trailing period needed.
- Bullets should read like lecture talking points, not full paragraphs.
- Also list 4-8 key terms the student should recognise.

Return ONLY JSON:
{"sections":[{"title":"...","bullets":["...","...","..."]}],"keyTerms":["...","..."]}

Lecture content:
${memory.slice(0, 3000)}`;
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const lectureId: string = b?.lectureId;
    const creator = b?.creator === "teacher" ? "teacher" : "student";
    if (!lectureId) return NextResponse.json({ error: "lectureId required" }, { status: 400 });

    const sessionId: string =
      b?.sessionId || `${creator}:${lectureId}:${slug(b?.studentName || "anon")}:${Date.now().toString(36)}`;

    // Create the shared session record if it doesn't exist yet.
    let session = await loadSession(sessionId);
    if (!session) {
      session = {
        sessionId,
        studentName: String(b?.studentName || "anon"),
        lectureId, creator,
        topic: String(b?.topic || ""),
        tone: ["playful", "guided", "accurate"].includes(b?.tone) ? b.tone : "guided",
        createdAt: Date.now(),
        phase: "primer",
        primer: null,
        treePoints: 0,
      };
      await saveSession(session);
    }
    const lec = await getLecture(lectureId, creator);
    if (!lec) return NextResponse.json({ error: "Lecture not found or not ready" }, { status: 404 });

    // serve cached primer, but only if it's already in the new bullet shape
    if (session.primer && Array.isArray(session.primer.sections) && session.primer.sections[0]?.bullets) {
      return NextResponse.json({ sessionId, primer: session.primer, title: lec.title, cached: true });
    }

    let primer: any;
    try {
      const res = await fastModel.invoke([new SystemMessage(buildPrimerPrompt(lec.title, lec.memory))]);
      const obj = extractJSON(res.content as string);
      primer = {
        sections: (obj.sections || []).slice(0, 5).map((x: any) => {
          const bullets = Array.isArray(x.bullets) && x.bullets.length
            ? x.bullets.map((bl: any) => String(bl).replace(/^[-•\s]+/, "").slice(0, 140)).filter(Boolean).slice(0, 4)
            : splitToBullets(x.body);            // fallback if the model returned prose
          return { title: String(x.title || "").slice(0, 60), bullets };
        }).filter((s: any) => s.bullets.length),
        keyTerms: (obj.keyTerms || []).slice(0, 8).map((t: any) => String(t).slice(0, 40)),
        createdAt: Date.now(),
      };
      if (!primer.sections.length) throw new Error("empty");
    } catch {
      primer = {
        sections: [{ title: lec.title, bullets: [`A quick look at ${lec.title} before we explore it together.`] }],
        keyTerms: [],
        createdAt: Date.now(),
      };
    }

    session.primer = primer;
    await saveSession(session);
    return NextResponse.json({ sessionId, primer, title: lec.title });
  } catch (e: any) {
    console.error("[primer] error:", e);
    return NextResponse.json({ error: e?.message || "primer error" }, { status: 500 });
  }
}