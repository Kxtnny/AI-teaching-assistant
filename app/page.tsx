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

const HEADING = "Dr Feynman";
const SUBHEADING = "Learn by Teaching with AI";
const DESC =
  "An AI-powered platform that enhances the Feynman learning technique using LLMs—so you can explain clearly, find gaps, and build real understanding.";

export default function Home() {
  const h = useTypewriter(HEADING, 0, 60);
  const s = useTypewriter(SUBHEADING, HEADING.length * 60 + 120, 40);
  const d = useTypewriter(DESC, HEADING.length * 60 + SUBHEADING.length * 40 + 280, 18);

  return (
    <main style={styles.page}>
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
