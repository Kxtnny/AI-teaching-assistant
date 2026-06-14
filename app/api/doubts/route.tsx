// app/api/analytics/route.ts
// Single API route powering all four dashboard visualizations.
// Usage:
//   GET /api/analytics?type=questions-per-topic   -> bar chart (count of questions per topic)
//   GET /api/analytics?type=topic-percentage      -> pie (% of questions asked by topic)
//   GET /api/analytics?type=material-percentage    -> pie (% of course material by topic)
//   GET /api/analytics?type=context               -> pie (question context breakdown)
//   GET /api/analytics?type=all                   -> raw question list (joined w/ topic)
// Add &studentId=1 to scope question-based stats to a single student.

// ---------- Mock data (swap for JSON imports when ready) ----------
const topics = [
    { topicId: 1, name: "Python Basics and Syntax" },
    { topicId: 2, name: "Variables and Data Types" },
    { topicId: 3, name: "Control Flow (Conditionals and Loops)" },
    { topicId: 4, name: "Functions and Modular Programming" },
    { topicId: 5, name: "Built-in Data Structures (Lists, Tuples, Dictionaries, Sets)" },
    { topicId: 6, name: "File Handling and Input/Output" },
    { topicId: 7, name: "Error Handling and Debugging" }
];

// Number of course-material documents/pieces per topic.
// Used for the "Percentage of Course Material" pie, compared against questions asked.
const courseMaterial = [
    { topicId: 1, documents: 6 },
    { topicId: 2, documents: 5 },
    { topicId: 3, documents: 8 },
    { topicId: 4, documents: 7 },
    { topicId: 5, documents: 6 },
    { topicId: 6, documents: 3 },
    { topicId: 7, documents: 4 }
];

const students = [
    { id: 1, name: "Ava Lim" },
    { id: 2, name: "Noah Tan" },
    { id: 3, name: "Mia Chen" },
    { id: 4, name: "Liam Goh" },
    { id: 5, name: "Ethan Raj" }
];

// context values: chat_with_educator | forum | lecture | self_study_chatbot
const questions = [
    { questionId: 1, studentId: 1, topicId: 1, context: "lecture" },
    { questionId: 2, studentId: 2, topicId: 2, context: "forum" },
    { questionId: 3, studentId: 3, topicId: 2, context: "self_study_chatbot" },
    { questionId: 4, studentId: 1, topicId: 3, context: "lecture" },
    { questionId: 5, studentId: 2, topicId: 3, context: "forum" },
    { questionId: 6, studentId: 3, topicId: 3, context: "self_study_chatbot" },
    { questionId: 7, studentId: 4, topicId: 3, context: "chat_with_educator" },
    { questionId: 8, studentId: 5, topicId: 3, context: "lecture" },
    { questionId: 9, studentId: 1, topicId: 3, context: "forum" },
    { questionId: 10, studentId: 2, topicId: 3, context: "self_study_chatbot" },
    { questionId: 11, studentId: 3, topicId: 3, context: "lecture" },
    { questionId: 12, studentId: 4, topicId: 3, context: "forum" },
    { questionId: 13, studentId: 1, topicId: 4, context: "self_study_chatbot" },
    { questionId: 14, studentId: 2, topicId: 4, context: "lecture" },
    { questionId: 15, studentId: 3, topicId: 4, context: "forum" },
    { questionId: 16, studentId: 4, topicId: 4, context: "self_study_chatbot" },
    { questionId: 17, studentId: 5, topicId: 4, context: "lecture" },
    { questionId: 18, studentId: 1, topicId: 5, context: "forum" },
    { questionId: 19, studentId: 2, topicId: 5, context: "self_study_chatbot" },
    { questionId: 20, studentId: 3, topicId: 5, context: "lecture" },
    { questionId: 21, studentId: 4, topicId: 5, context: "chat_with_educator" },
    { questionId: 22, studentId: 5, topicId: 5, context: "forum" },
    { questionId: 23, studentId: 1, topicId: 6, context: "self_study_chatbot" },
    { questionId: 24, studentId: 2, topicId: 6, context: "lecture" },
    { questionId: 25, studentId: 3, topicId: 6, context: "forum" },
    { questionId: 26, studentId: 4, topicId: 6, context: "self_study_chatbot" },
    { questionId: 27, studentId: 5, topicId: 7, context: "lecture" },
    { questionId: 28, studentId: 1, topicId: 7, context: "forum" },
    { questionId: 29, studentId: 2, topicId: 7, context: "chat_with_educator" },
    { questionId: 30, studentId: 3, topicId: 7, context: "self_study_chatbot" }
];

export async function GET(request: Request) {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'questions-per-topic';
    const studentId = url.searchParams.get('studentId');

    // Scope questions to a student if requested
    let filtered = questions;
    if (studentId) filtered = filtered.filter(q => q.studentId === Number(studentId));

    let result: any;

    // --- Bar chart: number of questions per topic ---
    if (type === 'questions-per-topic' || type === 'topic-percentage') {
        const counts: Record<number, number> = {};
        filtered.forEach(q => { counts[q.topicId] = (counts[q.topicId] || 0) + 1; });
        result = topics
            .map(t => ({ topicId: t.topicId, name: t.name, count: counts[t.topicId] || 0 }))
            .filter(t => t.count > 0);
    }

    // --- Pie: percentage of course material by topic ---
    else if (type === 'material-percentage') {
        result = courseMaterial.map(m => {
            const topic = topics.find(t => t.topicId === m.topicId);
            return { topicId: m.topicId, name: topic?.name || `Topic ${m.topicId}`, documents: m.documents };
        });
    }

    // --- Pie: question context breakdown ---
    else if (type === 'context') {
        const counts: Record<string, number> = {};
        filtered.forEach(q => { counts[q.context] = (counts[q.context] || 0) + 1; });
        result = Object.entries(counts).map(([context, count]) => ({ context, count }));
    }

    // --- Raw question list joined with topic ---
    else if (type === 'all') {
        result = filtered.map(q => {
            const topic = topics.find(t => t.topicId === q.topicId);
            const student = students.find(s => s.id === q.studentId);
            return {
                questionId: q.questionId,
                studentId: q.studentId,
                studentName: student?.name,
                topic,
                context: q.context
            };
        });
    }

    // --- Per-student summary (for table) ---
    else if (type === 'students') {
        const map: Record<number, { topics: Set<number>, total: number }> = {};
        questions.forEach(q => {
            if (!map[q.studentId]) map[q.studentId] = { topics: new Set(), total: 0 };
            map[q.studentId].topics.add(q.topicId);
            map[q.studentId].total++;
        });
        result = Object.entries(map).map(([sid, data]) => {
            const student = students.find(s => s.id === Number(sid));
            // most asked topic
            const freq: Record<number, number> = {};
            questions.filter(q => q.studentId === Number(sid)).forEach(q => {
                freq[q.topicId] = (freq[q.topicId] || 0) + 1;
            });
            const topTopicId = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
            const topTopic = topics.find(t => t.topicId === Number(topTopicId));
            return {
                studentId: Number(sid),
                studentName: student?.name,
                primaryTopic: topTopic?.name,
                topicsCovered: data.topics.size,
                totalQuestions: data.total
            };
        });
    }

    else {
        return new Response(JSON.stringify({ error: 'Invalid type parameter' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify(result), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
}