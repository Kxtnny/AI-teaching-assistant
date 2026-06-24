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
    <main style={styles.page}>
      <FloatingIcons />
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
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    background: "#f6f4f1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    textAlign: "center",
    padding: "40px 24px 0",
    overflow: "hidden",
    position: "relative",
    zIndex: 1,
  },
  heading: {
    margin: "0 0 10px",
    fontFamily: "Georgia, serif",
    fontSize: "clamp(44px, 7vw, 72px)",
    lineHeight: 1.05,
    letterSpacing: "-0.02em",
    color: "#151515",
    minHeight: "1.1em",
  },
  subheading: {
    margin: "0 0 12px",
    fontFamily: "Georgia, serif",
    fontSize: "clamp(16px, 2.5vw, 22px)",
    color: "#4c4741",
    fontWeight: 400,
    minHeight: "1.4em",
  },
  description: {
    margin: "0 0 32px",
    fontFamily: "system-ui, sans-serif",
    fontSize: "clamp(13px, 1.6vw, 15px)",
    color: "#6a635a",
    lineHeight: 1.7,
    maxWidth: 460,
    minHeight: "5em",
  },
  cursor: {
    display: "inline-block",
    marginLeft: 2,
    animation: "blink 0.8s step-start infinite",
    color: "#151515",
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
