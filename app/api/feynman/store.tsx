// app/api/feynman/store.tsx
// ─────────────────────────────────────────────────────────────────────────────
// DATA layer. Reuses the existing library + RAG output + sessions. Nothing new
// is created here (no new database / vector store).
// ─────────────────────────────────────────────────────────────────────────────

import path from "path";
import fsp from "fs/promises";
import { askJSON, Concept } from "./config";

const DATA_DIR = path.resolve(process.cwd(), "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const libPath = (creator?: string) =>
  creator === "teacher" ? path.join(DATA_DIR, "teachersdata", "library.json") : path.join(DATA_DIR, "library.json");

export async function getContent(lectureId: string, creator: string): Promise<{ title: string; memory: string; chunks: string[] } | null> {
  let lib: any[] = [];
  try { lib = JSON.parse(await fsp.readFile(libPath(creator), "utf-8")); } catch { return null; }
  const lec = lib.find((l: any) => l.lecture_id === lectureId);
  if (!lec || lec.status !== "Ready" || !lec.memory_path) return null;
  try {
    const memory = await fsp.readFile(lec.memory_path, "utf-8");
    let chunks: string[] = [];
    if (lec.chunks_path) {
      try { const raw = JSON.parse(await fsp.readFile(lec.chunks_path, "utf-8")); chunks = Array.isArray(raw) ? raw.map((x: any) => x.text).filter(Boolean) : []; } catch {}
    }
    return { title: lec.title, memory, chunks };
  } catch { return null; }
}

// simple keyword retrieval over the existing chunks (grounds the questions)
export function retrieve(query: string, chunks: string[], topic: string): string {
  if (!chunks.length) return "";
  const want = new Set((query + " " + topic).toLowerCase().match(/[a-z0-9']+/g) || []);
  const scored = chunks.map((ch) => {
    const toks = ch.toLowerCase().match(/[a-z0-9']+/g) || [];
    let s = 0; for (const t of toks) if (want.has(t)) s++;
    return { ch, s };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, 3).map((x) => x.ch).join("\n---\n").slice(0, 1500);
}

export async function extractConcepts(topic: string, memory: string, n: number): Promise<Concept[]> {
  const o = await askJSON(
    `From the lecture below, list the ${n} most important concepts a student must convey to understand "${topic}".
Return ONLY JSON: {"concepts":[{"name":"<=5 words","hint":"one line"}]}
Lecture:\n${memory.slice(0, 3500)}`,
    { temperature: 0.4, maxTokens: 500 }
  );
  const list = (o?.concepts || []).slice(0, n).map((c: any, i: number) => ({
    id: `c${i + 1}`, name: String(c.name || `Concept ${i + 1}`).slice(0, 60), hint: String(c.hint || "").slice(0, 120),
  })).filter((c: Concept) => c.name);
  return list.length ? list : [{ id: "c1", name: topic, hint: "Explain the main idea in your own words." }];
}

const sPath = (id: string) => path.join(SESSIONS_DIR, id.replace(/[:]/g, "_") + ".json");
export const loadSessionFile = async (id: string) => { try { return JSON.parse(await fsp.readFile(sPath(id), "utf-8")); } catch { return null; } };
export const saveSessionFile = async (s: any) => { await fsp.mkdir(SESSIONS_DIR, { recursive: true }); await fsp.writeFile(sPath(s.sessionId), JSON.stringify(s, null, 2)); };
