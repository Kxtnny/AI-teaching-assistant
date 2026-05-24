import fs from "fs/promises";
import path from "path";

export async function saveTableEvalReport(lectureDir: string, pageLabel: string, report: any) {
  try {
    const safeLabel = pageLabel.replace(/[^a-z0-9_-]/gi, "_").slice(0, 64);
    const outPath = path.join(lectureDir, `tables_eval_${safeLabel}.json`);
    await fs.writeFile(outPath, JSON.stringify({ timestamp: new Date().toISOString(), report }, null, 2), "utf-8");
    return outPath;
  } catch (e) {
    return null;
  }
}
