import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

type LectureEntry = {
  lecture_id: string;
  original_path: string | null;
  title: string;
};

const DATA_DIR = path.resolve(process.cwd(), 'data', 'teachersdata');
const LIBRARY_PATH = path.join(DATA_DIR, 'library.json');

const FFMPEG_BIN = process.env.FFMPEG_PATH
  ? path.resolve(process.cwd(), process.env.FFMPEG_PATH)
  : 'ffmpeg';

const VIDEO_THUMBNAIL_SECONDS = Number(process.env.VIDEO_THUMBNAIL_SECONDS || 0.5);

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadLibrary(): Promise<LectureEntry[]> {
  try {
    const raw = await fs.readFile(LIBRARY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mimeTypeForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

function previewMimeTypeForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.svg') return 'image/svg+xml';
  return mimeTypeForFile(filePath);
}

function runCmd(bin: string, args: string[]) {
  return new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (data) => (stderr += data.toString()));
    child.on('error', (err: any) => {
      if (err?.code === 'ENOENT') reject(new Error(`Binary not found: ${bin}.`));
      else reject(err);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

async function renderVideoPreviewToJpg(videoPath: string, previewPath: string) {
  const result = await runCmd(FFMPEG_BIN, [
    '-y',
    '-ss',
    String(VIDEO_THUMBNAIL_SECONDS),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    previewPath,
  ]);

  if (result.code !== 0) {
    throw new Error(`Failed to create video preview: ${result.stderr.slice(-400)}`);
  }
}

export async function getVideoPreviewBuffer(contentId: string) {
  const library = await loadLibrary();
  const lecture = library.find((entry) => entry.lecture_id === contentId);
  if (!lecture || !lecture.original_path) {
    throw new Error('Lecture not found');
  }

  if (!(await fileExists(lecture.original_path))) {
    throw new Error('Source file is missing');
  }

  const sourceExt = path.extname(lecture.original_path).toLowerCase();
  const previewName = `preview_${String(VIDEO_THUMBNAIL_SECONDS).replace(/\./g, '_')}s.jpg`;
  const previewPath = path.join(path.dirname(lecture.original_path), previewName);

  if (!(await fileExists(previewPath))) {
    await renderVideoPreviewToJpg(lecture.original_path, previewPath);
  }

  return {
    buffer: await fs.readFile(previewPath),
    contentType: previewMimeTypeForFile(previewPath),
    sourceExt,
  };
}