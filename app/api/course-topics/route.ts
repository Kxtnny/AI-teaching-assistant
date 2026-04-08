import topics from '../../data/topics.json'
import course_topics from '../../data/course_topics.json'



export async function GET(request: Request) {
    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId');

    let filtered = course_topics;

    if (courseId) {
        filtered = filtered.filter(course_topic=>
            course_topic.courseId === Number(courseId)
        )
    }

    const result = filtered.map(item => {
        const topic = topics.find(topic => topic.topicId === item.topicId);

        return {
            topicId: topic?.topicId,
            name: topic?.name
        }
    })

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
}