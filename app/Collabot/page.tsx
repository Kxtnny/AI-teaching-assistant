"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Msg {
  id: string;
  role: "student" | "facilitator";
  username: string;
  content: string;
  timestamp: number;
}

type SessionPhase = "waiting" | "discussion_3min" | "adaptive_questions" | "personal_feedback";

interface SessionState {
  phase: SessionPhase;
  topic: string;
  students: string[];
  roomId: string | null;
  language: string;
  discussionEndsAt: number | null;
  privateFeedbackReady?: boolean;
}

interface TopicItem {
  topic: string;
  openSeats: boolean;
  activeRooms: number;
  totalStudents: number;
  nextRoomCount: number;
  maxPerRoom: number;
}

const COLORS = ["#3c9eff", "#ff445d", "#f8d248", "#5bcca0", "#e06ff8", "#ff8c42", "#36d6c5"];
const LANGS = ["English", "Bahasa Melayu", "中文", "தமிழ்", "Español"];

const color = (name: string) => {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
};

const PHASE_CONFIG: Record<SessionPhase, { label: string; emoji: string; colour: string }> = {
  waiting: { label: "Waiting for 2 students to start", emoji: "⏳", colour: "#9ca3af" },
  discussion_3min: { label: "3-minute peer discussion", emoji: "🗣️", colour: "#10b981" },
  adaptive_questions: { label: "Adaptive questioning", emoji: "🧠", colour: "#3b82f6" },
  personal_feedback: { label: "Personalized feedback", emoji: "🎯", colour: "#8b5cf6" },
};

type SpeechRec = (typeof window extends any ? any : never) & {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  start: () => void;
  stop: () => void;
};

export default function CollabotPage() {
  const [username, setUsername] = useState("");
  const [language, setLanguage] = useState("English");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [joined, setJoined] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [session, setSession] = useState<SessionState>({
    phase: "waiting",
    topic: "",
    students: [],
    roomId: null,
    language: "English",
    discussionEndsAt: null,
    privateFeedbackReady: false,
  });

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [listening, setListening] = useState(false);

  const [myFeedbackOpen, setMyFeedbackOpen] = useState(false);
  const [myFeedback, setMyFeedback] = useState("");
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  const bottom = useRef<HTMLDivElement>(null);
  const es = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recRef = useRef<SpeechRec | null>(null);

  const fetchTopics = useCallback(async () => {
    const r = await fetch("/api/collabchat?topics=1");
    const data = await r.json();
    setTopics(data.topics || []);
  }, []);

  const fetchSession = useCallback(async () => {
    if (!username.trim()) return;
    const r = await fetch(`/api/collabchat?session=1&username=${encodeURIComponent(username)}`);
    const data = await r.json();
    setSession(data);
  }, [username]);

  const fetchHistory = useCallback(async () => {
    if (!username.trim()) return;
    const r = await fetch(`/api/collabchat?history=1&username=${encodeURIComponent(username)}`);
    const data = await r.json();
    setMessages(data.messages || []);
  }, [username]);

  useEffect(() => {
    fetchTopics().catch(() => {});
  }, [fetchTopics]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(
    () => () => {
      es.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
      recRef.current?.stop?.();
    },
    []
  );

  useEffect(() => {
    if (!joined) return;
    const poll = async () => {
      try {
        await fetchSession();
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [joined, fetchSession]);

  useEffect(() => {
    if (!session.discussionEndsAt || session.phase !== "discussion_3min") {
      setSecondsLeft(null);
      return;
    }
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((session.discussionEndsAt! - Date.now()) / 1000));
      setSecondsLeft(left);
    }, 1000);
    return () => clearInterval(t);
  }, [session.discussionEndsAt, session.phase]);

  const connectStream = useCallback(() => {
    if (!username.trim()) return;
    es.current?.close();
    const source = new EventSource(`/api/collabchat?stream=1&username=${encodeURIComponent(username)}`);
    source.onmessage = (e) => {
      const msg: Msg = JSON.parse(e.data);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    es.current = source;
  }, [username]);

  const join = useCallback(async () => {
    if (!username.trim() || !selectedTopic) return;

    const res = await fetch("/api/collabchat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join_room", username: username.trim(), topic: selectedTopic, language }),
    });
    const data = await res.json();
    if (!data?.ok) return;

    await fetchHistory();
    await fetchSession();
    connectStream();
    setJoined(true);
  }, [username, selectedTopic, language, fetchHistory, fetchSession, connectStream]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    await fetch("/api/collabchat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), content: input.trim() }),
    });
    setInput("");
    setSending(false);
  };

  const resetRoom = async () => {
    await fetch("/api/collabchat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_room", username: username.trim() }),
    });
    setMessages([]);
    setMyFeedback("");
    setMyFeedbackOpen(false);
    await fetchSession();
    await fetchTopics();
  };

  const viewMyFeedback = async () => {
    setLoadingFeedback(true);
    try {
      const r = await fetch(`/api/collabchat?my_feedback=1&username=${encodeURIComponent(username)}`);
      const d = await r.json();
      setMyFeedback(d.feedback || "No feedback found yet.");
      setMyFeedbackOpen(true);
    } finally {
      setLoadingFeedback(false);
    }
  };

  const toggleVoice = () => {
    if (typeof window === "undefined") return;
    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }

    const rec: SpeechRec = new SR();
    rec.lang =
      language === "Bahasa Melayu"
        ? "ms-MY"
        : language === "中文"
        ? "zh-CN"
        : language === "தமிழ்"
        ? "ta-MY"
        : language === "Español"
        ? "es-ES"
        : "en-US";
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (event: any) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) finalText += event.results[i][0].transcript;
      setInput((prev) => (prev ? `${prev} ${finalText}` : finalText));
    };

    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  if (!joined) {
    return (
      <div style={S.joinWrap}>
        <div style={S.joinCard}>
          <Link href="/" style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', border: '1px solid rgba(15, 23, 42, 0.08)', cursor: 'pointer', transition: 'all 180ms ease', textDecoration: 'none', color: '#1f2937', marginBottom: '12px'}} onMouseEnter={(e) => {e.currentTarget.style.background = 'rgba(15, 23, 42, 0.12)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.08)';}} onMouseLeave={(e) => {e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'; e.currentTarget.style.boxShadow = 'none';}}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 style={{ margin: "0.4rem 0 0.2rem" }}>Dr. Feynman’s Collaborative Room</h1>
          <p style={{ color: "#6b7280", marginBottom: 14 }}>
            Pick your topic and join a room (max 3 students per room). Room starts when 2 students join.
          </p>

          <div style={{ display: "grid", gap: 8 }}>
            <input
              style={S.joinInput}
              placeholder="Enter your name…"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
            />

            <select style={S.joinInput} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>

            <div style={{ marginTop: 6, textAlign: "left" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Choose a topic:</div>
              <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                {topics.map((t) => (
                  <button
                    key={t.topic}
                    onClick={() => setSelectedTopic(t.topic)}
                    style={{
                      ...S.topicBtn,
                      borderColor: selectedTopic === t.topic ? "#3b82f6" : "#e5e7eb",
                      background: selectedTopic === t.topic ? "#eff6ff" : "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 700, textAlign: "left" }}>{t.topic}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", textAlign: "left", marginTop: 2 }}>
                      Next room occupancy: {t.nextRoomCount}/3 • Active rooms: {t.activeRooms} • Total students: {t.totalStudents}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button
              style={{ ...S.btn, opacity: username.trim() && selectedTopic ? 1 : 0.45, marginTop: 6 }}
              disabled={!username.trim() || !selectedTopic}
              onClick={join}
            >
              Join Topic Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  const phaseInfo = PHASE_CONFIG[session.phase] ?? PHASE_CONFIG.waiting;

  return (
    <div style={S.container}>
      <header style={S.header}>
        <Link href="/" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', border: '1px solid rgba(15, 23, 42, 0.08)', cursor: 'pointer', transition: 'all 180ms ease', textDecoration: 'none', color: '#1f2937'}} onMouseEnter={(e) => {e.currentTarget.style.background = 'rgba(15, 23, 42, 0.12)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.08)';}} onMouseLeave={(e) => {e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'; e.currentTarget.style.boxShadow = 'none';}}>
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div style={S.headerIcon}>🎓</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900 }}>Dr. Feynman’s Classroom</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {session.topic} • Room: {session.roomId} • {session.language}
          </div>
        </div>

        {session.privateFeedbackReady && (
          <button onClick={viewMyFeedback} style={S.feedbackBtn} disabled={loadingFeedback}>
            {loadingFeedback ? "Loading..." : "📄 View My Feedback"}
          </button>
        )}

        <div style={S.badge}>
          <span style={{ ...S.dot, background: color(username) }} />
          {username}
        </div>
      </header>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "8px 14px",
          borderBottom: `2px solid ${phaseInfo.colour}`,
          background: `${phaseInfo.colour}12`,
          flexWrap: "wrap",
        }}
      >
        <span>{phaseInfo.emoji}</span>
        <strong style={{ color: phaseInfo.colour }}>{phaseInfo.label}</strong>
        {secondsLeft !== null && <span style={{ marginLeft: 8, fontWeight: 700, color: "#065f46" }}>⏱️ {secondsLeft}s left</span>}
        <button onClick={resetRoom} style={{ ...S.controlBtn, marginLeft: "auto", background: "#fee2e2", color: "#dc2626" }}>
          ↻ Reset Room
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" }}>
        <span style={{ color: "#9ca3af", fontSize: 12, fontWeight: 700 }}>Online:</span>
        {session.students.map((s) => (
          <span
            key={s}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              borderRadius: 999,
              border: `1px solid ${color(s)}`,
              color: color(s),
              padding: "2px 8px",
              fontSize: 12,
              fontWeight: 700,
              background: s === username ? `${color(s)}22` : "#fff",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color(s) }} />
            {s}
            {s === username ? " (you)" : ""}
          </span>
        ))}
      </div>

      <div style={S.messages}>
        {messages.map((m) => {
          const me = m.role === "student" && m.username === username;
          const fac = m.role === "facilitator";
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                gap: 8,
                alignSelf: fac ? "center" : me ? "flex-end" : "flex-start",
                flexDirection: me ? "row-reverse" : "row",
                maxWidth: fac ? "92%" : "78%",
              }}
            >
              <div
                style={{
                  ...S.avatar,
                  ...(fac ? { background: "#fff0f1", border: "2px solid #ff445d" } : { background: color(m.username) }),
                }}
              >
                {fac ? "🎓" : <span style={{ color: "#fff", fontWeight: 900 }}>{m.username[0].toUpperCase()}</span>}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: fac ? "#ff445d" : color(m.username) }}>
                  {m.username} ·{" "}
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                    ...(fac
                      ? { border: "2px solid #ff445d", background: "linear-gradient(135deg,#fff5f5,#fff9e6)" }
                      : me
                      ? { border: "1px solid #e5e7eb", background: "#fff", borderBottomRightRadius: 4 }
                      : { border: "1px solid #e5e7eb", background: "#fff", borderBottomLeftRadius: 4 }),
                  }}
                >
                  {fac && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 900,
                        background: "#ff445d",
                        color: "#fff",
                        padding: "2px 6px",
                        borderRadius: 999,
                        marginRight: 6,
                      }}
                    >
                      FACILITATOR
                    </span>
                  )}
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} style={S.inputBar}>
        <button
          type="button"
          onClick={toggleVoice}
          style={{
            ...S.voiceBtn,
            background: listening ? "#fee2e2" : "#ecfeff",
            color: listening ? "#b91c1c" : "#0e7490",
          }}
          title="Voice to text"
        >
          {listening ? "⏹️" : "🎙️"}
        </button>

        <input
          style={S.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={session.phase === "personal_feedback" ? "Feedback is ready. Click View My Feedback." : "Type your message…"}
          disabled={sending}
        />

        <button style={{ ...S.sendBtn, opacity: input.trim() && !sending ? 1 : 0.5 }} disabled={!input.trim() || sending}>
          ➤
        </button>
      </form>

      {myFeedbackOpen && (
        <div style={S.modalBackdrop} onClick={() => setMyFeedbackOpen(false)}>
          <div style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Your Personalized Feedback</div>
            <div style={S.modalBody}>{myFeedback || "No feedback available."}</div>
            <button style={S.modalClose} onClick={() => setMyFeedbackOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  joinWrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f6f7ff",
    fontFamily: "system-ui, sans-serif",
    padding: 16,
  },
  joinCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    width: "min(680px, 100%)",
    padding: "20px 18px",
    boxShadow: "0 10px 24px rgba(15,23,42,.08)",
  },
  joinInput: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1.5px solid #d1d5db",
    fontSize: 14,
    outline: "none",
    background: "#fff",
  },
  topicBtn: {
    border: "1.5px solid #e5e7eb",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
  },
  btn: {
    border: "none",
    borderRadius: 12,
    padding: "10px 12px",
    color: "#fff",
    fontWeight: 800,
    background: "#6b7280",
    cursor: "pointer",
  },
  feedbackBtn: {
    border: "1px solid #8b5cf6",
    background: "#f5f3ff",
    color: "#6d28d9",
    borderRadius: 10,
    padding: "6px 10px",
    fontWeight: 800,
    cursor: "pointer",
    marginRight: 8,
  },
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "#f8fafc",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    padding: "10px 14px",
  },
  headerIcon: {
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    borderRadius: 10,
    background: "linear-gradient(135deg,#ff445d,#f8d248)",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    background: "#f3f4f6",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
  },
  dot: { width: 8, height: 8, borderRadius: "50%" },
  messages: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  inputBar: {
    display: "flex",
    gap: 8,
    borderTop: "1px solid #e5e7eb",
    background: "#fff",
    padding: "10px 12px",
  },
  input: {
    flex: 1,
    border: "1.5px solid #d1d5db",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg,#ff445d,#f8d248)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  voiceBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    border: "1px solid #bae6fd",
    fontWeight: 900,
    cursor: "pointer",
  },
  controlBtn: {
    border: "none",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "center",
    zIndex: 2000,
  },
  modalCard: {
    width: "min(680px, 92vw)",
    maxHeight: "78vh",
    overflowY: "auto",
    background: "#fff",
    borderRadius: 16,
    border: "1px solid #e5e7eb",
    boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
    padding: 16,
  },
  modalTitle: {
    fontWeight: 900,
    fontSize: 18,
    marginBottom: 8,
    color: "#4c1d95",
  },
  modalBody: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    color: "#1f2937",
    fontSize: 14,
  },
  modalClose: {
    marginTop: 12,
    border: "none",
    borderRadius: 10,
    padding: "8px 12px",
    fontWeight: 800,
    cursor: "pointer",
    background: "#ede9fe",
    color: "#5b21b6",
  },
};