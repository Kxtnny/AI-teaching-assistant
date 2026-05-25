import { NextResponse } from 'next/server';
import { getUploadedContentId, uploadTeacherLectureFile } from '@/lib/uploadProxy';

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
