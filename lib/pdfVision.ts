import fs from "fs/promises";
import ollama from "ollama";
import { repairTablesJsonFromText, heuristicExtractTablesFromText, tablesToMarkdown } from "@/lib/tableUtils";
import { saveTableEvalReport } from "@/lib/tableEval";

export function buildDetailedPageExtractionPrompt(pageLabel: string, adjacentText?: string) {
  return `You are extracting a PDF page for an educational RAG system.
${pageLabel}

Goal:
- Read the page top to bottom.
- Capture the exact visible text first.
- Then describe special components only if they exist: tables, images, diagrams, formulas, labels, examples, and definitions.
- If a scanned page is unclear, perform OCR-style transcription as accurately as possible.

Output format:
1) Top-down text readout:
- Preserve visible text in the order it appears on the page.
- Keep line breaks, headings, bullet points, and labels when they matter.

2) Component sections (include only if present):
- Tables:
  - Render each table as a markdown table.
  - Include row-by-row values with clear column headers.
  - If multiple tables appear, separate them clearly.
  - IMPORTANT: In addition to markdown, if the page contains any table(s), append a strict machine-readable JSON block between the markers <TABLES_JSON> and </TABLES_JSON> containing an array named "tables" with each table as {"title": string|null, "headers": [..], "rows": [[..],[..]]}. Example:

    <TABLES_JSON>
    {"tables": [{"title": "Semester 1 Year 1", "headers": ["Course Code","Course Title","AU"], "rows": [["CS101","Intro to CS","4"],["MA100","Calculus","4"]]}]}
    </TABLES_JSON>

  - The JSON block MUST be valid JSON and must appear at the end of your message exactly between those markers. This allows programmatic extraction of tables.
- Images:
  - Give a thorough description of the image, including objects, labels, captions, visual emphasis, and educational purpose.
- Diagrams:
  - Give a thorough description of the diagram, including arrows, relationships, labels, shapes, flow direction, and meaning.
- Formulas:
  - Transcribe formulas carefully and explain the symbols if visible.
- Definitions:
  - Explain the term and its surrounding context.
- Examples:
  - Summarize worked examples step by step.
- Other Important Details:
  - Include anything else that is visually important, such as side notes, callouts, figure captions, legends, or boxed remarks.

Rules:
- Be exhaustive and concrete.
- Do not invent information that is not visible.
- Do not mention a component section unless that component exists on the page.
- Prioritize readability and completeness over brevity.

Adjacent text from the PDF text layer (use this to contextualize the image):
${adjacentText?.trim() ? adjacentText : "[No adjacent text extracted]"}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, label = "Operation"): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  const timer = new Promise<never>((_, rej) => {
    timeout = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timer]) as Promise<T>;
}

export async function visionExtractFromImagesDetailed(imagePaths: string[], visionModel = process.env.OLLAMA_VISION_MODEL || "llama3.2-vision", adjacentTexts: string[] = [], mode: "generic" = "generic", lectureDirPath?: string) {
  const maxFrames = Number(process.env.VISION_MAX_FRAMES || 8);
  const perImageTimeoutMs = Number(process.env.VISION_TIMEOUT_MS || 20000);

  const limited = imagePaths.slice(0, maxFrames);
  const results: Array<{ label: string; content: string; parsedTables?: any; tableExtractionMethod?: string }> = [];
  if (!limited.length) return results;

  for (let idx = 0; idx < limited.length; idx++) {
    const imgPath = limited[idx];
    try {
      const b64 = await fsReadBase64(imgPath);
      const res = await withTimeout(
        ollama.chat({ model: visionModel, messages: [{ role: "user", content: buildDetailedPageExtractionPrompt(`Page ${idx + 1}`, adjacentTexts[idx]), images: [b64] }] }),
        perImageTimeoutMs,
        `Vision page ${idx + 1}`
      );

      const txt = String(res?.message?.content || "").trim();
      let finalText = txt;
      let extractedTables: any = null;
      let tableExtractionMethod: string | undefined = undefined;

      try {
        const m = txt.match(/<TABLES_JSON>([\s\S]*?)<\/TABLES_JSON>/i);
        if (m && m[1]) {
          try {
            extractedTables = JSON.parse(m[1].trim());
            tableExtractionMethod = "vision";
          } catch (_e) {
            const repair = await repairTablesJsonFromText(m[1].trim() || txt);
            if (repair) {
              extractedTables = repair;
              tableExtractionMethod = "repair";
            }
          }
        } else {
          const repair = await repairTablesJsonFromText(txt);
          if (repair) {
            extractedTables = repair;
            tableExtractionMethod = "repair";
          }
        }

        if ((!extractedTables || !Array.isArray(extractedTables.tables) || !extractedTables.tables.length)) {
          const heur = heuristicExtractTablesFromText(txt || adjacentTexts[idx] || "");
          if (heur && Array.isArray(heur.tables) && heur.tables.length) {
            extractedTables = heur;
            tableExtractionMethod = tableExtractionMethod || "heuristic";
          }
        }

        if (extractedTables && Array.isArray(extractedTables.tables) && extractedTables.tables.length) {
          const tablesMd = tablesToMarkdown(extractedTables);
          finalText = `=== Extracted Tables ===\n${tablesMd}\n\n${txt.replace(/<TABLES_JSON>[\s\S]*?<\/TABLES_JSON>/i, "")}`;
          if (lectureDirPath) {
            try {
              await saveTableEvalReport(lectureDirPath, `page_${idx + 1}`, { method: tableExtractionMethod || "vision", tables: extractedTables.tables });
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn(`[VISION] table extraction fallback failed on page ${idx + 1}: ${String(e)}`);
      }

      results.push({ label: `Page ${idx + 1}`, content: finalText, parsedTables: extractedTables || undefined, tableExtractionMethod });
    } catch (err: any) {
      console.warn(`[VISION] page ${idx + 1} skipped: ${err?.message || err}`);
    }
  }

  return results;
}

async function fsReadBase64(p: string) {
  const b = await import('fs/promises');
  const buf = await b.readFile(p);
  return buf.toString('base64');
}
