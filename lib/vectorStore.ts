import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { supabase } from './supabase';
import OpenAI from 'openai';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Custom Ollama embeddings class
class OllamaEmbeddings {
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl: string; model: string }) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const batchSize = Number(process.env.OLLAMA_EMBEDDING_BATCH_SIZE || 4);
    const maxChars = Number(process.env.OLLAMA_EMBED_MAX_CHARS || 3000);
    const embeddings: number[][] = [];

    // Helper: split text into chunks not exceeding maxChars (try to cut on whitespace)
    function chunkText(text: string, maxLen: number) {
      const chunks: string[] = [];
      let s = 0;
      while (s < text.length) {
        if (text.length - s <= maxLen) {
          chunks.push(text.slice(s));
          break;
        }
        let cut = s + maxLen;
        // try to find a whitespace to split on
        const lastSpace = text.lastIndexOf(' ', cut);
        if (lastSpace > s) cut = lastSpace;
        chunks.push(text.slice(s, cut));
        s = cut + 1;
      }
      return chunks.filter(Boolean);
    }

    // Process each text: chunk if needed, embed each chunk, then average chunk embeddings
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] ?? '';
      const chunks = text.length > maxChars ? chunkText(text, maxChars) : [text];
      const chunkEmbeds: number[][] = [];

      for (let j = 0; j < chunks.length; j += batchSize) {
        const batch = chunks.slice(j, j + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (chunk) => {
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                return await this.embedQuery(chunk);
              } catch (error) {
                if (attempt === 3) {
                  // try OpenAI fallback on final failure
                  try {
                    if (process.env.OPENAI_API_KEY) {
                      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
                      const resp = await openai.embeddings.create({ model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small', input: chunk });
                      return resp.data?.[0]?.embedding ?? [];
                    }
                  } catch (e) {
                    // fall through to rethrow original
                  }
                  throw error;
                }
                await sleep(300 * attempt);
              }
            }
            throw new Error('Unexpected embedding retry failure');
          })
        );

        chunkEmbeds.push(...batchResults.filter(Boolean) as number[][]);
      }

      // Average chunk embeddings to produce a single vector per original text
      if (chunkEmbeds.length === 0) embeddings.push([]);
      else {
        const dim = chunkEmbeds[0].length;
        const avg = new Array(dim).fill(0);
        for (const e of chunkEmbeds) {
          for (let k = 0; k < dim; k++) avg[k] += e[k] ?? 0;
        }
        for (let k = 0; k < dim; k++) avg[k] = avg[k] / chunkEmbeds.length;
        embeddings.push(avg);
      }
    }

    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const timeoutMs = Number(process.env.OLLAMA_EMBEDDING_TIMEOUT_MS || 30000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown fetch error';
      throw new Error(`Ollama embedding request failed (${this.model}): ${reason}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text();
      // Attempt OpenAI fallback if available
      if (process.env.OPENAI_API_KEY) {
        try {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const resp = await openai.embeddings.create({ model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small', input: text });
          return resp.data?.[0]?.embedding ?? [];
        } catch (e) {
          // continue to throw original
        }
      }
      throw new Error(`Ollama embedding failed (${response.status}): ${response.statusText} ${body}`);
    }

    const data = await response.json();
    if (!data?.embedding || !Array.isArray(data.embedding)) {
      // Try OpenAI fallback
      if (process.env.OPENAI_API_KEY) {
        try {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const resp = await openai.embeddings.create({ model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small', input: text });
          return resp.data?.[0]?.embedding ?? [];
        } catch (e) {
          // fall through
        }
      }
      throw new Error(`Ollama embedding response missing embedding array for model ${this.model}`);
    }

    return data.embedding;
  }
}

export async function getVectorStore() {
  const embeddings = new OllamaEmbeddings({
    model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  });

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabase,
    tableName: 'documents',
    queryName: 'match_documents',
  });

  return vectorStore;
}
