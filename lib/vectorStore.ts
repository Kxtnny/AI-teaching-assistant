import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { supabase } from './supabase';

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
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(async (text) => {
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              return await this.embedQuery(text);
            } catch (error) {
              if (attempt === 3) throw error;
              await sleep(300 * attempt);
            }
          }

          throw new Error('Unexpected embedding retry failure');
        })
      );

      embeddings.push(...batchEmbeddings);
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
      throw new Error(`Ollama embedding failed (${response.status}): ${response.statusText} ${body}`);
    }

    const data = await response.json();
    if (!data?.embedding || !Array.isArray(data.embedding)) {
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
