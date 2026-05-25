import ollama from "ollama";
import Tesseract from "tesseract.js";
import { spawn } from "child_process";
import path from "path";

const OLLAMA_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || process.env.OLLAMA_MODEL || "llama3.2";

export async function repairTablesJsonFromText(raw: string): Promise<any | null> {
  try {
    const prompt = `You are given a text that may contain a machine-readable TABLES_JSON block between <TABLES_JSON> and </TABLES_JSON> markers.\n\n` +
      `Task: If a TABLES_JSON block is present but malformed, repair it and output ONLY the valid JSON object. If no TABLES_JSON block appears, reply with the single token: NO_TABLES\n\n` +
      `Input Text:\n${raw}\n\n` +
      `Output:`;

    const res = await ollama.chat({ model: OLLAMA_TEXT_MODEL, messages: [{ role: "user", content: prompt }] });
    const content = String(res?.message?.content || "").trim();
    if (!content) return null;
    if (/^NO_TABLES$/i.test(content)) return null;

    // Attempt to extract a JSON object from the response
    const s = content.indexOf("{");
    const e = content.lastIndexOf("}");
    if (s < 0 || e < 0) return null;
    const candidate = content.slice(s, e + 1);
    try {
      return JSON.parse(candidate);
    } catch (err) {
      // Last-ditch: try to fix common issues (unescaped backslashes)
      const repaired = candidate.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
      try { return JSON.parse(repaired); } catch { return null; }
    }
  } catch (e) {
    return null;
  }
}

export function heuristicExtractTablesFromText(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tables: Array<{ title: string | null; headers: string[]; rows: string[][] }> = [];

  // Look for pipe-delimited tables first
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("|")) {
      // Collect contiguous pipe lines
      const block: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].includes("|")) {
        block.push(lines[j]);
        j++;
      }
      i = j;
      const rows = block.map((r) => r.split("|").map((c) => c.trim()).filter((c) => c !== ""));
      if (rows.length >= 2) {
        const headers = rows[0];
        const data = rows.slice(1);
        tables.push({ title: null, headers, rows: data });
      }
    }
  }

  // Fallback: detect evenly spaced columns using multiple spaces
  if (!tables.length) {
    const candidates: string[][] = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/ {2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) candidates.push(parts);
      else candidates.length = 0;
      if (candidates.length >= 2) {
        // Build table
        const headers = candidates[0];
        const rows = candidates.slice(1);
        tables.push({ title: null, headers, rows });
        break;
      }
    }
  }

  return { tables };
}

export function tablesToMarkdown(tablesObj: any) {
  if (!tablesObj || !Array.isArray(tablesObj.tables)) return "";
  return tablesObj.tables
    .map((t: any) => {
      const hdrs = Array.isArray(t.headers) ? t.headers : [];
      const rows = Array.isArray(t.rows) ? t.rows : [];
      const headerLine = `| ${hdrs.join(" | ")} |`;
      const sepLine = `| ${hdrs.map(() => "---").join(" | ")} |`;
      const rowsMd = rows.map((r: any[]) => `| ${r.map((c) => String(c || "")).join(" | ")} |`).join("\n");
      const title = t.title ? `**${String(t.title)}**\n\n` : "";
      return `${title}${headerLine}\n${sepLine}\n${rowsMd}`;
    })
    .join("\n\n");
}

export async function ocrExtractTablesFromImage(imagePath: string) {
  // Try native Python pytesseract first (better accuracy/ANLS); fall back to tesseract.js if Python isn't available.
  try {
    const py = process.env.PYTHON_BIN || "python";
    const script = path.join(process.cwd(), "tools", "ocr_image_text.py");
    const p = spawn(py, [script, imagePath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    const code: number = await new Promise((resolve) => {
      p.on("close", (c) => resolve(c ?? 0));
      p.on("error", () => resolve(1));
    });

    if (code === 0 && stdout) {
      try {
        const parsed = JSON.parse(stdout);
        const text = String(parsed?.text || "").trim();
        if (text) return heuristicExtractTablesFromText(text);
      } catch (e) {
        // fall through to JS tesseract
      }
    }
  } catch (e) {
    // ignore and fallback
  }

  try {
    const res = await Tesseract.recognize(imagePath, "eng");
    const text = String(res?.data?.text || "").trim();
    if (!text) return { tables: [] };
    const heur = heuristicExtractTablesFromText(text);
    return heur;
  } catch (e) {
    return { tables: [] };
  }
}
