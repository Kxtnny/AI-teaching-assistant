"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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

const COLORS = ["#3b82f6", "#ef4444", "#eab308", "#10b981", "#8b5cf6", "#f97316", "#06b6d4"];
const LANGS = ["English", "Bahasa Melayu", "中文", "தமிழ்", "Español"];

const color = (name: string) => {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

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
  [...prev, ...incoming].forEach(m => map.set(m.id, m));
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
};

type Pulse = "none" | "good" | "bad" | "milestone";

const TREE_STAGES = ["Seed", "Sprout", "Sapling", "Young Tree", "Full Tree"];

export default function SoloSprintUI() {
  const [username, setUsername] = useState("");
  const [language, setLanguage] = useState("English");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [session, setSession] = useState<SessionState>({
    phase: "waiting", topic: "", students: [], roomId: null,
    language: "English", discussionEndsAt: null, privateFeedbackReady: false, treeScore: 0,
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

  const bottom = useRef<HTMLDivElement>(null);
  const es = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const lastScoreRef = useRef(0);
  const lastMilestoneRef = useRef(0);

  const treeScore = session.treeScore ?? 0;
  const currentStage = Math.floor(clamp(treeScore, 0, 100) / 20);
  const currentStageName = TREE_STAGES[currentStage] || "Seed";

  useEffect(() => {
    const prev = lastScoreRef.current;
    const delta = treeScore - prev;
    lastScoreRef.current = treeScore;
    const nextM = Math.floor(treeScore / 25) * 25;
    if (nextM > lastMilestoneRef.current) {
      lastMilestoneRef.current = nextM;
      setTreePulse("milestone");
      setTimeout(() => setTreePulse("none"), 650);
    } else if (delta !== 0) {
      setTreePulse(delta > 0 ? "good" : "bad");
      setTimeout(() => setTreePulse("none"), 420);
    }
  }, [treeScore]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => () => { es.current?.close(); pollRef.current && clearInterval(pollRef.current); recRef.current?.stop?.(); }, []);

  const fetchTopics = useCallback(async () => {
    const res = await fetch("/api/solosprint?topics=1");
    const data = await res.json();
    if (res.ok) setTopics(data.topics || []);
    else setError(data?.error || "Failed to load topics");
  }, []);

  const fetchSession = useCallback(async () => {
    if (!username.trim()) return;
    const res = await fetch(`/api/solosprint?session=1&username=${encodeURIComponent(username.trim())}`);
    const data = await res.json();
    if (res.ok) setSession(prev => ({ ...prev, ...data }));
  }, [username]);

  const fetchHistory = useCallback(async () => {
    if (!username.trim()) return;
    const res = await fetch(`/api/solosprint?history=1&username=${encodeURIComponent(username.trim())}`);
    const data = await res.json();
    if (res.ok) {
      setMessages(prev => mergeMessages(prev, data.messages || []));
      if (typeof data.treeScore === "number") setSession(s => ({ ...s, treeScore: data.treeScore }));
    }
  }, [username]);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  useEffect(() => {
    if (!joined) return;
    const poll = async () => { try { await Promise.all([fetchSession(), fetchHistory()]); } catch {} };
    poll();
    pollRef.current = setInterval(poll, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [joined, fetchSession, fetchHistory]);

  useEffect(() => {
    if (!session.discussionEndsAt || session.phase !== "discussion_3min") {
      setSecondsLeft(null);
      return;
    }
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((session.discussionEndsAt! - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [session.discussionEndsAt, session.phase]);

  const connectStream = useCallback(() => {
    if (!username.trim()) return;
    es.current?.close();
    const source = new EventSource(`/api/solosprint?stream=1&username=${encodeURIComponent(username.trim())}`);
    source.onmessage = (e) => { try { setMessages(prev => mergeMessages(prev, [JSON.parse(e.data)])); } catch {} };
    source.onerror = () => source.close();
    es.current = source;
  }, [username]);

  const join = useCallback(async () => {
    setError("");
    if (!username.trim() || !selectedTopic) return;
    try {
      const res = await fetch("/api/solosprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join_room", username: username.trim(), topic: selectedTopic, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Join failed");
      setSession(s => ({ ...s, ...data, treeScore: typeof data.treeScore === "number" ? data.treeScore : 0 }));
      await Promise.all([fetchHistory(), fetchSession()]);
      connectStream();
      setJoined(true);
    } catch (e: any) { setError(e?.message || "Join failed"); }
  }, [username, selectedTopic, language, fetchHistory, fetchSession, connectStream]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError("Enter your name first.");
    if (!input.trim() || sending || session.phase === "personal_feedback") return;
    setSending(true);
    try {
      const res = await fetch("/api/solosprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), content: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Send failed");
      if (typeof data.treeScore === "number") setSession(s => ({ ...s, treeScore: data.treeScore }));
      setInput("");
    } catch (e: any) { setError(e?.message || "Send failed"); }
    finally { setSending(false); }
  };

  const resetRoom = async () => {
    if (!username.trim()) return setError("Enter your name first.");
    try {
      const res = await fetch("/api/solosprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_room", username: username.trim() }),
      });
      if (!res.ok) throw new Error("Reset failed");
      setMessages([]);
      setMyFeedback("");
      setMyFeedbackOpen(false);
      setSession(s => ({ ...s, treeScore: 0 }));
      await Promise.all([fetchSession(), fetchTopics()]);
    } catch (e: any) { setError(e?.message || "Reset failed"); }
  };

  const viewMyFeedback = async () => {
    if (!username.trim()) return setError("Enter your name first.");
    setLoadingFeedback(true);
    try {
      const res = await fetch(`/api/solosprint?my_feedback=1&username=${encodeURIComponent(username.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load feedback");
      setMyFeedback(data.feedback || "No feedback found yet.");
      setMyFeedbackOpen(true);
    } catch (e: any) { setError(e?.message || "Failed to load feedback"); }
    finally { setLoadingFeedback(false); }
  };

  const toggleVoice = () => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported."); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec: SpeechRec = new SR();
    rec.lang = language === "Bahasa Melayu" ? "ms-MY" : language === "中文" ? "zh-CN" : language === "தமிழ்" ? "ta-MY" : language === "Español" ? "es-ES" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(prev => prev ? `${prev} ${text}` : text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  if (!joined) {
    return (
      <div style={styles.joinWrap}>
        <div style={styles.joinCard}>
          {error && <div style={styles.errorBanner}>{error}</div>}
          <Link href="/" style={styles.backBtn}><ArrowLeft className="w-5 h-5" /></Link>
          <h1 style={{ margin: "0.4rem 0 0.2rem", fontSize: "1.5rem" }}>SoloSprint Collaborative Room</h1>
          <p style={{ color: "#6b7280", marginBottom: 14 }}>Pick your topic and join. Discussion starts immediately!</p>
          <div style={{ display: "grid", gap: 8 }}>
            <input style={styles.joinInput} placeholder="Enter your name…" value={username} onChange={e => setUsername(e.target.value)} maxLength={20} />
            <select style={styles.joinInput} value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGS.map(l => <option key={l}>{l}</option>)}
            </select>
            <div style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Choose a topic:</div>
              <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                {topics.map(t => (
                  <button key={t.topic} onClick={() => setSelectedTopic(t.topic)} style={{ ...styles.topicBtn, borderColor: selectedTopic === t.topic ? "#3b82f6" : "#e5e7eb", background: selectedTopic === t.topic ? "#eff6ff" : "#fff" }}>
                    <div style={{ fontWeight: 700, textAlign: "left" }}>{t.topic}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", textAlign: "left", marginTop: 2 }}>Room {t.nextRoomCount}/3 • {t.activeRooms} active rooms</div>
                  </button>
                ))}
              </div>
            </div>
            <button style={{ ...styles.btn, opacity: username.trim() && selectedTopic ? 1 : 0.45 }} disabled={!username.trim() || !selectedTopic} onClick={join}>Join Topic Room</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {error && <div style={styles.errorBanner}>{error}</div>}
      
      {/* Header */}
      <header style={styles.header}>
        <Link href="/" style={styles.backBtn}><ArrowLeft className="w-5 h-5" /></Link>
        <div style={styles.headerIcon}>🎓</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900 }}>SoloSprint Classroom</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{session.topic} • Room: {session.roomId} • {session.language}</div>
        </div>
        {session.privateFeedbackReady && (
          <button onClick={viewMyFeedback} style={styles.feedbackBtn} disabled={loadingFeedback}>{loadingFeedback ? "Loading..." : "📄 View My Feedback"}</button>
        )}
        <div style={styles.badge}><span style={{ ...styles.dot, background: color(username) }} />{username}</div>
      </header>

      {/* Main content - 3 columns: Rules (left), Chat (center), Tree (right) */}
      <div style={styles.main}>
        {/* Left: Session Rules & TA Feedback */}
        <aside style={styles.leftPanel}>
          <div style={styles.rulesCard}>
            <div style={styles.rulesHeader}>
              <span>📋</span>
              <strong>SESSION RULES</strong>
            </div>
            <div style={styles.rulesContent}>
              <div><span style={{ color: "#10b981" }}>✓</span> Explain concepts clearly</div>
              <div><span style={{ color: "#10b981" }}>✓</span> Build on peer ideas</div>
              <div><span style={{ color: "#10b981" }}>✓</span> Correct with reasons</div>
              <div><span style={{ color: "#ef4444" }}>✗</span> No off-topic messages</div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e5e7eb", fontSize: 11, color: "#6b7280" }}>
                💡 Focus on subtopic: Lecture Focus 2
              </div>
            </div>
          </div>

          <div style={styles.taCard}>
            <div style={styles.taHeader}>
              <span>🎓</span>
              <strong>TA Feedback</strong>
            </div>
            <div style={styles.taContent}>
              <div style={styles.taMessage}>
                <span style={styles.taBadge}>TA</span>
                <span>Within Lecture Focus 2, explain one mechanism and why it matters in this lecture context.</span>
              </div>
              <div style={styles.taMessage}>
                <span style={styles.taBadge}>TA</span>
                <span>Feedback: Partially relevant. Add mechanism-level detail.</span>
              </div>
              <div style={styles.taMessage}>
                <span style={styles.taBadge}>TA</span>
                <span>Use one key term and one cause-effect relation.</span>
              </div>
              <div style={styles.taTip}>
                💡 Tip: Explain mechanism → why it matters in lecture context
              </div>
            </div>
          </div>

          <div style={styles.statsCard}>
            <div style={styles.statsHeader}>📊 Session Stats</div>
            <div style={styles.statRow}>
              <span>Messages:</span>
              <strong>{messages.filter(m => m.role === "student").length}</strong>
            </div>
            <div style={styles.statRow}>
              <span>Participants:</span>
              <strong>{session.students.length}/3</strong>
            </div>
            <div style={styles.statRow}>
              <span>Correct Answers:</span>
              <strong style={{ color: "#10b981" }}>+{Math.floor(treeScore / 10)}</strong>
            </div>
          </div>
        </aside>

        {/* Center: Chat */}
        <section style={styles.chatPanel}>
          <div style={styles.onlineBar}>
            <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 700 }}>Online:</span>
            {session.students.map(s => (
              <span key={s} style={{ ...styles.userBadge, borderColor: color(s), color: color(s), background: s === username ? `${color(s)}22` : "#fff" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color(s) }} />
                {s}{s === username ? " (you)" : ""}
              </span>
            ))}
          </div>

          <div style={styles.messages}>
            {messages.map(m => {
              const me = m.role === "student" && m.username === username;
              const fac = m.role === "facilitator";
              return (
                <div key={m.id} style={{ ...styles.messageRow, justifyContent: fac ? "center" : me ? "flex-end" : "flex-start" }}>
                  {!fac && !me && (
                    <div style={{ ...styles.avatar, background: color(m.username) }}>
                      <span style={{ color: "#fff", fontWeight: 900, fontSize: 12 }}>{m.username[0].toUpperCase()}</span>
                    </div>
                  )}
                  <div style={{ maxWidth: fac ? "90%" : "75%" }}>
                    {!fac && !me && <div style={{ fontSize: 11, fontWeight: 600, color: color(m.username), marginBottom: 2 }}>{m.username}</div>}
                    <div style={{ 
                      ...styles.messageBubble, 
                      ...(fac ? styles.facBubble : me ? styles.myBubble : styles.otherBubble)
                    }}>
                      {fac && <span style={styles.facTag}>🎓 Dr. Feynman</span>}
                      {m.content}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, textAlign: me ? "right" : "left" }}>
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {!fac && me && (
                    <div style={{ ...styles.avatar, background: color(m.username) }}>
                      <span style={{ color: "#fff", fontWeight: 900, fontSize: 12 }}>{m.username[0].toUpperCase()}</span>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottom} />
          </div>

          <form onSubmit={send} style={styles.inputBar}>
            <button type="button" onClick={toggleVoice} style={{ ...styles.voiceBtn, background: listening ? "#fee2e2" : "#f3f4f6" }}>
              {listening ? "⏹️" : "🎙️"}
            </button>
            <input 
              style={styles.input} 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              placeholder={session.phase === "personal_feedback" ? "Feedback ready. Click View My Feedback." : "Type your explanation..."} 
              disabled={sending || session.phase === "personal_feedback"} 
            />
            <button 
              type="submit"
              style={{ ...styles.sendBtn, opacity: input.trim() && !sending && session.phase !== "personal_feedback" ? 1 : 0.5 }} 
              disabled={!input.trim() || sending || session.phase === "personal_feedback"}
            >
              Send
            </button>
          </form>
        </section>

        {/* Right: LARGE Collaboration Tree */}
        <aside style={styles.rightPanel}>
          <div style={styles.treeCard}>
            <div style={styles.treeHeader}>
              <strong>🌳 COLLABORATION TREE</strong>
              <span style={styles.treeScore}>{treeScore}/100</span>
            </div>
            <TreeWidget score={treeScore} pulse={treePulse} />
            <div style={styles.treeStageContainer}>
              <div style={styles.treeStages}>
                {TREE_STAGES.map((stage, idx) => (
                  <div key={stage} style={{ ...styles.treeStageDot, background: idx <= currentStage ? "#10b981" : "#e5e7eb" }} />
                ))}
              </div>
              <div style={styles.treeStageLabel}>
                {currentStageName} → {TREE_STAGES[currentStage + 1] || "Complete!"}
              </div>
            </div>
            <div style={styles.treeTip}>
              💡 Use one lecture term each response. +10 for correct answers. -7 for incorrect.
            </div>
          </div>

          <div style={styles.timerCard}>
            <div style={styles.timerHeader}>⏱️ TIME REMAINING</div>
            <div style={styles.timerValue}>
              {secondsLeft !== null ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` : "3:00"}
            </div>
            <div style={styles.timerLabel}>Discussion Phase</div>
            <button onClick={resetRoom} style={styles.resetBtn}>
              ↻ Reset Room
            </button>
          </div>

          <div style={styles.weatherCard}>
            <div style={styles.weatherTemp}>28°C</div>
            <div style={styles.weatherDesc}>⛈️ T-storms</div>
            <div style={styles.weatherSearch}>Q Search</div>
          </div>
        </aside>
      </div>

      {/* Footer with timer bar */}
      <div style={styles.footer}>
        <div style={styles.timerBar}>
          <div style={{ ...styles.timerProgress, width: secondsLeft !== null ? `${(secondsLeft / 180) * 100}%` : "100%" }} />
        </div>
      </div>

      {myFeedbackOpen && (
        <div style={styles.modalBackdrop} onClick={() => setMyFeedbackOpen(false)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>Your Personalized Feedback</div>
            <div style={styles.modalBody}>{myFeedback || "No feedback available."}</div>
            <button style={styles.modalClose} onClick={() => setMyFeedbackOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// LARGER TreeWidget with bigger dimensions
function TreeWidget({ score, pulse }: { score: number; pulse: Pulse }) {
  const growth = clamp(score / 100, 0, 1);
  const stage = Math.floor(clamp(score, 0, 100) / 20);
  const trunkH = 40 + growth * 200;
  const trunkW = 12 + growth * 20;
  const canopyBaseY = 520 - trunkH - 40;
  const canopyR = 40 + growth * 100;
  const showSprout = stage === 1;
  const showSapling = stage >= 2;
  const showBranches = stage >= 3;
  const showFullCanopy = stage >= 4;
  const showFruit = stage >= 5;

  const foliage = [
    { x: 250, y: canopyBaseY, r: canopyR * 0.95, shade: "#4ea83c" },
    { x: 190, y: canopyBaseY + 25, r: canopyR * 0.72, shade: "#3f8f32" },
    { x: 310, y: canopyBaseY + 28, r: canopyR * 0.7, shade: "#3b8730" },
    { x: 250, y: canopyBaseY - 50, r: canopyR * 0.66, shade: "#4aa23a" },
    { x: 210, y: canopyBaseY - 15, r: canopyR * 0.54, shade: "#56b145" },
    { x: 290, y: canopyBaseY - 12, r: canopyR * 0.52, shade: "#55ae44" },
    { x: 250, y: canopyBaseY - 85, r: canopyR * 0.48, shade: "#5cb84a" },
    { x: 170, y: canopyBaseY + 5, r: canopyR * 0.45, shade: "#4a9e3a" },
    { x: 330, y: canopyBaseY + 8, r: canopyR * 0.44, shade: "#489636" },
  ];

  const fruitPts = [
    { x: 220, y: canopyBaseY - 10 }, { x: 250, y: canopyBaseY + 15 }, { x: 270, y: canopyBaseY + 5 },
    { x: 200, y: canopyBaseY + 30 }, { x: 295, y: canopyBaseY + 32 }, { x: 250, y: canopyBaseY - 30 },
    { x: 230, y: canopyBaseY - 45 }, { x: 275, y: canopyBaseY - 40 }, { x: 185, y: canopyBaseY + 10 }, 
    { x: 315, y: canopyBaseY + 12 }, { x: 240, y: canopyBaseY - 60 }, { x: 265, y: canopyBaseY - 55 },
  ];

  const pulseAnim = pulse === "milestone" ? { scale: [1, 1.03, 1], transition: { duration: 0.45 } }
    : pulse === "good" ? { scale: [1, 1.015, 1], transition: { duration: 0.3 } }
    : pulse === "bad" ? { x: [0, -3, 3, -2, 2, 0], transition: { duration: 0.25 } }
    : {};

  return (
    <motion.div animate={pulseAnim} style={{ height: 520, borderRadius: 16, overflow: "hidden", background: "#e8f4e8", marginBottom: 12 }}>
      <svg viewBox="0 0 500 520" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c8e6f5" />
            <stop offset="100%" stopColor="#e8f4e8" />
          </linearGradient>
          <linearGradient id="trunkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a96c3d" />
            <stop offset="100%" stopColor="#6d4326" />
          </linearGradient>
        </defs>
        
        <rect x="0" y="0" width="500" height="520" fill="url(#skyGrad)" />
        
        {/* Sun */}
        <circle cx="80" cy="70" r="40" fill="#ffd24d" opacity="0.9" />
        <circle cx="80" cy="70" r="80" fill="#ffd24d" opacity="0.2" />
        
        {/* Clouds */}
        <g opacity={0.6}>
          <ellipse cx="400" cy="80" rx="45" ry="18" fill="#fff" />
          <ellipse cx="430" cy="85" rx="30" ry="14" fill="#fff" />
          <ellipse cx="370" cy="88" rx="25" ry="12" fill="#fff" />
        </g>
        
        {/* Ground */}
        <path d="M0 480 C 100 460, 200 490, 350 470 C 430 455, 470 465, 500 460 L500 520 L0 520 Z" fill="#7cb342" />
        <ellipse cx="250" cy="495" rx={70 + growth * 25} ry="14" fill="rgba(0,0,0,0.12)" />
        
        {/* Seed / Base */}
        <ellipse cx="250" cy="478" rx="8" ry="5" fill="#5a3920" />
        
        <AnimatePresence mode="wait">
          {showSprout && (
            <motion.g key="sprout" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              <path d="M250 478 C 250 465, 250 455, 250 445" stroke="#4b9440" strokeWidth="4" strokeLinecap="round" fill="none" />
              <ellipse cx="238" cy="448" rx="14" ry="8" transform="rotate(-30 238 448)" fill="#72c95b" />
              <ellipse cx="262" cy="448" rx="14" ry="8" transform="rotate(30 262 448)" fill="#72c95b" />
            </motion.g>
          )}
        </AnimatePresence>

        {showSapling && (
          <motion.g initial={{ opacity: 0, scaleY: 0.2 }} animate={{ opacity: 1, scaleY: 1 }} transition={{ duration: 0.45 }} style={{ transformOrigin: "250px 478px" }}>
            <path d={`M ${250 - trunkW / 2} 478 C ${245 - growth * 5} ${455 - growth * 12}, ${235 - growth * 10} ${400 - growth * 30}, ${250 - trunkW / 2} ${478 - trunkH} L ${250 + trunkW / 2} ${478 - trunkH} C ${265 + growth * 10} ${400 - growth * 30}, ${255 + growth * 5} ${455 - growth * 12}, ${250 + trunkW / 2} 478 Z`} fill="url(#trunkGrad)" />
          </motion.g>
        )}

        {showBranches && (
          <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 0.95, scale: 1 }} transition={{ duration: 0.4 }} stroke="#7b4d2d" strokeWidth={3 + growth * 2} strokeLinecap="round" fill="none">
            <path d={`M250 ${478 - trunkH + 45} C 225 ${478 - trunkH + 15}, 200 ${478 - trunkH - 10}, 180 ${478 - trunkH - 35}`} />
            <path d={`M250 ${478 - trunkH + 35} C 275 ${478 - trunkH + 10}, 300 ${478 - trunkH - 15}, 320 ${478 - trunkH - 40}`} />
            {showFullCanopy && (
              <>
                <path d={`M250 ${478 - trunkH + 25} C 230 ${478 - trunkH - 10}, 215 ${478 - trunkH - 35}, 205 ${478 - trunkH - 55}`} />
                <path d={`M250 ${478 - trunkH + 22} C 270 ${478 - trunkH - 10}, 285 ${478 - trunkH - 38}, 295 ${478 - trunkH - 58}`} />
              </>
            )}
          </motion.g>
        )}

        {showSapling && (
          <motion.g initial={{ opacity: 0, scale: 0.25 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} style={{ transformOrigin: `${250}px ${canopyBaseY}px` }}>
            {foliage.slice(0, showFullCanopy ? foliage.length : 4).map((f, i) => (
              <circle key={i} cx={f.x} cy={f.y - 50} r={f.r} fill={f.shade} opacity={0.9} />
            ))}
          </motion.g>
        )}

        <AnimatePresence>
          {showFruit && (
            <motion.g key="fruits" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              {fruitPts.map((p, i) => (
                <motion.g key={i} initial={{ y: -3 }} animate={{ y: [0, -1, 0], opacity: 1 }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.08 }}>
                  <circle cx={p.x} cy={p.y - 50} r={4.5} fill="#e64949" />
                  <circle cx={p.x - 1.2} cy={p.y - 51.5} r={1.5} fill="rgba(255,255,255,0.5)" />
                </motion.g>
              ))}
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  joinWrap: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f5f5", fontFamily: "system-ui, -apple-system, sans-serif", padding: 16 },
  joinCard: { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 16, width: "min(680px, 100%)", padding: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  backBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, background: "#f5f5f5", cursor: "pointer", textDecoration: "none", color: "#333", marginBottom: 12 },
  errorBanner: { marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca", fontWeight: 600, fontSize: 13 },
  joinInput: { padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none", background: "#fff" },
  topicBtn: { border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", cursor: "pointer", width: "100%", textAlign: "left" },
  btn: { border: "none", borderRadius: 8, padding: "10px 16px", color: "#fff", fontWeight: 600, background: "#3b82f6", cursor: "pointer" },
  
  container: { display: "flex", flexDirection: "column", height: "100vh", background: "#f5f5f5", fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { display: "flex", gap: 12, alignItems: "center", background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 20px" },
  headerIcon: { width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 8, background: "#3b82f6", color: "#fff" },
  badge: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "#f3f4f6", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  dot: { width: 8, height: 8, borderRadius: "50%" },
  feedbackBtn: { border: "1px solid #8b5cf6", background: "#f5f3ff", color: "#6d28d9", borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer", marginRight: 8 },
  
  main: { display: "grid", gridTemplateColumns: "280px 1fr 420px", gap: 16, padding: 20, flex: 1, minHeight: 0, overflow: "hidden" },
  
  // Left panel
  leftPanel: { display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" },
  rulesCard: { background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" },
  rulesHeader: { padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", gap: 8, alignItems: "center" },
  rulesContent: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 },
  taCard: { background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" },
  taHeader: { padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", gap: 8, alignItems: "center" },
  taContent: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 },
  taMessage: { display: "flex", gap: 8, fontSize: 12, alignItems: "flex-start", lineHeight: 1.4 },
  taBadge: { background: "#3b82f6", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, flexShrink: 0 },
  taTip: { marginTop: 8, padding: "8px", background: "#eff6ff", borderRadius: 8, fontSize: 11, color: "#2563eb" },
  statsCard: { background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 16 },
  statsHeader: { fontWeight: 600, marginBottom: 12, fontSize: 13 },
  statRow: { display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid #f0f0f0" },
  
  // Center chat
  chatPanel: { display: "flex", flexDirection: "column", background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden", minHeight: 0 },
  onlineBar: { display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap", background: "#fafafa" },
  userBadge: { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, border: "1px solid", padding: "4px 10px", fontSize: 12, fontWeight: 600 },
  messages: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: 16, minHeight: 0 },
  messageRow: { display: "flex", gap: 8, alignItems: "flex-start" },
  avatar: { width: 28, height: 28, borderRadius: 6, display: "grid", placeItems: "center", flexShrink: 0 },
  messageBubble: { padding: "8px 12px", borderRadius: 12, fontSize: 16, lineHeight: 1.5, wordBreak: "break-word" },
  otherBubble: { background: "#f3f4f6", borderBottomLeftRadius: 4 },
  myBubble: { background: "#3b82f6", color: "#fff", borderBottomRightRadius: 4 },
  facBubble: { background: "#fef3c7", border: "1px solid #fde68a", fontSize: 16 },
  facTag: { display: "inline-block", fontSize: 10, fontWeight: 700, color: "#d97706", marginRight: 8 },
  inputBar: { display: "flex", gap: 8, borderTop: "1px solid #e5e7eb", padding: "12px 16px", background: "#fff" },
  input: { flex: 1, border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", outline: "none", fontSize: 13 },
  sendBtn: { border: "none", borderRadius: 8, padding: "10px 20px", background: "#3b82f6", color: "#fff", fontWeight: 600, cursor: "pointer" },
  voiceBtn: { width: 40, height: 40, borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer", fontSize: 16 },
  
  // Right panel - LARGE TREE
  rightPanel: { display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" },
  treeCard: { background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" },
  treeHeader: { padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" },
  treeScore: { fontSize: 14, fontWeight: 700, background: "#ecfeff", color: "#0e7490", padding: "4px 10px", borderRadius: 20 },
  treeStageContainer: { padding: "12px 16px", borderTop: "1px solid #e5e7eb" },
  treeStages: { display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 },
  treeStageDot: { width: 10, height: 10, borderRadius: "50%", transition: "all 0.3s" },
  treeStageLabel: { fontSize: 12, textAlign: "center", color: "#6b7280" },
  treeTip: { padding: "10px 12px", fontSize: 11, color: "#6b7280", background: "#fef3c7", borderTop: "1px solid #fde68a", textAlign: "center" },
  
  timerCard: { background: "linear-gradient(135deg, #040507, #0a0101)", borderRadius: 12, padding: 16, textAlign: "center", color: "#fff" },
  timerHeader: { fontSize: 11, fontWeight: 600, opacity: 0.8, marginBottom: 8 },
  timerValue: { fontSize: 36, fontWeight: 700, fontFamily: "monospace", marginBottom: 4 },
  timerLabel: { fontSize: 11, opacity: 0.8, marginBottom: 12 },
  resetBtn: { width: "100%", border: "none", borderRadius: 8, padding: "8px", background: "rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  
  weatherCard: { background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 16, textAlign: "center" },
  weatherTemp: { fontSize: 28, fontWeight: 700, color: "#333" },
  weatherDesc: { fontSize: 14, color: "#6b7280", marginTop: 4 },
  weatherSearch: { marginTop: 12, fontSize: 12, color: "#3b82f6", cursor: "pointer", padding: "6px", background: "#f3f4f6", borderRadius: 8 },
  
  // Footer
  footer: { background: "#fff", borderTop: "1px solid #e5e7eb", padding: "6px 20px" },
  timerBar: { height: 2, background: "#e5e7eb", borderRadius: 1, overflow: "hidden" },
  timerProgress: { height: "100%", background: "#3b82f6", transition: "width 1s linear" },
  
  // Modal
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 2000 },
  modalCard: { width: "min(600px, 90vw)", maxHeight: "80vh", overflowY: "auto", background: "#fff", borderRadius: 16, padding: 20 },
  modalTitle: { fontWeight: 700, fontSize: 18, marginBottom: 12, color: "#1e3a5f" },
  modalBody: { whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14 },
  modalClose: { marginTop: 16, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", background: "#f3f4f6", color: "#333" },
};