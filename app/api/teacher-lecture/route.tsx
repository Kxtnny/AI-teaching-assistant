import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { writeFile, unlink } from "fs/promises";
import OpenAI from "openai";
import ollama from "ollama";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

type Action =
  | "upload"
  | "process"
  | "progress"
  | "load"
  | "chat"
  | "mcq"
  | "tf"
  | "derivation"
  | "deleteLecture"
  | "deleteAll";

type CreatorType = "teacher";
type ContentKind = "video" | "document";
type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string };

interface LectureEntry {
  lecture_id: string;
  title: string;
  file_hash: string;
  creator: CreatorType;
  content_kind: ContentKind;
  status: "Uploaded" | "Audio Ready" | "Ready";
  time_ago: string;
  original_path: string | null;
  audio_path: string | null;
  transcript_path: string | null;
  summary_path: string | null;
  memory_path: string | null;
  chunks_path: string | null;
  created_at: string;
  updated_at: string;
}

type ProgressState = {
  lectureId: string | null;
  stage: string;
  percent: number;
  done: boolean;
  error?: string;
};

const FFMPEG_BIN = process.env.FFMPEG_PATH
  ? path.resolve(process.cwd(), process.env.FFMPEG_PATH)
  : "ffmpeg";

const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "llama3.2-vision";
const OLLAMA_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || process.env.OLLAMA_MODEL || "llama3.2";
const DEFAULT_LLM_MODEL = "gpt-4.1-mini";
const TRANSCRIBE_MODEL = "whisper-1";
const VIDEO_THUMBNAIL_SECONDS = Number(process.env.VIDEO_THUMBNAIL_SECONDS || 0.5);
const PDF_PREVIEW_VERSION = 5;
const WORD_RE = /[A-Za-z0-9']+/g;

// teacher storage
const DATA_DIR = path.resolve(process.cwd(), "data", "teachersdata");
const LECTURES_DIR = path.join(DATA_DIR, "lectures");
const LIBRARY_PATH = path.join(DATA_DIR, "library.json");
const UPLOAD_TMP = path.join(DATA_DIR, "tmp_uploads");
const PROGRESS_PATH = path.join(DATA_DIR, "progress.json");

const SUPPORTED_EXTS = new Set([
  ".mp3", ".wav", ".m4a", ".mp4", ".mov", ".mkv", ".flac",
  ".pdf", ".png", ".jpg", ".jpeg", ".webp",
]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a", ".flac"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const PDF_EXTS = new Set([".pdf"]);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const defaultProgress: ProgressState = {
  lectureId: null,
  stage: "idle",
  percent: 0,
  done: true,
};

const nowISO = () => new Date().toISOString();

function withTimeout<T>(p: Promise<T>, ms: number, label = "Operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function inferContentKindFromExt(ext: string): ContentKind {
  return VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext) ? "video" : "document";
}

function inferContentKindFromEntry(entry: Partial<LectureEntry>): ContentKind {
  if (entry.content_kind === "video" || entry.content_kind === "document") return entry.content_kind;
  const sourcePath = entry.original_path || entry.audio_path || entry.title || "";
  return inferContentKindFromExt(path.extname(sourcePath).toLowerCase());
}

// PDF cache
const MAX_PDF_CACHE_ENTRIES = 12;
const globalForPdf = globalThis as unknown as { pdfTextCache?: Map<string, string> };
if (!globalForPdf.pdfTextCache) globalForPdf.pdfTextCache = new Map();
function upsertPdfCache(key: string, value: string) {
  const cache = globalForPdf.pdfTextCache!;
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_PDF_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

async function ensureDir(p: string) {
  await fsp.mkdir(p, { recursive: true });
}
async function fileExists(p: string) {
  try { await fsp.access(p); return true; } catch { return false; }
}
async function removeIfExists(p: string) {
  if (await fileExists(p)) await fsp.rm(p, { recursive: true, force: true });
}
async function initStorage() {
  await ensureDir(DATA_DIR);
  await ensureDir(LECTURES_DIR);
  await ensureDir(UPLOAD_TMP);
  if (!(await fileExists(LIBRARY_PATH))) await fsp.writeFile(LIBRARY_PATH, "[]", "utf-8");
  if (!(await fileExists(PROGRESS_PATH))) {
    await fsp.writeFile(PROGRESS_PATH, JSON.stringify(defaultProgress, null, 2), "utf-8");
  }
}
async function loadProgress(): Promise<ProgressState> {
  await initStorage();
  try { return JSON.parse(await fsp.readFile(PROGRESS_PATH, "utf-8")); } catch { return defaultProgress; }
}
async function setProgress(patch: Partial<ProgressState>) {
  const cur = await loadProgress();
  const next = { ...cur, ...patch };
  await fsp.writeFile(PROGRESS_PATH, JSON.stringify(next, null, 2), "utf-8");
}
async function loadLibrary(): Promise<LectureEntry[]> {
  await initStorage();
  try {
    const raw = await fsp.readFile(LIBRARY_PATH, "utf-8");
    const arr = JSON.parse(raw);
    const lib = Array.isArray(arr) ? arr : [];
    return lib.map((x: any) => ({
      ...x,
      creator: "teacher" as const,
      content_kind: inferContentKindFromEntry(x),
    }));
  } catch {
    return [];
  }
}
async function saveLibrary(library: LectureEntry[]) {
  await fsp.writeFile(LIBRARY_PATH, JSON.stringify(library, null, 2), "utf-8");
}
async function updateOrInsert(entry: LectureEntry) {
  const lib = await loadLibrary();
  const idx = lib.findIndex((x) => x.lecture_id === entry.lecture_id);
  if (idx >= 0) lib[idx] = entry;
  else lib.unshift(entry);
  await saveLibrary(lib);
}
async function patchByHash(fileHash: string, updates: Partial<LectureEntry>) {
  const lib = await loadLibrary();
  const idx = lib.findIndex((x) => x.file_hash === fileHash);
  if (idx < 0) return null;
  lib[idx] = { ...lib[idx], ...updates, updated_at: nowISO() };
  await saveLibrary(lib);
  return lib[idx];
}
async function computeHash(filePath: string): Promise<string> {
  const h = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const s = fs.createReadStream(filePath);
    s.on("data", (d) => h.update(d));
    s.on("error", reject);
    s.on("end", () => resolve());
  });
  return h.digest("hex");
}
function lectureDir(lectureId: string) { return path.join(LECTURES_DIR, lectureId); }
function normalizeTokens(text: string) { return (text.match(WORD_RE) || []).map((x) => x.toLowerCase()); }
function mimeTypeForFile(filePath: string) {
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

function previewMimeTypeForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  return mimeTypeForFile(filePath);
}

function buildAudioPlaceholderSvg(title: string) {
  const safeTitle = title.replace(/[<&>]/g, "");
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="Audio preview">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#2f3136" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
  </defs>
  <rect width="800" height="450" rx="28" fill="url(#g)" />
  <circle cx="400" cy="170" r="78" fill="#f3f4f6" opacity="0.12" />
  <path d="M325 170h40l70-56v172l-70-56h-40z" fill="#f9fafb" />
  <path d="M472 126c18 20 28 46 28 74s-10 54-28 74" fill="none" stroke="#f9fafb" stroke-width="12" stroke-linecap="round" opacity="0.8" />
  <path d="M505 99c28 31 43 71 43 101s-15 70-43 101" fill="none" stroke="#f9fafb" stroke-width="10" stroke-linecap="round" opacity="0.55" />
  <text x="400" y="332" text-anchor="middle" fill="#f9fafb" font-family="Arial, sans-serif" font-size="34" font-weight="700">AUDIO</text>
  <text x="400" y="374" text-anchor="middle" fill="#d1d5db" font-family="Arial, sans-serif" font-size="18">${safeTitle}</text>
</svg>`;
}

function escapeSvgText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildPdfPreviewSvg(title: string, pageText: string) {
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

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="PDF preview">
  <defs>
    <linearGradient id="paper" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#fffdf7" />
      <stop offset="100%" stop-color="#f0e9dd" />
    </linearGradient>
    <linearGradient id="frame" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#7b7469" />
      <stop offset="100%" stop-color="#4d463e" />
    </linearGradient>
  </defs>
  <rect width="800" height="450" rx="28" fill="url(#frame)" />
  <rect x="42" y="34" width="716" height="382" rx="20" fill="url(#paper)" />
  <rect x="42" y="34" width="716" height="58" rx="20" fill="#ece3d6" />
  <text x="52" y="70" fill="#2a241d" font-family="Arial, sans-serif" font-size="26" font-weight="700">${safeTitle}</text>
  <rect x="52" y="112" width="696" height="250" rx="14" fill="#ffffff" opacity="0.68" />
  ${lineEls}
</svg>`;
}

async function getLecturePreviewBuffer(lecture: LectureEntry) {
  if (!lecture.original_path) throw new Error("Missing original_path");

  const sourceExt = path.extname(lecture.original_path).toLowerCase();
  const previewName = VIDEO_EXTS.has(sourceExt)
    ? `preview_${String(VIDEO_THUMBNAIL_SECONDS).replace(/\./g, "_")}s.jpg`
    : `preview_page1_v${PDF_PREVIEW_VERSION}.png`;
  const previewPath = path.join(path.dirname(lecture.original_path), previewName);

  if (lecture.content_kind === "document") {
    if (PDF_EXTS.has(sourceExt)) {
      if (!(await fileExists(previewPath))) {
        const image = await renderPdfPageToPng(lecture.original_path, 1);
        await fsp.writeFile(previewPath, image);
      }
      return {
        buffer: await fsp.readFile(previewPath),
        contentType: previewMimeTypeForFile(previewPath),
      };
    }

    if (IMAGE_EXTS.has(sourceExt)) {
      return {
        buffer: await fsp.readFile(lecture.original_path),
        contentType: mimeTypeForFile(lecture.original_path),
      };
    }
  }

  if (VIDEO_EXTS.has(sourceExt)) {
    if (!(await fileExists(previewPath))) {
      const result = await runCmd(FFMPEG_BIN, [
        "-y",
        "-ss",
        String(VIDEO_THUMBNAIL_SECONDS),
        "-i",
        lecture.original_path,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        previewPath,
      ]);
      if (result.code !== 0) throw new Error(`Failed to create video preview: ${result.stderr.slice(-400)}`);
    }
    return {
      buffer: await fsp.readFile(previewPath),
      contentType: previewMimeTypeForFile(previewPath),
    };
  }

  if (AUDIO_EXTS.has(sourceExt)) {
    return {
      buffer: Buffer.from(buildAudioPlaceholderSvg(lecture.title)),
      contentType: "image/svg+xml",
    };
  }

  return {
    buffer: await fsp.readFile(lecture.original_path),
    contentType: mimeTypeForFile(lecture.original_path),
  };
}
function scoreChunk(query: string, chunk: string) {
  const q = normalizeTokens(query);
  const c = normalizeTokens(chunk);
  if (!q.length || !c.length) return 0;
  const qset = new Set(q);
  const counts = new Map<string, number>();
  for (const t of c) counts.set(t, (counts.get(t) || 0) + 1);
  let score = 0;
  for (const t of qset) {
    const n = counts.get(t);
    if (n) score += 1 + Math.log(1 + n);
  }
  return score;
}
function retrieveTopK(query: string, chunks: string[], k = 3) {
  const scored = chunks.map((ch, i) => ({ i, s: scoreChunk(query, ch) }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, k).filter((x) => x.s > 0).map((x) => ({ i: x.i, text: chunks[x.i] }));
  return top.length ? top : chunks.slice(0, k).map((text, i) => ({ i, text }));
}
function chunkText(text: string, maxChars = 3500, overlap = 400): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= maxChars) return [t];
  const chunks: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(t.length, start + maxChars);
    const window = t.slice(start, end);
    const cut = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
    if (cut > 1000) end = start + cut + 1;
    const ch = t.slice(start, end).trim();
    if (ch) chunks.push(ch);
    if (end >= t.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}
function shortenForLLM(text: string, maxChars = 20000) {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const h = t.slice(0, maxChars / 2);
  const tail = t.slice(-(maxChars / 2));
  return `${h}\n\n[...TRUNCATED...]\n\n${tail}`;
}
function buildSummaryPrompt(transcript: string) {
  return `You are helping a student learn from multi-modal lecture content.
Task:
1) Lightly clean obvious recognition mistakes.
2) Produce the following sections, each on its own line:

**Summary:**
- Write exactly 5 bullet points. Each bullet must be one concise sentence (max 20 words). Start each with "- ".

**Key Terms:**
- List 8–12 key terms separated by commas, each at most 3 words.

**Action Items:**
- 3 bullet points of what a student should do to follow up. Each one sentence.

Combined Lecture Text:
${transcript}`;
}
function buildMemoryPrompt(transcript: string) {
  return `You are a helpful tutor.
Create compact Lecture Memory in this format:
LECTURE MEMORY:
- 10–15 bullets main ideas
- formulas/theorems
- pitfalls
- example problem types
Combined Lecture Text:
${transcript}`;
}
function buildDocumentSummaryPrompt(content: string) {
  return `You are a local study assistant for class notes and reference files.
Turn the extracted content into a clean study brief.

Return exactly these sections:
Summary:
- 5 concise bullets max, one sentence each.

Key Terms:
- 8 to 12 terms separated by commas.

Important Details:
- 3 to 5 bullets covering formulas, definitions, diagrams, or table takeaways.

Extracted Content:
${content}`;
}
function buildDocumentMemoryPrompt(content: string) {
  return `You are a local study assistant.
Create a compact lecture memory for this document in the following format:
LECTURE MEMORY:
- 10 to 15 short bullets with the main ideas
- formulas or definitions if present
- common mistakes or confusing points
- example question types

Extracted Content:
${content}`;
}
function mcqPrompt(memory: string, context: string[], n = 5) {
  return `Create exactly ${n} MCQs from lecture only. Return strict JSON list.
Lecture Memory:
${memory}
Context:
${context.join("\n\n---\n\n")}`;
}
function tfPrompt(memory: string, context: string[], n = 5) {
  return `Create exactly ${n} True/False from lecture only. Return strict JSON list.
Lecture Memory:
${memory}
Context:
${context.join("\n\n---\n\n")}`;
}
function derivationPrompt(memory: string, context: string[], topic: string) {
  return `Provide a step-by-step derivation.
Topic: ${topic}
Lecture Memory:
${memory}
Context:
${context.join("\n\n---\n\n")}`;
}
function extractJsonList(raw: string): any[] {
  const t = raw.trim();
  const s = t.indexOf("[");
  const e = t.lastIndexOf("]");
  if (s < 0 || e < 0) throw new Error("No JSON list found.");
  const candidate = t.slice(s, e + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    const repaired = candidate.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    return JSON.parse(repaired);
  }
}
async function runCmd(bin: string, args: string[]) {
  return new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", (err: any) => {
      if (err?.code === "ENOENT") reject(new Error(`Binary not found: ${bin}.`));
      else reject(err);
    });
    p.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
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

    const child = spawn(process.execPath, ["-e", script, pdfPath, String(pageNumber)], {
      stdio: ["ignore", "pipe", "pipe"],
    });

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
async function convertVideoToAudio(input: string, out: string) {
  let r = await runCmd(FFMPEG_BIN, ["-y", "-i", input, "-vn", "-acodec", "copy", out]);
  if (r.code !== 0) {
    r = await runCmd(FFMPEG_BIN, ["-y", "-i", input, "-vn", "-c:a", "aac", "-b:a", "128k", out]);
    if (r.code !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-400)}`);
  }
}
async function extractFramesSceneBased(inputVideo: string, outDir: string) {
  await ensureDir(outDir);
  const scenePattern = path.join(outDir, "scene_%04d.jpg");
  let r = await runCmd(FFMPEG_BIN, ["-y", "-i", inputVideo, "-vf", "select='gt(scene,0.25)'", "-vsync", "vfr", "-q:v", "3", scenePattern]);

  let files = (await fsp.readdir(outDir))
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .sort()
    .map((f) => path.join(outDir, f));

  if (r.code !== 0 || files.length < 3) {
    const fpsPattern = path.join(outDir, "fps_%04d.jpg");
    r = await runCmd(FFMPEG_BIN, ["-y", "-i", inputVideo, "-vf", "fps=0.2", "-q:v", "3", fpsPattern]);
    if (r.code !== 0) throw new Error(`frame extraction failed: ${r.stderr.slice(-400)}`);
    files = (await fsp.readdir(outDir))
      .filter((f) => f.toLowerCase().endsWith(".jpg"))
      .sort()
      .map((f) => path.join(outDir, f));
  }
  return files;
}
async function convertPdfToImages(pdfPath: string, outDir: string) {
  await ensureDir(outDir);
  const maxPages = Number(process.env.PDF_MAX_PAGES || 8);
  const files: string[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    try {
      const image = await renderPdfPageToPng(pdfPath, page);
      const outPath = path.join(outDir, `page_${String(page).padStart(4, "0")}.png`);
      await fsp.writeFile(outPath, image);
      files.push(outPath);
    } catch {
      break;
    }
  }

  return files;
}
async function extractPdfTextWithLoader(pdfPath: string): Promise<string> {
  const buffer = await fsp.readFile(pdfPath);
  const hash = crypto.createHash("sha1").update(buffer).digest("hex");

  const cache = globalForPdf.pdfTextCache!;
  const cached = cache.get(hash);
  if (cached) return cached;

  const tempDir = path.join(tmpdir(), "teacher-pdf");
  await ensureDir(tempDir);
  const tempPath = path.join(tempDir, `${hash}.pdf`);
  await writeFile(tempPath, buffer);

  try {
    const loader = new PDFLoader(tempPath);
    const docs = await loader.load();
    const text = docs.map((d) => d.pageContent).join("\n\n").trim();
    const trimmed = text.slice(0, 120000);
    if (trimmed) upsertPdfCache(hash, trimmed);
    return trimmed;
  } finally {
    try { await unlink(tempPath); } catch {}
  }
}
async function transcribeAudio(audioPath: string, language: string) {
  const tx = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: TRANSCRIBE_MODEL,
    language,
    response_format: "text",
  });
  return String(tx || "").trim();
}
async function visionExtractFromImages(imagePaths: string[]) {
  const maxFrames = Number(process.env.VISION_MAX_FRAMES || 8);
  const concurrency = Number(process.env.VISION_CONCURRENCY || 2);
  const perImageTimeoutMs = Number(process.env.VISION_TIMEOUT_MS || 20000);

  const limited = imagePaths.slice(0, maxFrames);
  const results: string[] = [];
  if (!limited.length) return "";

  async function processOne(imgPath: string, idx: number) {
    try {
      const b64 = await fsp.readFile(imgPath, { encoding: "base64" });
      const res = await withTimeout(
        ollama.chat({
          model: OLLAMA_VISION_MODEL,
          messages: [{
            role: "user",
            content: "Extract lecture text, formulas, headings, and key bullet points from this image. Keep output concise and factual.",
            images: [b64],
          }],
        }),
        perImageTimeoutMs,
        `Vision frame ${idx + 1}`
      );
      const txt = String(res?.message?.content || "").trim();
      if (txt) results.push(`(Frame/Page ${idx + 1})\n${txt}`);
    } catch (err: any) {
      console.warn(`[VISION] frame/page ${idx + 1} skipped: ${err?.message || err}`);
    }
  }

  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < limited.length) {
      const i = cursor++;
      await processOne(limited[i], i);
    }
  });

  await Promise.all(workers);
  return results.join("\n\n");
}
async function ollamaText(prompt: string, model = OLLAMA_TEXT_MODEL) {
  const res = await ollama.chat({
    model,
    messages: [{ role: "user", content: prompt }],
  });
  return String(res?.message?.content || "").trim();
}
async function llm(messages: ChatMessage[], model = DEFAULT_LLM_MODEL) {
  const res = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return res.choices?.[0]?.message?.content?.trim() || "";
}

export async function GET(req: NextRequest) {
  try {
    await initStorage();

    const lectureId = req.nextUrl.searchParams.get("lectureId") || "";
    const preview = req.nextUrl.searchParams.get("preview") === "1";
    if (!lectureId) return NextResponse.json({ error: "Missing lectureId" }, { status: 400 });

    const lib = await loadLibrary();
    const lecture = lib.find((x) => x.lecture_id === lectureId);
    if (!lecture || !lecture.original_path) {
      return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
    }

    if (!(await fileExists(lecture.original_path))) {
      return NextResponse.json({ error: "Source file is missing" }, { status: 404 });
    }

    if (preview) {
      const previewArtifact = await getLecturePreviewBuffer(lecture);
      return new NextResponse(previewArtifact.buffer, {
        status: 200,
        headers: {
          "Content-Type": previewArtifact.contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    const fileBuffer = await fsp.readFile(lecture.original_path);
    const fileName = path.basename(lecture.original_path);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeTypeForFile(lecture.original_path),
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to open file" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initStorage();

    const contentType = req.headers.get("content-type") || "";
    let action: Action | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      action = (form.get("action") as Action) || "upload";
      if (action !== "upload") {
        return NextResponse.json({ error: "multipart only supports action=upload" }, { status: 400 });
      }

      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }

      const ext = path.extname(file.name).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) {
        return NextResponse.json({ error: `Unsupported extension: ${ext}` }, { status: 400 });
      }

      const tmpPath = path.join(UPLOAD_TMP, `${Date.now()}_${file.name}`);
      const buf = Buffer.from(await file.arrayBuffer());
      await fsp.writeFile(tmpPath, buf);

      const fileHash = await computeHash(tmpPath);
      const lib = await loadLibrary();
      const existing = lib.find((x) => x.file_hash === fileHash);
      if (existing) {
        await removeIfExists(tmpPath);
        return NextResponse.json({ ok: true, duplicate: true, lecture: existing });
      }

      const lectureId = fileHash.slice(0, 16);
      const ldir = lectureDir(lectureId);
      await ensureDir(ldir);

      const originalPath = path.join(ldir, `original${ext}`);
      await fsp.copyFile(tmpPath, originalPath);
      await removeIfExists(tmpPath);

      const entry: LectureEntry = {
        lecture_id: lectureId,
        title: path.basename(file.name, ext),
        file_hash: fileHash,
        creator: "teacher",
        content_kind: inferContentKindFromExt(ext),
        status: "Uploaded",
        time_ago: "Saved",
        original_path: originalPath,
        audio_path: null,
        transcript_path: null,
        summary_path: null,
        memory_path: null,
        chunks_path: null,
        created_at: nowISO(),
        updated_at: nowISO(),
      };

      await updateOrInsert(entry);
      await setProgress({ lectureId, stage: "uploaded", percent: 0, done: true, error: "" });
      return NextResponse.json({ ok: true, duplicate: false, lecture: entry });
    }

    const body = await req.json();
    action = body.action as Action;
    if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

    if (action === "progress") {
      const p = await loadProgress();
      if (!body.lectureId || p.lectureId === body.lectureId) return NextResponse.json({ ok: true, progress: p });
      return NextResponse.json({ ok: true, progress: defaultProgress });
    }

    if (action === "load") {
      const lib = await loadLibrary();

      if (body.lectureId) {
        const lecture = lib.find((x) => x.lecture_id === body.lectureId);
        if (!lecture) return NextResponse.json({ error: "Lecture not found" }, { status: 404 });

        const transcript = lecture.transcript_path && (await fileExists(lecture.transcript_path))
          ? await fsp.readFile(lecture.transcript_path, "utf-8")
          : "";
        const summary = lecture.summary_path && (await fileExists(lecture.summary_path))
          ? await fsp.readFile(lecture.summary_path, "utf-8")
          : "";
        const memory = lecture.memory_path && (await fileExists(lecture.memory_path))
          ? await fsp.readFile(lecture.memory_path, "utf-8")
          : "";

        let chunks: string[] = [];
        if (lecture.chunks_path && (await fileExists(lecture.chunks_path))) {
          const raw = JSON.parse(await fsp.readFile(lecture.chunks_path, "utf-8"));
          chunks = Array.isArray(raw) ? raw.map((x: any) => x.text).filter(Boolean) : [];
        }

        return NextResponse.json({ ok: true, lecture, transcript, summary, memory, chunks });
      }

      return NextResponse.json({ ok: true, library: lib });
    }

    if (action === "process") {
      const { lectureId, language = "en", llmModel = DEFAULT_LLM_MODEL } = body;

      await setProgress({ lectureId, stage: "starting", percent: 3, done: false, error: "" });

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === lectureId);
      if (!lecture) return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
      if (!lecture.original_path) return NextResponse.json({ error: "Missing original_path" }, { status: 400 });

      const ext = path.extname(lecture.original_path).toLowerCase();
      const ldir = lectureDir(lecture.lecture_id);
      await ensureDir(ldir);
      const contentKind = inferContentKindFromEntry(lecture);

      if (contentKind === "document") {
        let extractedText = "";
        let visualText = "";
        let notesText = "";

        if (PDF_EXTS.has(ext)) {
          await setProgress({ stage: "extracting PDF text", percent: 35 });

          try {
            const timeoutMs = Number(process.env.PDF_TEXT_TIMEOUT_MS || 20000);
            notesText = await withTimeout(extractPdfTextWithLoader(lecture.original_path), timeoutMs, "PDF text extraction");
          } catch (e: any) {
            console.warn("[PDF] loader extraction failed:", e?.message || e);
          }

          if (!notesText.trim()) {
            await setProgress({ stage: "rendering PDF pages", percent: 45 });
            const pdfPagesDir = path.join(ldir, "pdf_pages");
            const pageImages = await convertPdfToImages(lecture.original_path, pdfPagesDir);

            await setProgress({ stage: "reading PDF pages (vision)", percent: 55 });
            visualText = await visionExtractFromImages(pageImages);
          }

          extractedText = [
            notesText ? `=== PDF/NOTES TEXT ===\n${notesText}` : "",
            visualText ? `=== VISUAL NOTES (OLLAMA VISION) ===\n${visualText}` : "",
          ].filter(Boolean).join("\n\n");
        } else if (IMAGE_EXTS.has(ext)) {
          await setProgress({ stage: "reading image notes (vision)", percent: 45 });
          visualText = await visionExtractFromImages([lecture.original_path]);
          extractedText = visualText ? `=== VISUAL NOTES (OLLAMA VISION) ===\n${visualText}` : "";
        } else {
          return NextResponse.json({ error: `Unsupported file type for document processing: ${ext}` }, { status: 400 });
        }

        if (!extractedText.trim()) {
          await setProgress({ stage: "failed", percent: 100, done: true, error: "No extractable text found." });
          return NextResponse.json({ error: "No extractable text found." }, { status: 400 });
        }

        await setProgress({ stage: "merging extracted content", percent: 75 });

        const chunks = chunkText(extractedText, 3500, 400);
        const localInput = shortenForLLM(extractedText, 20000);

        await setProgress({ stage: "creating summary", percent: 84 });
        const summary = await ollamaText(buildDocumentSummaryPrompt(localInput));

        await setProgress({ stage: "creating lecture memory", percent: 90 });
        const memory = await ollamaText(buildDocumentMemoryPrompt(localInput));

        await setProgress({ stage: "saving outputs", percent: 96 });

        const transcriptPath = path.join(ldir, "transcript.txt");
        const summaryPath = path.join(ldir, "summary.txt");
        const memoryPath = path.join(ldir, "memory.txt");
        const chunksPath = path.join(ldir, "chunks.json");

        await fsp.writeFile(transcriptPath, extractedText, "utf-8");
        await fsp.writeFile(summaryPath, summary, "utf-8");
        await fsp.writeFile(memoryPath, memory, "utf-8");
        await fsp.writeFile(chunksPath, JSON.stringify(chunks.map((text, i) => ({ chunk_id: i, text })), null, 2), "utf-8");

        const updated = await patchByHash(lecture.file_hash, {
          transcript_path: transcriptPath,
          summary_path: summaryPath,
          memory_path: memoryPath,
          chunks_path: chunksPath,
          status: "Ready",
          content_kind: "document",
        });

        await setProgress({ lectureId, stage: "completed", percent: 100, done: true, error: "" });

        return NextResponse.json({
          ok: true,
          lecture: updated,
          transcript: extractedText,
          summary,
          memory,
          chunks,
          sources_used: {
            pdf: !!notesText,
            vision: !!visualText,
            local: true,
          },
        });
      }

      let audioText = "";
      let visualText = "";
      let notesText = "";
      let audioPath = lecture.audio_path;

      if (VIDEO_EXTS.has(ext)) {
        await setProgress({ stage: "extracting audio", percent: 15 });

        if (!audioPath) {
          audioPath = path.join(ldir, "audio.m4a");
          await convertVideoToAudio(lecture.original_path, audioPath);
          await patchByHash(lecture.file_hash, { audio_path: audioPath, status: "Audio Ready" });
        }

        await setProgress({ stage: "transcribing audio", percent: 35 });
        audioText = await transcribeAudio(audioPath, language);

        await setProgress({ stage: "extracting key frames (scene change)", percent: 50 });
        const framesDir = path.join(ldir, "frames");
        const frames = await extractFramesSceneBased(lecture.original_path, framesDir);

        await setProgress({ stage: "reading slide content (vision)", percent: 68 });
        visualText = await visionExtractFromImages(frames);
      } else if (AUDIO_EXTS.has(ext)) {
        await setProgress({ stage: "preparing audio", percent: 20 });

        if (!audioPath) {
          audioPath = path.join(ldir, `audio${ext}`);
          if (!(await fileExists(audioPath))) await fsp.copyFile(lecture.original_path, audioPath);
          await patchByHash(lecture.file_hash, { audio_path: audioPath, status: "Audio Ready" });
        }

        await setProgress({ stage: "transcribing audio", percent: 55 });
        audioText = await transcribeAudio(audioPath, language);
      } else if (PDF_EXTS.has(ext)) {
        await setProgress({ stage: "extracting PDF text", percent: 35 });

        try {
          const timeoutMs = Number(process.env.PDF_TEXT_TIMEOUT_MS || 20000);
          notesText = await withTimeout(extractPdfTextWithLoader(lecture.original_path), timeoutMs, "PDF text extraction");
        } catch (e: any) {
          console.warn("[PDF] loader extraction failed:", e?.message || e);
        }

        if (!notesText.trim()) {
          await setProgress({ stage: "rendering PDF pages", percent: 45 });
          const pdfPagesDir = path.join(ldir, "pdf_pages");
          const pageImages = await convertPdfToImages(lecture.original_path, pdfPagesDir);

          await setProgress({ stage: "reading PDF pages (vision)", percent: 55 });
          notesText = await visionExtractFromImages(pageImages);
        }

        if (!notesText.trim()) {
          await setProgress({
            stage: "failed",
            percent: 100,
            done: true,
            error: "Could not extract text from PDF (text layer + vision fallback failed).",
          });
          return NextResponse.json({ error: "Could not extract text from PDF." }, { status: 400 });
        }
      } else if (IMAGE_EXTS.has(ext)) {
        await setProgress({ stage: "reading image notes (vision)", percent: 45 });
        visualText = await visionExtractFromImages([lecture.original_path]);
      } else {
        return NextResponse.json({ error: `Unsupported file type for process: ${ext}` }, { status: 400 });
      }

      await setProgress({ stage: "merging extracted content", percent: 75 });

      const combinedTranscript = [
        audioText ? `=== AUDIO TRANSCRIPT ===\n${audioText}` : "",
        notesText ? `=== PDF/NOTES TEXT ===\n${notesText}` : "",
        visualText ? `=== VISUAL NOTES (OLLAMA VISION) ===\n${visualText}` : "",
      ].filter(Boolean).join("\n\n");

      if (!combinedTranscript.trim()) {
        await setProgress({ stage: "failed", percent: 100, done: true, error: "No extractable text found." });
        return NextResponse.json({ error: "No extractable text found." }, { status: 400 });
      }

      const chunks = chunkText(combinedTranscript, 3500, 400);
      const llmInput = shortenForLLM(combinedTranscript, 20000);

      await setProgress({ stage: "creating summary", percent: 84 });
      const summary = await llm(
        [
          { role: "system", content: "You are a helpful tutor who produces structured study notes from multimodal inputs." },
          { role: "user", content: buildSummaryPrompt(llmInput) },
        ],
        llmModel
      );

      await setProgress({ stage: "creating lecture memory", percent: 90 });
      const memory = await llm(
        [
          { role: "system", content: "You are a helpful tutor who creates compact lecture memories from multimodal inputs." },
          { role: "user", content: buildMemoryPrompt(llmInput) },
        ],
        llmModel
      );

      await setProgress({ stage: "saving outputs", percent: 96 });

      const transcriptPath = path.join(ldir, "transcript.txt");
      const summaryPath = path.join(ldir, "summary.txt");
      const memoryPath = path.join(ldir, "memory.txt");
      const chunksPath = path.join(ldir, "chunks.json");

      await fsp.writeFile(transcriptPath, combinedTranscript, "utf-8");
      await fsp.writeFile(summaryPath, summary, "utf-8");
      await fsp.writeFile(memoryPath, memory, "utf-8");
      await fsp.writeFile(chunksPath, JSON.stringify(chunks.map((text, i) => ({ chunk_id: i, text })), null, 2), "utf-8");

      const updated = await patchByHash(lecture.file_hash, {
        audio_path: audioPath || null,
        transcript_path: transcriptPath,
        summary_path: summaryPath,
        memory_path: memoryPath,
        chunks_path: chunksPath,
        status: "Ready",
        content_kind: "video",
      });

      await setProgress({ lectureId, stage: "completed", percent: 100, done: true, error: "" });

      return NextResponse.json({
        ok: true,
        lecture: updated,
        transcript: combinedTranscript,
        summary,
        memory,
        chunks,
        sources_used: {
          audio: !!audioText,
          pdf: !!notesText,
          vision: !!visualText,
        },
      });
    }

    if (action === "chat") {
      const { lectureId, question, history = [], llmModel = DEFAULT_LLM_MODEL } = body;
      if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === lectureId);
      if (
        !lecture ||
        !lecture.memory_path ||
        !lecture.chunks_path ||
        !(await fileExists(lecture.memory_path)) ||
        !(await fileExists(lecture.chunks_path))
      ) {
        return NextResponse.json({ error: "Lecture not processed yet" }, { status: 400 });
      }

      const memory = await fsp.readFile(lecture.memory_path, "utf-8");
      const raw = JSON.parse(await fsp.readFile(lecture.chunks_path, "utf-8"));
      const chunks: string[] = raw.map((x: any) => x.text).filter(Boolean);

      const top = retrieveTopK(question, chunks, 3);
      const ctx = top.map((x) => `(Chunk ${x.i})\n${x.text}`).join("\n\n---\n\n");

      const messages: ChatMessage[] = [
        { role: "system", content: "You are a helpful tutor grounded in provided lecture context." },
        { role: "user", content: `Lecture Memory:\n${memory}\n\nRelevant Excerpts:\n${ctx}` },
        ...(history as ChatMessage[]).slice(-8),
        { role: "user", content: question },
      ];

      const reply = await llm(messages, llmModel);
      return NextResponse.json({ ok: true, reply });
    }

    if (action === "mcq" || action === "tf" || action === "derivation") {
      const { lectureId, focus = "", n = 5, topic = "main lecture concept", llmModel = DEFAULT_LLM_MODEL } = body;

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === lectureId);
      if (
        !lecture ||
        !lecture.memory_path ||
        !lecture.chunks_path ||
        !(await fileExists(lecture.memory_path)) ||
        !(await fileExists(lecture.chunks_path))
      ) {
        return NextResponse.json({ error: "Lecture not processed yet" }, { status: 400 });
      }

      const memory = await fsp.readFile(lecture.memory_path, "utf-8");
      const raw = JSON.parse(await fsp.readFile(lecture.chunks_path, "utf-8"));
      const chunks: string[] = raw.map((x: any) => x.text).filter(Boolean);

      const top = retrieveTopK(focus || topic || "overall lecture", chunks, action === "derivation" ? 3 : 2);
      const ctx = top.map((x) => `(Chunk ${x.i})\n${x.text}`);

      if (action === "derivation") {
        const output = await llm(
          [
            { role: "system", content: "You are a patient tutor who shows steps clearly." },
            { role: "user", content: derivationPrompt(memory, ctx, topic) },
          ],
          llmModel
        );
        return NextResponse.json({ ok: true, output });
      }

      const prompt = action === "mcq" ? mcqPrompt(memory, ctx, n) : tfPrompt(memory, ctx, n);
      const rawOut = await llm(
        [
          { role: "system", content: "You generate strict JSON only." },
          { role: "user", content: prompt },
        ],
        llmModel
      );

      const items = extractJsonList(rawOut);
      return NextResponse.json({ ok: true, items });
    }

    if (action === "deleteLecture") {
      const { lectureId } = body;
      if (!lectureId) return NextResponse.json({ error: "Missing lectureId" }, { status: 400 });

      const lib = await loadLibrary();
      const filtered = lib.filter((x) => x.lecture_id !== lectureId);
      await saveLibrary(filtered);
      await removeIfExists(lectureDir(lectureId));
      return NextResponse.json({ ok: true });
    }

    if (action === "deleteAll") {
      await removeIfExists(LECTURES_DIR);
      await ensureDir(LECTURES_DIR);
      await saveLibrary([]);
      await setProgress(defaultProgress);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (e: any) {
    await setProgress({
      stage: "failed",
      percent: 100,
      done: true,
      error: e?.message || "Server error",
    });
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

async function extractFirstPageTextFromPdf(pdfPath: string) {
  const buffer = await fsp.readFile(pdfPath);
  const tempDir = path.join(tmpdir(), "teacher-pdf-preview");
  await ensureDir(tempDir);
  const tempPath = path.join(tempDir, `${crypto.createHash("sha1").update(buffer).digest("hex")}.pdf`);
  await writeFile(tempPath, buffer);

  try {
    const loader = new PDFLoader(tempPath);
    const docs = await loader.load();
    return String(docs[0]?.pageContent || "").trim().slice(0, 2000);
  } finally {
    try { await unlink(tempPath); } catch {}
  }
}