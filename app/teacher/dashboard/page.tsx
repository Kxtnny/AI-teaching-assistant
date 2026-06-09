// app/dashboard/page.tsx
"use client"
import { useEffect, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, Legend
} from 'recharts';

// ============ TYPES ============
type Doubt = {
    doubtId: number,
    studentId: number,
    studentName?: string,
    topic: { topicId: number, name: string },
    severity: string,
    context: string,
    dayOfWeek: string
};
type StudentSummary = {
    studentId: number, studentName: string,
    primaryTopic: string, severity: string, sessionsFlagged: number
};
type TopicDifficulty = { topicId: number, name: string, count: number };
type WeeklyData = { day: string, requests: number };

const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28EFF', '#FF6F61', '#FFB347'];
const SEVERITY_COLORS: Record<string, string> = {
    'High': '#E63946', 'Medium': '#F4A261', 'Low': '#2A9D8F'
};
const SEVERITY_BADGE: Record<string, { bg: string, text: string }> = {
    'High': { bg: '#fde2e4', text: '#c92a2a' },
    'Medium': { bg: '#fff3bf', text: '#b08900' },
    'Low': { bg: '#d3f9d8', text: '#2b8a3e' }
};

// ============ MAIN PAGE ============
export default function DashboardPage() {
    const [doubts, setDoubts] = useState<Doubt[]>([]);
    const [studentSummary, setStudentSummary] = useState<StudentSummary[]>([]);
    const [topicDifficulty, setTopicDifficulty] = useState<TopicDifficulty[]>([]);
    const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

    useEffect(() => {
        async function fetchAll() {
            const qs = selectedStudentId ? `&studentId=${selectedStudentId}` : '';
            const [d, s, t, w] = await Promise.all([
                fetch(`/api/doubts?type=all${qs}`).then(r => r.json()),
                fetch(`/api/doubts?type=students`).then(r => r.json()),
                fetch(`/api/doubts?type=topic-difficulty${qs}`).then(r => r.json()),
                fetch(`/api/doubts?type=weekly${qs}`).then(r => r.json())
            ]);
            setDoubts(d);
            setStudentSummary(s);
            setTopicDifficulty(t);
            setWeeklyData(w);
            setIsLoaded(true);
        }
        fetchAll();
    }, [selectedStudentId]);

    if (!isLoaded) {
        return <div style={{ padding: '40px', backgroundColor: '#f5f1ea', minHeight: '100vh' }}>Loading...</div>;
    }

    const isStudentView = selectedStudentId !== null;
    const currentStudentName = isStudentView ? doubts[0]?.studentName || 'Student' : null;

    // Stats
    const totalStudents = new Set(studentSummary.map(s => s.studentId)).size;
    const highSeverity = doubts.filter(d => d.severity === 'High').length;
    const avgStruggleIndex = doubts.length > 0 ? Math.round((highSeverity / doubts.length) * 100) : 0;
    const topicsWithHighDifficulty = topicDifficulty.filter(t => t.count >= 3).length;
    const studentsNeedingSupport = studentSummary.filter(s => s.severity === 'High' || s.severity === 'Medium').length;

    return (
        <div style={{
            display: 'flex', minHeight: '100vh',
            backgroundColor: '#f5f1ea', fontFamily: 'Georgia, serif'
        }}>
            {/* Sidebar */}
            <aside style={{ width: '220px', padding: '30px 20px', borderRight: '1px solid #e0d9cc' }}>
                <div
                    style={{ marginBottom: '40px', fontSize: '14px', color: '#666', cursor: 'pointer' }}
                    onClick={() => setSelectedStudentId(null)}
                >
                    ← {isStudentView ? 'Back to dashboard' : 'Back to home'}
                </div>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={navItemStyle}>Overview</div>
                    <div style={navItemStyle}>Upload Lecture</div>
                    <div style={navItemStyle}>My Lectures</div>
                    <div style={{ ...navItemStyle, border: '1px solid #000', fontWeight: 'bold' }}>Doubt Analytics</div>
                </nav>
            </aside>

            {/* Main content */}
            <main style={{ flex: 1, padding: '40px 50px' }}>
                <div style={{ fontSize: '12px', color: '#888', letterSpacing: '2px', marginBottom: '10px' }}>
                    {isStudentView ? 'STUDENT PROFILE' : 'WELCOME BACK'}
                </div>
                <h1 style={{ fontSize: '48px', margin: '0 0 10px 0', fontWeight: 400 }}>
                    {isStudentView ? currentStudentName : 'Your teaching dashboard'}
                </h1>
                <p style={{ color: '#777', marginBottom: '30px' }}>
                    {isStudentView
                        ? 'Detailed doubt analytics and topic-level struggle profile.'
                        : 'Upload material, manage lectures, and track student learning difficulty.'}
                </p>

                {/* Top stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
                    {isStudentView ? (
                        <>
                            <StatCard label="TOTAL DOUBTS" value={doubts.length} />
                            <StatCard label="STRUGGLE INDEX" value={`${avgStruggleIndex}%`} />
                            <StatCard label="TOPICS STRUGGLING" value={new Set(doubts.map(d => d.topic.topicId)).size} />
                            <StatCard label="HIGH SEVERITY" value={highSeverity} />
                        </>
                    ) : (
                        <>
                            <StatCard label="TOTAL STUDENTS" value={totalStudents} />
                            <StatCard label="AVG. STRUGGLE INDEX" value={`${avgStruggleIndex}%`} />
                            <StatCard label="TOPICS WITH HIGH DIFFICULTY" value={topicsWithHighDifficulty} />
                            <StatCard label="STUDENTS NEEDING SUPPORT" value={studentsNeedingSupport} />
                        </>
                    )}
                </div>

                {/* Charts row 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                    <ChartCard title="Difficulty by Topic">
                        <DifficultyByTopicChart data={topicDifficulty} />
                    </ChartCard>
                    <ChartCard title="Weekly Assistance Requests">
                        <WeeklyRequestsChart data={weeklyData} />
                    </ChartCard>
                    <ChartCard title="Students by Severity">
                        <SeverityChart doubts={doubts} />
                    </ChartCard>
                </div>

                {/* Charts row 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                    <ChartCard title="Doubts by Context">
                        <ContextChart doubts={doubts} />
                    </ChartCard>
                    <ChartCard title="Doubts by Topic (%)">
                        <TopicPercentageChart doubts={doubts} />
                    </ChartCard>
                </div>

                {/* Table */}
                <div style={cardStyle}>
                    <h2 style={{ marginTop: 0, fontWeight: 400, fontSize: '24px' }}>
                        {isStudentView ? 'All flagged doubts' : 'Students requiring assistance by topic'}
                    </h2>
                    {isStudentView ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e0d9cc' }}>
                                    <th style={thStyle}>Topic</th>
                                    <th style={thStyle}>Severity</th>
                                    <th style={thStyle}>Context</th>
                                    <th style={thStyle}>Day</th>
                                </tr>
                            </thead>
                            <tbody>
                                {doubts.map(d => (
                                    <tr key={d.doubtId} style={{ borderBottom: '1px solid #f0ebe0' }}>
                                        <td style={tdStyle}>{d.topic.name}</td>
                                        <td style={tdStyle}><SeverityBadge severity={d.severity} /></td>
                                        <td style={tdStyle}>{d.context}</td>
                                        <td style={tdStyle}>{d.dayOfWeek}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e0d9cc' }}>
                                    <th style={thStyle}>Student</th>
                                    <th style={thStyle}>Topic</th>
                                    <th style={thStyle}>Severity</th>
                                    <th style={thStyle}>Sessions flagged</th>
                                </tr>
                            </thead>
                            <tbody>
                                {studentSummary.map(s => (
                                    <tr key={s.studentId} style={{ borderBottom: '1px solid #f0ebe0' }}>
                                        <td style={tdStyle}>
                                            <span
                                                onClick={() => setSelectedStudentId(s.studentId)}
                                                style={{ color: '#333', textDecoration: 'underline', fontWeight: 'bold', cursor: 'pointer' }}>
                                                {s.studentName}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>{s.primaryTopic}</td>
                                        <td style={tdStyle}><SeverityBadge severity={s.severity} /></td>
                                        <td style={tdStyle}>{s.sessionsFlagged}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>
        </div>
    );
}

// ============ CHART COMPONENTS ============
function DifficultyByTopicChart({ data }: { data: TopicDifficulty[] }) {
    const chartData = data.map(d => ({ topic: d.name, difficulty: d.count }));
    return (
        <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                <XAxis dataKey="topic" interval={0} tick={({ x, y, payload }) => {
                    const words = payload.value.split(' ');
                    return (
                        <g transform={`translate(${x},${y + 10})`}>
                            {words.map((word: string, index: number) => (
                                <text key={index} textAnchor="middle" x={0} y={index * 12} fontSize={11}>{word}</text>
                            ))}
                        </g>
                    );
                }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="difficulty">
                    {chartData.map((entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function WeeklyRequestsChart({ data }: { data: WeeklyData[] }) {
    return (
        <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="requests">
                    {data.map((entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function SeverityChart({ doubts }: { doubts: Doubt[] }) {
    const counts: Record<string, number> = {};
    doubts.forEach(d => { counts[d.severity] = (counts[d.severity] || 0) + 1; });
    const data = Object.entries(counts).map(([severity, count]) => ({ severity, count }));
    return (
        <ResponsiveContainer width="100%" height={350}>
            <PieChart>
                <Pie data={data} dataKey="count" nameKey="severity"
                    cx="50%" cy="50%" innerRadius={60} outerRadius={110} label>
                    {data.map((entry, index) => (
                        <Cell key={index} fill={SEVERITY_COLORS[entry.severity] || '#888'} />
                    ))}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" verticalAlign="middle" align="right" />
            </PieChart>
        </ResponsiveContainer>
    );
}

function ContextChart({ doubts }: { doubts: Doubt[] }) {
    const counts: Record<string, number> = {};
    doubts.forEach(d => { counts[d.context] = (counts[d.context] || 0) + 1; });
    const data = Object.entries(counts).map(([context, count]) => ({ context, count }));
    return (
        <ResponsiveContainer width="100%" height={400}>
            <PieChart>
                <Pie data={data} dataKey="count" nameKey="context"
                    cx="50%" cy="50%" outerRadius={120} label>
                    {data.map((entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" verticalAlign="middle" align="right" />
            </PieChart>
        </ResponsiveContainer>
    );
}

function TopicPercentageChart({ doubts }: { doubts: Doubt[] }) {
    const counts: Record<number, number> = {};
    doubts.forEach(d => { counts[d.topic.topicId] = (counts[d.topic.topicId] || 0) + 1; });
    const data = Object.entries(counts).map(([tid, count]) => {
        const name = doubts.find(d => d.topic.topicId === Number(tid))?.topic.name || `Topic ${tid}`;
        return { topic: name, count };
    });
    return (
        <ResponsiveContainer width="100%" height={400}>
            <PieChart>
                <Pie data={data} dataKey="count" nameKey="topic"
                    cx="50%" cy="50%" outerRadius={120} label={false}>
                    {data.map((entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" verticalAlign="middle" align="right" />
            </PieChart>
        </ResponsiveContainer>
    );
}

// ============ UI HELPERS ============
function StatCard({ label, value }: { label: string, value: string | number }) {
    return (
        <div style={cardStyle}>
            <div style={{ fontSize: '11px', color: '#999', letterSpacing: '1.5px', marginBottom: '12px' }}>{label}</div>
            <div style={{ fontSize: '40px', fontWeight: 400 }}>{value}</div>
        </div>
    );
}

function ChartCard({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div style={cardStyle}>
            <h3 style={{ marginTop: 0, fontWeight: 400, fontSize: '20px', marginBottom: '20px' }}>{title}</h3>
            {children}
        </div>
    );
}

function SeverityBadge({ severity }: { severity: string }) {
    const c = SEVERITY_BADGE[severity] || { bg: '#eee', text: '#333' };
    return (
        <span style={{
            padding: '4px 12px', borderRadius: '12px', fontSize: '12px',
            backgroundColor: c.bg, color: c.text
        }}>
            {severity}
        </span>
    );
}

const navItemStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '15px'
};
const cardStyle: React.CSSProperties = {
    backgroundColor: '#fafaf5', border: '1px solid #e0d9cc',
    borderRadius: '12px', padding: '24px'
};
const thStyle: React.CSSProperties = { padding: '12px 8px', fontSize: '14px', color: '#333' };
const tdStyle: React.CSSProperties = { padding: '14px 8px', fontSize: '14px', color: '#555' };