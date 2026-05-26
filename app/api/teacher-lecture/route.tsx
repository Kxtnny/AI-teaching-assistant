import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import OpenAI from "openai";
import ollama from "ollama";
import { ollamaText, llm } from "@/lib/llm";
import { indexContentChunksToVectorStore, normalizeInsertionErrorMessage } from "@/lib/indexing";
import { buildCaptionPrompt } from "@/lib/prompts";
import { visionExtractFromImagesDetailed, buildDetailedPageExtractionPrompt } from "@/lib/pdfVision";
import { getLecturePreviewBuffer, mimeTypeForFile, previewMimeTypeForFile } from "@/lib/preview";
import { lectureDir, normalizeTokens, inferContentKindFromExt, inferContentKindFromEntry, globalForTeacherTempCleanup, ensureDir, fileExists, removeIfExists } from "@/lib/utils";
import { Document } from "@langchain/core/documents";
import { getVectorStore } from "@/lib/vectorStore";
import { repairTablesJsonFromText, heuristicExtractTablesFromText, tablesToMarkdown } from "@/lib/tableUtils";
import { saveTableEvalReport } from "@/lib/tableEval";
import { deleteContentArtifacts } from "@/lib/uploadCleanup";

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
  contentId: string | null;
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
const PDF_PREVIEW_VERSION = 5;
const WORD_RE = /[A-Za-z0-9']+/g;

// teacher storage
const DATA_DIR = path.resolve(process.cwd(), "data", "teachersdata");
// on-disk folder renamed from `lectures` -> `content`
const LECTURES_DIR = path.join(DATA_DIR, "content");
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
  contentId: null,
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

// Small utility helpers moved to lib/utils.ts
async function purgeTemporaryLectures() {
  const lib = await loadLibrary();
  const tempLectures = lib.filter((entry) => Boolean(entry.temporary));
  if (!tempLectures.length) return;

  for (const entry of tempLectures) {
    await deleteContentArtifacts(entry.lecture_id);
  }

  await saveLibrary(lib.filter((entry) => !entry.temporary));
  const progress = await loadProgress();
  if (progress.contentId && tempLectures.some((entry) => entry.lecture_id === progress.contentId)) {
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
// lectureDir and normalizeTokens moved to lib/utils.ts
// Preview and mime helpers moved to lib/preview.ts
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
// normalizeInsertionErrorMessage moved to lib/indexing.ts
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
// caption prompt moved to lib/prompts.ts
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

// PDF render moved to lib/preview.ts
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
async function transcribeAudio(audioPath: string, language: string) {
  const tx = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: TRANSCRIBE_MODEL,
    language,
    response_format: "text",
  });
  return String(tx || "").trim();
}
// detailed page extraction prompt moved to lib/pdfVision.ts
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
// detailed vision extraction moved to lib/pdfVision.ts
// indexing moved to lib/indexing.ts
// LLM helpers moved to lib/llm.ts

export async function GET(req: NextRequest) {
  try {
    await initStorage();

    const contentId = req.nextUrl.searchParams.get("contentId") || "";
    const preview = req.nextUrl.searchParams.get("preview") === "1";
    if (!contentId) return NextResponse.json({ error: "Missing contentId" }, { status: 400 });

    const lib = await loadLibrary();
    const lecture = lib.find((x) => x.lecture_id === contentId);
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

      const contentId = fileHash.slice(0, 16);
      const ldir = lectureDir(contentId);
      await ensureDir(ldir);

      const originalPath = path.join(ldir, `original${ext}`);
      await fsp.copyFile(tmpPath, originalPath);
      await removeIfExists(tmpPath);

      const entry: LectureEntry = {
        lecture_id: contentId,
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
      await setProgress({ contentId, stage: "uploaded", percent: 0, done: true, error: "" });
      return NextResponse.json({ ok: true, duplicate: false, lecture: entry });
    }

    const body = await req.json();
    action = body.action as Action;
    if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

    if (action === "progress") {
      const p = await loadProgress();
      if (!body.contentId || p.contentId === body.contentId) return NextResponse.json({ ok: true, progress: p });
      return NextResponse.json({ ok: true, progress: defaultProgress });
    }

    if (action === "healthCheck") {
      let vectorRpcOk = false;
      let vectorRpcError: string | null = null;

      try {
        const vectorStore = await getVectorStore();
        // Use a non-existent lecture filter to avoid exposing content while still validating RPC wiring.
        await vectorStore.similaritySearch("health check", 1, { contentId: "__healthcheck__" });
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

      if (body.contentId) {
        const lecture = lib.find((x) => x.lecture_id === body.contentId);
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
      const { contentId, language = "en", llmModel = DEFAULT_LLM_MODEL, visionModel = OLLAMA_VISION_MODEL } = body;

      await setProgress({ contentId, stage: "starting", percent: 3, done: false, error: "" });

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === contentId);
      if (!lecture) return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
      if (!lecture.original_path) return NextResponse.json({ error: "Missing original_path" }, { status: 400 });

      const ext = path.extname(lecture.original_path).toLowerCase();
      const ldir = lectureDir(lecture.lecture_id);
      await ensureDir(ldir);
      const contentKind = inferContentKindFromEntry(lecture);

      if (contentKind === "document") {
        const extractedText = "";
        let visualText = "";

        if (IMAGE_EXTS.has(ext)) {
          await setProgress({ stage: "reading image notes (vision)", percent: 45 });
          const visionPages = await visionExtractFromImagesDetailed([lecture.original_path], visionModel, [], undefined, ldir);
          visualText = visionPages.map((page) => `=== ${page.label} ===\n${page.content}`).join("\n\n");
        } else {
          return NextResponse.json({ error: `Unsupported file type for document processing: ${ext}` }, { status: 400 });
        }

        if (!visualText.trim()) {
          await setProgress({ stage: "failed", percent: 100, done: true, error: "No extractable text found." });
          return NextResponse.json({ error: "No extractable text found." }, { status: 400 });
        }

        await setProgress({ stage: "merging extracted content", percent: 75 });

        const extractedTextCombined = `=== VISUAL NOTES (OLLAMA VISION) ===\n${visualText}`;
        const chunks = chunkText(extractedTextCombined, 3500, 400);
        const localInput = shortenForLLM(extractedTextCombined, 20000);

        await setProgress({ stage: "creating summary", percent: 84 });
        const summary = await llm(
          [
            { role: "system", content: "You are a helpful tutor who produces structured study notes from multimodal inputs." },
            { role: "user", content: buildSummaryPrompt(localInput) },
          ],
          llmModel
        );

        await setProgress({ stage: "creating lecture memory", percent: 90 });
        const memory = await llm(
          [
            { role: "system", content: "You are a helpful tutor who creates compact lecture memories from multimodal inputs." },
            { role: "user", content: buildMemoryPrompt(localInput) },
          ],
          llmModel
        );

        await setProgress({ stage: "saving outputs", percent: 96 });

        const transcriptPath = path.join(ldir, "transcript.txt");
        const summaryPath = path.join(ldir, "summary.txt");
        const memoryPath = path.join(ldir, "memory.txt");
        const chunksPath = path.join(ldir, "chunks.json");

        await fsp.writeFile(transcriptPath, extractedTextCombined, "utf-8");
        await fsp.writeFile(summaryPath, summary, "utf-8");
        await fsp.writeFile(memoryPath, memory, "utf-8");
        await fsp.writeFile(chunksPath, JSON.stringify(chunks.map((text, i) => ({ chunk_id: i, text })), null, 2), "utf-8");

        const indexingResult = await indexContentChunksToVectorStore({
          contentId,
          fileName: path.basename(lecture.original_path),
          fileType: path.extname(lecture.original_path).toLowerCase(),
          parserModel: llmModel,
          contentKind: "document",
          parserOutput: extractedTextCombined,
          chunks,
        });

        const updated = await patchByHash(lecture.file_hash, {
          transcript_path: transcriptPath,
          summary_path: summaryPath,
          memory_path: memoryPath,
          chunks_path: chunksPath,
          status: "Ready",
          content_kind: "document",
        });

        await setProgress({ contentId, stage: "completed", percent: 100, done: true, error: "" });

        return NextResponse.json({
          ok: true,
          lecture: updated,
          transcript: extractedTextCombined,
          summary,
          memory,
          chunks,
          sources_used: {
            vision: !!visualText,
            local: true,
          },
          indexing_ok: Boolean(indexingResult && indexingResult.ok),
          indexing_error: indexingResult && (indexingResult.error || null),
        });
      }

      let audioText = "";
      let visualText = "";
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
      } else if (IMAGE_EXTS.has(ext)) {
        await setProgress({ stage: "reading image notes (vision)", percent: 45 });
        visualText = await visionExtractFromImages([lecture.original_path], visionModel);
      } else {
        return NextResponse.json({ error: `Unsupported file type for process: ${ext}` }, { status: 400 });
      }

      await setProgress({ stage: "merging extracted content", percent: 75 });

      const combinedTranscript = [
        audioText ? `=== AUDIO TRANSCRIPT ===\n${audioText}` : "",
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
        contentId,
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

      await setProgress({ contentId, stage: "completed", percent: 100, done: true, error: "" });

      return NextResponse.json({
        ok: true,
        lecture: updated,
        transcript: combinedTranscript,
        summary,
        memory,
        chunks,
        sources_used: {
          audio: !!audioText,
          vision: !!visualText,
        },
        indexing_ok: Boolean(indexingResult2 && indexingResult2.ok),
        indexing_error: indexingResult2 && (indexingResult2.error || null),
      });
    }

    if (action === "chat") {
      const { contentId, question, history = [], llmModel = DEFAULT_LLM_MODEL } = body;
      if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === contentId);
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
          console.warn(`[RAG] similaritySearch failed for ${contentId}: ${String(err?.message || err)}`);
          retrievalNotice = `Vector search unavailable, using fallback document lookup. (${normalizeInsertionErrorMessage(err)})`;
          return [];
        }
      };

      // Hybrid retrieval: combine vector matches with lexical local chunk matches, then rerank.
      const vectorCandidates: Document[] = [];
      vectorCandidates.push(...await trySimilaritySearch({ contentId, source: "teacher-upload-llm-summary" }, 3));
      vectorCandidates.push(...await trySimilaritySearch({ contentId, source: "teacher-upload-caption" }, 3));
      vectorCandidates.push(...await trySimilaritySearch({ contentId }, 6));

      // Retrieval fallbacks: if nothing found for the contentId-scoped queries,
      // try table-context specific and broader searches to catch metadata mismatches
      // or embedding ranking issues (helps when table docs exist but were not
      // returned by the strict contentId queries).
      if (vectorCandidates.length === 0) {
        try {
          vectorCandidates.push(...await trySimilaritySearch({ contentId, source: 'pdf-table-context' }, 6));
          vectorCandidates.push(...await trySimilaritySearch({ source: 'pdf-table-context' }, 6));
          vectorCandidates.push(...await trySimilaritySearch({}, 6));
        } catch (e) {
          // swallow; trySimilaritySearch already handles errors and records notice
        }
      }

      let localCandidates: Document[] = [];
      if (lecture.chunks_path && (await fileExists(lecture.chunks_path))) {
        const raw = JSON.parse(await fsp.readFile(lecture.chunks_path, "utf-8"));
        const chunks: string[] = raw.map((x: any) => x.text).filter(Boolean);
        const top = retrieveTopK(question, chunks, 4);
        localCandidates = top.map((x) => new Document({
          pageContent: x.text,
          metadata: { contentId, chunkIndex: x.i, source: "local-lexical" },
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
          metadata: { contentId, source: "local-description-fallback", chunkIndex: -1 },
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
      const { contentId, focus = "", n = 5, topic = "main lecture concept", llmModel = DEFAULT_LLM_MODEL } = body;

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === contentId);
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

    if (action === "deleteAll") {
      await removeIfExists(LECTURES_DIR);
      await ensureDir(LECTURES_DIR);
      await saveLibrary([]);
      await setProgress(defaultProgress);
      return NextResponse.json({ ok: true });
    }

    if (action === "retryIndex") {
      const { contentId } = body;
      if (!contentId) return NextResponse.json({ error: "Missing contentId" }, { status: 400 });

      const lib = await loadLibrary();
      const lecture = lib.find((x) => x.lecture_id === contentId);
      if (!lecture) return NextResponse.json({ error: "Lecture not found" }, { status: 404 });

      // Load chunks and parser output if available
      let chunks: string[] = [];
      try {
        if (lecture.chunks_path && (await fileExists(lecture.chunks_path))) {
          const raw = JSON.parse(await fsp.readFile(lecture.chunks_path, "utf-8"));
          chunks = Array.isArray(raw) ? raw.map((x: any) => x.text).filter(Boolean) : [];
        }
      } catch (e: any) {
        console.warn(`[RAG] Failed to read chunks.json for ${contentId}: ${String(e?.message || e)}`);
      }

      let parserOutput = "";
      try {
        if (lecture.summary_path && (await fileExists(lecture.summary_path))) {
          parserOutput = await fsp.readFile(lecture.summary_path, "utf-8");
        } else if (lecture.transcript_path && (await fileExists(lecture.transcript_path))) {
          parserOutput = await fsp.readFile(lecture.transcript_path, "utf-8");
        }
      } catch (e: any) {
        console.warn(`[RAG] Failed to read summary/transcript for ${contentId}: ${String(e?.message || e)}`);
      }

      if (!chunks.length && !parserOutput.trim()) {
        return NextResponse.json({ error: "No chunks or parser output available to index" }, { status: 400 });
      }

      const resIndex = await indexContentChunksToVectorStore({
        contentId,
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
