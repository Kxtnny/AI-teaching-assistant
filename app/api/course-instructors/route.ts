import courses from '../../data/courses.json'
import courseInstructors from '../../data/course_instructors.json';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const courseId = url.searchParams.get('courseId');

  let filtered = courseInstructors;

  if (userId) {
    filtered = filtered.filter(u => u.userId === Number(userId));
  }

  if (courseId) {
    filtered = filtered.filter(u => u.courseId === Number(courseId));
  }

  const result = filtered.map(item=>{
    const course = courses.find(course=>course.id === item.courseId)

    return {
      userId:item.userId,
      course
    }
  })

  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
}