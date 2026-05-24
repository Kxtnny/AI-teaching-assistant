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
import { Document } from "@langchain/core/documents";
import { getVectorStore } from "@/lib/vectorStore";
import { supabase } from "@/lib/supabase";

class PDFLoader {
  constructor(_path: string) {}
  async load(): Promise<Array<{ pageContent: string }>> {
    return [];
  }
}

async function repairTablesJsonFromText(_raw: string): Promise<any> { return null; }
function heuristicExtractTablesFromText(_text: string): any { return { tables: [] }; }
function tablesToMarkdown(_tablesObj: any): string { return ""; }
async function ocrExtractTablesFromImage(_imagePath: string): Promise<any> { return { tables: [] }; }
async function saveTableEvalReport(_lectureDir: string, _reportName: string, _payload: any): Promise<void> {}
function summarizeTableMetrics(_visionTable: any, _nativeTable: any): any { return {}; }
async function describePdfImageBlockWithVision(_params: any): Promise<string> { return ""; }
async function extractTablesFromPdfNative(_pdfPath: string): Promise<any> { return null; }
async function extractPdfBlocksFromPdfNative(_pdfPath: string): Promise<any> { return null; }
async function extractPdfTextWithLoader(_pdfPath: string): Promise<string> { return ""; }
async function extractPdfPagesWithLoader(_pdfPath: string): Promise<any> { return []; }

type Action =
  | "upload"
  | "process"
  | "progress"
  | "healthCheck"
  | "load"
  | "chat"
  | "mcq"
  | "tf"
  | "derivation"
  | "deleteLecture"
  | "deleteAll"
  | "retryIndex";

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
  temporary?: boolean;
  original_path: string | null;
  audio_path: string | null;
  transcript_path: string | null;
  description_path: string | null;
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

const globalForTeacherTempCleanup = globalThis as unknown as {
  teacherTempCleanupInstalled?: boolean;
  teacherTempCleanupOnStartRan?: boolean;
  teacherTempCleanupRunning?: boolean;
};

async function ensureDir(p: string) {
  await fsp.mkdir(p, { recursive: true });
}
async function fileExists(p: string) {
  try { await fsp.access(p); return true; } catch { return false; }
}
async function removeIfExists(p: string) {
  if (await fileExists(p)) await fsp.rm(p, { recursive: true, force: true });
}
async function deleteLectureVectors(lectureId: string) {
  try {
    await supabase
      .from('documents')
      .delete()
      .filter('metadata->>lectureId', 'eq', lectureId);
  } catch (err: any) {
    console.warn(`[RAG] Failed to delete Supabase documents for ${lectureId}: ${String(err?.message || err)}`);
  }
}
async function removeLectureArtifacts(lectureId: string) {
  await removeIfExists(lectureDir(lectureId));
  await deleteLectureVectors(lectureId);
}
async function purgeTemporaryLectures() {
  const lib = await loadLibrary();
  const tempLectures = lib.filter((entry) => Boolean(entry.temporary));
  if (!tempLectures.length) return;

  for (const entry of tempLectures) {
    await removeLectureArtifacts(entry.lecture_id);
  }

  await saveLibrary(lib.filter((entry) => !entry.temporary));
  const progress = await loadProgress();
  if (progress.lectureId && tempLectures.some((entry) => entry.lecture_id === progress.lectureId)) {
    await setProgress(defaultProgress);
  }
}
function installTempCleanupHandlers() {
  if (globalForTeacherTempCleanup.teacherTempCleanupInstalled) return;
  globalForTeacherTempCleanup.teacherTempCleanupInstalled = true;

  if (process.env.NODE_ENV === "production") return;

  const cleanupAndExit = async (code = 0) => {
    if (globalForTeacherTempCleanup.teacherTempCleanupRunning) return;
    globalForTeacherTempCleanup.teacherTempCleanupRunning = true;
    try {
      await purgeTemporaryLectures();
    } catch (err) {
      console.warn(`[TEMP] Cleanup on shutdown failed: ${String(err)}`);
    } finally {
      globalForTeacherTempCleanup.teacherTempCleanupRunning = false;
      process.exit(code);
    }
  };

  process.once("SIGINT", () => { void cleanupAndExit(0); });
  process.once("SIGTERM", () => { void cleanupAndExit(0); });
}
async function initStorage() {
  await ensureDir(DATA_DIR);
  await ensureDir(LECTURES_DIR);
  await ensureDir(UPLOAD_TMP);
  if (!(await fileExists(LIBRARY_PATH))) await fsp.writeFile(LIBRARY_PATH, "[]", "utf-8");
  if (!(await fileExists(PROGRESS_PATH))) {
    await fsp.writeFile(PROGRESS_PATH, JSON.stringify(defaultProgress, null, 2), "utf-8");
  }

  if (process.env.NODE_ENV !== "production" && !globalForTeacherTempCleanup.teacherTempCleanupOnStartRan) {
    globalForTeacherTempCleanup.teacherTempCleanupOnStartRan = true;
    await purgeTemporaryLectures();
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
function normalizeInsertionErrorMessage(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || "unknown error");
  return message.replace(/^Error inserting:\s*/i, "");
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
function buildDocumentDescriptionPrompt(pages: Array<{ label: string; content: string }>) {
  const serializedPages = pages
    .map((page) => `[${page.label}]\n${shortenForLLM(page.content, 8000)}`)
    .join("\n\n---\n\n");

  return `You are writing a detailed reading guide for a student.
Create a structured page-by-page extraction that preserves the page content in reading order and explains all important visible elements.

Rules:
- Start with the heading "Document Summary:".
- Write 4 to 8 concise bullet sentences summarizing the whole document.
- Then write one section per page using the heading "Page X:".
- For each page, describe the content from top to bottom in the order a reader would encounter it.
- First narrate the visible text in reading order.
- Then add component-specific subsections only if they exist on the page.
- Use these subsection headings exactly when relevant: "Tables:", "Images:", "Diagrams:", "Formulas:", "Definitions:", "Examples:", "Other Important Details:".
- For tables, output a markdown table row by row with clear column headers and values. Include every row you can infer.
- For images and diagrams, give a thorough and complete description of what is shown, including labels, arrows, shapes, relationships, legends, captions, and likely purpose.
- For formulas, transcribe them carefully and explain visible symbols if possible.
- For definitions, explain the term and surrounding context from the page.
- Preserve important wording, names, numbers, and labels exactly when possible.
- Keep the language concrete, factual, and complete.
- Do not mention a component section if that component does not appear on the page.
- Do not add commentary about missing information.
- If the page is dense, prioritize completeness over brevity.

Input pages:
${serializedPages}`;
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
async function transcribeAudio(audioPath: string, language: string) {
  const tx = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: TRANSCRIBE_MODEL,
    language,
    response_format: "text",
  });
  return String(tx || "").trim();
}
function buildDetailedPageExtractionPrompt(pageLabel: string, adjacentText?: string) {
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
async function visionExtractFromImages(imagePaths: string[], visionModel = OLLAMA_VISION_MODEL, adjacentTexts: string[] = [], mode: "generic" | "pdf" = "generic") {
  const maxFrames = Number(process.env.VISION_MAX_FRAMES || 8);
  const concurrency = Number((mode === "pdf" ? process.env.PDF_VISION_CONCURRENCY : process.env.VISION_CONCURRENCY) || (mode === "pdf" ? 1 : 2));
  const perImageTimeoutMs = Number((mode === "pdf" ? process.env.PDF_VISION_TIMEOUT_MS : process.env.VISION_TIMEOUT_MS) || (mode === "pdf" ? 60000 : 20000));

  const limited = imagePaths.slice(0, maxFrames);
  const results: string[] = [];
  if (!limited.length) return "";

  async function processOne(imgPath: string, idx: number) {
    // local parsed/method handled in detailed extractor when needed
    try {
      const b64 = await fsp.readFile(imgPath, { encoding: "base64" });
      const res = await withTimeout(
        ollama.chat({
          model: visionModel,
          messages: [{
            role: "user",
            content: buildDetailedPageExtractionPrompt(`Page ${idx + 1}`, adjacentTexts[idx]),
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
async function visionExtractFromImagesDetailed(imagePaths: string[], visionModel = OLLAMA_VISION_MODEL, adjacentTexts: string[] = [], mode: "generic" | "pdf" = "generic", lectureDirPath?: string) {
  const maxFrames = Number(process.env.VISION_MAX_FRAMES || 8);
  const concurrency = Number((mode === "pdf" ? process.env.PDF_VISION_CONCURRENCY : process.env.VISION_CONCURRENCY) || (mode === "pdf" ? 1 : 2));
  const perImageTimeoutMs = Number((mode === "pdf" ? process.env.PDF_VISION_TIMEOUT_MS : process.env.VISION_TIMEOUT_MS) || (mode === "pdf" ? 60000 : 20000));

  const limited = imagePaths.slice(0, maxFrames);
  const results: Array<{ label: string; content: string; parsedTables?: any; tableExtractionMethod?: string }> = [];
  if (!limited.length) return results;

  for (let idx = 0; idx < limited.length; idx++) {
    const imgPath = limited[idx];
    try {
      const b64 = await fsp.readFile(imgPath, { encoding: "base64" });
      const res = await withTimeout(
        ollama.chat({
          model: visionModel,
          messages: [{ role: "user", content: buildDetailedPageExtractionPrompt(`Page ${idx + 1}`, adjacentTexts[idx]), images: [b64] }],
        }),
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

        if ((!extractedTables || !Array.isArray(extractedTables.tables) || !extractedTables.tables.length) && mode === "pdf") {
          const ocr = await ocrExtractTablesFromImage(imgPath);
          if (ocr && Array.isArray(ocr.tables) && ocr.tables.length) {
            extractedTables = ocr;
            tableExtractionMethod = tableExtractionMethod || "ocr";
          }
        }

        if (extractedTables && Array.isArray(extractedTables.tables) && extractedTables.tables.length) {
          const tablesMd = tablesToMarkdown(extractedTables);
          finalText = `=== Extracted Tables ===\n${tablesMd}\n\n${txt.replace(/<TABLES_JSON>[\s\S]*?<\/TABLES_JSON>/i, "")}`;
          if (lectureDirPath) {
            try {
              await saveTableEvalReport(lectureDirPath, `page_${idx + 1}`, { method: tableExtractionMethod || "vision", tables: extractedTables.tables });
            } catch (e) {
              // ignore
            }
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
async function indexContentChunksToVectorStore(params: {
  lectureId: string;
  fileName: string;
  fileType: string;
  parserModel: string;
  contentKind: ContentKind;
  parserOutput: string;
  chunks: string[];
}) {
  try {
    const vectorStore = await getVectorStore();
    const docs = params.chunks.map((text, chunkIndex) => new Document({
      pageContent: text,
      metadata: {
        lectureId: params.lectureId,
        fileName: params.fileName,
        fileType: params.fileType,
        parserModel: params.parserModel,
        contentKind: params.contentKind,
        source: "teacher-upload-chunk",
        chunkIndex,
        uploadDate: new Date().toISOString(),
      },
    }));

    // Index the raw parser output as a summary doc as before
    if (params.parserOutput.trim()) {
      docs.push(new Document({
        pageContent: `File parser output (${params.parserModel}) for ${params.fileName}:\n\n${params.parserOutput}`,
        metadata: {
          lectureId: params.lectureId,
          fileName: params.fileName,
          fileType: params.fileType,
          parserModel: params.parserModel,
          contentKind: params.contentKind,
          source: "teacher-upload-summary",
          chunkIndex: -1,
          uploadDate: new Date().toISOString(),
        },
      }));

      // Attempt to generate sentence-level page captions and an overall summary for better RAG
      try {
        const captionPrompt = buildCaptionPrompt(params.parserOutput);
        const captionsRaw = await ollamaText(captionPrompt, OLLAMA_TEXT_MODEL);
        try {
          const parsedCaptions = JSON.parse(captionsRaw);
          if (Array.isArray(parsedCaptions.pages)) {
            for (const p of parsedCaptions.pages) {
              if (p && p.summary) {
                docs.push(new Document({
                  pageContent: String(p.summary),
                  metadata: {
                    lectureId: params.lectureId,
                    fileName: params.fileName,
                    fileType: params.fileType,
                    parserModel: params.parserModel,
                    contentKind: params.contentKind,
                    source: "teacher-upload-caption",
                    page: Number(p.page) || -1,
                    chunkIndex: -1,
                    uploadDate: new Date().toISOString(),
                  },
                }));
              }
            }
          }

          if (parsedCaptions && parsedCaptions.overall) {
            docs.push(new Document({
              pageContent: String(parsedCaptions.overall),
              metadata: {
                lectureId: params.lectureId,
                fileName: params.fileName,
                fileType: params.fileType,
                parserModel: params.parserModel,
                contentKind: params.contentKind,
                source: "teacher-upload-llm-summary",
                chunkIndex: -1,
                uploadDate: new Date().toISOString(),
              },
            }));
          }
        } catch (e) {
          // If parsing JSON fails, still index the raw caption text as a helpful doc
          docs.push(new Document({
            pageContent: `LLM captions for ${params.fileName}:\n\n${captionsRaw}`,
            metadata: {
              lectureId: params.lectureId,
              fileName: params.fileName,
              fileType: params.fileType,
              parserModel: params.parserModel,
              contentKind: params.contentKind,
              source: "teacher-upload-llm-summary-raw",
              chunkIndex: -1,
              uploadDate: new Date().toISOString(),
            },
          }));
        }
      } catch (err) {
        console.warn(`[RAG] Caption generation failed for ${params.fileName}: ${String(err)}`);
      }
    }

    if (docs.length) {
      // Add documents in small batches with retries to avoid large single requests failing
      const batchSize = Number(process.env.RAG_INDEX_BATCH_SIZE || 8);
      const maxAttempts = Number(process.env.RAG_INDEX_MAX_ATTEMPTS || 3);
      let anyFailed = false;
      let lastErr: any = null;

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        let succeeded = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await vectorStore.addDocuments(batch);
            succeeded = true;
            break;
          } catch (err: any) {
            lastErr = err;
            console.warn(`[RAG] addDocuments attempt ${attempt} failed for batch ${i}/${docs.length}: ${String(err?.message || err)}`);
            // exponential backoff
            await new Promise((res) => setTimeout(res, 250 * attempt));
          }
        }
        if (!succeeded) {
          anyFailed = true;
          // continue attempting remaining batches but record failure
        }
      }

      if (anyFailed) {
        throw new Error(`Error inserting: ${normalizeInsertionErrorMessage(lastErr)}`);
      }
    }
    return { ok: true };
  } catch (error: any) {
    console.warn(
      `[RAG] Skipping vector indexing for ${params.fileName}: ${normalizeInsertionErrorMessage(error)}`
    );
    return { ok: false, error: `Error inserting: ${normalizeInsertionErrorMessage(error)}` };
  }
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
    installTempCleanupHandlers();
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

      const tempMode = String(form.get("tempMode") || "") === "1";

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
        temporary: tempMode || undefined,
        original_path: originalPath,
        audio_path: null,
        transcript_path: null,
        description_path: null,
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

    if (action === "healthCheck") {
      let vectorRpcOk = false;
      let vectorRpcError: string | null = null;

      try {
        const vectorStore = await getVectorStore();
        // Use a non-existent lecture filter to avoid exposing content while still validating RPC wiring.
        await vectorStore.similaritySearch("health check", 1, { lectureId: "__healthcheck__" });
        vectorRpcOk = true;
      } catch (err: any) {
        vectorRpcError = normalizeInsertionErrorMessage(err);
      }

      return NextResponse.json(
        {
          ok: vectorRpcOk,
          checks: {
            vectorRpcOk,
            vectorRpcError,
          },
        },
        { status: vectorRpcOk ? 200 : 503 }
      );
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
        const description = lecture.description_path && (await fileExists(lecture.description_path))
          ? await fsp.readFile(lecture.description_path, "utf-8")
          : "";
        const memory = lecture.memory_path && (await fileExists(lecture.memory_path))
          ? await fsp.readFile(lecture.memory_path, "utf-8")
          : "";

        let chunks: string[] = [];
        if (lecture.chunks_path && (await fileExists(lecture.chunks_path))) {
          const raw = JSON.parse(await fsp.readFile(lecture.chunks_path, "utf-8"));
          chunks = Array.isArray(raw) ? raw.map((x: any) => x.text).filter(Boolean) : [];
        }

        return NextResponse.json({ ok: true, lecture, transcript, summary, description, memory, chunks });
      }

      return NextResponse.json({ ok: true, library: lib });
    }

    if (action === "process") {
      const { lectureId, language = "en", llmModel = DEFAULT_LLM_MODEL, visionModel = OLLAMA_VISION_MODEL } = body;

      await setProgress({ lectureId, stage: "starting", percent: 3, done: false, error: "" });

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === lectureId) as LectureEntry & { original_path: string };
      if (!lecture) return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
      if (!lecture.original_path) return NextResponse.json({ error: "Missing original_path" }, { status: 400 });

      const ext = path.extname(lecture.original_path).toLowerCase();
      const ldir = lectureDir(lecture.lecture_id);
      await ensureDir(ldir);
      const contentKind = inferContentKindFromEntry(lecture);

      if (contentKind === "document") {
        return NextResponse.json({ error: "Non-video processing has moved to /api/upload" }, { status: 400 });

        let extractedText = "";
        let visualText = "";
        let notesText = "";
        let parserOutput = "";
        let descriptionPages: Array<{ label: string; content: string }> = [];

        if (PDF_EXTS.has(ext)) {
          await setProgress({ stage: "extracting PDF text", percent: 35 });
          const nativeTablesByPage = new Map<number, any[]>();

          try {
            const timeoutMs = Number(process.env.PDF_TEXT_TIMEOUT_MS || 20000);
            const pages = await withTimeout(extractPdfPagesWithLoader(lecture.original_path), timeoutMs, "PDF text extraction");
            notesText = pages.map((page: { pageContent: string }) => page.pageContent).join("\n\n");
            descriptionPages = pages.map((page: { pageNumber: number; pageContent: string }) => ({ label: `Page ${page.pageNumber}`, content: page.pageContent }));

            // Native block and table extraction: try local PyMuPDF/pdfplumber helpers first.
            try {
              const blocks = await extractPdfBlocksFromPdfNative(lecture.original_path);
              const imageBlocks = Array.isArray(blocks?.pages)
                ? blocks.pages.flatMap((page: any) => {
                    if (!page || page.type !== "page" || !Array.isArray(page.image_blocks)) return [];
                    return page.image_blocks.map((imageBlock: any) => ({
                      page: Number(page.page) || 1,
                      ...imageBlock,
                    }));
                  })
                : [];

              const imageDescriptions = await Promise.all(
                imageBlocks.map(async (imageBlock: any, imageIndex: number) => {
                  if (!imageBlock?.image_base64) return null;
                  try {
                    const description = await describePdfImageBlockWithVision({
                      imageBase64: imageBlock.image_base64,
                      imageExtension: imageBlock.ext,
                      surroundingText: imageBlock.surrounding_text,
                      pageLabel: `Page ${imageBlock.page} / Block ${imageBlock.rect_index ?? imageIndex}`,
                      modelName: visionModel,
                    });
                    return {
                      page: imageBlock.page,
                      blockIndex: imageBlock.rect_index ?? imageIndex,
                      content: description,
                      metadata: imageBlock,
                    };
                  } catch {
                    return {
                      page: imageBlock.page,
                      blockIndex: imageBlock.rect_index ?? imageIndex,
                      content: String(imageBlock.surrounding_text || "").trim(),
                      metadata: imageBlock,
                    };
                  }
                })
              );

              if (Array.isArray(blocks?.pages) && blocks.pages.length && imageDescriptions.length) {
                const descriptionsByPage = new Map<number, string[]>();
                for (const imageDescription of imageDescriptions.filter(Boolean)) {
                  const pageNumber = Number((imageDescription as any).page) || 1;
                  const list = descriptionsByPage.get(pageNumber) || [];
                  list.push((imageDescription as any).content);
                  descriptionsByPage.set(pageNumber, list);
                }

                for (const page of blocks.pages) {
                  if (!page || page.type !== "page") continue;
                  const pageNumber = Number(page.page) || 1;
                  const idx = Math.max(0, pageNumber - 1);
                  const pageContextParts = [String(page.text || "").trim()];
                  const imageTexts = descriptionsByPage.get(pageNumber) || [];
                  if (imageTexts.length) pageContextParts.push(`Image blocks:\n${imageTexts.map((text) => `- ${text}`).join("\n")}`);
                  const pageContext = pageContextParts.filter(Boolean).join("\n\n");
                  if (descriptionPages[idx] && pageContext) {
                    descriptionPages[idx].content = `${pageContext}\n\n${descriptionPages[idx].content}`.trim();
                  }
                }
              }

              if (blocks && Array.isArray(blocks.pages) && blocks.pages.length) {
                for (const page of blocks.pages) {
                  if (!page || page.type !== "page") continue;
                  const idx = Math.max(0, Number(page.page || 1) - 1);
                  const pageContextParts = [String(page.text || "").trim()];
                  if (Array.isArray(page.image_blocks) && page.image_blocks.length) {
                    for (const img of page.image_blocks) {
                      const ctx = String(img?.surrounding_text || "").trim();
                      if (ctx) pageContextParts.push(`Image context: ${ctx}`);
                    }
                  }
                  const pageContext = pageContextParts.filter(Boolean).join("\n\n");
                  if (descriptionPages[idx] && pageContext) {
                    descriptionPages[idx].content = `${pageContext}\n\n${descriptionPages[idx].content}`.trim();
                  }
                }
              }

              const native = await extractTablesFromPdfNative(lecture.original_path);
              if (native && Array.isArray(native.tables) && native.tables.length) {
                // integrate native tables into per-page descriptionPages by prepending markdown
                for (const t of native.tables) {
                  const pnum = Number(t.page) || 1;
                  const tableList = nativeTablesByPage.get(pnum) || [];
                  tableList.push(t);
                  nativeTablesByPage.set(pnum, tableList);
                  const md = tablesToMarkdown({ tables: [t] });
                  const idx = pnum - 1;
                  if (descriptionPages[idx]) {
                    descriptionPages[idx].content = `=== Native Extracted Tables ===\n${md}\n\n${descriptionPages[idx].content}`;
                  }
                }
                // save eval reports
                try {
                  for (const t of native.tables) {
                    await saveTableEvalReport(ldir, `native_page_${t.page}`, { method: "native", table: t });
                  }
                } catch (e) {
                  console.warn(`[EVAL] failed to save native table eval reports: ${String(e)}`);
                }
              }
            } catch (e) {
              console.warn(`[PDF_NATIVE] native table extractor failed: ${String(e)}`);
            }

          } catch (e: any) {
            console.warn("[PDF] loader extraction failed:", e?.message || e);
          }

          await setProgress({ stage: "rendering PDF pages", percent: 45 });
          const pdfPagesDir = path.join(ldir, "pdf_pages");
          const pageImages = await convertPdfToImages(lecture.original_path, pdfPagesDir);

          await setProgress({ stage: "reading PDF pages (vision)", percent: 55 });
          const pageContexts = descriptionPages.map((page) => page.content);
          const visionPages = await visionExtractFromImagesDetailed(pageImages, visionModel, pageContexts, "pdf", ldir);
          visualText = visionPages.map((page) => `=== ${page.label} ===\n${page.content}`).join("\n\n");
          if (visionPages.length) descriptionPages = visionPages;

          try {
            for (const page of visionPages) {
              const pageNumber = Number(String(page.label).replace(/\D+/g, "")) || 0;
              const nativeTables = nativeTablesByPage.get(pageNumber) || [];
              const parsedTables = (page as any).parsedTables;
              if (nativeTables.length && parsedTables && Array.isArray(parsedTables.tables) && parsedTables.tables.length) {
                const visionTable = parsedTables.tables[0];
                const nativeTable = nativeTables[0];
                const metrics = summarizeTableMetrics(visionTable, nativeTable);
                await saveTableEvalReport(ldir, `page_${pageNumber}`, {
                  method: (page as any).tableExtractionMethod || "vision",
                  metrics,
                  native_table: nativeTable,
                  vision_table: visionTable,
                });
              }
            }
          } catch (e) {
            console.warn(`[EVAL] failed to save comparison table metrics: ${String(e)}`);
          }

          extractedText = [
            notesText ? `=== PDF/NOTES TEXT ===\n${notesText}` : "",
            visualText ? `=== VISUAL NOTES (OLLAMA VISION) ===\n${visualText}` : "",
          ].filter(Boolean).join("\n\n");
        } else if (IMAGE_EXTS.has(ext)) {
          await setProgress({ stage: "reading image notes (vision)", percent: 45 });
          const visionPages = await visionExtractFromImagesDetailed([lecture.original_path], visionModel, [], undefined, ldir);
          visualText = visionPages.map((page) => `=== ${page.label} ===\n${page.content}`).join("\n\n");
          extractedText = visualText ? `=== VISUAL NOTES (OLLAMA VISION) ===\n${visualText}` : "";
          descriptionPages = visionPages;
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
        const descriptionInput = descriptionPages.length ? descriptionPages : [{ label: "Page 1", content: extractedText }];

        await setProgress({ stage: "creating document description", percent: 82 });
        parserOutput = await ollamaText(buildDocumentDescriptionPrompt(descriptionInput), OLLAMA_TEXT_MODEL);
        if (!parserOutput.trim()) parserOutput = extractedText;

        await setProgress({ stage: "creating summary", percent: 84 });
        const summary = await ollamaText(buildDocumentSummaryPrompt(localInput), OLLAMA_TEXT_MODEL);

        await setProgress({ stage: "creating lecture memory", percent: 90 });
        const memory = await ollamaText(buildDocumentMemoryPrompt(localInput), OLLAMA_TEXT_MODEL);

        await setProgress({ stage: "saving outputs", percent: 96 });

        const transcriptPath = path.join(ldir, "transcript.txt");
        const descriptionPath = path.join(ldir, "description.txt");
        const summaryPath = path.join(ldir, "summary.txt");
        const memoryPath = path.join(ldir, "memory.txt");
        const chunksPath = path.join(ldir, "chunks.json");

        await fsp.writeFile(transcriptPath, extractedText, "utf-8");
        await fsp.writeFile(descriptionPath, parserOutput, "utf-8");
        await fsp.writeFile(summaryPath, summary, "utf-8");
        await fsp.writeFile(memoryPath, memory, "utf-8");
        await fsp.writeFile(chunksPath, JSON.stringify(chunks.map((text, i) => ({ chunk_id: i, text })), null, 2), "utf-8");

        const indexingResult = await indexContentChunksToVectorStore({
          lectureId,
          fileName: path.basename(lecture.original_path),
          fileType: path.extname(lecture.original_path).toLowerCase(),
          parserModel: visionModel,
          contentKind: "document",
          parserOutput,
          chunks,
        });

        const updated = await patchByHash(lecture.file_hash, {
          transcript_path: transcriptPath,
          description_path: descriptionPath,
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
          description: parserOutput,
          summary,
          memory,
          chunks,
          parserOutput,
          sources_used: {
            pdf: !!notesText,
            vision: !!visualText,
            local: true,
          },
          indexing_ok: Boolean(indexingResult && indexingResult.ok),
          indexing_error: indexingResult && (indexingResult.error || null),
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
        visualText = await visionExtractFromImages(frames, visionModel);
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

        let pdfVisionText = "";
        try {
          const timeoutMs = Number(process.env.PDF_TEXT_TIMEOUT_MS || 20000);
          notesText = await withTimeout(extractPdfTextWithLoader(lecture.original_path), timeoutMs, "PDF text extraction");
        } catch (e: any) {
          console.warn("[PDF] loader extraction failed:", e?.message || e);
        }

        await setProgress({ stage: "rendering PDF pages", percent: 45 });
        const pdfPagesDir = path.join(ldir, "pdf_pages");
        const pageImages = await convertPdfToImages(lecture.original_path, pdfPagesDir);

        await setProgress({ stage: "reading PDF pages (vision)", percent: 55 });
        pdfVisionText = await visionExtractFromImages(pageImages, visionModel, [], "pdf");

        if (!notesText.trim() && !pdfVisionText.trim()) {
          await setProgress({
            stage: "failed",
            percent: 100,
            done: true,
            error: "Could not extract text from PDF (text layer + vision fallback failed).",
          });
          return NextResponse.json({ error: "Could not extract text from PDF." }, { status: 400 });
        }

        visualText = pdfVisionText;
      } else if (IMAGE_EXTS.has(ext)) {
        await setProgress({ stage: "reading image notes (vision)", percent: 45 });
        visualText = await visionExtractFromImages([lecture.original_path], visionModel);
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
      // attempt to index transcript/chunks for RAG
      const indexingResult2 = await indexContentChunksToVectorStore({
        lectureId,
        fileName: path.basename(lecture.original_path),
        fileType: path.extname(lecture.original_path).toLowerCase(),
        parserModel: OLLAMA_TEXT_MODEL,
        contentKind: contentKind,
        parserOutput: combinedTranscript,
        chunks,
      });

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
        indexing_ok: Boolean(indexingResult2 && indexingResult2.ok),
            hierarchical_pdf_pipeline: PDF_EXTS.has(ext),
        indexing_error: indexingResult2 && (indexingResult2.error || null),
      });
    }

    if (action === "chat") {
      const { lectureId, question, history = [], llmModel = DEFAULT_LLM_MODEL } = body;
      if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === lectureId);
      if (!lecture) {
        return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
      }

      let memory = "";
      if (lecture.memory_path && (await fileExists(lecture.memory_path))) {
        memory = await fsp.readFile(lecture.memory_path, "utf-8");
      }

      let retrievalNotice = "";
      const trySimilaritySearch = async (filter: Record<string, any>, k: number) => {
        try {
          const vectorStore = await getVectorStore();
          return await vectorStore.similaritySearch(question, k, filter);
        } catch (err: any) {
          console.warn(`[RAG] similaritySearch failed for ${lectureId}: ${String(err?.message || err)}`);
          retrievalNotice = `Vector search unavailable, using fallback document lookup. (${normalizeInsertionErrorMessage(err)})`;
          return [];
        }
      };

      // Hybrid retrieval: combine vector matches with lexical local chunk matches, then rerank.
      const vectorCandidates: Document[] = [];
      vectorCandidates.push(...await trySimilaritySearch({ lectureId, source: "teacher-upload-llm-summary" }, 3));
      vectorCandidates.push(...await trySimilaritySearch({ lectureId, source: "teacher-upload-caption" }, 3));
      vectorCandidates.push(...await trySimilaritySearch({ lectureId }, 6));

      let localCandidates: Document[] = [];
      if (lecture.chunks_path && (await fileExists(lecture.chunks_path))) {
        const raw = JSON.parse(await fsp.readFile(lecture.chunks_path, "utf-8"));
        const chunks: string[] = raw.map((x: any) => x.text).filter(Boolean);
        const top = retrieveTopK(question, chunks, 4);
        localCandidates = top.map((x) => new Document({
          pageContent: x.text,
          metadata: { lectureId, chunkIndex: x.i, source: "local-lexical" },
        }));
      }

      const dedupe = new Set<string>();
      const retrieved = [...vectorCandidates, ...localCandidates]
        .filter((doc) => {
          const key = String(doc.pageContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
          if (!key || dedupe.has(key)) return false;
          dedupe.add(key);
          return true;
        })
        .map((doc) => {
          const lexicalScore = scoreChunk(question, doc.pageContent || "");
          const source = String(doc.metadata?.source || "");
          const sourceBoost = source === "local-lexical" || source === "teacher-upload-chunk" ? 0.75 : 0;
          return { doc, score: lexicalScore + sourceBoost };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((x) => x.doc);

      let finalRetrieved = retrieved;

      if (!finalRetrieved.length && lecture.description_path && (await fileExists(lecture.description_path))) {
        const description = await fsp.readFile(lecture.description_path, "utf-8");
        finalRetrieved = [new Document({
          pageContent: description,
          metadata: { lectureId, source: "local-description-fallback", chunkIndex: -1 },
        })];
        retrievalNotice = retrievalNotice || "Vector search unavailable, using the saved document description as fallback context.";
      }

      if (!finalRetrieved.length) {
        return NextResponse.json({ error: "Lecture not processed yet" }, { status: 400 });
      }

      const ctx = finalRetrieved
        .map((doc, index) => {
          const chunkIndex = typeof doc.metadata?.chunkIndex === "number" ? doc.metadata.chunkIndex : index;
          return `(Chunk ${chunkIndex})\n${doc.pageContent}`;
        })
        .join("\n\n---\n\n");

      const messages: ChatMessage[] = [
        { role: "system", content: "You are a helpful tutor grounded in provided lecture context." },
        { role: "user", content: `Lecture Memory:\n${memory}\n\nRelevant Excerpts:\n${ctx}` },
        ...(history as ChatMessage[]).slice(-8),
        { role: "user", content: question },
      ];

      const reply = await llm(messages, llmModel);
      return NextResponse.json({ ok: true, reply, retrieval_notice: retrievalNotice || undefined });
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

      // Delete from library and file system
      const lib = await loadLibrary();
      const filtered = lib.filter((x) => x.lecture_id !== lectureId);
      await saveLibrary(filtered);
      await removeLectureArtifacts(lectureId);

      return NextResponse.json({ ok: true });
    }

    if (action === "deleteAll") {
      await removeIfExists(LECTURES_DIR);
      await ensureDir(LECTURES_DIR);
      await saveLibrary([]);
      await setProgress(defaultProgress);
      return NextResponse.json({ ok: true });
    }

    if (action === "retryIndex") {
      const { lectureId } = body;
      if (!lectureId) return NextResponse.json({ error: "Missing lectureId" }, { status: 400 });

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === lectureId);
      if (!lecture) return NextResponse.json({ error: "Lecture not found" }, { status: 404 });

      // Load chunks and parser output if available
      let chunks: string[] = [];
      try {
        if (lecture.chunks_path && (await fileExists(lecture.chunks_path))) {
          const raw = JSON.parse(await fsp.readFile(lecture.chunks_path, "utf-8"));
          chunks = Array.isArray(raw) ? raw.map((x: any) => x.text).filter(Boolean) : [];
        }
      } catch (e: any) {
        console.warn(`[RAG] Failed to read chunks.json for ${lectureId}: ${String(e?.message || e)}`);
      }

      let parserOutput = "";
      try {
        if (lecture.summary_path && (await fileExists(lecture.summary_path))) {
          parserOutput = await fsp.readFile(lecture.summary_path, "utf-8");
        } else if (lecture.transcript_path && (await fileExists(lecture.transcript_path))) {
          parserOutput = await fsp.readFile(lecture.transcript_path, "utf-8");
        }
      } catch (e: any) {
        console.warn(`[RAG] Failed to read summary/transcript for ${lectureId}: ${String(e?.message || e)}`);
      }

      if (!chunks.length && !parserOutput.trim()) {
        return NextResponse.json({ error: "No chunks or parser output available to index" }, { status: 400 });
      }

      const resIndex = await indexContentChunksToVectorStore({
        lectureId,
        fileName: lecture.original_path ? path.basename(lecture.original_path) : lecture.title,
        fileType: lecture.original_path ? path.extname(lecture.original_path).toLowerCase() : ".txt",
        parserModel: OLLAMA_TEXT_MODEL,
        contentKind: lecture.content_kind || "document",
        parserOutput: parserOutput || "",
        chunks: chunks,
      });

      if (resIndex && resIndex.ok) {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ ok: false, error: resIndex?.error || "Indexing failed" }, { status: 500 });
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
function buildCaptionPrompt(extractedContent: string) {
  return `You are a precise document describer. The input contains extracted text from pages or image frames of a document. For each logical page or frame, produce 1-3 short, complete declarative sentences that describe what is visible (headings, main idea, figures, formulas, and important labels). Also produce a short overall 2-4 sentence summary for the entire input.

Return strict JSON with this shape:
{ "pages": [{ "page": 1, "summary": "..." }, ...], "overall": "..." }

Be concise and factual. Do not include extraneous commentary.

ExtractedContent:
${extractedContent}`;
}