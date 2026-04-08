import courses from '../../data/courses.json'



export async function GET(request: Request) {
  const url = new URL(request.url);
  const courseId = url.searchParams.get('courseId');

  let filtered = courses;

  if (courseId) {
    const course = courses.find(course=>course.id===Number(courseId));
    return new Response(JSON.stringify(course), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const result = filtered.map(item => {
    const course = courses.find(course=>course.id===item.id);
    
    return {
      courseId:course?.id,
      name:course?.name
    }
  })

  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
}