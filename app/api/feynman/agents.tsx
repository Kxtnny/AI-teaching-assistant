// app/api/feynman/agents.tsx
// ─────────────────────────────────────────────────────────────────────────────
// THE AGENTS. runAgent() is the generic bindTools loop (calls tools until the
// model gives a plain reply). teacherTurn/makeHint use it; makeFeedback is a
// single synthesis call over the grades captured during the session.
// ─────────────────────────────────────────────────────────────────────────────

import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { chat, DIFFICULTY, askJSON, Room, Ctx, Grade, FeedbackReport } from "./config";
import { makeTools, gradeExplanation } from "./tools";

// generic bindTools loop: keep calling tools until the model returns a plain reply
async function runAgent(system: string, human: string, tools: any[], temperature = 0.6): Promise<string> {
  const llm = chat({ temperature }).bindTools(tools);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  const msgs: any[] = [new SystemMessage(system), new HumanMessage(human)];
  for (let hop = 0; hop < 4; hop++) {
    const ai: any = await llm.invoke(msgs);
    msgs.push(ai);
    const calls = ai.tool_calls || [];
    if (!calls.length) return String(ai.content || "").trim();
    for (const tc of calls) {
      let result = "";
      try { const t = byName[tc.name]; result = t ? await t.invoke(tc.args) : `unknown tool ${tc.name}`; } catch { result = "tool error"; }
      msgs.push(new ToolMessage({ content: typeof result === "string" ? result : JSON.stringify(result), tool_call_id: tc.id }));
    }
  }
  return ""; // ran out of hops without a final reply
}

// builds the teaching system+human prompt (shared by streaming + non-streaming)
async function buildTeachPrompt(r: Room, text: string) {
  const cfg = DIFFICULTY[r.difficulty];
  const maxSent = r.difficulty === "adult" ? 3 : 2;
  const emoji = r.difficulty === "kid" ? " Use a friendly emoji." : "";
  const { retrieve } = await import("./store");
  const ref = retrieve(text, r.chunks, r.topic) || r.memory.slice(0, 800);
  const missing = r.concepts.filter((c) => !r.covered.has(c.id)).map((c) => c.name);
  const allConcepts = r.concepts.map((c) => c.name);
  const recentAsked = r.turns.slice(-3).map((t) => t.message).filter(Boolean);

  const system = `${cfg.persona}

The user is TEACHING you about "${r.topic}". Keep them teaching (Feynman technique): build on EXACTLY what they said and gently draw out the next piece. Warm conversation, NOT a quiz: never test them, never ask them to define a term cold, never say "tell me more" with nothing specific attached.

HOW TO ASK: ${cfg.ask}

CRITICAL: Your question must be about "${r.topic}" and its concepts — NEVER about ordinary English words (never ask "what's a sentence/word/story?"). Anchor every question to a specific technical thing the user just said or to one of these key concepts: ${allConcepts.join(", ")}.

Reference material to ground your follow-up (use this, don't make stuff up):
${ref}

Concepts still missing for the student to teach: ${missing.length ? missing.join(", ") : "(all touched)"}
Questions you already asked (do not repeat): ${recentAsked.length ? recentAsked.map((q) => `- ${q}`).join("\n") : "(none yet)"}

Reply IN CHARACTER as ${cfg.who} with ONE follow-up that anchors to a specific topic word they used. 1-${maxSent} short sentences.${emoji} Output ONLY what you say out loud — no preamble, no labels.`;
  const human = `The student just taught you:\n"""${text}"""\n\nReply with ONE warm, on-topic follow-up.`;
  return { system, human };
}

// fallback follow-up if the model returns nothing usable (persona-aware)
function fallbackReply(r: Room): string {
  const c = r.concepts.find((x) => !r.covered.has(x.id));
  if (r.difficulty === "kid") return c ? `wait wait i'm a little lost 🤔 can you tell me about ${c.name}? but with small words please` : `okayyy one more thing — can you tell me the WHOLE thing again real quick? 😊`;
  if (r.difficulty === "teen") return c ? `ohh wait okay — can you break down ${c.name} for me? like how does that part actually work?` : `okay cool — can you wrap it all up? like the main idea in one go?`;
  return c ? `Hmm, I'd like to dig into ${c.name} a bit more — could you walk me through how that actually works and why it matters?` : `Could you tie this all together — what's the core mechanism, and what would break if it weren't there?`;
}

// TEACHING agent — grades + grounds + asks one Feynman follow-up. Returns the
// reply AND the grade. Optimized: grading + reply happen in PARALLEL on one LLM
// call each, instead of the slow bindTools loop (which made 3-4 sequential calls).
export async function teacherTurn(r: Room, text: string): Promise<{ reply: string; grade: Grade }> {
  const ctx: Ctx = { room: r, lastGrade: null };
  const { system, human } = await buildTeachPrompt(r, text);

  // ── fire BOTH calls at once (grade + reply) — cuts latency roughly in half
  const replyPromise = chat({ temperature: 0.6, maxTokens: 120 })
    .invoke([new SystemMessage(system), new HumanMessage(human)])
    .then((res) => String(res.content || "").trim()).catch(() => "");
  const gradePromise = gradeExplanation(ctx, text);

  const [replyRaw, grade] = await Promise.all([replyPromise, gradePromise]);
  let reply = replyRaw;
  if (!reply || /^(tell me more|go on|keep going|interesting)\b/i.test(reply)) reply = fallbackReply(r);
  return { reply: reply.slice(0, 320), grade };
}

// STREAMING teaching agent — yields reply tokens as the model generates them,
// while grading runs in parallel. Resolves the grade + final reply at the end.
// onToken is called for each text chunk; returns { reply, grade } when done.
export async function teacherStream(
  r: Room,
  text: string,
  onToken: (chunk: string) => void
): Promise<{ reply: string; grade: Grade }> {
  const ctx: Ctx = { room: r, lastGrade: null };
  const { system, human } = await buildTeachPrompt(r, text);

  // grade runs in parallel — it doesn't block the streamed reply
  const gradePromise = gradeExplanation(ctx, text);

  // stream the reply token-by-token
  let reply = "";
  try {
    const stream = await chat({ temperature: 0.6, maxTokens: 120 }).stream([
      new SystemMessage(system), new HumanMessage(human),
    ]);
    for await (const chunk of stream) {
      const piece = String(chunk?.content || "");
      if (piece) { reply += piece; onToken(piece); }
    }
    reply = reply.trim();
  } catch { reply = ""; }

  const grade = await gradePromise;
  if (!reply || /^(tell me more|go on|keep going|interesting)\b/i.test(reply)) {
    reply = fallbackReply(r);
    onToken(reply); // emit the fallback so the client still shows something
  }
  return { reply: reply.slice(0, 320), grade };
}

// HINT agent — uses the history tool to say WHAT to explain next (an instruction, not a question)
export async function makeHint(r: Room): Promise<string> {
  const ctx: Ctx = { room: r, lastGrade: null };
  const { historyTool } = makeTools(ctx);
  const cfg = DIFFICULTY[r.difficulty];
  const recent = r.turns.slice(-3);
  const stuck = recent.length >= 2 && recent.every((t) => t.quality < cfg.qualityBar);
  const system = `${cfg.persona}
The user is teaching you about "${r.topic}" but may be stuck${stuck ? " (their last explanations stayed vague)" : ""}.
Call get_history to see which concept is still missing or weak.
Then give ONE short, concrete INSTRUCTION telling them WHAT to explain next — name the concept and what to cover, e.g. "Try explaining «X» — say what it does and why it matters." This is a tip, NOT a question (do not end with '?'). Keep it to 1-2 sentences in ${cfg.label} language.`;
  let reply = "";
  try { reply = await runAgent(system, "Tell the student what to explain next. Use get_history first.", [historyTool], 0.4); } catch {}
  if (!reply) {
    const miss = r.concepts.find((c) => !r.covered.has(c.id));
    reply = miss ? `Try explaining «${miss.name}» next — ${miss.hint || "say what it is and why it matters"}.` : "Try tying everything together in one short summary.";
  }
  return reply.slice(0, 280);
}

// CHEER agent — a short, mood-aware pick-me-up before the lesson (3 moods)
export async function cheerUp(mood: string): Promise<string> {
  const m = (mood || "").toLowerCase();
  const tone = m.includes("sad") ? "gentle, warm and comforting"
    : m.includes("bored") ? "playful and intriguing, spark some curiosity"
    : "upbeat and celebratory, match their good energy";
  try {
    const res = await chat({ temperature: 0.85, maxTokens: 90 }).invoke([new SystemMessage(
      `A learner is about to teach you something, and right now they feel "${mood}". In ONE or TWO short sentences, give them a ${tone} cheer-up that gets them excited to start. You may weave in a tiny uplifting quote. Use exactly one emoji. Output only the message.`
    )]);
    const t = String(res.content || "").trim();
    if (t) return t.slice(0, 240);
  } catch {}
  return m.includes("sad") ? "Be gentle with yourself today — teaching one small idea can lift the whole mood. 💛"
    : m.includes("bored") ? "Let's shake off the boredom — the best way to make something interesting is to explain it your way. ✨"
    : "Love that energy — let's pour it into teaching me something! ⚡";
}

// FEEDBACK agent — synthesises the grades captured during the session + history.
// (Coverage is computed inline here so this file never has to import the engine.)
export async function makeFeedback(r: Room): Promise<FeedbackReport> {
  const cfg = DIFFICULTY[r.difficulty];
  const total = Math.max(1, r.concepts.length);
  const percent = Math.min(100, Math.round(((r.covered.size + r.weak.size * 0.3) / total) * 100));
  const cov = { covered: r.covered.size, total, percent };
  const mastered = r.concepts.filter((c) => r.covered.has(c.id)).map((c) => c.name);
  const weak = r.concepts.filter((c) => r.weak.has(c.id) && !r.covered.has(c.id)).map((c) => c.name);
  const missing = r.concepts.filter((c) => !r.covered.has(c.id) && !r.weak.has(c.id)).map((c) => c.name);
  const gaps = r.concepts.filter((c) => !r.covered.has(c.id)).map((c) => c.name);
  const avgQ = r.qualityCount ? (r.qualitySum / r.qualityCount).toFixed(1) : "0";
  const transcript = r.turns.map((t, i) => `${i + 1}. (q${t.quality}/10) "${t.explanation}"`).join("\n").slice(0, 3000);

  const o = await askJSON(
    `You are the feedback coach for a Feynman session. The student taught "${r.topic}" at the "${cfg.label}" level (marking rule: ${cfg.mark}).
Be ELABORATE and SPECIFIC — name the actual concepts and refer to their real words. No generic filler.
Coverage ${cov.covered}/${cov.total} (${cov.percent}%), avg quality ${avgQ}/10.
Explained well: ${mastered.join(", ") || "none"}. Shaky: ${weak.join(", ") || "none"}. Never mentioned: ${missing.join(", ") || "none"}.
Transcript:\n${transcript || "(short session)"}
Return ONLY JSON:
{"wrote":"2-3 sentences on what they DID explain (name concepts, quote their words)",
 "missing":"2-3 sentences on what they left out (name the missing/weak concepts)",
 "better":"2-3 concrete sentences on what to make clearer/more accurate for the ${cfg.label} level",
 "improve":["3 concrete next steps, each tied to a named concept"],
 "summary":"2 warm sentences celebrating real progress"}`,
    { temperature: 0.5, maxTokens: 600 }
  );
  const targets = weak.concat(missing).slice(0, 3);
  return {
    understanding: cov.percent, mastered, gaps,
    wrote: o?.wrote || (mastered.length ? `You explained ${mastered.slice(0, 2).join(" and ")} in your own words.` : `You started putting the ideas of "${r.topic}" into your own words.`),
    missing: o?.missing || (gaps.length ? `You didn't really get to ${gaps.slice(0, 3).join(", ")} yet.` : `You touched on every key concept.`),
    better: o?.better || `For the ${cfg.label} level, make ${(weak[0] || gaps[0] || "the trickiest idea")} clearer and more precise.`,
    improve: Array.isArray(o?.improve) && o.improve.length ? o.improve.slice(0, 5).map((x: any) => String(x).slice(0, 200))
      : (targets.length ? targets.map((n) => `Re-explain «${n}» out loud — focus on how it works, not just the name.`) : ["Re-teach the topic in 3 sentences.", "Explain the hardest idea again.", "Skim the lecture summary."]),
    summary: o?.summary || `You taught ${cov.covered}/${cov.total} concepts (${cov.percent}%). ${mastered.length ? `Lovely work on ${mastered[0]} — ` : ""}keep tending your tree! 🌳`,
  };
}