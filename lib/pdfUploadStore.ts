import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

export type PdfLectureRecord = {
  lecture_id: string;
  title: string;
  file_hash: string;
  creator: 'teacher';
  content_kind: 'document';
  status: 'Uploaded' | 'Audio Ready' | 'Ready';
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
};

const DATA_DIR = path.resolve(process.cwd(), 'data', 'teachersdata');
const CONTENT_DIR = path.join(DATA_DIR, 'content');
const LIBRARY_PATH = path.join(DATA_DIR, 'library.json');
const UPLOAD_TMP = path.join(DATA_DIR, 'tmp_uploads');

const nowISO = () => new Date().toISOString();

async function ensureDir(dirPath: string) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath: string) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(filePath: string) {
  if (await fileExists(filePath)) {
    await fsp.rm(filePath, { recursive: true, force: true });
  }
}

async function loadLibrary(): Promise<PdfLectureRecord[]> {
  await ensureDir(DATA_DIR);
  await ensureDir(CONTENT_DIR);
  await ensureDir(UPLOAD_TMP);

  try {
    const raw = await fsp.readFile(LIBRARY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const library = Array.isArray(parsed) ? parsed : [];
    return library.map((entry: any) => ({
      ...entry,
      creator: 'teacher' as const,
      content_kind: 'document' as const,
    }));
  } catch {
    return [];
  }
}

async function saveLibrary(library: PdfLectureRecord[]) {
  await fsp.writeFile(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf-8');
}

async function updateOrInsert(entry: PdfLectureRecord) {
  const library = await loadLibrary();
  const index = library.findIndex((item) => item.lecture_id === entry.lecture_id);
  if (index >= 0) library[index] = entry;
  else library.unshift(entry);
  await saveLibrary(library);
}

async function computeHash(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  return new Promise<string>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function storePdfUpload(file: File, options?: { tempMode?: boolean }) {
  const ext = path.extname(file.name).toLowerCase() || '.pdf';
  const tempName = `${Date.now()}_${file.name}`;
  const tmpPath = path.join(UPLOAD_TMP, tempName);

  await ensureDir(DATA_DIR);
  await ensureDir(CONTENT_DIR);
  await ensureDir(UPLOAD_TMP);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fsp.writeFile(tmpPath, buffer);

  const fileHash = await computeHash(tmpPath);
  const library = await loadLibrary();
  const existing = library.find((entry) => entry.file_hash === fileHash);
  if (existing) {
    await removeIfExists(tmpPath);
    return {
      lecture: existing,
      contentId: existing.lecture_id,
      duplicate: true,
    };
  }

  const contentId = fileHash.slice(0, 16);
  const lectureDir = path.join(CONTENT_DIR, contentId);
  await ensureDir(lectureDir);

  const originalPath = path.join(lectureDir, `original${ext}`);
  await fsp.copyFile(tmpPath, originalPath);
  await removeIfExists(tmpPath);

  const lecture: PdfLectureRecord = {
    lecture_id: contentId,
    title: path.basename(file.name, ext),
    file_hash: fileHash,
    creator: 'teacher',
    content_kind: 'document',
    status: 'Uploaded',
    time_ago: 'Saved',
    temporary: options?.tempMode || undefined,
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

  await updateOrInsert(lecture);

  return {
    lecture,
    contentId,
    duplicate: false,
  };
}