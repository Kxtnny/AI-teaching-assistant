"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { useMemo, useState } from "react";
import styles from "./page.module.css";

type McqItem = {
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
};

export default function QuizPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const contentId = params.id;
  const creator = (searchParams.get("creator") === "teacher" ? "teacher" : "student") as
    | "teacher"
    | "student";
  const contentKind = searchParams.get("contentKind") === "document" ? "document" : "video";

const apiBase = useMemo(
  () => (creator === "teacher" && contentKind !== "document" ? "/api/teacher-lecture" : "/api/upload-pdf"),
  [creator, contentKind]
);

  const [focus, setFocus] = useState("");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<McqItem[]>([]);
  const [err, setErr] = useState("");

  // track selected option index for each question
  const [selected, setSelected] = useState<Record<number, number>>({});
  // track if question has been revealed/answered
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  async function generateQuiz() {
    setLoading(true);
    setErr("");
    setSelected({});
    setRevealed({});
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mcq", contentId, focus, n: count }),
      }).then((r) => r.json());

      if (!res?.ok) throw new Error(res?.error || "Failed to generate quiz");
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (e: any) {
      setErr(e.message || "Quiz generation failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const normalize = (s: string) => s.trim().toLowerCase();

  const onPick = (qIdx: number, optIdx: number) => {
    setSelected((prev) => ({ ...prev, [qIdx]: optIdx }));
    setRevealed((prev) => ({ ...prev, [qIdx]: true }));
  };

  return (
    <div className={styles.page}>
      <Link href={`/LectureLens/course/${contentId}?creator=${creator}&contentKind=${contentKind}`} className={styles.back}>
        ← Back to course
      </Link>

      <h1 className={styles.title}>Practice Quiz</h1>

      <div className={styles.controls}>
        <input
          className={styles.input}
          placeholder="Optional focus topic (e.g. Thermodynamics)"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
        />
        <select className={styles.select} value={count} onChange={(e) => setCount(Number(e.target.value))}>
          <option value={3}>3 questions</option>
          <option value={5}>5 questions</option>
          <option value={8}>8 questions</option>
          <option value={10}>10 questions</option>
        </select>
        <button className={styles.button} onClick={generateQuiz} disabled={loading}>
          {loading ? "Generating..." : "Generate MCQ"}
        </button>
      </div>

      {err && <p className={styles.error}>{err}</p>}

      <div className={styles.list}>
        {items.map((q, idx) => {
          const pickedIdx = selected[idx];
          const hasPicked = pickedIdx !== undefined;
          const answerShown = !!revealed[idx];

          return (
            <article key={idx} className={styles.card}>
              <h3>
                {idx + 1}. {q.question}
              </h3>

              <ul className={styles.options}>
                {(q.options || []).map((op, i) => {
                  const isPicked = pickedIdx === i;
                  const isCorrect = normalize(op) === normalize(q.answer);

                  let optionClass = styles.optionBtn;
                  if (answerShown && isCorrect) optionClass += ` ${styles.correct}`;
                  if (answerShown && isPicked && !isCorrect) optionClass += ` ${styles.wrong}`;

                  return (
                    <li key={i} className={styles.optionItem}>
                      <button
                        type="button"
                        className={optionClass}
                        onClick={() => onPick(idx, i)}
                        disabled={answerShown}
                      >
                        {op}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {!hasPicked && <p className={styles.hint}>Select one option to reveal the answer.</p>}

              {answerShown && (
                <div className={styles.answerBox}>
                  <p>
                    <strong>Answer:</strong> {q.answer}
                  </p>
                  {q.explanation && (
                    <p>
                      <strong>Why:</strong> {q.explanation}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}