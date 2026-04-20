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

  const shortSummary =
    summary.length > 700
      ? `${summary.slice(0, 700)}...`
      : summary || "No summary available yet. Please process this lecture first.";

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
          <p className={styles.summaryText}>{shortSummary}</p>
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
          </div>
        </article>
      </section>
    </div>
  );
}