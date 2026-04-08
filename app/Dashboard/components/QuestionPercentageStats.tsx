"use client"
import {
    PieChart,
    Pie,
    Tooltip,
    ResponsiveContainer,
    Cell,
    Legend
} from 'recharts'

export default function QuestionPercentageStats({ questions }) {

    const topicCounts = {};

    questions.forEach((q) => {
        if (topicCounts[q.topic.topicId]) {
            topicCounts[q.topic.topicId]++;
        } else {
            topicCounts[q.topic.topicId] = 1;
        }
    });

    const data = Object.entries(topicCounts).map(([topicId, count]) => {
        const topicName =
            questions.find(q => q.topic.topicId === Number(topicId))?.topic.name
            || `Topic ${topicId}`;

        return { topic: topicName, questions: count };
    });

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28EFF'];

    return (
        <ResponsiveContainer width="100%" height={400}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey="questions"
                    nameKey="topic"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={false}
                >
                    {data.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" verticalAlign="middle" align="right" />
            </PieChart>
        </ResponsiveContainer>
    )
}