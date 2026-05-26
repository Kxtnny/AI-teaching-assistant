"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  treeScore?: number;
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

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const PHASE_CONFIG: Record<SessionPhase, { label: string; emoji: string; colour: string }> = {
  waiting: { label: "Waiting for 2 students to start", emoji: "⏳", colour: "#9ca3af" },
  discussion_3min: { label: "3-minute peer discussion", emoji: "🗣️", colour: "#10b981" },
  adaptive_questions: { label: "Adaptive questioning", emoji: "🧠", colour: "#3b82f6" },
  personal_feedback: { label: "Personalized feedback", emoji: "🎯", colour: "#8b5cf6" },
};

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const mergeMessages = (prev: Msg[], incoming: Msg[]) => {
  const map = new Map<string, Msg>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
};

type Pulse = "none" | "good" | "bad" | "milestone";

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
    treeScore: 0,
  });

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [listening, setListening] = useState(false);

  const [myFeedbackOpen, setMyFeedbackOpen] = useState(false);
  const [myFeedback, setMyFeedback] = useState("");
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [error, setError] = useState("");

  const [treePulse, setTreePulse] = useState<Pulse>("none");
  const lastScoreRef = useRef(0);
  const lastMilestoneRef = useRef(0);

  const bottom = useRef<HTMLDivElement>(null);
  const es = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recRef = useRef<SpeechRec | null>(null);

  const treeScore = session.treeScore ?? 0;

  useEffect(() => {
    const prev = lastScoreRef.current;
    const cur = treeScore;
    if (cur === prev) return;

    const delta = cur - prev;
    lastScoreRef.current = cur;

    const prevM = lastMilestoneRef.current;
    const nextM = Math.floor(cur / 25) * 25;
    if (nextM > prevM) {
      lastMilestoneRef.current = nextM;
      setTreePulse("milestone");
      const t = setTimeout(() => setTreePulse("none"), 650);
      return () => clearTimeout(t);
    }

    setTreePulse(delta > 0 ? "good" : "bad");
    const t = setTimeout(() => setTreePulse("none"), 420);
    return () => clearTimeout(t);
  }, [treeScore]);

  const fetchTopics = useCallback(async () => {
    const r = await fetch("/api/collabchat?topics=1", { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Failed to load topics");
    setTopics(data.topics || []);
  }, []);

  const fetchSession = useCallback(async () => {
    if (!username.trim()) return;
    const r = await fetch(`/api/collabchat?session=1&username=${encodeURIComponent(username.trim())}`, {
      cache: "no-store",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Failed to load session");
    setSession((prev) => ({ ...prev, ...data }));
  }, [username]);

  const fetchHistory = useCallback(async () => {
    if (!username.trim()) return;
    const r = await fetch(`/api/collabchat?history=1&username=${encodeURIComponent(username.trim())}`, {
      cache: "no-store",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Failed to load history");
    setMessages((prev) => mergeMessages(prev, data.messages || []));
    if (typeof data.treeScore === "number") {
      setSession((s) => ({ ...s, treeScore: data.treeScore }));
    }
  }, [username]);

  useEffect(() => {
    fetchTopics().catch((e: any) => setError(e?.message || "Failed to load topics"));
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
        await Promise.all([fetchSession(), fetchHistory()]);
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [joined, fetchSession, fetchHistory]);

  useEffect(() => {
    const discussionEndsAt = session.discussionEndsAt;
    if (!discussionEndsAt || session.phase !== "discussion_3min") {
      setSecondsLeft(null);
      return;
    }
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((discussionEndsAt - Date.now()) / 1000));
      setSecondsLeft(left);
    }, 1000);
    return () => clearInterval(t);
  }, [session.discussionEndsAt, session.phase]);

  const connectStream = useCallback(() => {
    if (!username.trim()) return;
    es.current?.close();

    const source = new EventSource(`/api/collabchat?stream=1&username=${encodeURIComponent(username.trim())}`);
    source.onmessage = (e) => {
      try {
        const msg: Msg = JSON.parse(e.data);
        setMessages((prev) => mergeMessages(prev, [msg]));
      } catch {}
    };
    source.onerror = () => source.close();
    es.current = source;
  }, [username]);

  const join = useCallback(async () => {
    setError("");
    if (!username.trim() || !selectedTopic) return;

    try {
      const res = await fetch("/api/collabchat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join_room", username: username.trim(), topic: selectedTopic, language }),
      });

      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "Join failed");

      setSession((s) => ({ ...s, ...data, treeScore: typeof data.treeScore === "number" ? data.treeScore : 0 }));
      await Promise.all([fetchHistory(), fetchSession()]);
      connectStream();
      setJoined(true);
    } catch (e: any) {
      setError(e?.message || "Join failed");
    }
  }, [username, selectedTopic, language, fetchHistory, fetchSession, connectStream]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) return setError("Enter your name first.");
    if (!input.trim() || sending) return;
    if (session.phase === "personal_feedback") return;

    setSending(true);
    try {
      const r = await fetch("/api/collabchat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), content: input.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Send failed");
      if (typeof data.treeScore === "number") {
        setSession((s) => ({ ...s, treeScore: data.treeScore }));
      }
      setInput("");
    } catch (e: any) {
      setError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const resetRoom = async () => {
    setError("");
    if (!username.trim()) return setError("Enter your name first.");

    try {
      const r = await fetch("/api/collabchat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_room", username: username.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Reset failed");

      setMessages([]);
      setMyFeedback("");
      setMyFeedbackOpen(false);
      setSession((s) => ({ ...s, treeScore: 0 }));
      await Promise.all([fetchSession(), fetchTopics()]);
    } catch (e: any) {
      setError(e?.message || "Reset failed");
    }
  };

  const viewMyFeedback = async () => {
    setError("");
    if (!username.trim()) return setError("Enter your name first.");

    setLoadingFeedback(true);
    try {
      const r = await fetch(`/api/collabchat?my_feedback=1&username=${encodeURIComponent(username.trim())}`, {
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Failed to load feedback");
      setMyFeedback(d.feedback || "No feedback found yet.");
      setMyFeedbackOpen(true);
    } catch (e: any) {
      setError(e?.message || "Failed to load feedback");
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
    rec.onend = () => setListening(false);
    rec.start();

    recRef.current = rec;
    setListening(true);
  };

  if (!joined) {
    return (
      <div style={S.joinWrap}>
        <div style={S.joinCard}>
          {error ? <div style={S.errorBanner}>{error}</div> : null}
          <Link href="/" style={S.backBtn as React.CSSProperties}>
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
      {error ? <div style={S.errorBanner}>{error}</div> : null}

      <header style={S.header}>
        <Link href="/" style={S.backBtn as React.CSSProperties}>
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

      <div style={S.main}>
        {/* CHAT ON LEFT */}
        <section style={S.chatPanel}>
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
                      {m.username} · {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
              disabled={sending || session.phase === "personal_feedback"}
            />

            <button
              style={{ ...S.sendBtn, opacity: input.trim() && !sending && session.phase !== "personal_feedback" ? 1 : 0.5 }}
              disabled={!input.trim() || sending || session.phase === "personal_feedback"}
            >
              ➤
            </button>
          </form>
        </section>

        {/* TREE ON RIGHT */}
        <aside style={S.treePanel}>
          <div style={S.treeHead}>
            <strong>🌳 Collaboration Tree</strong>
            <span style={S.score}>Score {treeScore}/100</span>
          </div>
          <TreeWidget score={treeScore} pulse={treePulse} />
          <div style={S.treeLegend}>Grow from seed → sprout → sapling → fruit tree as collaboration quality improves.</div>
        </aside>
      </div>

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

function TreeWidget({ score, pulse }: { score: number; pulse: Pulse }) {
  const growth = clamp(score / 100, 0, 1);
  const stage = Math.floor(clamp(score, 0, 100) / 20); // 0..5

  const trunkH = 20 + growth * 150;
  const trunkW = 6 + growth * 14;
  const canopyBaseY = 430 - trunkH - 32;
  const canopyR = 20 + growth * 75;

  const showSprout = stage === 1; // only stage 1
  const showSapling = stage >= 2;
  const showBranches = stage >= 3;
  const showFullCanopy = stage >= 4;
  const showFruit = stage >= 5;

  const foliage = [
    { x: 210, y: canopyBaseY, r: canopyR * 0.95, shade: "#4ea83c" },
    { x: 170, y: canopyBaseY + 18, r: canopyR * 0.72, shade: "#3f8f32" },
    { x: 250, y: canopyBaseY + 20, r: canopyR * 0.7, shade: "#3b8730" },
    { x: 210, y: canopyBaseY - 36, r: canopyR * 0.66, shade: "#4aa23a" },
    { x: 185, y: canopyBaseY - 12, r: canopyR * 0.54, shade: "#56b145" },
    { x: 236, y: canopyBaseY - 10, r: canopyR * 0.52, shade: "#55ae44" },
  ];

  const fruitPts = [
    { x: 190, y: canopyBaseY - 6 },
    { x: 206, y: canopyBaseY + 10 },
    { x: 223, y: canopyBaseY + 2 },
    { x: 177, y: canopyBaseY + 22 },
    { x: 244, y: canopyBaseY + 24 },
    { x: 210, y: canopyBaseY - 20 },
    { x: 196, y: canopyBaseY - 30 },
    { x: 228, y: canopyBaseY - 27 },
    { x: 166, y: canopyBaseY + 2 },
    { x: 254, y: canopyBaseY + 5 },
  ];

  const pulseAnim =
    pulse === "milestone"
      ? { scale: [1, 1.03, 1], transition: { duration: 0.45 } }
      : pulse === "good"
      ? { scale: [1, 1.015, 1], transition: { duration: 0.3 } }
      : pulse === "bad"
      ? { x: [0, -2, 2, -1, 1, 0], transition: { duration: 0.25 } }
      : {};

  return (
    <motion.div
      animate={pulseAnim}
      style={{
        height: 560,
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid #dbeafe",
        background: "#dff2ff",
      }}
      aria-label="Tree growth visualization"
    >
      <svg viewBox="0 0 420 560" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="skyDay2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bfe4ff" />
            <stop offset="100%" stopColor="#eef9ff" />
          </linearGradient>
          <radialGradient id="sunGlow2" cx="0.12" cy="0.12" r="0.3">
            <stop offset="0%" stopColor="rgba(255,240,165,.9)" />
            <stop offset="100%" stopColor="rgba(255,240,165,0)" />
          </radialGradient>
          <linearGradient id="grass2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8bd17d" />
            <stop offset="100%" stopColor="#4ea65c" />
          </linearGradient>
          <linearGradient id="trunk2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a96c3d" />
            <stop offset="100%" stopColor="#6d4326" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="420" height="560" fill="url(#skyDay2)" />
        <circle cx="72" cy="70" r="36" fill="#ffd24d" />
        <circle cx="72" cy="70" r="110" fill="url(#sunGlow2)" />

        <g opacity={0.75}>
          <ellipse cx="322" cy="88" rx="36" ry="15" fill="#fff" />
          <ellipse cx="348" cy="91" rx="26" ry="12" fill="#fff" />
          <ellipse cx="298" cy="95" rx="22" ry="10" fill="#fff" />
        </g>

        <path d="M0 430 C 88 400, 186 462, 278 420 C 340 392, 390 408, 420 400 L420 560 L0 560 Z" fill="url(#grass2)" />
        <ellipse cx="210" cy="444" rx={46 + growth * 18} ry="12" fill="rgba(0,0,0,0.14)" />

        {/* seed */}
        <ellipse cx="210" cy="432" rx="6" ry="4" fill="#5a3920" />

        <AnimatePresence mode="wait">
          {showSprout && (
            <motion.g
              key="sprout"
              initial={{ opacity: 0, scale: 0.5, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 6 }}
              transition={{ duration: 0.35 }}
            >
              <path d="M210 432 C 210 422, 210 413, 210 404" stroke="#4b9440" strokeWidth="3.2" strokeLinecap="round" fill="none" />
              <ellipse cx="201" cy="406" rx="10" ry="6" transform="rotate(-28 201 406)" fill="#72c95b" />
              <ellipse cx="219" cy="406" rx="10" ry="6" transform="rotate(28 219 406)" fill="#72c95b" />
            </motion.g>
          )}
        </AnimatePresence>

        {showSapling && (
          <motion.g
            initial={{ opacity: 0, scaleY: 0.2 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.45 }}
            style={{ transformOrigin: "210px 432px" }}
          >
            <path
              d={`
                M ${210 - trunkW / 2} 432
                C ${205 - growth * 4} ${412 - growth * 10}, ${198 - growth * 8} ${356 - growth * 28}, ${210 - trunkW / 2} ${432 - trunkH}
                L ${210 + trunkW / 2} ${432 - trunkH}
                C ${222 + growth * 8} ${356 - growth * 28}, ${215 + growth * 4} ${412 - growth * 10}, ${210 + trunkW / 2} 432
                Z
              `}
              fill="url(#trunk2)"
            />
          </motion.g>
        )}

        {showBranches && (
          <motion.g
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 0.95, scale: 1 }}
            transition={{ duration: 0.4 }}
            style={{ transformOrigin: "210px 350px" }}
            stroke="#7b4d2d"
            strokeWidth={2 + growth * 1.8}
            strokeLinecap="round"
            fill="none"
          >
            <path d={`M210 ${432 - trunkH + 34} C 190 ${432 - trunkH + 12}, 174 ${432 - trunkH - 8}, 160 ${432 - trunkH - 28}`} />
            <path d={`M210 ${432 - trunkH + 28} C 230 ${432 - trunkH + 8}, 246 ${432 - trunkH - 12}, 260 ${432 - trunkH - 32}`} />
            {showFullCanopy && (
              <>
                <path d={`M210 ${432 - trunkH + 16} C 196 ${432 - trunkH - 8}, 188 ${432 - trunkH - 24}, 184 ${432 - trunkH - 40}`} />
                <path d={`M210 ${432 - trunkH + 14} C 224 ${432 - trunkH - 8}, 234 ${432 - trunkH - 24}, 240 ${432 - trunkH - 42}`} />
              </>
            )}
          </motion.g>
        )}

        {showSapling && (
          <motion.g
            initial={{ opacity: 0, scale: 0.25 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            style={{ transformOrigin: `${210}px ${canopyBaseY}px` }}
          >
            {foliage.slice(0, showFullCanopy ? foliage.length : 3).map((f, i) => (
              <circle key={i} cx={f.x} cy={f.y} r={f.r} fill={f.shade} />
            ))}
          </motion.g>
        )}

        <AnimatePresence>
          {showFruit && (
            <motion.g
              key="fruits"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              {fruitPts.map((p, i) => (
                <motion.g
                  key={i}
                  initial={{ y: -2, opacity: 0 }}
                  animate={{ y: [0, -0.6, 0], opacity: 1 }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.08 }}
                >
                  <circle cx={p.x} cy={p.y} r={3.2 + (i % 3) * 0.4} fill="#e64949" />
                  <circle cx={p.x - 0.9} cy={p.y - 0.9} r={1.1} fill="rgba(255,255,255,.45)" />
                </motion.g>
              ))}
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
    </motion.div>
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
  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    background: "rgba(15, 23, 42, 0.06)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    cursor: "pointer",
    transition: "all 180ms ease",
    textDecoration: "none",
    color: "#1f2937",
    marginBottom: "12px",
  },
  errorBanner: {
    marginBottom: 10,
    padding: "8px 10px",
    borderRadius: 10,
    background: "#fee2e2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    fontWeight: 700,
    fontSize: 13,
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

  // keep chat width stable, enlarge tree panel
  main: {
    display: "grid",
    gridTemplateColumns: "minmax(720px, 1fr) 520px",
    gap: 12,
    minHeight: 0,
    flex: 1,
    padding: 10,
    alignItems: "stretch",
  },

  chatPanel: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
  },

  treePanel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 0,
  },
  treeHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "10px 12px",
  },
  score: {
    fontSize: 12,
    fontWeight: 900,
    borderRadius: 999,
    padding: "4px 8px",
    background: "#ecfeff",
    color: "#0e7490",
  },
  treeLegend: {
    fontSize: 12,
    color: "#6b7280",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "10px 12px",
  },

  messages: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    minHeight: 0,
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