import { spawn } from "child_process";
import path from "path";

export async function extractPdfBlocksFromPdfNative(pdfPath: string): Promise<any | null> {
  return new Promise((resolve) => {
    const script = path.join(process.cwd(), "tools", "extract_pdf_blocks.py");
    const py = process.env.PYTHON_BIN || "python";
    const p = spawn(py, [script, pdfPath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.on("close", () => {
      if (!stdout) return resolve(null);
      try {
        const parsed = JSON.parse(stdout);
        return resolve(parsed && parsed.pages ? parsed : null);
      } catch {
        return resolve(null);
      }
    });
    p.on("error", () => resolve(null));
  });
}
