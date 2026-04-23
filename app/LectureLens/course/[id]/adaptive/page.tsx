"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { User, Bot, Send, ArrowLeft } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type ToneKey = "playful" | "guided" | "accurate";

const LS_MODE_KEY = "drf_selected_mode";

const TONE_CONFIG: Record<ToneKey, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  playful: { label: "Playful", emoji: "🎉", color: "#d97706", bg: "#fef3c7", border: "#fcd34d" },
  guided: { label: "Guided", emoji: "🧭", color: "#16a34a", bg: "#dcfce7", border: "#86efac" },
  accurate: { label: "Accurate", emoji: "🎯", color: "#2563eb", bg: "#dbeafe", border: "#93c5fd" },
};

export default function AdaptiveAgentPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const lectureId = params?.id ?? "";
  const creator = searchParams.get("creator") === "teacher" ? "teacher" : "student";

  const [selectedMode, setSelectedMode] = useState<ToneKey>("guided");
  const modeRef = useRef(selectedMode);
  modeRef.current = selectedMode;

  const [uiError, setUiError] = useState("");
  const [input, setInput] = useState("");

  const pendingModeRef = useRef<ToneKey>("guided");
  const [messageModes, setMessageModes] = useState<Map<string, ToneKey>>(new Map());

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/adaptivelearning",
        body: () => ({
          mode: modeRef.current,
          lectureId,
          creator,
        }),
      })
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    onError: (e) => {
      console.error("useChat error:", e);
      setUiError("Adaptive agent failed. Check server logs.");
    },
  });

  useEffect(() => {
    const savedMode = (localStorage.getItem(LS_MODE_KEY) as ToneKey | null) || "guided";
    setSelectedMode(savedMode);
  }, []);

  useEffect(() => localStorage.setItem(LS_MODE_KEY, selectedMode), [selectedMode]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      setMessageModes((prev) => {
        if (prev.has(last.id)) return prev;
        const next = new Map(prev);
        next.set(last.id, pendingModeRef.current);
        return next;
      });
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUiError("");
    if (!input.trim()) return;

    pendingModeRef.current = selectedMode;
    sendMessage({ text: input.trim() });
    setInput("");
  };

  return (
    <div className={styles.chatPage}>
      <nav className={styles.navbar}>
        <div className={styles.navLeft}>
          <Link href={`/LectureLens/course/${lectureId}?creator=${creator}`} className={styles.iconBtn}>
            <ArrowLeft size={16} />
          </Link>
          <h1 className={styles.brand}>Adaptive Agent</h1>
        </div>

        <div className={styles.navRight}>
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as ToneKey)}
            className={styles.modeSelect}
            style={{
              borderColor: TONE_CONFIG[selectedMode].border,
              background: TONE_CONFIG[selectedMode].bg,
              color: TONE_CONFIG[selectedMode].color,
            }}
          >
            {(Object.keys(TONE_CONFIG) as ToneKey[]).map((key) => (
              <option key={key} value={key}>
                {TONE_CONFIG[key].emoji} {TONE_CONFIG[key].label}
              </option>
            ))}
          </select>

        </div>
      </nav>

      {uiError && <div className={styles.errorStrip}>{uiError}</div>}

      <div className={styles.messagesWrap}>
        <div className={styles.messages}>
          {messages.map((m) => (
            <div key={m.id} className={`${styles.row} ${m.role === "user" ? styles.rowUser : styles.rowBot}`}>
              <div className={styles.avatar}>
                {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
              </div>

              <div className={`${styles.bubble} ${m.role === "user" ? styles.userBubble : styles.botBubble}`}>
                {m.role === "assistant" && (
                  <span className={styles.modeTag}>
                    {TONE_CONFIG[messageModes.get(m.id) ?? selectedMode].emoji}{" "}
                    {TONE_CONFIG[messageModes.get(m.id) ?? selectedMode].label}
                  </span>
                )}
                {m.parts.map((p, i) =>
                  p.type === "text" ? (
                    <div key={i} className={styles.text}>
                      {p.text}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.formBar}>
        <input
          className={styles.formInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Adaptive Agent..."
        />
        <button className={styles.sendBtn} disabled={status !== "ready"}>
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}