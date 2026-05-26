import fs from 'fs/promises';
import path from 'path';
import { supabase } from './supabase';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'teachersdata');
const CONTENT_DIR = path.join(DATA_DIR, 'content');
const LIBRARY_PATH = path.join(DATA_DIR, 'library.json');

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(filePath: string) {
  if (await fileExists(filePath)) {
    await fs.rm(filePath, { recursive: true, force: true });
  }
}

async function loadLibrary(): Promise<any[]> {
  try {
    const raw = await fs.readFile(LIBRARY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLibrary(library: any[]) {
  await fs.writeFile(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf-8');
}

async function deleteVectorsByContentId(contentId: string) {
  try {
    await supabase
      .from('documents')
      .delete()
      .filter('metadata->>contentId', 'eq', contentId);
  } catch (error) {
    console.warn(`[RAG] Failed to delete Supabase documents for ${contentId}: ${String((error as any)?.message || error)}`);
  }
}

export async function deleteContentArtifacts(contentId: string) {
  const library = await loadLibrary();
  await saveLibrary(library.filter((entry) => entry.lecture_id !== contentId));

  await removeIfExists(path.join(CONTENT_DIR, contentId));
  await deleteVectorsByContentId(contentId);
}