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
  status: "Uploaded" | "Audio Ready" | "Ready";
};

function Sidebar() {
  const pathname = usePathname();
  const isHome = pathname === "/LectureLens";

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
      </nav>
    </aside>
  );
}

export default function StudentHomePage() {
  const [library, setLibrary] = useState<Lecture[]>([]);
  const [search, setSearch] = useState("");

  async function refreshLibrary() {
    try {
      const teacherRes = await fetch("/api/teacher-lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load" }),
      }).then((r) => r.json());

      const teacherLib = (teacherRes?.ok ? teacherRes.library : []) || [];

      const normalizedTeachers: Lecture[] = teacherLib.map((x: any) => ({
        ...x,
        creator: "teacher",
      }));

      const mergedMap = new Map<string, Lecture>();
      normalizedTeachers.forEach((item) => {
        mergedMap.set(item.lecture_id, item);
      });

      setLibrary(Array.from(mergedMap.values()));
    } catch (e) {
      console.error("Failed to load library:", e);
      setLibrary([]);
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

  const teacherCourses = filtered.filter((l) => l.creator === "teacher");

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
                href={`/LectureLens/course/${c.lecture_id}?creator=${c.creator || "teacher"}`}
                className={styles.courseCard}
              >
                <div className={`${styles.cover} ${styles[coverTone(idx)]}`}>
                  <span className={styles.topBadge}>TEACHER</span>
                  <div className={styles.centerGlyph}>{c.title?.[0]?.toUpperCase() || "L"}</div>
                </div>

                <div className={styles.body}>
                  <h3 title={c.title}>{c.title}</h3>
                  <p className={styles.sub}>Open course content</p>
                  <div className={styles.metaRow}>
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
    <div className={`ll-theme ${styles.layout}`}>
      <Sidebar />
      <main className={styles.main}>
        <header>
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
      </main>
    </div>
  );
}