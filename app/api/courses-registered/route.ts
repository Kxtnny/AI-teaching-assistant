import courses_registered from '../../data/courses_registered.json';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const courseId = url.searchParams.get('courseId');

  let result = courses_registered;

  if (userId) {
    result = result.filter(u => u.userId === Number(userId));
  }

  if (courseId) {
    result = result.filter(u => u.courseId === Number(courseId));
  }

  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
}