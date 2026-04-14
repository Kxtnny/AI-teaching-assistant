import NumQuestionStats from "@/app/dashboard/components/NumQuestionStats";
import QuestionPercentageStats from "@/app/dashboard/components/QuestionPercentageStats";

type LearnerCourseViewProps = {
    userId: string,
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
export default async function LearnerCourseView({ userId, courseId }: LearnerCourseViewProps) {
    let res = await fetch(`http://localhost:3000/api/questions?authorId=${userId}&courseId=${courseId}`);
    const questions: Question[] = await res.json()

    res = await fetch(`http://localhost:3000/api/questions?courseId=${courseId}`);
    const classmateQuestions: Question[] = await res.json()

    return (
        <>
            <section className="section split">

            </section>
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
                        <h1 className="section-title">Personal vs Classmates</h1>
                        <h2 className="section-subtitle">My Questions</h2>
                        <QuestionPercentageStats questions={questions}></QuestionPercentageStats>
                        <h2 className="section-subtitle">Class Questions</h2>
                        <QuestionPercentageStats questions={classmateQuestions}></QuestionPercentageStats>
                    </div>
                </div>
            </section>
            {/* Temporarily hiding this section */}
            {false&&
                <section className="section split">
                    <div className="split-inner">
                        <div>
                            <h1 className="section-title">Similar Questions</h1>
                        </div>
                    </div>
                </section>
            }
        </>
    )
}