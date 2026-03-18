import { NextResponse } from 'next/server';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { getVectorStore } from '@/lib/vectorStore';
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
        message: `Parsed and indexed image ${file.name} with ${parserModel}`,
        parserModel,
        parserOutput,
        chunks: 1,
      });
    }

    // Save file temporarily (use OS temp directory for cross-platform support)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const tempDir = join(tmpdir(), 'pdf-uploads');
    await mkdir(tempDir, { recursive: true });
    const tempPath = join(tempDir, file.name);
    await writeFile(tempPath, buffer);

    try {
      // Load PDF
      const loader = new PDFLoader(tempPath);
      const docs = await loader.load();

      // Split text into chunks
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await textSplitter.splitDocuments(docs);
      const allPdfText = docs.map((d) => d.pageContent).join('\n\n');
      const parserOutput = await summarizePdfTextWithModel(allPdfText, parserModel);

      // Add metadata
      const docsWithMetadata = splitDocs.map((doc) => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          fileName: file.name,
          fileType: file.type,
          parserModel,
          source: 'pdf-text',
          uploadDate: new Date().toISOString(),
        },
      }));

      const parserDoc = {
        pageContent:
          `File parser output (${parserModel}) for PDF ${file.name}:\n\n` + parserOutput,
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
      const allDocs = [...docsWithMetadata, parserDoc];
      const upsertBatchSize = Number(process.env.VECTORSTORE_UPSERT_BATCH_SIZE || 20);
      for (let i = 0; i < allDocs.length; i += upsertBatchSize) {
        const batch = allDocs.slice(i, i + upsertBatchSize);
        await vectorStore.addDocuments(batch);
      }

      // Clean up temp file
      await unlink(tempPath);

      return NextResponse.json({
        success: true,
        message: `Successfully processed ${splitDocs.length} text chunks and 1 parser summary from ${file.name} using ${parserModel}`,
        parserModel,
        parserOutput,
        chunks: splitDocs.length + 1,
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
