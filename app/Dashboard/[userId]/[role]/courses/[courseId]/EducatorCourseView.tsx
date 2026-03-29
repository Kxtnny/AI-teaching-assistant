import NumQuestionStats from "@/app/dashboard/components/NumQuestionStats"
import QuestionContextStats from "@/app/dashboard/components/QuestionContextStats"

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
    const res = await fetch(`http://localhost:3000/api/questions?courseId=${courseId}`);
    const questions: Question[] = await res.json()
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
                    </div>
                </div>
            </section>
        </>
    )
}