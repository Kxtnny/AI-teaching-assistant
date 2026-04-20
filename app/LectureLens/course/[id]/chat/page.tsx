"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { useMemo, useState } from "react";
import styles from "./page.module.css";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const lectureId = params.id;
  const creator = (searchParams.get("creator") === "teacher" ? "teacher" : "student") as
    | "teacher"
    | "student";

  const apiBase = useMemo(
    () => (creator === "teacher" ? "/api/teacher-lecture" : "/api/lecture"),
    [creator]
  );

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput("");

    const next = [...messages, { role: "user", content: q } as Msg];
    setMessages(next);
    setLoading(true);

    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "chat", lectureId, question: q, history: next }),
    }).then((r) => r.json());

    setLoading(false);

    if (!res?.ok) {
      setMessages((p) => [...p, { role: "assistant", content: `Error: ${res?.error || "Chat failed"}` }]);
      return;
    }

    setMessages((p) => [...p, { role: "assistant", content: res.reply || "No reply" }]);
  }

  return (
    <div className={styles.page}>
      <Link href={`/LectureLens/course/${lectureId}?creator=${creator}`} className={styles.back}>
        ← Back to course
      </Link>

      <h1 className={styles.title}>Ask the Tutor</h1>

      <div className={styles.chatBox}>
        {messages.map((m, i) => (
          <div key={i} className={`${styles.msg} ${m.role === "user" ? styles.user : styles.assistant}`}>
            <b>{m.role === "user" ? "You" : "Tutor"}:</b> {m.content}
          </div>
        ))}
      </div>

      <div className={styles.row}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this lecture..."
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className={styles.button} onClick={send} disabled={loading}>
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}