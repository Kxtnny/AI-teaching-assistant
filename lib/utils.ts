import path from "path";
import fs from "fs/promises";

export const DATA_DIR = path.resolve(process.cwd(), "data", "teachersdata");
export const LECTURES_DIR = path.join(DATA_DIR, "content");

export function lectureDir(contentId: string) { return path.join(LECTURES_DIR, contentId); }

export function normalizeTokens(text: string) { return (text.match(/[A-Za-z0-9']+/g) || []).map((x) => x.toLowerCase()); }

export function inferContentKindFromExt(ext: string) {
  const VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv"]);
  const AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a", ".flac"]);
  return VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext) ? "video" : "document" as const;
}

export function inferContentKindFromEntry(entry: Partial<any>) {
  if (entry.content_kind === "video" || entry.content_kind === "document") return entry.content_kind;
  const sourcePath = entry.original_path || entry.audio_path || entry.title || "";
  return inferContentKindFromExt(path.extname(sourcePath).toLowerCase());
}

export const globalForTeacherTempCleanup = globalThis as unknown as {
  teacherTempCleanupInstalled?: boolean;
  teacherTempCleanupOnStartRan?: boolean;
  teacherTempCleanupRunning?: boolean;
};

export async function ensureDir(p: string) { await fs.mkdir(p, { recursive: true }); }
export async function fileExists(p: string) { try { await fs.access(p); return true; } catch { return false; } }
export async function removeIfExists(p: string) { if (await fileExists(p)) await fs.rm(p, { recursive: true, force: true }); }
