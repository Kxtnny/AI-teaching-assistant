import questions from '../../data/questions.json'
import topics from '../../data/topics.json'

export async function GET(request: Request) {
    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId');
    const topicId = url.searchParams.get('topicId');

    let filtered = questions

    if (courseId) {
        filtered = filtered.filter(qns => qns.courseId === Number(courseId))
    }

    if (topicId) {
        filtered = filtered.filter(qns => qns.topicId === Number(topicId))
    }

    const result = filtered.map(item => {
        const topic = topics.find(topic => topic.topicId === item.topicId);
        
        return {
            questionId: item.questionId,
            courseId: item.courseId,
            topic: topic,
            question: item.question,
            context: item.context,
            authorId: item.authorId
        }
    })

    return Response.json(result)
}