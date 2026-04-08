"use client"
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'

export default function RandomContentPercentageStats({ topics }) {

    // Assign random number of documents per topic
    const data = topics.map(topic => ({
        topic: topic.name,
        documents: Math.floor(Math.random() * 50) + 1  // random between 1–50
    }));

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28EFF'];
    
    return (
        <ResponsiveContainer width="100%" height={400}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey="documents"  // <- changed from 'questions'
                    nameKey="topic"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label = {false}
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