import { NextResponse } from 'next/server';
import { getUploadedContentId, uploadTeacherLectureFile } from '../../../lib/uploadProxy';
import { getVideoPreviewBuffer } from '@/lib/videoPreview';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const contentId = url.searchParams.get('contentId') || '';
    const preview = url.searchParams.get('preview') === '1';

    if (!contentId) {
      return NextResponse.json({ error: 'Missing contentId' }, { status: 400 });
    }

    if (!preview) {
      return NextResponse.json({ error: 'Unsupported request' }, { status: 400 });
    }

    const previewArtifact = await getVideoPreviewBuffer(contentId);
    return new NextResponse(previewArtifact.buffer, {
      status: 200,
      headers: {
        'Content-Type': previewArtifact.contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load video preview';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const uploadRes = await uploadTeacherLectureFile(req, file, { tempMode: true });
    return NextResponse.json({
      ok: true,
      lecture: uploadRes.lecture,
      contentId: getUploadedContentId(uploadRes),
      duplicate: uploadRes.duplicate,
      message: uploadRes.duplicate ? 'Duplicate video found. Existing content selected.' : 'Video uploaded successfully.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload video';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
