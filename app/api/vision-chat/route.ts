import { NextResponse } from 'next/server';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

type HistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const SUPPORTED_MODELS = new Set(['gemma3', 'llama3.2-vision', 'llava']);
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const MAX_PDF_CACHE_ENTRIES = 12;

const globalForVision = globalThis as unknown as {
  pdfTextCache?: Map<string, string>;
};

if (!globalForVision.pdfTextCache) {
  globalForVision.pdfTextCache = new Map();
}

function normalizeModel(modelRaw: string | null) {
  const model = (modelRaw || 'llama3.2-vision').trim();
  return SUPPORTED_MODELS.has(model) ? model : 'llama3.2-vision';
}

function trimHistory(history: HistoryMessage[], keep = 8): HistoryMessage[] {
  return history.slice(-keep);
}

function upsertPdfCache(key: string, value: string) {
  const cache = globalForVision.pdfTextCache!;
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_PDF_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

async function extractPdfText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const hash = createHash('sha1').update(buffer).digest('hex');

  const cache = globalForVision.pdfTextCache!;
  const cached = cache.get(hash);
  if (cached) return cached;

  const tempDir = join(tmpdir(), 'vision-lab-pdf');
  await mkdir(tempDir, { recursive: true });
  const tempPath = join(tempDir, `${hash}-${file.name}`);
  await writeFile(tempPath, buffer);

  try {
    const loader = new PDFLoader(tempPath);
    const docs = await loader.load();
    const text = docs.map((d) => d.pageContent).join('\n\n').trim();
    const trimmed = text.slice(0, 16000);
    upsertPdfCache(hash, trimmed);
    return trimmed;
  } finally {
    try {
      await unlink(tempPath);
    } catch {}
  }
}

function parseHistory(historyRaw: string | null): HistoryMessage[] {
  if (!historyRaw) return [];

  try {
    const parsed = JSON.parse(historyRaw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((m): m is HistoryMessage => {
        if (!m || typeof m !== 'object') return false;
        const role = (m as { role?: unknown }).role;
        const content = (m as { content?: unknown }).content;
        return (
          (role === 'user' || role === 'assistant') &&
          typeof content === 'string' &&
          content.trim().length > 0
        );
      })
      .map((m) => ({ role: m.role, content: m.content }));
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const question = String(formData.get('question') || '').trim();
    const history = parseHistory(formData.get('history') as string | null);
    const model = normalizeModel(formData.get('model') as string | null);

    if (!file) {
      return NextResponse.json({ error: 'Please upload a file.' }, { status: 400 });
    }

    if (!question) {
      return NextResponse.json({ error: 'Please enter a question.' }, { status: 400 });
    }

    const llm = new ChatOllama({ model, temperature: 0.1 });
    const recentHistory = trimHistory(history);

    const system = new SystemMessage(
      'You are a file-grounded assistant for testing vision models. Answer only using the uploaded file content and the conversation context. If information is not in the file, say you cannot find it in the file. Keep answers concise and factual.'
    );

    const langchainHistory = recentHistory.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

    if (file.type === 'application/pdf') {
      const pdfText = await extractPdfText(file);
      if (!pdfText) {
        return NextResponse.json({ error: 'Could not extract text from PDF.' }, { status: 400 });
      }

      const prompt =
        `File type: PDF\n` +
        `File name: ${file.name}\n\n` +
        `PDF extracted text:\n${pdfText}\n\n` +
        `User question: ${question}`;

      const response = await llm.invoke([system, ...langchainHistory, new HumanMessage(prompt)]);
      return NextResponse.json({
        success: true,
        model,
        answer: String(response.content || '').trim(),
      });
    }

    if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      return NextResponse.json(
        { error: 'Supported file types are PDF, PNG, JPG, and JPEG.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    const response = await llm.invoke([
      system,
      ...langchainHistory,
      new HumanMessage({
        content: [
          {
            type: 'text',
            text:
              `File type: image\n` +
              `File name: ${file.name}\n` +
              `User question: ${question}\n\n` +
              `Read the image and answer only from this file.`,
          },
          {
            type: 'image_url',
            image_url: dataUrl,
          },
        ],
      }),
    ]);

    return NextResponse.json({
      success: true,
      model,
      answer: String(response.content || '').trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error('Vision chat error:', error);
    return NextResponse.json({ error: `Vision chat failed: ${message}` }, { status: 500 });
  }
}
