import { getVectorStore } from "@/lib/vectorStore";
import { Document } from "langchain/document";
import { buildCaptionPrompt } from "@/lib/prompts";
import { ollamaText } from "@/lib/llm";

function normalizeInsertionErrorMessage(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || "unknown error");
  return message.replace(/^Error inserting:\s*/i, "");
}

export async function indexContentChunksToVectorStore(params: {
  contentId: string;
  fileName: string;
  fileType: string;
  parserModel: string;
  contentKind: string;
  parserOutput: string;
  chunks: string[];
}) {
  try {
    const vectorStore = await getVectorStore();
    const docs = params.chunks.map((text, chunkIndex) => new Document({
      pageContent: text,
      metadata: {
        contentId: params.contentId,
        fileName: params.fileName,
        fileType: params.fileType,
        parserModel: params.parserModel,
        contentKind: params.contentKind,
        source: "teacher-upload-chunk",
        chunkIndex,
        uploadDate: new Date().toISOString(),
      },
    }));

    if (params.parserOutput.trim()) {
      docs.push(new Document({
        pageContent: `File parser output (${params.parserModel}) for ${params.fileName}:\n\n${params.parserOutput}`,
        metadata: {
          contentId: params.contentId,
          fileName: params.fileName,
          fileType: params.fileType,
          parserModel: params.parserModel,
          contentKind: params.contentKind,
          source: "teacher-upload-summary",
          chunkIndex: -1,
          uploadDate: new Date().toISOString(),
        },
      }));

      try {
        const captionPrompt = buildCaptionPrompt(params.parserOutput);
        const captionsRaw = await ollamaText(captionPrompt);
        try {
          const parsedCaptions = JSON.parse(captionsRaw);
          if (Array.isArray(parsedCaptions.pages)) {
            for (const p of parsedCaptions.pages) {
              if (p && p.summary) {
                docs.push(new Document({
                  pageContent: String(p.summary),
                  metadata: {
                    contentId: params.contentId,
                    fileName: params.fileName,
                    fileType: params.fileType,
                    parserModel: params.parserModel,
                    contentKind: params.contentKind,
                    source: "teacher-upload-caption",
                    page: Number(p.page) || -1,
                    chunkIndex: -1,
                    uploadDate: new Date().toISOString(),
                  },
                }));
              }
            }
          }

          if (parsedCaptions && parsedCaptions.overall) {
            docs.push(new Document({
              pageContent: String(parsedCaptions.overall),
              metadata: {
                contentId: params.contentId,
                fileName: params.fileName,
                fileType: params.fileType,
                parserModel: params.parserModel,
                contentKind: params.contentKind,
                source: "teacher-upload-llm-summary",
                chunkIndex: -1,
                uploadDate: new Date().toISOString(),
              },
            }));
          }
        } catch (e) {
          docs.push(new Document({
            pageContent: `LLM captions for ${params.fileName}:\n\n${captionsRaw}`,
            metadata: {
              contentId: params.contentId,
              fileName: params.fileName,
              fileType: params.fileType,
              parserModel: params.parserModel,
              contentKind: params.contentKind,
              source: "teacher-upload-llm-summary-raw",
              chunkIndex: -1,
              uploadDate: new Date().toISOString(),
            },
          }));
        }
      } catch (err) {
        console.warn(`[RAG] Caption generation failed for ${params.fileName}: ${String(err)}`);
      }
    }

    if (docs.length) {
      const batchSize = Number(process.env.RAG_INDEX_BATCH_SIZE || 8);
      const maxAttempts = Number(process.env.RAG_INDEX_MAX_ATTEMPTS || 3);
      let anyFailed = false;
      let lastErr: any = null;

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        let succeeded = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await vectorStore.addDocuments(batch);
            succeeded = true;
            break;
          } catch (err: any) {
            lastErr = err;
            console.warn(`[RAG] addDocuments attempt ${attempt} failed for batch ${i}/${docs.length}: ${String(err?.message || err)}`);
            await new Promise((res) => setTimeout(res, 250 * attempt));
          }
        }
        if (!succeeded) {
          anyFailed = true;
        }
      }

      if (anyFailed) {
        throw new Error(`Error inserting: ${normalizeInsertionErrorMessage(lastErr)}`);
      }
    }

    return { ok: true };
  } catch (error: any) {
    console.warn(`[RAG] Skipping vector indexing for ${params.fileName}: ${normalizeInsertionErrorMessage(error)}`);
    return { ok: false, error: `Error inserting: ${normalizeInsertionErrorMessage(error)}` };
  }
}

export { normalizeInsertionErrorMessage };
