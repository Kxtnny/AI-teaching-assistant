// app/dashboard/page.tsx
"use client"
import { useEffect, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, Legend
} from 'recharts';

// ============ TYPES ============
type TopicCount = { topicId: number, name: string, count: number };
type MaterialCount = { topicId: number, name: string, documents: number };
type ContextCount = { context: string, count: number };
type StudentSummary = {
    studentId: number, studentName: string,
    primaryTopic: string, topicsCovered: number, totalQuestions: number
};

const CHART_COLORS = ['#6f7d57', '#bb8d39', '#b06a3c', '#4f7a5f', '#8a6a82', '#4a7d82', '#c79a3f', '#9c552c'];

// ============ MAIN PAGE ============
export default function DashboardPage() {
    const [questionsPerTopic, setQuestionsPerTopic] = useState<TopicCount[]>([]);
    const [materialPercentage, setMaterialPercentage] = useState<MaterialCount[]>([]);
    const [contextData, setContextData] = useState<ContextCount[]>([]);
    const [studentSummary, setStudentSummary] = useState<StudentSummary[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

    useEffect(() => {
        async function fetchAll() {
            const qs = selectedStudentId ? `&studentId=${selectedStudentId}` : '';
            const [qpt, mat, ctx, stu] = await Promise.all([
                fetch(`/api/analytics?type=questions-per-topic${qs}`).then(r => r.json()),
                fetch(`/api/analytics?type=material-percentage`).then(r => r.json()),
                fetch(`/api/analytics?type=context${qs}`).then(r => r.json()),
                fetch(`/api/analytics?type=students`).then(r => r.json())
            ]);
            setQuestionsPerTopic(qpt);
            setMaterialPercentage(mat);
            setContextData(ctx);
            setStudentSummary(stu);
            setIsLoaded(true);
        }
        fetchAll();
    }, [selectedStudentId]);

    if (!isLoaded) {
        return <div className="ll-theme" style={{ padding: '40px', minHeight: '100vh', fontFamily: 'var(--ll-serif)' }}>Loading...</div>;
    }

    const isStudentView = selectedStudentId !== null;
    const currentStudentName = isStudentView
        ? studentSummary.find(s => s.studentId === selectedStudentId)?.studentName || 'Student'
        : null;

    const totalQuestions = questionsPerTopic.reduce((sum, t) => sum + t.count, 0);
    const totalStudents = studentSummary.length;
    const topicsCovered = questionsPerTopic.length;
    const totalMaterial = materialPercentage.reduce((sum, m) => sum + m.documents, 0);

    return (
        <div className="ll-theme" style={{
            display: 'flex', minHeight: '100vh'
        }}>
            {/* Sidebar */}
            <aside style={{ width: '220px', padding: '30px 20px', borderRight: '1px solid var(--ll-line)', background: 'rgba(246, 238, 218, 0.6)' }}>
                <div
                    style={{ marginBottom: '40px', fontSize: '14px', color: 'var(--ll-muted)', cursor: 'pointer', fontFamily: 'system-ui, sans-serif', fontWeight: 600 }}
                    onClick={() => setSelectedStudentId(null)}
                >
                    ← {isStudentView ? 'Back to dashboard' : 'Back to home'}
                </div>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={navItemStyle}>Overview</div>
                    <div style={navItemStyle}>Upload Lecture</div>
                    <div style={navItemStyle}>My Lectures</div>
                    <div style={{ ...navItemStyle, background: 'var(--ll-surface)', border: '1px solid var(--ll-line)', fontWeight: 700 }}>Doubt Analytics</div>
                </nav>
            </aside>

            {/* Main content */}
            <main style={{ flex: 1, padding: '40px 50px' }}>
                <div style={{ fontSize: '12px', color: 'var(--ll-muted)', letterSpacing: '2px', marginBottom: '10px', fontFamily: 'system-ui, sans-serif' }}>
                    {isStudentView ? 'STUDENT PROFILE' : 'WELCOME BACK'}
                </div>
                <h1 style={{ fontSize: '48px', margin: '0 0 10px 0', fontWeight: 500, color: 'var(--ll-ink)', fontFamily: 'var(--ll-serif)' }}>
                    {isStudentView ? currentStudentName : 'Your teaching dashboard'}
                </h1>
                <p style={{ color: 'var(--ll-ink-soft)', marginBottom: '30px', fontFamily: 'system-ui, sans-serif' }}>
                    {isStudentView
                        ? 'Question patterns and topic breakdown for this student.'
                        : 'Track student questions, course material coverage, and learning contexts.'}
                </p>

                {/* Top stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
                    <StatCard label="TOTAL QUESTIONS" value={totalQuestions} />
                    <StatCard label={isStudentView ? "TOPICS ASKED" : "TOTAL STUDENTS"} value={isStudentView ? topicsCovered : totalStudents} />
                    <StatCard label="TOPICS COVERED" value={topicsCovered} />
                    <StatCard label="COURSE MATERIALS" value={totalMaterial} />
                </div>

                {/* 1. Number of Questions per Topic */}
                <div style={cardStyle}>
                    <h2 style={sectionTitleStyle}>1. Number of Questions per Topic</h2>
                    <p style={subTextStyle}>Collected through various student interactions — identifies areas of common struggle.</p>
                    <QuestionsPerTopicChart data={questionsPerTopic} />
                </div>

                {/* 2. Course Material Analysis — two pies side by side */}
                <div style={{ ...cardStyle, marginTop: '30px' }}>
                    <h2 style={sectionTitleStyle}>2. Course Material Analysis</h2>
                    <p style={subTextStyle}>
                        Compare what the course material covers against what students actually ask about.
                        A topic that's a small slice of material but a large slice of questions signals where to adjust teaching.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        <div>
                            <h3 style={pieTitleStyle}>Percentage of Questions Asked by Topics</h3>
                            <TopicPie data={questionsPerTopic.map(t => ({ name: t.name, value: t.count }))} />
                        </div>
                        <div>
                            <h3 style={pieTitleStyle}>Percentage of Course Material</h3>
                            <TopicPie data={materialPercentage.map(m => ({ name: m.name, value: m.documents }))} />
                        </div>
                    </div>
                </div>

                {/* 3. Question Context */}
                <div style={{ ...cardStyle, marginTop: '30px' }}>
                    <h2 style={sectionTitleStyle}>3. Question Context</h2>
                    <p style={subTextStyle}>
                        Where students raise questions — lectures, forums, direct chats with educators, or the self-study chatbot.
                        Gives insight into students' learning habits.
                    </p>
                    <ContextPie data={contextData} />
                </div>

                {/* Student table */}
                {!isStudentView && (
                    <div style={{ ...cardStyle, marginTop: '30px' }}>
                        <h2 style={sectionTitleStyle}>Questions by student</h2>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--ll-line)' }}>
                                    <th style={thStyle}>Student</th>
                                    <th style={thStyle}>Most asked topic</th>
                                    <th style={thStyle}>Topics covered</th>
                                    <th style={thStyle}>Total questions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {studentSummary.map(s => (
                                    <tr key={s.studentId} style={{ borderBottom: '1px solid var(--ll-line)' }}>
                                        <td style={tdStyle}>
                                            <span
                                                onClick={() => setSelectedStudentId(s.studentId)}
                                                style={{ color: 'var(--ll-sage-deep)', textDecoration: 'underline', fontWeight: 'bold', cursor: 'pointer' }}>
                                                {s.studentName}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>{s.primaryTopic}</td>
                                        <td style={tdStyle}>{s.topicsCovered}</td>
                                        <td style={tdStyle}>{s.totalQuestions}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}

// ============ CHARTS ============
function QuestionsPerTopicChart({ data }: { data: TopicCount[] }) {
    const chartData = data.map(d => ({ topic: d.name, questions: d.count }));
    return (
        <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <XAxis dataKey="topic" interval={0} tick={({ x, y, payload }) => {
                    const words = payload.value.split(' ');
                    return (
                        <g transform={`translate(${x},${y + 10})`}>
                            {words.map((word: string, index: number) => (
                                <text key={index} textAnchor="middle" x={0} y={index * 11} fontSize={10}>{word}</text>
                            ))}
                        </g>
                    );
                }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="questions">
                    {chartData.map((entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function TopicPie({ data }: { data: { name: string, value: number }[] }) {
    return (
        <ResponsiveContainer width="100%" height={360}>
            <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={false}>
                    {data.map((entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [`${value}`, name]} />
                <Legend layout="vertical" verticalAlign="middle" align="right"
                    wrapperStyle={{ fontSize: '11px', maxWidth: '45%' }} />
            </PieChart>
        </ResponsiveContainer>
    );
}

function ContextPie({ data }: { data: ContextCount[] }) {
    return (
        <ResponsiveContainer width="100%" height={400}>
            <PieChart>
                <Pie data={data} dataKey="count" nameKey="context" cx="50%" cy="50%" outerRadius={130} label>
                    {data.map((entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '13px' }} />
            </PieChart>
        </ResponsiveContainer>
    );
}

// ============ UI HELPERS ============
function StatCard({ label, value }: { label: string, value: string | number }) {
    return (
        <div style={cardStyle}>
            <div style={{ fontSize: '11px', color: 'var(--ll-muted)', letterSpacing: '1.5px', marginBottom: '12px', fontFamily: 'system-ui, sans-serif' }}>{label}</div>
            <div style={{ fontSize: '40px', fontWeight: 500, color: 'var(--ll-ink)', fontFamily: 'var(--ll-serif)' }}>{value}</div>
        </div>
    );
}

const navItemStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '15px',
    color: 'var(--ll-ink-soft)', fontFamily: 'system-ui, sans-serif', fontWeight: 600
};
const cardStyle: React.CSSProperties = {
    background: 'var(--ll-surface)', border: '1px solid var(--ll-line)',
    borderRadius: '16px', padding: '24px', boxShadow: '0 6px 18px rgba(63, 55, 38, 0.06)'
};
const sectionTitleStyle: React.CSSProperties = {
    marginTop: 0, fontWeight: 500, fontSize: '26px', marginBottom: '6px', color: 'var(--ll-ink)', fontFamily: 'var(--ll-serif)'
};
const subTextStyle: React.CSSProperties = {
    color: 'var(--ll-ink-soft)', fontSize: '14px', marginTop: 0, marginBottom: '20px', fontFamily: 'system-ui, sans-serif'
};
const pieTitleStyle: React.CSSProperties = {
    fontWeight: 500, fontSize: '16px', color: 'var(--ll-ink-soft)', marginBottom: '8px'
};
const thStyle: React.CSSProperties = { padding: '12px 8px', fontSize: '14px', color: 'var(--ll-ink)' };
const tdStyle: React.CSSProperties = { padding: '14px 8px', fontSize: '14px', color: 'var(--ll-ink-soft)' };