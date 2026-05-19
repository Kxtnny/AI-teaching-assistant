"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type CreatorType = "teacher" | "student";
type Lecture = {
  lecture_id: string;
  title: string;
  creator?: CreatorType;
  content_kind?: "video" | "document";
  status: "Uploaded" | "Audio Ready" | "Ready";
};

function Sidebar() {
  const pathname = usePathname();
  const isHome = pathname === "/LectureLens";
  const isUpload = pathname === "/LectureLens/upload";

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.back}>← Back to home</Link>
      <div className={styles.sideTop}>
        <div className={styles.miniLogo}>🎓</div>
        <div className={styles.miniText}>
          <strong>Student</strong>
          <span>Learning Hub</span>
        </div>
      </div>

      <nav className={styles.menu}>
        <Link href="/LectureLens" className={`${styles.menuItem} ${isHome ? styles.active : ""}`}>
          <span className={styles.icon}>▦</span>
          <span>Overview</span>
        </Link>
        <Link href="/LectureLens" className={`${styles.menuItem} ${isHome ? styles.activeSoft : ""}`}>
          <span className={styles.icon}>▭</span>
          <span>My Courses</span>
        </Link>
        <Link href="/LectureLens/upload" className={`${styles.menuItem} ${isUpload ? styles.active : ""}`}>
          <span className={styles.icon}>⇪</span>
          <span>Upload Lecture</span>
        </Link>
        <button className={`${styles.menuItem} ${styles.muted}`} disabled>
          <span className={styles.icon}>✧</span>
          <span>Doubt Analytics</span>
        </button>
      </nav>
    </aside>
  );
}

export default function StudentHomePage() {
  const [library, setLibrary] = useState<Lecture[]>([]);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refreshLibrary() {
    try {
      const [studentRes, teacherRes] = await Promise.all([
        fetch("/api/lecture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "load" }),
        }).then((r) => r.json()),
        fetch("/api/teacher-lecture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "load" }),
        }).then((r) => r.json()),
      ]);

      const studentLib = (studentRes?.ok ? studentRes.library : []) || [];
      const teacherLib = (teacherRes?.ok ? teacherRes.library : []) || [];

      const normalizedStudents: Lecture[] = studentLib.map((x: any) => ({
        ...x,
        creator: "student",
      }));

      const normalizedTeachers: Lecture[] = teacherLib.map((x: any) => ({
        ...x,
        creator: "teacher",
      }));

      const mergedMap = new Map<string, Lecture>();
      [...normalizedTeachers, ...normalizedStudents].forEach((item) => {
        mergedMap.set(item.lecture_id, item);
      });

      setLibrary(Array.from(mergedMap.values()));
    } catch (e) {
      console.error("Failed to load merged library:", e);
      setLibrary([]);
    }
  }

  async function deleteStudentLecture(lectureId: string) {
    const yes = window.confirm("Delete this student lecture?");
    if (!yes) return;

    setDeletingId(lectureId);
    try {
      const res = await fetch("/api/lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteLecture", lectureId }),
      }).then((r) => r.json());

      if (!res?.ok) throw new Error(res?.error || "Delete failed");
      await refreshLibrary();
    } catch (e: any) {
      alert(e?.message || "Failed to delete lecture");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    refreshLibrary();
  }, []);

  const ready = useMemo(() => library.filter((l) => l.status === "Ready"), [library]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ready;
    return ready.filter((l) => (l.title || "").toLowerCase().includes(q));
  }, [ready, search]);

  const teacherCourses = filtered.filter((l) => l.creator === "teacher" && l.content_kind !== "document");
  const studentCourses = filtered.filter((l) => l.creator !== "teacher" && l.content_kind !== "document");

  const coverTone = (idx: number) =>
    ["tone0", "tone1", "tone2", "tone3", "tone4", "tone5"][idx % 6];

  function CourseSection({ title, items }: { title: string; items: Lecture[] }) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{title}</h2>
          <span className={styles.count}>{items.length}</span>
        </div>

        {items.length === 0 ? (
          <div className={styles.emptyCard}>No courses yet.</div>
        ) : (
          <div className={styles.grid}>
            {items.map((c, idx) => (
              <Link
                key={c.lecture_id}
                href={`/LectureLens/course/${c.lecture_id}?creator=${c.creator || "student"}`}
                className={styles.courseCard}
              >
                {c.creator !== "teacher" && (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteStudentLecture(c.lecture_id);
                    }}
                    disabled={deletingId === c.lecture_id}
                    aria-label="Delete lecture"
                    title="Delete lecture"
                  >
                    {deletingId === c.lecture_id ? "..." : "🗑"}
                  </button>
                )}

                <div className={`${styles.cover} ${styles[coverTone(idx)]}`}>
                  <span className={styles.topBadge}>
                    {c.creator === "teacher" ? "TEACHER" : "STUDENT"}
                  </span>
                  <div className={styles.centerGlyph}>{c.title?.[0]?.toUpperCase() || "L"}</div>
                </div>

                <div className={styles.body}>
                  <h3 title={c.title}>{c.title}</h3>
                  <p className={styles.sub}>Open course content</p>
                  <div className={styles.metaRow}>
                    <span>⏱ 45m</span>
                    <span>👁 120</span>
                    <span>💬 3</span>
                    <span className={styles.date}>Apr 20</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <header>
          <h1 className={styles.title}>Your courses.</h1>
          <p className={styles.subtitle}>
            Explore your lectures, practice with quizzes, and get personalized help from your AI tutor.
          </p>
        </header>

        <section className={styles.searchRow}>
          <input
            className={styles.searchInput}
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </section>

        <CourseSection title="Teacher content" items={teacherCourses} />
        <CourseSection title="Student content" items={studentCourses} />
      </main>
    </div>
  );
}