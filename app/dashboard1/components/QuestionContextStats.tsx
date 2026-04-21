"use client"
import { PieChart, Pie, Tooltip, Cell, ResponsiveContainer, Legend } from 'recharts';

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

export default function QuestionContextStats({ questions }: { questions: Question[] }) {

    const contextCount: Record<string, number> = {};

    questions.forEach((q) => {
        if (contextCount[q.context]) {
            contextCount[q.context]++; // already exists, increase count
        } else {
            contextCount[q.context] = 1; // first occurrence
        }
    });

    const data = Object.entries(contextCount).map(([context, count]) => ({
        context,
        questions: count
    }));

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28EFF', '#FF6F61', '#FFB347'];

    return (
        <ResponsiveContainer width="100%" height={400}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey="questions"
                    nameKey="context"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label
                >
                    {data.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" verticalAlign="middle" align="right" />
            </PieChart>
        </ResponsiveContainer>
    );

}