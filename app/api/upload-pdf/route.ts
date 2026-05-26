import { NextResponse } from 'next/server';
import fsp from 'fs/promises';
import path from 'path';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage } from '@langchain/core/messages';
import { supabase } from '@/lib/supabase';
import { getVectorStore } from '@/lib/vectorStore';
import { llm, DEFAULT_LLM_MODEL } from '@/lib/llm';
import { extractPdfBlocksFromPdfNative } from '@/lib/pdfBlockExtractor';
import { extractTablesFromPdfNative } from '@/lib/pdfTableExtractor';
import { storePdfUpload } from '@/lib/pdfUploadStore';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'teachersdata');
const LIBRARY_PATH = path.join(DATA_DIR, 'library.json');

const SUPPORTED_VISION_MODELS = new Set(['gemma3', 'llama3.2-vision', 'llava']);

function getVisionModel(formData: FormData) {
  const selected = String(formData.get('visionModel') || 'llama3.2-vision').trim();
  return SUPPORTED_VISION_MODELS.has(selected) ? selected : 'llama3.2-vision';
}

async function describePdfImageBlockWithVision(input: {
  imageBase64: string;
  imageExtension?: string;
  surroundingText?: string;
  pageLabel: string;
  modelName: string;
}) {
  const llm = new ChatOllama({ model: input.modelName, temperature: 0 });
  const response = await llm.invoke([
    new HumanMessage({
      content: [
        {
          type: 'text',
          text:
            'You are a precise PDF diagram/table assistant. Describe the image for study use, extract visible text exactly when possible, summarize chart/table/diagram meaning, and return a concise 3-5 bullet study summary.',
        },
        {
          type: 'text',
          text: `Context: ${input.surroundingText || 'None'}\nPage: ${input.pageLabel}\nFormat: ${input.imageExtension || 'image'}`,
        },
        {
          type: 'image_url',
          image_url: `data:image/${input.imageExtension || 'png'};base64,${input.imageBase64}`,
        },
      ],
    }),
  ]);

  return String(response.content || '').trim();
}

async function summarizePdfTextWithModel(pdfText: string, modelName: string) {
  const llm = new ChatOllama({ model: modelName, temperature: 0 });
  const trimmed = pdfText.slice(0, 15000);
  const response = await llm.invoke(
    `You are a precise PDF processor for academic material. Parse this PDF text for students and researchers.\n\n` +
      `Return sections in this order:\n` +
      `1) Main topic\n` +
      `2) Key concepts\n` +
      `3) Methodology / approach / experimental design (if this is a research paper)\n` +
      `4) Extracted terms/formulas\n` +
      `5) If any diagram/table clues are present in text, explain them\n` +
      `6) 3-5 bullet study summary\n\n` +
      `PDF text:\n${trimmed}`
  );
  return String(response.content || '').trim();
}

async function loadPdfLibrary(): Promise<any[]> {
  try {
    const raw = await fsp.readFile(LIBRARY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadPdfLecture(contentId: string) {
  const library = await loadPdfLibrary();
  return library.find((entry) => String(entry?.lecture_id || '') === contentId) || null;
}

async function loadPdfDocuments(contentId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('content, metadata')
    .filter('metadata->>contentId', 'eq', contentId);

  if (error) {
    throw new Error(`Failed to load PDF documents: ${error.message}`);
  }

  const docs = (data || [])
    .map((row: any) => ({
      pageContent: String(row.content || '').trim(),
      metadata: row.metadata || {},
    }))
    .filter((doc: any) => doc.pageContent);

  const sourceOrder = (source: string) => {
    if (source === 'pdf-parser') return 0;
    if (source === 'pdf-page-context') return 1;
    if (source === 'pdf-table-context') return 2;
    if (source === 'pdf-image-block') return 3;
    return 4;
  };

  docs.sort((a: any, b: any) => {
    const bySource = sourceOrder(String(a.metadata?.source || '')) - sourceOrder(String(b.metadata?.source || ''));
    if (bySource !== 0) return bySource;
    const byPage = Number(a.metadata?.page || 0) - Number(b.metadata?.page || 0);
    if (byPage !== 0) return byPage;
    return Number(a.metadata?.chunkIndex || 0) - Number(b.metadata?.chunkIndex || 0);
  });

  return docs;
}

function normalizeTokens(text: string) {
  return (text.match(/[A-Za-z0-9']+/g) || []).map((token) => token.toLowerCase());
}

function scoreChunk(query: string, chunk: string) {
  const q = new Set(normalizeTokens(query));
  const c = normalizeTokens(chunk);
  if (!q.size || !c.length) return 0;
  const counts = new Map<string, number>();
  for (const token of c) counts.set(token, (counts.get(token) || 0) + 1);
  let score = 0;
  for (const token of q) {
    const count = counts.get(token);
    if (count) score += 1 + Math.log(1 + count);
  }
  return score;
}

function buildPdfMemory(docs: Array<{ pageContent: string; metadata: any }>) {
  const parserDoc = docs.find((doc) => String(doc.metadata?.source || '') === 'pdf-parser');
  return parserDoc?.pageContent || docs.map((doc) => doc.pageContent).join('\n\n').slice(0, 12000);
}

function dedupeAndRankPdfDocs(question: string, docs: Array<{ pageContent: string; metadata: any }>) {
  const seen = new Set<string>();
  return docs
    .filter((doc) => {
      const key = String(doc.pageContent || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((doc) => ({ doc, score: scoreChunk(question, doc.pageContent) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => item.doc);
}

async function answerPdfQuestion(params: {
  contentId: string;
  question: string;
  history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  llmModel?: string;
}) {
  const docs = await loadPdfDocuments(params.contentId);
  if (!docs.length) {
    return { error: 'Lecture not processed yet' } as const;
  }

  const memory = buildPdfMemory(docs);
  const selected = dedupeAndRankPdfDocs(params.question, docs);
  const ctx = selected.map((doc, index) => `(Chunk ${index})\n${doc.pageContent}`).join('\n\n---\n\n');

  const messages = [
    { role: 'system', content: 'You are a helpful tutor grounded in the uploaded PDF context.' },
    { role: 'user', content: `PDF summary:\n${memory}\n\nRelevant excerpts:\n${ctx}` },
    ...params.history.slice(-8),
    { role: 'user', content: params.question },
  ] as const;

  const reply = await llm([...messages], params.llmModel || DEFAULT_LLM_MODEL);

  return { reply, memory, selectedCount: selected.length } as const;
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      const body = await req.json().catch(() => null);
      const action = String(body?.action || '').trim();

      if (action === 'load') {
        const contentId = String(body?.contentId || body?.lectureId || '').trim();
        if (!contentId) {
          return NextResponse.json({ error: 'Missing contentId' }, { status: 400 });
        }

        const lecture = await loadPdfLecture(contentId);
        if (!lecture) {
          return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });
        }

        const docs = await loadPdfDocuments(contentId);
        const transcript = docs.map((doc) => doc.pageContent).join('\n\n---\n\n');
        const summaryDoc = docs.find((doc) => String(doc.metadata?.source || '') === 'pdf-parser') || docs[0] || null;
        const summary = summaryDoc?.pageContent || transcript;

        return NextResponse.json({
          ok: true,
          lecture,
          transcript,
          summary,
          memory: summary,
          chunks: docs.map((doc) => doc.pageContent),
          parserOutput: summary,
        });
      }

      if (action === 'chat') {
        const contentId = String(body?.contentId || body?.lectureId || '').trim();
        const question = String(body?.question || '').trim();
        if (!contentId) return NextResponse.json({ error: 'Missing contentId' }, { status: 400 });
        if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 });

        const lecture = await loadPdfLecture(contentId);
        if (!lecture) return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });

        const result = await answerPdfQuestion({
          contentId,
          question,
          history: Array.isArray(body?.history) ? body.history : [],
          llmModel: String(body?.llmModel || DEFAULT_LLM_MODEL),
        });

        if ('error' in result) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ ok: true, reply: result.reply, retrieval_notice: `Using ${result.selectedCount} indexed PDF excerpts.` });
      }

      return NextResponse.json({ error: `Unsupported action: ${action || 'unknown'}` }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const parserModel = getVisionModel(formData);
    const uploadRes = await storePdfUpload(file, { tempMode: false });
    const lecture = uploadRes.lecture;
    const contentId = uploadRes.contentId;
    if (!lecture || !contentId) {
      return NextResponse.json({ error: 'Upload succeeded but no content ID was returned' }, { status: 500 });
    }

    const lecturePath = lecture.original_path;
    if (!lecturePath) {
      return NextResponse.json({ error: 'Missing original lecture path' }, { status: 500 });
    }

    const blockData = await extractPdfBlocksFromPdfNative(lecturePath);
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

    const diagramResults = await Promise.all(
      imageBlocks.map(async (imageBlock: any, imageIndex: number) => {
        if (!imageBlock?.image_base64) return null;
        try {
          const description = await describePdfImageBlockWithVision({
            imageBase64: imageBlock.image_base64,
            imageExtension: imageBlock.ext,
            surroundingText: imageBlock.surrounding_text,
            pageLabel: `Page ${imageBlock.page} / Block ${imageBlock.rect_index ?? imageIndex}`,
            modelName: parserModel,
          });

          const diagramForm = new FormData();
          diagramForm.append('file', new File([Buffer.from(imageBlock.image_base64, 'base64')], `page-${imageBlock.page}-block-${imageBlock.rect_index ?? imageIndex}.${imageBlock.ext || 'png'}`, {
            type: imageBlock.ext ? `image/${imageBlock.ext}` : 'image/png',
          }));
          diagramForm.append('description', description);
          diagramForm.append('originalFileName', file.name);
          await fetch(new URL('/api/upload-diagrams', req.url), { method: 'POST', body: diagramForm });

          return {
            pageContent: `File image block (${parserModel}) for PDF ${file.name}, page ${imageBlock.page}, block ${imageBlock.rect_index ?? imageIndex}:\n\n${description}`,
            metadata: {
              contentId,
              fileName: file.name,
              fileType: file.type,
              parserModel,
              source: 'pdf-image-block',
              page: imageBlock.page,
              blockIndex: imageBlock.rect_index ?? imageIndex,
              bbox: imageBlock.bbox || null,
              imageExtension: imageBlock.ext || null,
              uploadDate: new Date().toISOString(),
            },
          };
        } catch {
          return {
            pageContent: `File image block (${parserModel}) for PDF ${file.name}, page ${imageBlock.page}, block ${imageBlock.rect_index ?? imageIndex}:\n\n${String(imageBlock.surrounding_text || '').trim()}`,
            metadata: {
              contentId,
              fileName: file.name,
              fileType: file.type,
              parserModel,
              source: 'pdf-image-block-fallback',
              page: imageBlock.page,
              blockIndex: imageBlock.rect_index ?? imageIndex,
              bbox: imageBlock.bbox || null,
              imageExtension: imageBlock.ext || null,
              uploadDate: new Date().toISOString(),
            },
          };
        }
      })
    );

    const pageDocs = pageContexts.map((pageText: string, pageIndex: number) => ({
      pageContent: `File page context (${parserModel}) for PDF ${file.name}, page ${pageIndex + 1}:\n\n${pageText}`,
      metadata: {
        contentId,
        fileName: file.name,
        fileType: file.type,
        parserModel,
        source: 'pdf-page-context',
        page: pageIndex + 1,
        uploadDate: new Date().toISOString(),
      },
    }));

    const allPdfText = pageContexts.join('\n\n');
    const imageTextContext = diagramResults
      .filter((doc): doc is { pageContent: string; metadata: any } => Boolean(doc))
      .map((doc) => doc.pageContent)
      .join('\n\n');
    const parserOutput = await summarizePdfTextWithModel(
      [allPdfText, imageTextContext].filter(Boolean).join('\n\n'),
      parserModel
    );

    const nativeTables = await extractTablesFromPdfNative(lecturePath);
    const tableCount = Array.isArray(nativeTables?.tables) ? nativeTables.tables.length : 0;

    if (Array.isArray(nativeTables?.tables) && nativeTables.tables.length) {
      try {
        for (const table of nativeTables.tables) {
          const tableForm = new FormData();
          tableForm.append('contentId', contentId);
          tableForm.append('fileName', file.name);
          tableForm.append('fileType', file.type);
          tableForm.append('parserModel', parserModel);
          tableForm.append('page', String(table.page || 1));
          tableForm.append('tableJson', JSON.stringify(table));
          await fetch(new URL('/api/upload-table', req.url), { method: 'POST', body: tableForm });
        }
      } catch {}
    }

    const vectorStore = await getVectorStore();
    const parserDoc = {
      pageContent:
        `File parser output (${parserModel}) for PDF ${file.name}:\n\n` +
        parserOutput,
      metadata: {
        contentId,
        fileName: file.name,
        fileType: file.type,
        parserModel,
        source: 'pdf-parser',
        uploadDate: new Date().toISOString(),
      },
    };

    const allDocs = [...pageDocs, parserDoc];
    const upsertBatchSize = Number(process.env.VECTORSTORE_UPSERT_BATCH_SIZE || 20);
    for (let i = 0; i < allDocs.length; i += upsertBatchSize) {
      const batch = allDocs.slice(i, i + upsertBatchSize);
      await vectorStore.addDocuments(batch);
    }

    return NextResponse.json({
      ok: true,
      lecture,
      contentId,
      parserModel,
      parserOutput,
      chunks: pageDocs.length + 1,
      message: `Successfully processed ${pageDocs.length} page docs, ${imageBlocks.length} image docs, and forwarded ${tableCount} table docs from ${file.name} using ${parserModel}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process PDF file';
    console.error('Error processing PDF:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
