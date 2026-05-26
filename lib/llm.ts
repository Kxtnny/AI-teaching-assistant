import ollama from "ollama";
import OpenAI from "openai";

const OLLAMA_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || process.env.OLLAMA_MODEL || "llama3.2";
const DEFAULT_LLM_MODEL = "gpt-4.1-mini";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function ollamaText(prompt: string, model = OLLAMA_TEXT_MODEL) {
  const res = await ollama.chat({ model, messages: [{ role: "user", content: prompt }] });
  return String(res?.message?.content || "").trim();
}

export async function llm(messages: { role: string; content: string }[], model = DEFAULT_LLM_MODEL) {
  const preferOllama = /llama|llava|gemma|local/i.test(String(model));
  if (preferOllama) {
    try {
      const res = await ollama.chat({ model, messages: messages.map((m) => ({ role: m.role, content: m.content })) });
      return String(res?.message?.content || "").trim();
    } catch (err) {
      console.warn('[LLM] Ollama call failed, falling back to OpenAI:', String(err));
    }
  }

  const res = await client.chat.completions.create({ model, temperature: 0.2, messages: messages.map((m) => ({ role: m.role, content: m.content })) });
  return res.choices?.[0]?.message?.content?.trim() || "";
}

export { DEFAULT_LLM_MODEL, OLLAMA_TEXT_MODEL };
