import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const description = String(formData.get('description') || '').trim();

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    const forward = new FormData();
    forward.append('file', file);
    forward.append('description', description);
    if (formData.get('originalFileName')) {
      forward.append('originalFileName', String(formData.get('originalFileName')));
    }

    const response = await fetch(new URL('/api/upload-image', req.url), {
      method: 'POST',
      body: forward,
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload diagram';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
