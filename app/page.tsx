"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import btnStyles from "./page.module.css";

function useTypewriter(text: string, startDelay = 0, speed = 40) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    setDisplayed("");
    setDone(false);
    const start = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(interval);
    }, startDelay);
    return () => clearTimeout(start);
  }, [text, startDelay, speed]);

  return { displayed, done };
}

// ─── Classroom backdrop (from activelearning page) ───────────────────────────
function ClassroomBackdrop() {
  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none", opacity: 0.07 }}
    >
      <rect x="0" y="0" width="1600" height="730" fill="#f1ead6" />
      <rect x="0" y="730" width="1600" height="170" fill="#e3d8bd" />
      <line x1="0" y1="730" x2="1600" y2="730" stroke="#6e5a47" strokeWidth="2" />
      <g>
        <rect x="90" y="180" width="190" height="280" rx="10" fill="#fbf6e6" stroke="#6e5a47" strokeWidth="4" />
        <line x1="185" y1="180" x2="185" y2="460" stroke="#6e5a47" strokeWidth="2.5" />
        <line x1="90" y1="320" x2="280" y2="320" stroke="#6e5a47" strokeWidth="2.5" />
        <rect x="98" y="188" width="80" height="124" fill="#fcf3d4" opacity=".7" />
        <rect x="192" y="188" width="80" height="124" fill="#fcf3d4" opacity=".7" />
      </g>
      <g>
        <rect x="1320" y="180" width="190" height="280" rx="10" fill="#fbf6e6" stroke="#6e5a47" strokeWidth="4" />
        <line x1="1415" y1="180" x2="1415" y2="460" stroke="#6e5a47" strokeWidth="2.5" />
        <line x1="1320" y1="320" x2="1510" y2="320" stroke="#6e5a47" strokeWidth="2.5" />
        <rect x="1328" y="188" width="80" height="124" fill="#fcf3d4" opacity=".7" />
        <rect x="1422" y="188" width="80" height="124" fill="#fcf3d4" opacity=".7" />
      </g>
      <g>
        <line x1="540" y1="0" x2="540" y2="90" stroke="#6e5a47" strokeWidth="2" />
        <path d="M510,90 Q540,130 570,90 Z" fill="#c2703d" />
        <ellipse cx="540" cy="138" rx="6" ry="3" fill="#e0a458" opacity=".6" />
      </g>
      <g>
        <line x1="1060" y1="0" x2="1060" y2="90" stroke="#6e5a47" strokeWidth="2" />
        <path d="M1030,90 Q1060,130 1090,90 Z" fill="#c2703d" />
        <ellipse cx="1060" cy="138" rx="6" ry="3" fill="#e0a458" opacity=".6" />
      </g>
      <rect x="340" y="610" width="56" height="84" fill="#6e5a47" />
      <ellipse cx="368" cy="606" rx="46" ry="10" fill="#6e5a47" />
      <ellipse cx="368" cy="560" rx="40" ry="56" fill="#4f7a5f" />
      <ellipse cx="338" cy="544" rx="20" ry="28" fill="#67987a" />
      <ellipse cx="398" cy="548" rx="18" ry="26" fill="#67987a" />
      <ellipse cx="368" cy="518" rx="16" ry="22" fill="#7fa48b" />
      <g>
        <rect x="1180" y="500" width="120" height="200" fill="#6e5a47" />
        <line x1="1180" y1="550" x2="1300" y2="550" stroke="#3a2e22" strokeWidth="2" />
        <line x1="1180" y1="620" x2="1300" y2="620" stroke="#3a2e22" strokeWidth="2" />
        <rect x="1190" y="510" width="14" height="38" fill="#4f7a5f" />
        <rect x="1206" y="510" width="14" height="38" fill="#c2703d" />
        <rect x="1222" y="514" width="14" height="34" fill="#6e5a47" />
        <rect x="1240" y="510" width="14" height="38" fill="#4f7a5f" />
        <rect x="1190" y="582" width="14" height="36" fill="#c2703d" />
        <rect x="1206" y="582" width="14" height="36" fill="#6e5a47" />
        <rect x="1222" y="584" width="14" height="34" fill="#4f7a5f" />
        <rect x="1240" y="582" width="14" height="36" fill="#c2703d" />
      </g>
      {[200, 540, 920, 1380].map((x) => (
        <g key={x}>
          <rect x={x} y="650" width="140" height="14" rx="2" fill="#6e5a47" />
          <rect x={x + 14} y="664" width="6" height="60" fill="#6e5a47" />
          <rect x={x + 120} y="664" width="6" height="60" fill="#6e5a47" />
          <rect x={x + 30} y="694" width="80" height="10" rx="2" fill="#6e5a47" />
          <rect x={x + 34} y="704" width="4" height="34" fill="#6e5a47" />
          <rect x={x + 102} y="704" width="4" height="34" fill="#6e5a47" />
        </g>
      ))}
      <rect x="220" y="644" width="36" height="6" rx="1" fill="#4f7a5f" />
      <rect x="560" y="644" width="36" height="6" rx="1" fill="#c2703d" />
      <rect x="940" y="644" width="36" height="6" rx="1" fill="#6e5a47" />
      <rect x="1400" y="644" width="36" height="6" rx="1" fill="#4f7a5f" />
    </svg>
  );
}

const ICONS = [
  { id: 0, lx: 8,  ty: 16, rotate: -18, bobDelay: "0s"    },
  { id: 1, lx: 84, ty: 10, rotate:  14, bobDelay: "0.9s"  },
  { id: 2, lx: 4,  ty: 54, rotate: -24, bobDelay: "1.3s"  },
  { id: 3, lx: 88, ty: 47, rotate:  20, bobDelay: "0.6s"  },
  { id: 4, lx: 13, ty: 80, rotate: -12, bobDelay: "1.6s"  },
  { id: 5, lx: 81, ty: 78, rotate:  26, bobDelay: "1.1s"  },
];

function FloatingIcons() {
  const [spread, setSpread] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSpread(true), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {ICONS.map(({ id, lx, ty, rotate, bobDelay }) => {
        const dx = spread ? 0 : 50 - lx;
        const dy = spread ? 0 : 50 - ty;
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              left: `${lx}%`,
              top: `${ty}%`,
              transform: `translate(${dx}vw, ${dy}vh) scale(${spread ? 1 : 0.15}) rotate(${rotate}deg)`,
              opacity: spread ? 1 : 0,
              transition: `transform 0.8s cubic-bezier(0.2, 0.8, 0.3, 1) ${id * 55}ms, opacity 0.5s ease ${id * 55}ms`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/question-mark.png"
              alt=""
              style={{
                width: 42,
                display: "block",
                opacity: 0.5,
                animation: spread ? `bob 3.8s ${bobDelay} ease-in-out infinite` : "none",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

const HEADING = "Dr Feynman";
const SUBHEADING = "Learn by Teaching";
const DESC =
  "An AI-powered platform that enhances the Feynman learning technique using LLMs, so you can explain clearly, find gaps, and build real understanding.";

export default function Home() {
  const h = useTypewriter(HEADING, 0, 30);
  const s = useTypewriter(SUBHEADING, HEADING.length * 30 + 60, 20);
  const d = useTypewriter(DESC, HEADING.length * 30 + SUBHEADING.length * 20 + 140, 18);

  return (
    <main className="ll-theme" style={styles.page}>
      <ClassroomBackdrop />
      <FloatingIcons />

      <div style={styles.content}>
        <h1 style={styles.heading}>
          {h.displayed}
          {!h.done && <span style={styles.cursor}>|</span>}
        </h1>
        <p style={styles.subheading}>
          {s.displayed}
          {h.done && !s.done && <span style={styles.cursor}>|</span>}
        </p>
        <p style={styles.description}>
          {d.displayed}
          {s.done && !d.done && <span style={styles.cursor}>|</span>}
        </p>

        <div style={styles.imageSection}>
          <Link href="/LectureLens?creator=student" className={`${btnStyles.btn} ${btnStyles.btnStudent}`}>
            <span>Student</span>
          </Link>

          <Image
            src="/feynman-pic.png"
            alt="Dr Feynman"
            width={420}
            height={520}
            style={styles.image}
            priority
          />

          <Link href="/teacher" className={`${btnStyles.btn} ${btnStyles.btnTeacher}`}>
            <span>Teacher</span>
          </Link>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    textAlign: "center",
    padding: "40px 24px 0",
    overflow: "hidden",
    position: "relative",
  },
  content: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    flex: 1,
    minHeight: 0,
  },
  heading: {
    margin: "0 0 10px",
    fontFamily: "var(--ll-serif)",
    fontSize: "clamp(44px, 7vw, 72px)",
    lineHeight: 1.05,
    letterSpacing: "-0.02em",
    color: "var(--ll-ink)",
    minHeight: "1.1em",
  },
  subheading: {
    margin: "0 0 12px",
    fontFamily: "var(--ll-serif)",
    fontSize: "clamp(16px, 2.5vw, 22px)",
    color: "var(--ll-ink-soft)",
    fontWeight: 400,
    minHeight: "1.4em",
  },
  description: {
    margin: "0 0 32px",
    fontFamily: "var(--ll-sans)",
    fontSize: "clamp(13px, 1.6vw, 15px)",
    color: "var(--ll-muted)",
    lineHeight: 1.7,
    maxWidth: 460,
    minHeight: "5em",
  },
  cursor: {
    display: "inline-block",
    marginLeft: 2,
    animation: "blink 0.8s step-start infinite",
    color: "var(--ll-clay)",
  },
  imageSection: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 40,
    width: "100%",
    maxWidth: 860,
    flex: 1,
    minHeight: 0,
  },
  image: {
    display: "block",
    objectFit: "contain",
    objectPosition: "bottom",
    height: "100%",
    width: "auto",
    flexShrink: 0,
    alignSelf: "flex-end",
  },
};
