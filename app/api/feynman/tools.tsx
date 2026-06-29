// app/api/feynman/tools.tsx
// ─────────────────────────────────────────────────────────────────────────────
// LangChain TOOLS the agents can call (tool() + zod schemas), built per-turn so
// they can see the room. The grade tool writes its result onto ctx.lastGrade so
// the engine can read it after the agent loop. Add new tools here.
// ─────────────────────────────────────────────────────────────────────────────

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DIFFICULTY, askJSON, Ctx, Grade } from "./config";
import { retrieve } from "./store";

// the actual grading logic — used by the grade tool AND as a fallback in agents
export async function gradeExplanation(ctx: Ctx, text: string): Promise<Grade> {
  const r = ctx.room, cfg = DIFFICULTY[r.difficulty];
  const conceptLines = r.concepts.map((c) => `${c.id}: ${c.name}`).join("\n");
  const ref = retrieve(text, r.chunks, r.topic) || r.memory.slice(0, 1500);
  const o = await askJSON(
    `You are grading a Feynman-technique explanation. The student is teaching at the "${cfg.label}" level about "${r.topic}".

MARKING RULE for this level: ${cfg.mark}

QUALITY SCORE (0-10) — score by THIS level's standard, not absolute correctness:
- 0-3 = the explanation wouldn't satisfy this audience at all (too vague, wrong, or wrong register)
- 4-5 = partial — touches the idea but misses the level's core ask (analogy for kid / mechanism for teen / precision for adult)
- 6-7 = solid for this level — meets the bar but with small gaps
- 8-9 = excellent for this level — clear, complete, and in the right voice
- 10 = nailed it perfectly for this audience
Use the WHOLE range. Do not default to 5-7.

COVERED vs WEAK: a concept goes in "covered" only if the student's words would PASS the marking rule above. If they touched it but the rule isn't met, put it in "weak". Do not be generous — weak is the right call when the bar isn't met.

Concepts to track:\n${conceptLines}

Reference material (truth source):\n${ref}

Student's explanation:\n"""${text.slice(0, 1500)}"""

Return ONLY JSON: {"covered":["concept-id"],"weak":["concept-id"],"quality":0-10,"note":"one short line on what was strong or missing"}`,
    { temperature: 0.2, maxTokens: 180 }
  );
  const valid = new Set(r.concepts.map((c) => c.id));
  let quality = o ? Number(o.quality) : 5; if (!Number.isFinite(quality)) quality = 5;
  quality = Math.max(0, Math.min(10, quality));
  let covered = o ? (o.covered || []).filter((x: string) => valid.has(x)) : [];
  let weak = o ? (o.weak || []).filter((x: string) => valid.has(x)) : [];
  // enforce the level's bar so the tree truly reflects quality
  if (quality < cfg.qualityBar) { weak = [...new Set([...weak, ...covered])]; covered = []; }
  const grade: Grade = { covered, weak, quality, note: o ? String(o.note || "").slice(0, 200) : "" };
  ctx.lastGrade = grade;
  return grade;
}

export function makeTools(ctx: Ctx) {
  const r = ctx.room;

  // DB / RAG grounding tool
  const retrieveTool = tool(
    async ({ query }: { query: string }) =>
      retrieve(query, r.chunks, r.topic) || r.memory.slice(0, 1200) || "No extra material; rely on the topic name.",
    {
      name: "retrieve_content",
      description: "Look up the real lecture material so your question is grounded in facts. Pass the topic or the student's last words as the query. Call BEFORE asking.",
      schema: z.object({ query: z.string().describe("what to look up in the lecture") }),
    }
  );

  // history / progress tool
  const historyTool = tool(
    async () => JSON.stringify({
      conceptsCovered: r.concepts.filter((c) => r.covered.has(c.id)).map((c) => c.name),
      conceptsStillMissing: r.concepts.filter((c) => !r.covered.has(c.id)).map((c) => c.name),
      questionsYouAlreadyAsked: r.turns.slice(-3).map((t) => t.message).filter(Boolean),
      studentsRecentWords: r.turns.slice(-3).map((t) => t.explanation),
    }),
    {
      name: "get_history",
      description: "See which concepts are covered vs still missing, the questions you already asked (so you never repeat), and the student's recent words.",
      schema: z.object({}),
    }
  );

  // grading tool, named per level: grade_kid / grade_teen / grade_adult
  const gradeTool = tool(
    async ({ explanation }: { explanation: string }) => JSON.stringify(await gradeExplanation(ctx, explanation)),
    {
      name: `grade_${r.difficulty}`,
      description: `Assess the student's latest explanation at the ${DIFFICULTY[r.difficulty].label} level. Returns covered/weak concepts + a 0-10 quality score. Call once on their latest message.`,
      schema: z.object({ explanation: z.string().describe("the student's latest explanation, verbatim") }),
    }
  );

  return { retrieveTool, historyTool, gradeTool };
}