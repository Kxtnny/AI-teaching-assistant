import { NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { tmpdir } from 'os';
import { writeFile, unlink } from 'fs/promises';
import OpenAI from 'openai';
import ollama from 'ollama';
import { getVectorStore } from '@/lib/vectorStore';
import { repairTablesJsonFromText, heuristicExtractTablesFromText, tablesToMarkdown, ocrExtractTablesFromImage } from '@/lib/tableUtils';
import { saveTableEvalReport } from '@/lib/tableEval';
import { summarizeTableMetrics } from '@/lib/tableMetrics';
import { describePdfImageBlockWithVision } from '@/lib/pdfImageVision';
import { extractTablesFromPdfNative } from '@/lib/pdfTableExtractor';
import { extractPdfBlocksFromPdfNative } from '@/lib/pdfBlockExtractor';

const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'llama3.2-vision';
const OLLAMA_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || process.env.OLLAMA_MODEL || 'llama3.2';
const TRANSCRIBE_MODEL = 'whisper-1';
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const SUPPORTED_PDF_TYPE = 'application/pdf';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'teachersdata');
const LECTURES_DIR = path.join(DATA_DIR, 'lectures');
const LIBRARY_PATH = path.join(DATA_DIR, 'library.json');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface LectureEntry {
  lecture_id: string;
  title: string;
  file_hash: string;
  creator: 'teacher';
  content_kind: 'document' | 'video';
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
}

type UploadResult = {
  ok: true;
  success: true;
  duplicate: boolean;
  lecture: LectureEntry;
  parserOutput: string;
  transcript: string;
  summary: string;
  memory: string;
  chunks: string[];
  indexing_ok: boolean;
  indexing_error: string | null;
};

function nowISO() {
  return new Date().toISOString();
}

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

async function loadLibrary(): Promise<LectureEntry[]> {
  await ensureDir(DATA_DIR);
  await ensureDir(LECTURES_DIR);
  if (!(await fileExists(LIBRARY_PATH))) {
    await fsp.writeFile(LIBRARY_PATH, '[]', 'utf-8');
  }

  try {
    const raw = await fsp.readFile(LIBRARY_PATH, 'utf-8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveLibrary(library: LectureEntry[]) {
  await fsp.writeFile(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf-8');
}

async function updateOrInsert(entry: LectureEntry) {
  const lib = await loadLibrary();
  const idx = lib.findIndex((item) => item.lecture_id === entry.lecture_id);
  if (idx >= 0) lib[idx] = entry;
  else lib.unshift(entry);
  await saveLibrary(lib);
}

async function computeHash(filePath: string): Promise<string> {
  const h = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const s = fs.createReadStream(filePath);
    s.on('data', (d) => h.update(d));
    s.on('error', reject);
    s.on('end', () => resolve());
  });
  return h.digest('hex');
}

async function runOllamaText(prompt: string, model = OLLAMA_TEXT_MODEL) {
  const res = await ollama.chat({ model, messages: [{ role: 'user', content: prompt }] });
  return String(res?.message?.content || '').trim();
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
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
    if (cut > 1000) end = start + cut + 1;
    const piece = t.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= t.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function shortenForLLM(text: string, maxChars = 20000) {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const head = t.slice(0, maxChars / 2);
  const tail = t.slice(-(maxChars / 2));
  return `${head}\n\n[...TRUNCATED...]\n\n${tail}`;
}

function buildSummaryPrompt(transcript: string) {
  return `You are helping a student learn from file content.\n\nReturn exactly these sections:\nSummary:\n- 5 concise bullets max, one sentence each.\n\nKey Terms:\n- 8 to 12 terms separated by commas.\n\nImportant Details:\n- 3 to 5 bullets covering formulas, definitions, diagrams, or table takeaways.\n\nContent:\n${transcript}`;
}

function buildMemoryPrompt(transcript: string) {
  return `You are a helpful tutor. Create compact Lecture Memory in this format:\nLECTURE MEMORY:\n- 10 to 15 short bullets with the main ideas\n- formulas or definitions if present\n- common mistakes or confusing points\n- example question types\n\nContent:\n${transcript}`;
}

function buildPdfDescriptionPrompt(pages: Array<{ label: string; content: string }>) {
  const serialized = pages
    .map((page) => `[${page.label}]\n${shortenForLLM(page.content, 8000)}`)
    .join('\n\n---\n\n');

  return `You are writing a structured reading guide for a student.\n\nReturn:\n- A short overall document summary.\n- One section per page in reading order.\n- Mention tables, diagrams, formulas, definitions, examples, and images when present.\n- Be concrete and avoid inventing details.\n\nInput pages:\n${serialized}`;
}

function buildImagePrompt(fileName: string) {
  return `You are describing a single educational image from ${fileName}. Describe visible text exactly when possible, summarize diagrams/charts/tables, list key entities, and give a concise study-ready summary.`;
}

async function processPdf(tempPath: string, fileName: string, parserModel: string) {
  const blockData = await extractPdfBlocksFromPdfNative(tempPath);
  const pageContexts = Array.isArray(blockData?.pages)
    ? blockData.pages
        .filter((page: any) => page && page.type === 'page')
        .map((page: any) => {
          const parts = [String(page.text || '').trim()];
          if (Array.isArray(page.image_blocks)) {
            for (const img of page.image_blocks) {
              const ctx = String(img?.surrounding_text || '').trim();
              if (ctx) parts.push(`Image context: ${ctx}`);
            }
          }
          return parts.filter(Boolean).join('\n\n');
        })
    : [];

  const imageBlocks = Array.isArray(blockData?.pages)
    ? blockData.pages.flatMap((page: any) => {
        if (!page || page.type !== 'page' || !Array.isArray(page.image_blocks)) return [];
        return page.image_blocks.map((imageBlock: any) => ({
          page: Number(page.page) || 1,
          ...imageBlock,
        }));
      })
    : [];

  const imageDocs = await Promise.all(
    imageBlocks.map(async (imageBlock: any, imageIndex: number) => {
      if (!imageBlock?.image_base64) return null;
      try {
        const content = await describePdfImageBlockWithVision({
          imageBase64: imageBlock.image_base64,
          imageExtension: imageBlock.ext,
          surroundingText: imageBlock.surrounding_text,
          pageLabel: `Page ${imageBlock.page} / Block ${imageBlock.rect_index ?? imageIndex}`,
          modelName: parserModel,
        });
        return {
          pageContent: `PDF image block for ${fileName}, page ${imageBlock.page}, block ${imageBlock.rect_index ?? imageIndex}:\n\n${content}`,
          metadata: {
            fileName,
            parserModel,
            source: 'upload-image-block',
            page: imageBlock.page,
            blockIndex: imageBlock.rect_index ?? imageIndex,
            bbox: imageBlock.bbox || null,
            imageExtension: imageBlock.ext || null,
            uploadDate: nowISO(),
          },
        };
      } catch {
        return {
          pageContent: `PDF image block for ${fileName}, page ${imageBlock.page}, block ${imageBlock.rect_index ?? imageIndex}:\n\n${String(imageBlock.surrounding_text || '').trim()}`,
          metadata: {
            fileName,
            parserModel,
            source: 'upload-image-block-fallback',
            page: imageBlock.page,
            blockIndex: imageBlock.rect_index ?? imageIndex,
            bbox: imageBlock.bbox || null,
            imageExtension: imageBlock.ext || null,
            uploadDate: nowISO(),
          },
        };
      }
    })
  );

  const pageDocs = pageContexts.map((pageText: string, pageIndex: number) => ({
    pageContent: `PDF page context for ${fileName}, page ${pageIndex + 1}:\n\n${pageText}`,
    metadata: {
      fileName,
      parserModel,
      source: 'upload-pdf-page',
      page: pageIndex + 1,
      uploadDate: nowISO(),
    },
  }));

  const nativeTables = await extractTablesFromPdfNative(tempPath);
  const tableDocs = Array.isArray(nativeTables?.tables)
    ? nativeTables.tables.map((table: any) => ({
        pageContent: `PDF table context for ${fileName}, page ${table.page || 1}:\n\n${tablesToMarkdown({ tables: [table] })}`,
        metadata: {
          fileName,
          parserModel,
          source: 'upload-pdf-table',
          page: Number(table.page) || 1,
          uploadDate: nowISO(),
        },
      }))
    : [];

  if (Array.isArray(nativeTables?.tables) && nativeTables.tables.length) {
    try {
      for (const table of nativeTables.tables) {
        await saveTableEvalReport(path.dirname(tempPath), `upload_page_${table.page || 1}`, { method: 'native', table });
      }
    } catch {}
  }

  const parserOutput = await runOllamaText(
    buildPdfDescriptionPrompt(
      pageContexts.map((content: string, index: number) => ({ label: `Page ${index + 1}`, content }))
    ),
    parserModel
  );
  const transcript = pageContexts.join('\n\n');
  const summary = await runOllamaText(buildSummaryPrompt(shortenForLLM(`${transcript}\n\n${imageDocs.filter(Boolean).map((doc: any) => doc.pageContent).join('\n\n')}`, 20000)), OLLAMA_TEXT_MODEL);
  const memory = await runOllamaText(buildMemoryPrompt(shortenForLLM(`${transcript}\n\n${imageDocs.filter(Boolean).map((doc: any) => doc.pageContent).join('\n\n')}`, 20000)), OLLAMA_TEXT_MODEL);

  return {
    parserOutput,
    transcript,
    summary,
    memory,
    pageDocs,
    imageDocs: imageDocs.filter(Boolean),
    tableDocs,
    chunks: chunkText(`${transcript}\n\n${parserOutput}`),
  };
}

async function processImage(file: File, parserModel: string) {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const dataUrl = `data:${file.type};base64,${base64}`;

  const llm = new (await import('@langchain/ollama')).ChatOllama({ model: parserModel, temperature: 0 });
  const { HumanMessage } = await import('@langchain/core/messages');
  const response = await llm.invoke([
    new HumanMessage({
      content: [
        { type: 'text', text: buildImagePrompt(file.name) },
        { type: 'image_url', image_url: dataUrl },
      ],
    }),
  ]);

  const parserOutput = String(response.content || '').trim();
  const summary = await runOllamaText(buildSummaryPrompt(shortenForLLM(parserOutput, 20000)), OLLAMA_TEXT_MODEL);
  const memory = await runOllamaText(buildMemoryPrompt(shortenForLLM(parserOutput, 20000)), OLLAMA_TEXT_MODEL);

  return {
    parserOutput,
    transcript: parserOutput,
    summary,
    memory,
    pageDocs: [],
    imageDocs: [
      {
        pageContent: `Image parser output for ${file.name}:\n\n${parserOutput}`,
        metadata: { fileName: file.name, parserModel, source: 'upload-image', uploadDate: nowISO() },
      },
    ],
    tableDocs: [],
    chunks: chunkText(parserOutput),
  };
}

async function saveLectureArtifacts(params: {
  lectureDir: string;
  fileName: string;
  fileType: string;
  parserModel: string;
  content: {
    parserOutput: string;
    transcript: string;
    summary: string;
    memory: string;
    chunks: string[];
    pageDocs: any[];
    imageDocs: any[];
    tableDocs: any[];
  };
}) {
  const transcriptPath = path.join(params.lectureDir, 'transcript.txt');
  const descriptionPath = path.join(params.lectureDir, 'description.txt');
  const summaryPath = path.join(params.lectureDir, 'summary.txt');
  const memoryPath = path.join(params.lectureDir, 'memory.txt');
  const chunksPath = path.join(params.lectureDir, 'chunks.json');

  await fsp.writeFile(transcriptPath, params.content.transcript || '', 'utf-8');
  await fsp.writeFile(descriptionPath, params.content.parserOutput || params.content.transcript || '', 'utf-8');
  await fsp.writeFile(summaryPath, params.content.summary || '', 'utf-8');
  await fsp.writeFile(memoryPath, params.content.memory || '', 'utf-8');
  await fsp.writeFile(chunksPath, JSON.stringify(params.content.chunks.map((text, index) => ({ chunk_id: index, text })), null, 2), 'utf-8');

  const vectorStore = await getVectorStore();
  const docs = [
    ...params.content.pageDocs,
    ...params.content.imageDocs,
    ...params.content.tableDocs,
    ...params.content.chunks.map((text, chunkIndex) => ({
      pageContent: text,
      metadata: {
        fileName: params.fileName,
        fileType: params.fileType,
        parserModel: params.parserModel,
        contentKind: 'document',
        source: 'upload-chunk',
        chunkIndex,
        uploadDate: nowISO(),
      },
    })),
    {
      pageContent: `File parser output (${params.parserModel}) for ${params.fileName}:\n\n${params.content.parserOutput}`,
      metadata: {
        fileName: params.fileName,
        fileType: params.fileType,
        parserModel: params.parserModel,
        contentKind: 'document',
        source: 'upload-summary',
        chunkIndex: -1,
        uploadDate: nowISO(),
      },
    },
  ];

  if (docs.length) {
    await vectorStore.addDocuments(docs as any);
  }

  return { transcriptPath, descriptionPath, summaryPath, memoryPath, chunksPath };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const visionModel = String(formData.get('visionModel') || OLLAMA_VISION_MODEL).trim() || OLLAMA_VISION_MODEL;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const fileType = file.type.toLowerCase();
    const ext = path.extname(file.name).toLowerCase();
    const isPdf = fileType === SUPPORTED_PDF_TYPE || ext === '.pdf';
    const isImage = SUPPORTED_IMAGE_TYPES.has(fileType) || ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
    if (!isPdf && !isImage) {
      return NextResponse.json({ error: 'Supported files are PDF and image files.' }, { status: 400 });
    }

    await ensureDir(DATA_DIR);
    await ensureDir(LECTURES_DIR);

    const tempDir = path.join(tmpdir(), 'teacher-upload');
    await ensureDir(tempDir);
    const tempPath = path.join(tempDir, `${Date.now()}_${file.name}`);
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

    try {
      const fileHash = await computeHash(tempPath);
      const lib = await loadLibrary();
      const existing = lib.find((entry) => entry.file_hash === fileHash);
      if (existing) {
        await unlink(tempPath).catch(() => undefined);
        return NextResponse.json({ ok: true, success: true, duplicate: true, lecture: existing });
      }

      const lectureId = fileHash.slice(0, 16);
      const lectureDir = path.join(LECTURES_DIR, lectureId);
      await ensureDir(lectureDir);
      const originalPath = path.join(lectureDir, `original${ext || path.extname(file.name) || '.bin'}`);
      await fsp.copyFile(tempPath, originalPath);

      const entry: LectureEntry = {
        lecture_id: lectureId,
        title: path.basename(file.name, ext || path.extname(file.name)),
        file_hash: fileHash,
        creator: 'teacher',
        content_kind: 'document',
        status: 'Uploaded',
        time_ago: 'Saved',
        temporary: undefined,
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

      const content = isPdf
        ? await processPdf(tempPath, file.name, visionModel)
        : await processImage(file, visionModel);

      const artifactPaths = await saveLectureArtifacts({
        lectureDir,
        fileName: file.name,
        fileType: fileType || ext,
        parserModel: visionModel,
        content,
      });

      const updatedEntry: LectureEntry = {
        ...entry,
        transcript_path: artifactPaths.transcriptPath,
        description_path: artifactPaths.descriptionPath,
        summary_path: artifactPaths.summaryPath,
        memory_path: artifactPaths.memoryPath,
        chunks_path: artifactPaths.chunksPath,
        status: 'Ready',
        updated_at: nowISO(),
      };
      await updateOrInsert(updatedEntry);

      const result: UploadResult = {
        ok: true,
        success: true,
        duplicate: false,
        lecture: updatedEntry,
        parserOutput: content.parserOutput,
        transcript: content.transcript,
        summary: content.summary,
        memory: content.memory,
        chunks: content.chunks,
        indexing_ok: true,
        indexing_error: null,
      };

      return NextResponse.json(result);
    } finally {
      try {
        await unlink(tempPath);
      } catch {}
    }
  } catch (error) {
    console.error('Upload parser error:', error);
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}
