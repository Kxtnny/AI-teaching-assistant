import course_instructors from '../../data/course_instructors.json';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const courseId = url.searchParams.get('courseId');

  let result = course_instructors;

  if (userId) {
    result = result.filter(u => u.userId === Number(userId));
  }

  if (courseId) {
    result = result.filter(u => u.courseId === Number(courseId));
  }

  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
}