"use client"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts'

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

export default function NumQuestionStats({ questions }: { questions: Question[] }) {

    const topicCounts: Record<number, number> = {};

    questions.forEach((q) => {
        if (topicCounts[q.topic.topicId]) {
            topicCounts[q.topic.topicId]++; // already exists, increase count
        } else {
            topicCounts[q.topic.topicId] = 1; // first occurrence
        }
    });

    const data = Object.entries(topicCounts).map(([topicId, count]) => {
        // find the topic name from one of the questions
        const topicName = questions.find(q => q.topic.topicId === Number(topicId))?.topic.name || `Topic ${topicId}`;
        return { topic: topicName, questions: count };
    });

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28EFF', '#FF6F61', '#FFB347'];

    return (
        <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                <XAxis
                    dataKey="topic"
                    interval={0}
                    tick={({ x, y, payload }) => {
                        const words = payload.value.split(' ');

                        return (
                            <g transform={`translate(${x},${y + 10})`}>
                                {words.map((word, index) => (
                                    <text
                                        key={index}
                                        textAnchor="middle"  // <-- center horizontally
                                        x={0}                // x=0 is the center of the tick
                                        y={index * 12}       // vertical spacing between words
                                        fontSize={12}
                                    >
                                        {word}
                                    </text>
                                ))}
                            </g>
                        );
                    }}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="questions">
                    {data.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}