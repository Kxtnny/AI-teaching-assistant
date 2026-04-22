"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import styles from "./page.module.css";

type Msg = { role: "system" | "student"; content: string };
type Verdict = "good" | "bad" | "neutral";
type CreatorType = "teacher" | "student";

type FinalFeedback = {
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  improvements?: { action: string; why: string; example: string }[];
  nextQuestion?: string;
};

type Subtopic = { title: string; description: string };

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 180)}`);
  }
}

function levelFromScore(score: number) {
  if (score < 20) return "Seed";
  if (score < 40) return "Sprout";
  if (score < 60) return "Sapling";
  if (score < 80) return "Young Tree";
  return "Full Tree";
}

export default function SoloSprintPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const creatorParam = searchParams.get("creator");
  if (creatorParam !== "teacher" && creatorParam !== "student") {
    return <div style={{ padding: 20 }}>Missing creator in URL. Please open from course page.</div>;
  }

  const lectureId = params.id;
  const creator: CreatorType = creatorParam;

  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [selectedSubtopic, setSelectedSubtopic] = useState("");
  const [loadingSubtopics, setLoadingSubtopics] = useState(true);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [treeScore, setTreeScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(180);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<FinalFeedback | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [pulse, setPulse] = useState<"none" | "good" | "bad" | "milestone">("none");
  const lastScoreRef = useRef(0);
  const lastMilestoneRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const transcript = useMemo(() => messages.map((m) => `${m.role}: ${m.content}`).join("\n"), [messages]);

  useEffect(() => {
    void loadSubtopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId, creator]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    const prev = lastScoreRef.current;
    const cur = treeScore;
    if (cur === prev) return;
    const delta = cur - prev;
    lastScoreRef.current = cur;

    const prevM = lastMilestoneRef.current;
    const nextM = Math.floor(cur / 20) * 20;
    if (nextM > prevM) {
      lastMilestoneRef.current = nextM;
      setPulse("milestone");
      const t = setTimeout(() => setPulse("none"), 650);
      return () => clearTimeout(t);
    }

    setPulse(delta > 0 ? "good" : "bad");
    const t = setTimeout(() => setPulse("none"), 420);
    return () => clearTimeout(t);
  }, [treeScore]);

  async function loadSubtopics() {
    setLoadingSubtopics(true);
    setError("");
    try {
      const r = await fetch("/api/solosprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subtopics", lectureId, creator }),
      });
      const d = await safeJson(r);
      if (!r.ok || !d?.ok) throw new Error(d?.error || "Failed to load subtopics");
      setSubtopics(Array.isArray(d.items) ? d.items : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load subtopics");
    } finally {
      setLoadingSubtopics(false);
    }
  }

  async function startSessionWithSubtopic(subtopic: string) {
    setSelectedSubtopic(subtopic);
    setError("");
    setDone(false);
    setFeedback(null);
    setShowFeedback(false);
    setTreeScore(0);
    setSecondsLeft(180);
    setMessages([]);

    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    await askNextQuestion("", subtopic);

    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          void endSession();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function askNextQuestion(transcriptOverride?: string, subtopicOverride?: string) {
    try {
      setBusy(true);
      const r = await fetch("/api/solosprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next_question",
          lectureId,
          creator,
          transcript: transcriptOverride ?? transcript,
          subtopic: subtopicOverride ?? selectedSubtopic,
        }),
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d?.error || "Failed to get question");
      setCurrentQuestion(d.question);
      setMessages((prev) => [...prev, { role: "system", content: d.question }]);
    } catch (e: any) {
      setError(e?.message || "Failed to get question");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || done || busy || !selectedSubtopic) return;

    const answer = input.trim();
    setInput("");

    const withStudent = [...messages, { role: "student", content: answer } as Msg];
    setMessages(withStudent);

    try {
      setBusy(true);
      const r = await fetch("/api/solosprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade",
          lectureId,
          creator,
          question: currentQuestion,
          answer,
          subtopic: selectedSubtopic,
        }),
      });

      const d = await safeJson(r);
      if (!r.ok || !d?.ok) throw new Error(d?.error || "Grading failed");

      const verdict: Verdict = d.verdict || "neutral";
      const delta =
        verdict === "good" ? 10 : verdict === "neutral" ? 3 : 0; // your policy

      setTreeScore((s) => clamp(s + delta));

      if (d.feedback) {
        setMessages((prev) => [...prev, { role: "system", content: `Feedback: ${d.feedback}` }]);
      }
      if (d.tip) {
        setMessages((prev) => [...prev, { role: "system", content: `Tip: ${d.tip}` }]);
      }

      const newTranscript = withStudent.map((m) => `${m.role}: ${m.content}`).join("\n");
      await askNextQuestion(newTranscript);
    } catch (e: any) {
      setError(e?.message || "Failed to grade answer");
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    setDone(true);
    try {
      const r = await fetch("/api/solosprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "final_feedback",
          lectureId,
          creator,
          transcript,
          score: treeScore,
          subtopic: selectedSubtopic,
        }),
      });

      const d = await safeJson(r);
      if (!r.ok) throw new Error(d?.error || "Failed to get feedback");

      setFeedback(d.feedback || null);
      setShowFeedback(true);
    } catch (e: any) {
      setError(e?.message || "Failed to get feedback");
    }
  }

  const level = levelFromScore(treeScore);

  return (
    <div className={styles.page}>
      <Link href={`/LectureLens/course/${lectureId}?creator=${creator}`} className={styles.back}>
        <ArrowLeft size={18} />
        <span>Back to course</span>
      </Link>

      {error ? <div className={styles.error}>{error}</div> : null}

      {!selectedSubtopic ? (
        <section className={styles.subtopicCard}>
          <h2>Select a subtopic to begin Sprint</h2>
          {loadingSubtopics ? (
            <p>Loading subtopics...</p>
          ) : (
            <div className={styles.subtopicGrid}>
              {subtopics.map((s, i) => (
                <button key={i} className={styles.subtopicBtn} onClick={() => startSessionWithSubtopic(s.title)}>
                  <strong>{s.title}</strong>
                  <span>{s.description}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className={styles.mainGrid}>
          <div className={styles.leftCol}>
            <section className={styles.rulesCard}>
              <h4>SESSION RULES</h4>
              <ol>
                <li>Focus on subtopic: <strong>{selectedSubtopic}</strong></li>
                <li>Answer directly and clearly.</li>
                <li>Use one lecture term each response.</li>
              </ol>
              <p>🍃 +10 for correct answers. Reach 100 to fully grow the tree.</p>
            </section>

            <section className={styles.chatCard}>
              <div className={styles.chatBody}>
                {messages.map((m, i) => {
                  const me = m.role === "student";
                  return (
                    <div key={i} className={`${styles.msgRow} ${me ? styles.right : styles.left}`}>
                      {!me && <div className={styles.avatar}>TA</div>}
                      <div className={`${styles.bubble} ${me ? styles.bubbleMe : styles.bubbleTa}`}>{m.content}</div>
                      {me && <div className={styles.avatarMe}>Y</div>}
                    </div>
                  );
                })}
                {busy && <div className={styles.typing}>Tutor is thinking...</div>}
                <div ref={bottomRef} />
              </div>

              <form className={styles.inputBar} onSubmit={submitAnswer}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={done ? "Session ended." : "Type your explanation..."}
                  disabled={done || busy}
                />
                <button type="submit" disabled={!input.trim() || done || busy}>
                  ➤
                </button>
              </form>
            </section>
          </div>

          <aside className={styles.rightCol}>
            <section className={styles.treeCard}>
              <div className={styles.treeHead}>
                <div>
                  <h4>COLLABORATION TREE</h4>
                  <h2>Growth</h2>
                </div>
                <span>{treeScore}/100</span>
              </div>

              <TreeWidget score={treeScore} pulse={pulse} />

              <div className={styles.progressDots}>
                {[20, 40, 60, 80, 100].map((v) => (
                  <span key={v} className={treeScore >= v ? styles.dotOn : styles.dotOff} />
                ))}
              </div>
              <div className={styles.levelText}>{level}</div>
              <p className={styles.helperText}>Grow from seed → sprout → sapling → young tree → full tree.</p>
              <p className={styles.timer}>⏱ {secondsLeft}s left</p>
            </section>
          </aside>
        </div>
      )}

      {showFeedback && feedback && (
        <div className={styles.modalBg} onClick={() => setShowFeedback(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Your Personalized Feedback</h3>
            {feedback.summary ? <p><strong>Summary:</strong> {feedback.summary}</p> : null}

            {feedback.strengths?.length ? (
              <>
                <h4>Strengths</h4>
                <ul>{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </>
            ) : null}

            {feedback.gaps?.length ? (
              <>
                <h4>Gaps</h4>
                <ul>{feedback.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </>
            ) : null}

            {feedback.improvements?.length ? (
              <>
                <h4>How to Improve</h4>
                <ul>
                  {feedback.improvements.map((imp, i) => (
                    <li key={i}>
                      <strong>{imp.action}</strong><br />
                      Why: {imp.why}<br />
                      Example: {imp.example}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {feedback.nextQuestion ? <p><strong>Next Practice Question:</strong> {feedback.nextQuestion}</p> : null}
            <button onClick={() => setShowFeedback(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TreeWidget({ score, pulse }: { score: number; pulse: "none" | "good" | "bad" | "milestone" }) {
  const stage = score < 20 ? 0 : score < 40 ? 1 : score < 60 ? 2 : score < 80 ? 3 : 4;

  const animate =
    pulse === "milestone"
      ? { scale: [1, 1.03, 1], transition: { duration: 0.45 } }
      : pulse === "good"
      ? { scale: [1, 1.02, 1], transition: { duration: 0.25 } }
      : pulse === "bad"
      ? { x: [0, -2, 2, -1, 1, 0], transition: { duration: 0.22 } }
      : {};

  return (
    <motion.div className={styles.treeWrap} animate={animate}>
      <svg viewBox="0 0 420 360">
        <rect x="0" y="0" width="420" height="360" rx="20" fill="#d7eefb" />
        <circle cx="340" cy="58" r="30" fill="#f9c646" />
        <ellipse cx="95" cy="58" rx="32" ry="16" fill="#edf2f7" />
        <ellipse cx="210" cy="318" rx="170" ry="42" fill="#78b45a" />

        {stage === 0 && <ellipse cx="210" cy="282" rx="10" ry="7" fill="#6b4a2f" />}
        {stage >= 1 && (
          <>
            <ellipse cx="210" cy="282" rx="9" ry="7" fill="#6b4a2f" />
            <rect x="207" y="260" width="6" height="22" rx="3" fill="#4e9f4a" />
            <ellipse cx="202" cy="258" rx="9" ry="5" fill="#63b85d" transform="rotate(-25 202 258)" />
            <ellipse cx="218" cy="256" rx="9" ry="5" fill="#63b85d" transform="rotate(25 218 256)" />
          </>
        )}
        {stage >= 2 && (
          <>
            <rect x="202" y="230" width="16" height="52" rx="6" fill="#8a5a35" />
            <circle cx="210" cy="222" r="18" fill="#4ea84e" />
          </>
        )}
        {stage >= 3 && (
          <>
            <circle cx="186" cy="236" r="14" fill="#56b357" />
            <circle cx="234" cy="236" r="14" fill="#56b357" />
            <circle cx="210" cy="208" r="24" fill="#4ea84e" />
          </>
        )}
        {stage >= 4 && (
          <>
            <rect x="198" y="200" width="24" height="82" rx="8" fill="#8a5a35" />
            <circle cx="210" cy="178" r="34" fill="#469e46" />
            <circle cx="175" cy="198" r="24" fill="#53ad53" />
            <circle cx="245" cy="198" r="24" fill="#53ad53" />
            <circle cx="210" cy="214" r="18" fill="#429842" />
          </>
        )}
      </svg>
    </motion.div>
  );
}