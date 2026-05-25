import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
