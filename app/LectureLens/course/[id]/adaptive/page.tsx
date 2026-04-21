"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { User, Bot, Send, ArrowLeft, LogOut } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type ToneKey = "playful" | "guided" | "accurate";

const LS_NAME_KEY = "drf_student_name";
const LS_JOINED_KEY = "drf_joined";
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

  const [studentName, setStudentName] = useState("");
  const [joined, setJoined] = useState(false);
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
          studentName: studentName || undefined,
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
    const savedName = localStorage.getItem(LS_NAME_KEY) || "";
    const savedJoined = localStorage.getItem(LS_JOINED_KEY) === "1";
    const savedMode = (localStorage.getItem(LS_MODE_KEY) as ToneKey | null) || "guided";
    setStudentName(savedName);
    setJoined(savedJoined);
    setSelectedMode(savedMode);
  }, []);

  useEffect(() => localStorage.setItem(LS_NAME_KEY, studentName), [studentName]);
  useEffect(() => localStorage.setItem(LS_JOINED_KEY, joined ? "1" : "0"), [joined]);
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

  const handleJoin = () => {
    setUiError("");
    if (!studentName.trim()) return setUiError("Please enter your name.");
    setJoined(true);
  };

  const leaveRoom = () => setJoined(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUiError("");
    if (!input.trim()) return;

    pendingModeRef.current = selectedMode;
    sendMessage({ text: input.trim() });
    setInput("");
  };

  if (!joined) {
    return (
      <div className={styles.joinPage}>
        <div className={styles.joinCard}>
          <Link href={`/LectureLens/course/${lectureId}?creator=${creator}`} className={styles.backText}>
            ← Back
          </Link>
          <h1 className={styles.joinTitle}>Adaptive Agent</h1>
          <p className={styles.joinSubtitle}>Join this lecture’s adaptive tutoring room.</p>

          <input
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Enter your name..."
            className={styles.input}
          />

          {uiError && <p className={styles.error}>{uiError}</p>}

          <button onClick={handleJoin} className={styles.joinBtn}>
            Join Adaptive Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chatPage}>
      <nav className={styles.navbar}>
        <div className={styles.navLeft}>
          <Link href={`/LectureLens/course/${lectureId}?creator=${creator}`} className={styles.iconBtn}>
            <ArrowLeft size={16} />
          </Link>
          <h1 className={styles.brand}>Adaptive Agent • {studentName}</h1>
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

          <button onClick={leaveRoom} className={styles.leaveBtn}>
            <LogOut size={14} />
            Leave
          </button>
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