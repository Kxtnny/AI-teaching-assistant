import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

export function escapeSvgText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildAudioPlaceholderSvg(title: string) {
  const safeTitle = title.replace(/[<&>]/g, "");
  return `\n<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="Audio preview">\n  <defs>\n    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">\n      <stop offset="0%" stop-color="#2f3136" />\n      <stop offset="100%" stop-color="#111827" />\n    </linearGradient>\n  </defs>\n  <rect width="800" height="450" rx="28" fill="url(#g)" />\n  <circle cx="400" cy="170" r="78" fill="#f3f4f6" opacity="0.12" />\n  <path d="M325 170h40l70-56v172l-70-56h-40z" fill="#f9fafb" />\n  <path d="M472 126c18 20 28 46 28 74s-10 54-28 74" fill="none" stroke="#f9fafb" stroke-width="12" stroke-linecap="round" opacity="0.8" />\n  <path d="M505 99c28 31 43 71 43 101s-15 70-43 101" fill="none" stroke="#f9fafb" stroke-width="10" stroke-linecap="round" opacity="0.55" />\n  <text x="400" y="332" text-anchor="middle" fill="#f9fafb" font-family="Arial, sans-serif" font-size="34" font-weight="700">AUDIO</text>\n  <text x="400" y="374" text-anchor="middle" fill="#d1d5db" font-family="Arial, sans-serif" font-size="18">${safeTitle}</text>\n</svg>`;
}

export function buildPdfPreviewSvg(title: string, pageText: string) {
  const safeTitle = escapeSvgText(title);
  const lines = pageText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((line) => line.slice(0, 72));

  const textLines = lines.length ? lines : ["No text detected on first page"];
  const lineEls = textLines
    .map((line, index) => `<text x="52" y="${140 + index * 30}" fill="#2f2a24" font-family="Arial, sans-serif" font-size="22">${escapeSvgText(line)}</text>`)
    .join("");

  return `\n<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="PDF preview">\n  <defs>\n    <linearGradient id="paper" x1="0" x2="0" y1="0" y2="1">\n      <stop offset="0%" stop-color="#fffdf7" />\n      <stop offset="100%" stop-color="#f0e9dd" />\n    </linearGradient>\n    <linearGradient id="frame" x1="0" x2="1" y1="0" y2="1">\n      <stop offset="0%" stop-color="#7b7469" />\n      <stop offset="100%" stop-color="#4d463e" />\n    </linearGradient>\n  </defs>\n  <rect width="800" height="450" rx="28" fill="url(#frame)" />\n  <rect x="42" y="34" width="716" height="382" rx="20" fill="url(#paper)" />\n  <rect x="42" y="34" width="716" height="58" rx="20" fill="#ece3d6" />\n  <text x="52" y="70" fill="#2a241d" font-family="Arial, sans-serif" font-size="26" font-weight="700">${safeTitle}</text>\n  <rect x="52" y="112" width="696" height="250" rx="14" fill="#ffffff" opacity="0.68" />\n  ${lineEls}\n</svg>`;
}

async function renderPdfPageToPng(pdfPath: string, pageNumber: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const script = [
      "const fs = require('fs');",
      "(async () => {",
      "  const { renderPageAsImage } = require('unpdf');",
      "  const pdfPath = process.argv[1];",
      "  const pageNumber = Number(process.argv[2]);",
      "  const pdfBuffer = new Uint8Array(fs.readFileSync(pdfPath));",
      "  const image = await renderPageAsImage(pdfBuffer, pageNumber, { canvasImport: () => import('@napi-rs/canvas') });",
      "  process.stdout.write(Buffer.from(image).toString('base64'));",
      "})().catch((error) => {",
      "  console.error(error && error.stack ? error.stack : String(error));",
      "  process.exit(1);",
      "});",
    ].join(" ");

    const child = spawn(process.execPath, ["-e", script, pdfPath, String(pageNumber)], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `PDF render failed with code ${code}`));
      resolve(Buffer.from(stdout.trim(), "base64"));
    });
  });
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getLecturePreviewBuffer(lecture: { lecture_id: string; original_path: string | null; title: string; content_kind?: string }) {
  if (!lecture.original_path) throw new Error("Missing original_path");

  const sourceExt = path.extname(lecture.original_path).toLowerCase();
  const previewName = `preview_page1_v1.png`;
  const previewPath = path.join(path.dirname(lecture.original_path), previewName);

  if (lecture.content_kind === "document") {
    if (sourceExt === ".pdf") {
      if (!(await fileExists(previewPath))) {
        const image = await renderPdfPageToPng(lecture.original_path, 1);
        await fs.writeFile(previewPath, image);
      }
      return {
        buffer: await fs.readFile(previewPath),
        contentType: previewMimeTypeForFile(previewPath),
      };
    }

    if ([".png", ".jpg", ".jpeg", ".webp"].includes(sourceExt)) {
      return {
        buffer: await fs.readFile(lecture.original_path),
        contentType: mimeTypeForFile(lecture.original_path),
      };
    }
  }

  if ([".mp3", ".wav", ".m4a", ".flac"].includes(sourceExt)) {
    return {
      buffer: Buffer.from(buildAudioPlaceholderSvg(lecture.title)),
      contentType: "image/svg+xml",
    };
  }

  return {
    buffer: await fs.readFile(lecture.original_path),
    contentType: mimeTypeForFile(lecture.original_path),
  };
}

export function mimeTypeForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mkv") return "video/x-matroska";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".flac") return "audio/flac";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export function previewMimeTypeForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  return mimeTypeForFile(filePath);
}
