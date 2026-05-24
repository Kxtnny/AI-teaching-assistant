import { spawn } from "child_process";
import path from "path";

export async function extractTablesFromPdfNative(pdfPath: string): Promise<any | null> {
  return new Promise((resolve) => {
    const script = path.join(process.cwd(), "tools", "extract_tables.py");
    const py = process.env.PYTHON_BIN || "python";
    const p = spawn(py, [script, pdfPath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      if (!stdout) return resolve(null);
      try {
        const parsed = JSON.parse(stdout);
        if (parsed && parsed.tables) return resolve(parsed);
        return resolve(null);
      } catch (e) {
        return resolve(null);
      }
    });
    p.on("error", () => resolve(null));
  });
}
