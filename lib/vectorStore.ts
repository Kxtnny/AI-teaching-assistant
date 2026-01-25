import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { supabase } from './supabase';

// Custom Ollama embeddings class
class OllamaEmbeddings {
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl: string; model: string }) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const embeddings = await Promise.all(
      texts.map((text) => this.embedQuery(text))
    );
    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
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
