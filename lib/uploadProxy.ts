export type TeacherLectureUploadResponse = {
  ok?: boolean;
  success?: boolean;
  duplicate?: boolean;
  lecture?: {
    lecture_id: string;
    title: string;
    original_path?: string | null;
    content_kind?: string;
  };
  contentId?: string;
  error?: string;
};

export async function uploadTeacherLectureFile(
  req: Request,
  file: File,
  options?: { tempMode?: boolean }
): Promise<TeacherLectureUploadResponse> {
  const formData = new FormData();
  formData.append('action', 'upload');
  formData.append('file', file);
  if (options?.tempMode) {
    formData.append('tempMode', '1');
  }

  const response = await fetch(new URL('/api/teacher-lecture', req.url), {
    method: 'POST',
    body: formData,
  });

  const data = (await response.json()) as TeacherLectureUploadResponse;
  if (!response.ok || !(data.ok || data.success)) {
    throw new Error(data.error || `Teacher lecture upload failed (${response.status})`);
  }

  return data;
}

export function getUploadedContentId(data: TeacherLectureUploadResponse): string {
  return data.contentId || data.lecture?.lecture_id || '';
}
