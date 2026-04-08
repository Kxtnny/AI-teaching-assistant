import NumQuestionStats from "@/app/dashboard/components/NumQuestionStats"
import QuestionContextStats from "@/app/dashboard/components/QuestionContextStats"
import QuestionPercentageStats from "@/app/dashboard/components/QuestionPercentageStats"
import RandomContentPercentageStats from "@/app/dashboard/components/RandomContentPercentageStats"

type EducatorCourseViewProps = {
    courseId: string;
}

type Topic = {
    topicId: number,
    name: string
}
type Question = {
    questionId: number,
    courseId: number,
    topic: Topic,
    question: string,
    context: string,
    authorId: number
}

export default async function EducatorCourseView({ courseId }: EducatorCourseViewProps) {
    let res = await fetch(`http://localhost:3000/api/questions?courseId=${courseId}`);
    const questions: Question[] = await res.json()

    res = await fetch(`http://localhost:3000/api/course-topics?courseId=${courseId}`);
    const topics: Topic[] = await res.json()
    return (
        <>
            <section className="section split">
                <div className="split-inner">
                    <div>
                        <h1 className="section-title">Number of Questions per Topic</h1>
                        <NumQuestionStats questions={questions}></NumQuestionStats>
                    </div>
                </div>
            </section>
            <section className="section split">
                <div className="split-inner">
                    <div>
                        <h1 className="section-title">Question Context</h1>
                        <QuestionContextStats questions={questions}></QuestionContextStats>
                    </div>
                </div>
            </section>
            <section className="section split">
                <div className="split-inner">
                    <div>
                        <h1 className="section-title">Course Material Analysis</h1>
                        <h2 className="section-subtitle">Percentage of Questions Asked by Topics</h2>
                        <QuestionPercentageStats questions={questions}></QuestionPercentageStats>
                        <h2 className="section-subtitle">Percentage of Course Material</h2>
                        <RandomContentPercentageStats topics={topics}></RandomContentPercentageStats>
                    </div>
                </div>
            </section>
        </>
    )
}