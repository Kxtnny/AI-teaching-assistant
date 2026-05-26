import { NextResponse } from 'next/server';
import { deleteContentArtifacts } from '@/lib/uploadCleanup';

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      }

      const type = file.type.toLowerCase();
      const route = type === 'application/pdf'
        ? '/api/upload-pdf'
        : type.startsWith('image/')
          ? '/api/upload-image'
          : type.startsWith('video/')
            ? '/api/upload-video'
            : type.startsWith('audio/')
              ? '/api/upload-audio'
              : '';

      if (!route) {
        return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
      }

      const response = await fetch(new URL(route, req.url), {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      const contentId = data.contentId || data.lecture?.lecture_id || '';
      return NextResponse.json({ ...data, contentId }, { status: response.status });
    }

    const body = await req.json();
    if (body?.action === 'deleteLecture') {
      const contentId = String(body.contentId || '').trim();
      if (!contentId) {
        return NextResponse.json({ error: 'Missing contentId' }, { status: 400 });
      }

      await deleteContentArtifacts(contentId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
