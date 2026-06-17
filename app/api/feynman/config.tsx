// app/api/feynman/config.tsx
// ─────────────────────────────────────────────────────────────────────────────
// THE KNOBS + shared helpers + shared types. Every other file imports from here.
// Edit personas / question difficulty / marking strictness / timer below.
// ─────────────────────────────────────────────────────────────────────────────

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";

export const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// one place to make a model; pass overrides like { temperature: 0.6 }
export const chat = (o: Record<string, any> = {}) =>
  new ChatOpenAI({ modelName: MODEL, openAIApiKey: process.env.OPENAI_API_KEY, ...o });

// plain JSON helper (used by the non-tool calls: concept extraction + feedback)
export async function askJSON(prompt: string, o: Record<string, any> = {}): Promise<any | null> {
  try {
    const res = await chat(o).invoke([new SystemMessage(prompt)]);
    return parseJSON(String(res.content || ""));
  } catch { return null; }
}
function parseJSON(text: string): any {
  const c = String(text).replace(/```json|```/g, "").trim();
  try { return JSON.parse(c); } catch {}
  const m = c.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error("no json");
}
export const slug = (s: string) =>
  (s || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "anon";

// ── shared types ─────────────────────────────────────────────────────────────
export type Difficulty = "kid" | "teen" | "adult";
export interface Concept { id: string; name: string; hint: string }
export interface Grade { covered: string[]; weak: string[]; quality: number; note: string }
export interface Turn { explanation: string; quality: number; coveredNow: string[]; message: string }
export interface FeedbackReport {
  understanding: number; wrote: string; missing: string; better: string;
  improve: string[]; summary: string; mastered: string[]; gaps: string[];
}
export interface Room {
  sessionId: string; studentName: string; creator: string; lectureId: string;
  topic: string; difficulty: Difficulty; mood: string;
  memory: string; chunks: string[];
  concepts: Concept[]; covered: Set<string>; weak: Set<string>;
  startTime: number; ended: boolean; endReason?: string; score: number;
  qualitySum: number; qualityCount: number; turns: Turn[]; lastMessage: string; report?: FeedbackReport;
}
// handed to tools each turn; lastGrade captures the grade tool's result
export interface Ctx { room: Room; lastGrade: Grade | null }

// ═══════════════════════════ THE KNOBS — EDIT HERE ═══════════════════════════
export const DIFFICULTY: Record<Difficulty, {
  label: string; who: string;       // shown to the user
  persona: string;                  // who the AI is + tone
  ask: string;                      // how hard / what style the questions are
  mark: string;                     // what counts as "covered" when grading
  qualityBar: number;               // a concept only counts as covered if quality >= this
  threshold: number;                // mastery target (share of concepts, 0..1)
  multiplier: number;               // score weight
  duration: number;                 // TIMER length in seconds
  concepts: number;                 // how many key concepts to pull from the lecture
}> = {
  kid: {
    label: "a kid", who: "Pip",
    persona: "You are Pip, a bright, excitable 5-year-old who ADORES learning. The user is your teacher and you think they're amazing. Short, simple sentences, lots of wonder, a couple of friendly emojis.",
    ask: "Ask ONE tiny, simple follow-up using only words a 5-year-old knows. Be playful. Anchor it to everyday things (toys, animals, snacks). Never ask for big words or technical detail — just 'why', 'what happens next', or 'show me with an example?'.",
    mark: "Covered = the correct BASIC idea in any simple way (a good analogy or plain-words intuition is plenty; no technical terms needed). Vague or half-right → weak.",
    qualityBar: 5, threshold: 0.55, multiplier: 1.0, duration: 360, concepts: 5,
  },
  teen: {
    label: "a teenager", who: "Maya",
    persona: "You are Maya, a sharp, friendly 15-year-old who loves when an idea 'clicks'. The user is teaching you. Curious, a little playful, likes real-life connections.",
    ask: "Ask ONE follow-up that digs into the HOW or WHY, or asks for a real example. Everyday language; if you use a term, explain it in a few words.",
    mark: "Covered = correct REASONING or a mechanism (the how/why), not just naming the idea. Small gaps or a missing 'why' → weak.",
    qualityBar: 6.5, threshold: 0.72, multiplier: 1.25, duration: 300, concepts: 6,
  },
  adult: {
    label: "an adult", who: "Sam",
    persona: "You are Sam, a thoughtful 25-year-old peer learner who likes getting to the bottom of things. The user is teaching you. Precise but warm and conversational — never a lecturer.",
    ask: "Ask ONE precise, probing follow-up — a mechanism, edge case, trade-off, or how two ideas connect. Use correct terms but stay conversational and briefly define any jargon.",
    mark: "Covered = TECHNICALLY ACCURATE, correct terminology, real depth. Anything vague or imprecise → weak.",
    qualityBar: 8, threshold: 0.88, multiplier: 1.5, duration: 240, concepts: 7,
  },
};
