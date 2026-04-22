"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import styles from "./CourseClient.module.css";

export default function CourseClient({ lectureId }: { lectureId: string }) {
  const searchParams = useSearchParams();
  const creator = (searchParams.get("creator") === "teacher" ? "teacher" : "student") as
    | "teacher"
    | "student";

  const apiBase = useMemo(
    () => (creator === "teacher" ? "/api/teacher-lecture" : "/api/lecture"),
    [creator]
  );

  const [title, setTitle] = useState("Course Topic");
  const [summary, setSummary] = useState("");
  const [showModal, setShowModal] = useState(false);

  async function api(action: string, payload: any = {}) {
    return fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    }).then((r) => r.json());
  }

  useEffect(() => {
    (async () => {
      const res = await api("load", { lectureId });
      if (!res?.ok) return;
      setTitle(res.lecture?.title || "Course Topic");
      setSummary((res.summary || "").trim());
    })();
  }, [lectureId, apiBase]);

  const shortSummary = (() => {
    const text = summary || "No summary available yet. Please process this lecture first.";
    if (text.length <= 450) return text;
    const cut = text.lastIndexOf(".", 450);
    return cut > 100 ? text.slice(0, cut + 1) : text.slice(0, 450) + "…";
  })();

  function renderMarkdown(text: string) {
    return text.split("\n").filter(line => line.trim() !== "").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={j}>{part.slice(2, -2)}</strong>;
        return part;
      });
      return <p key={i} className={styles.summaryLine}>{parts}</p>;
    });
  }

  const q = `?creator=${creator}`;

  return (
    <div className={styles.page}>
      <Link href="/LectureLens" className={styles.back}>← Back to courses</Link>

      <section className={styles.hero}>
        <h1 className={styles.title}>{title}</h1>
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.summaryCard}>
          <h3 className={styles.sectionLabel}>Summary of Content</h3>
          <div className={styles.summaryText}>{renderMarkdown(shortSummary)}</div>
          {summary.length > 450 && (
            <button className={styles.readMore} onClick={() => setShowModal(true)}>
              Read more ↗
            </button>
          )}
        </article>

        <article className={styles.modeWrap}>
          <h3 className={styles.modeHeading}>How would you like to study?</h3>

          <div className={styles.actions}>
            <Link href={`/LectureLens/course/${lectureId}/quiz${q}`} className={`${styles.card} ${styles.quiz}`}>
              <h4 className={styles.cardTitle}>Practice Quiz</h4>
              <p className={styles.cardText}>Generate MCQs and test your understanding.</p>
            </Link>

            <Link href={`/LectureLens/course/${lectureId}/chat${q}`} className={`${styles.card} ${styles.chat}`}>
              <h4 className={styles.cardTitle}>Ask the Tutor</h4>
              <p className={styles.cardText}>Ask lecture-specific questions and get guided help.</p>
            </Link>

            <Link href={`/LectureLens/course/${lectureId}/adaptive${q}`} className={`${styles.card} ${styles.adaptive}`}>
              <h4 className={styles.cardTitle}>Adaptive Learning</h4>
              <p className={styles.cardText}>Get personalized support based on your learning needs.</p>
            </Link>

            <Link href={`/LectureLens/course/${lectureId}/solosprintui${q}`} className={styles.card}>
              <h4 className={styles.cardTitle}>Solo Feynman Sprint</h4>
              <p className={styles.cardText}>practise your understanding using this gamified approach.</p>
            </Link>
          </div>
        </article>
      </section>

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modalPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Summary of Content</h2>
              <button className={styles.modalClose} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {renderMarkdown(summary)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
