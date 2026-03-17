import { supabase } from './supabase';

// Custom Ollama embeddings class (same as vectorStore)
class OllamaEmbeddings {
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl: string; model: string }) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
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

const embeddings = new OllamaEmbeddings({
  model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
});

export interface ImageMetadata {
  fileName: string;
  storagePath: string;
  uploadDate: string;
  [key: string]: any;
}

export async function addImageToVectorStore(
  description: string,
  fileName: string,
  storagePath: string,
  metadata: Partial<ImageMetadata> = {}
) {
  // Generate embedding from description
  const embedding = await embeddings.embedQuery(description);

  // Insert into images table
  const { data, error } = await supabase
    .from('images')
    .insert({
      description,
      file_name: fileName,
      storage_path: storagePath,
      embedding,
      metadata: {
        fileName,
        storagePath,
        uploadDate: new Date().toISOString(),
        ...metadata,
      },
    })
    .select();

  if (error) {
    throw new Error(`Failed to add image to vector store: ${error.message}`);
  }

  return data;
}

export async function searchSimilarImages(query: string, limit: number = 3) {
  // Generate embedding for the query
  const queryEmbedding = await embeddings.embedQuery(query);

  // Use the match_images function for similarity search
  const { data, error } = await supabase.rpc('match_images', {
    query_embedding: queryEmbedding,
    match_count: limit,
  });

  if (error) {
    throw new Error(`Failed to search images: ${error.message}`);
  }

  // Get public URLs for the images
  const imagesWithUrls = await Promise.all(
    (data || []).map(async (img: any) => {
      const { data: urlData } = supabase.storage
        .from('course-images')
        .getPublicUrl(img.storage_path);

      return {
        id: img.id,
        description: img.description,
        fileName: img.file_name,
        url: urlData.publicUrl,
        similarity: img.similarity,
        metadata: img.metadata,
      };
    })
  );

  return imagesWithUrls;
}
