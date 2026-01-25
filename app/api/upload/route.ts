import { NextResponse } from 'next/server';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { getVectorStore } from '@/lib/vectorStore';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are supported' },
        { status: 400 }
      );
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

      // Add metadata
      const docsWithMetadata = splitDocs.map((doc) => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          fileName: file.name,
          uploadDate: new Date().toISOString(),
        },
      }));

      // Store in vector database
      const vectorStore = await getVectorStore();
      await vectorStore.addDocuments(docsWithMetadata);

      // Clean up temp file
      await unlink(tempPath);

      return NextResponse.json({
        success: true,
        message: `Successfully processed ${splitDocs.length} chunks from ${file.name}`,
        chunks: splitDocs.length,
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
