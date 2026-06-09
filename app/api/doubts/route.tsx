// app/api/doubts/route.ts
// Single API route handling all doubt analytics queries.
// Usage:
//   GET /api/doubts?type=all                    -> full doubt list
//   GET /api/doubts?type=students               -> per-student summary
//   GET /api/doubts?type=topic-difficulty       -> doubt counts per topic
//   GET /api/doubts?type=weekly                 -> Mon-Sun activity
// Add &studentId=1 to any of them to scope to one student.

// Inline mock data (move to JSON files when ready)
const students = [
    { id: 1, name: "Ava Lim" },
    { id: 2, name: "Noah Tan" },
    { id: 3, name: "Mia Chen" },
    { id: 4, name: "Liam Goh" },
    { id: 5, name: "Ethan Raj" },
    { id: 6, name: "Sophia Lee" },
    { id: 7, name: "Jacob Wong" },
    { id: 8, name: "Isabella Ng" }
];

const topics = [
    { topicId: 1, name: "Backpropagation" },
    { topicId: 2, name: "Thermodynamics Laws" },
    { topicId: 3, name: "Gradient Descent" },
    { topicId: 4, name: "Chain Rule" },
    { topicId: 5, name: "Matrix Multiplication" },
    { topicId: 6, name: "Neural Networks" },
    { topicId: 7, name: "Linear Algebra" }
];

const doubts = [
    { doubtId: 1, studentId: 1, topicId: 1, severity: "High", context: "Lecture", dayOfWeek: "Mon" },
    { doubtId: 2, studentId: 1, topicId: 1, severity: "High", context: "Homework", dayOfWeek: "Tue" },
    { doubtId: 3, studentId: 1, topicId: 1, severity: "Medium", context: "Exam", dayOfWeek: "Wed" },
    { doubtId: 4, studentId: 1, topicId: 3, severity: "Medium", context: "Practice", dayOfWeek: "Thu" },
    { doubtId: 5, studentId: 2, topicId: 3, severity: "Medium", context: "Homework", dayOfWeek: "Mon" },
    { doubtId: 6, studentId: 2, topicId: 3, severity: "Medium", context: "Lecture", dayOfWeek: "Wed" },
    { doubtId: 7, studentId: 2, topicId: 4, severity: "Low", context: "Practice", dayOfWeek: "Fri" },
    { doubtId: 8, studentId: 3, topicId: 2, severity: "High", context: "Lecture", dayOfWeek: "Tue" },
    { doubtId: 9, studentId: 3, topicId: 2, severity: "High", context: "Exam", dayOfWeek: "Thu" },
    { doubtId: 10, studentId: 3, topicId: 2, severity: "High", context: "Homework", dayOfWeek: "Sat" },
    { doubtId: 11, studentId: 3, topicId: 6, severity: "Medium", context: "Lecture", dayOfWeek: "Sat" },
    { doubtId: 12, studentId: 4, topicId: 5, severity: "Low", context: "Practice", dayOfWeek: "Wed" },
    { doubtId: 13, studentId: 4, topicId: 5, severity: "Low", context: "Homework", dayOfWeek: "Fri" },
    { doubtId: 14, studentId: 5, topicId: 4, severity: "Medium", context: "Lecture", dayOfWeek: "Mon" },
    { doubtId: 15, studentId: 5, topicId: 4, severity: "Medium", context: "Practice", dayOfWeek: "Thu" },
    { doubtId: 16, studentId: 5, topicId: 4, severity: "Medium", context: "Homework", dayOfWeek: "Sun" },
    { doubtId: 17, studentId: 6, topicId: 1, severity: "High", context: "Exam", dayOfWeek: "Sat" },
    { doubtId: 18, studentId: 6, topicId: 6, severity: "Medium", context: "Lecture", dayOfWeek: "Tue" },
    { doubtId: 19, studentId: 7, topicId: 7, severity: "Low", context: "Practice", dayOfWeek: "Fri" },
    { doubtId: 20, studentId: 7, topicId: 1, severity: "High", context: "Homework", dayOfWeek: "Thu" },
    { doubtId: 21, studentId: 8, topicId: 2, severity: "Medium", context: "Lecture", dayOfWeek: "Sat" },
    { doubtId: 22, studentId: 8, topicId: 3, severity: "Low", context: "Practice", dayOfWeek: "Sun" },
    { doubtId: 23, studentId: 1, topicId: 6, severity: "High", context: "Lecture", dayOfWeek: "Fri" }
];

export async function GET(request: Request) {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'all';
    const studentId = url.searchParams.get('studentId');
    const topicId = url.searchParams.get('topicId');
    const severity = url.searchParams.get('severity');

    // Apply common filters
    let filtered = doubts;
    if (studentId) filtered = filtered.filter(d => d.studentId === Number(studentId));
    if (topicId) filtered = filtered.filter(d => d.topicId === Number(topicId));
    if (severity) filtered = filtered.filter(d => d.severity === severity);

    let result: any;

    // --- TYPE: full doubt list (joined with student + topic) ---
    if (type === 'all') {
        result = filtered.map(item => {
            const topic = topics.find(t => t.topicId === item.topicId);
            const student = students.find(s => s.id === item.studentId);
            return {
                doubtId: item.doubtId,
                studentId: item.studentId,
                studentName: student?.name,
                topic: topic,
                severity: item.severity,
                context: item.context,
                dayOfWeek: item.dayOfWeek
            };
        });
    }

    // --- TYPE: per-student summary (for the dashboard table) ---
    else if (type === 'students') {
        const studentMap: Record<number, { topics: Set<number>, severities: string[], sessions: number }> = {};
        filtered.forEach(d => {
            if (!studentMap[d.studentId]) {
                studentMap[d.studentId] = { topics: new Set(), severities: [], sessions: 0 };
            }
            studentMap[d.studentId].topics.add(d.topicId);
            studentMap[d.studentId].severities.push(d.severity);
            studentMap[d.studentId].sessions++;
        });

        const severityRank: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

        result = Object.entries(studentMap).map(([sid, data]) => {
            const student = students.find(s => s.id === Number(sid));
            const topSeverity = data.severities.reduce(
                (a, b) => (severityRank[a] || 0) >= (severityRank[b] || 0) ? a : b, 'Low'
            );

            const topicFreq: Record<number, number> = {};
            filtered.filter(d => d.studentId === Number(sid)).forEach(d => {
                topicFreq[d.topicId] = (topicFreq[d.topicId] || 0) + 1;
            });
            const topTopicId = Object.entries(topicFreq).sort((a, b) => b[1] - a[1])[0]?.[0];
            const topTopic = topics.find(t => t.topicId === Number(topTopicId));

            return {
                studentId: Number(sid),
                studentName: student?.name,
                primaryTopic: topTopic?.name,
                severity: topSeverity,
                sessionsFlagged: data.sessions
            };
        });
    }

    // --- TYPE: topic difficulty (for bar chart) ---
    else if (type === 'topic-difficulty') {
        const topicCounts: Record<number, number> = {};
        filtered.forEach(d => {
            topicCounts[d.topicId] = (topicCounts[d.topicId] || 0) + 1;
        });
        result = Object.entries(topicCounts).map(([tid, count]) => {
            const topic = topics.find(t => t.topicId === Number(tid));
            return {
                topicId: Number(tid),
                name: topic?.name || `Topic ${tid}`,
                count
            };
        }).sort((a, b) => b.count - a.count);
    }

    // --- TYPE: weekly activity ---
    else if (type === 'weekly') {
        const daysOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayCounts: Record<string, number> = {};
        daysOrder.forEach(d => { dayCounts[d] = 0; });
        filtered.forEach(d => {
            if (dayCounts[d.dayOfWeek] !== undefined) dayCounts[d.dayOfWeek]++;
        });
        result = daysOrder.map(day => ({ day, requests: dayCounts[day] }));
    }

    else {
        return new Response(JSON.stringify({ error: 'Invalid type parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}