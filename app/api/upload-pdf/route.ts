import { NextResponse } from 'next/server';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage } from '@langchain/core/messages';
import { getVectorStore } from '@/lib/vectorStore';
import { extractPdfBlocksFromPdfNative } from '@/lib/pdfBlockExtractor';
import { extractTablesFromPdfNative } from '@/lib/pdfTableExtractor';
import { uploadTeacherLectureFile, getUploadedContentId } from '@/lib/uploadProxy';

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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const parserModel = getVisionModel(formData);
    const uploadRes = await uploadTeacherLectureFile(req, file, { tempMode: false });
    const lecture = uploadRes.lecture;
    const contentId = getUploadedContentId(uploadRes);
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
