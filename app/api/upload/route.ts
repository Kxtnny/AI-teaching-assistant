import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getVectorStore } from '@/lib/vectorStore';
import { extractPdfBlocksFromPdfNative } from '@/lib/pdfBlockExtractor';
import { extractTablesFromPdfNative } from '@/lib/pdfTableExtractor';
import { describePdfImageBlockWithVision } from '@/lib/pdfImageVision';
import { saveTableEvalReport } from '@/lib/tableEval';
import { tablesToMarkdown } from '@/lib/tableUtils';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage } from '@langchain/core/messages';

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const SUPPORTED_VISION_MODELS = new Set(['gemma3', 'llama3.2-vision', 'llava']);

function getVisionModel(formData: FormData) {
  const selected = String(formData.get('visionModel') || 'llama3.2-vision').trim();
  return SUPPORTED_VISION_MODELS.has(selected) ? selected : 'llama3.2-vision';
}

function makeContentId(buffer: Buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16);
}

async function parseImageWithVisionModel(file: File, modelName: string) {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString('base64');
  const dataUrl = `data:${file.type};base64,${base64}`;

  const llm = new ChatOllama({
    model: modelName,
    temperature: 0,
  });

  const response = await llm.invoke([
    new HumanMessage({
      content: [
        {
          type: 'text',
          text:
            'You are a precise file parser. Describe this image for study use. Extract visible text exactly when possible, summarize diagrams/charts/tables, list key entities, and end with a 3-5 bullet concise study summary.',
        },
        {
          type: 'image_url',
          image_url: dataUrl,
        },
      ],
    }),
  ]);

  return String(response.content || '').trim();
}

async function summarizePdfTextWithModel(pdfText: string, modelName: string) {
  const llm = new ChatOllama({
    model: modelName,
    temperature: 0,
  });

  const trimmed = pdfText.slice(0, 12000);
  const response = await llm.invoke(
    `You are a precise file parser. Parse and summarize this PDF text for students.\n\n` +
      `Return sections in this order:\n` +
      `1) Main topic\n` +
      `2) Key concepts\n` +
      `3) Extracted terms/formulas\n` +
      `4) If any diagram/table clues are present in text, explain them\n` +
      `5) 3-5 bullet study summary\n\n` +
      `PDF text:\n${trimmed}`
  );

  return String(response.content || '').trim();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const parserModel = getVisionModel(formData);

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    const isPdf = file.type === 'application/pdf';
    const isImage = SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase());

    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: 'Only PDF, PNG, and JPG/JPEG files are supported' },
        { status: 400 }
      );
    }

    if (isImage) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const contentId = makeContentId(buffer);
      const parserOutput = await parseImageWithVisionModel(file, parserModel);

      if (!parserOutput) {
        return NextResponse.json(
          { error: `No parser output from model ${parserModel}` },
          { status: 500 }
        );
      }

      const vectorStore = await getVectorStore();
      await vectorStore.addDocuments([
        {
          pageContent:
            `File parser output (${parserModel}) for image ${file.name}:\n\n` + parserOutput,
          metadata: {
            fileName: file.name,
            fileType: file.type,
            parserModel,
            source: 'image-parser',
            uploadDate: new Date().toISOString(),
          },
        },
      ]);

      return NextResponse.json({
        success: true,
        contentId,
        message: `Parsed and indexed image ${file.name} with ${parserModel}`,
        parserModel,
        parserOutput,
        chunks: 1,
      });
    }

    // Save file temporarily (use OS temp directory for cross-platform support)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const contentId = makeContentId(buffer);
    const tempDir = join(tmpdir(), 'pdf-uploads');
    await mkdir(tempDir, { recursive: true });
    const tempPath = join(tempDir, file.name);
    await writeFile(tempPath, buffer);

    try {
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

      const imageDescriptions = await Promise.all(
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
            return {
              pageContent: `File image block (${parserModel}) for PDF ${file.name}, page ${imageBlock.page}, block ${imageBlock.rect_index ?? imageIndex}:\n\n${description}`,
              metadata: {
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
          fileName: file.name,
          fileType: file.type,
          parserModel,
          source: 'pdf-page-context',
          page: pageIndex + 1,
          uploadDate: new Date().toISOString(),
        },
      }));

      const allPdfText = pageContexts.join('\n\n');
      const imageTextContext = imageDescriptions
        .filter((doc): doc is { pageContent: string; metadata: any } => Boolean(doc))
        .map((doc) => doc.pageContent)
        .join('\n\n');
      const parserOutput = await summarizePdfTextWithModel(
        [allPdfText, imageTextContext].filter(Boolean).join('\n\n'),
        parserModel
      );

      const nativeTables = await extractTablesFromPdfNative(tempPath);
      const tableDocs = Array.isArray(nativeTables?.tables)
        ? nativeTables.tables.map((table: any) => ({
            pageContent: `File table context (${parserModel}) for PDF ${file.name}, page ${table.page || 1}:\n\n${tablesToMarkdown({ tables: [table] })}`,
            metadata: {
              fileName: file.name,
              fileType: file.type,
              parserModel,
              source: 'pdf-table-context',
              page: Number(table.page) || 1,
              uploadDate: new Date().toISOString(),
            },
          }))
        : [];

      const nativeTableMarkdown = Array.isArray(nativeTables?.tables) && nativeTables.tables.length
        ? tablesToMarkdown({ tables: nativeTables.tables })
        : '';

      if (Array.isArray(nativeTables?.tables) && nativeTables.tables.length) {
        try {
          for (const table of nativeTables.tables) {
            await saveTableEvalReport(tempDir, `upload_page_${table.page || 1}`, { method: 'native', table });
          }
        } catch {}
      }

      const parserDoc = {
        pageContent:
          `File parser output (${parserModel}) for PDF ${file.name}:\n\n` +
          (nativeTableMarkdown ? `=== Native Tables ===\n${nativeTableMarkdown}\n\n` : '') +
          parserOutput,
        metadata: {
          fileName: file.name,
          fileType: file.type,
          parserModel,
          source: 'pdf-parser',
          uploadDate: new Date().toISOString(),
        },
      };

      // Store in vector database
      const vectorStore = await getVectorStore();
      const allDocs = [...pageDocs, ...imageDescriptions.filter(Boolean), ...tableDocs, parserDoc];
      const upsertBatchSize = Number(process.env.VECTORSTORE_UPSERT_BATCH_SIZE || 20);
      for (let i = 0; i < allDocs.length; i += upsertBatchSize) {
        const batch = allDocs.slice(i, i + upsertBatchSize);
        await vectorStore.addDocuments(batch);
      }

      // Clean up temp file
      await unlink(tempPath);

      return NextResponse.json({
        success: true,
        contentId,
        message: `Successfully processed ${pageDocs.length} page docs, ${imageDescriptions.filter(Boolean).length} image docs, and 1 parser summary from ${file.name} using ${parserModel}`,
        parserModel,
        parserOutput,
        chunks: pageDocs.length + imageDescriptions.filter(Boolean).length + tableDocs.length + 1,
      });
    } catch (error) {
      // Clean up temp file on error
      try {
        await unlink(tempPath);
      } catch {}
      throw error;
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
    return NextResponse.json(
      { error: 'Failed to process PDF file' },
      { status: 500 }
    );
  }
}
