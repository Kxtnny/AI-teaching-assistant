import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addImageToVectorStore } from '@/lib/imageVectorStore';
import { getVectorStore } from '@/lib/vectorStore';
import { uploadTeacherLectureFile, getUploadedContentId } from '@/lib/uploadProxy';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage } from '@langchain/core/messages';

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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const description = formData.get('description') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type (images only)
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are supported' },
        { status: 400 }
      );
    }

    if (!description || description.trim() === '') {
      const uploadRes = await uploadTeacherLectureFile(req, file, { tempMode: false });
      const contentId = getUploadedContentId(uploadRes);
      if (!contentId) {
        return NextResponse.json({ error: 'Upload succeeded but no content ID was returned' }, { status: 500 });
      }

      const visionModel = getVisionModel(formData);
      const parserOutput = await parseImageWithVisionModel(file, visionModel);
      const vectorStore = await getVectorStore();
      await vectorStore.addDocuments([
        {
          pageContent: `Image parser output (${visionModel}) for ${file.name}:

${parserOutput}`,
          metadata: {
            contentId,
            fileName: file.name,
            fileType: file.type,
            parserModel: visionModel,
            source: 'image-parser',
            uploadDate: new Date().toISOString(),
          },
        },
      ]);

      return NextResponse.json({
        ok: true,
        success: true,
        lecture: uploadRes.lecture,
        contentId,
        parserModel: visionModel,
        parserOutput,
        message: `Parsed and indexed image ${file.name} with ${visionModel}`,
      });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.name}`;
    const storagePath = `images/${fileName}`;

    // Upload image to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('course-images')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: `Failed to upload image: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Add image to vector store with description
    await addImageToVectorStore(
      description.trim(),
      file.name,
      storagePath,
      {
        originalFileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        contentId: undefined,
      }
    );

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('course-images')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      message: 'Image uploaded successfully',
      fileName: file.name,
      url: urlData.publicUrl,
      contentId: file.name,
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}
