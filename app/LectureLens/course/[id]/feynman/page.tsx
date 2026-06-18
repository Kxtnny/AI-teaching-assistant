"use client";

// app/LectureLens/course/[id]/feynman/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// THE DR. FEYNMAN CHALLENGE — frontend (single self-contained feature page)
//
// Calm, cinematic flow (one continuous conversation):
//   greeting → mood check-in (emoji pills) → encouragement → pick level → TEACH.
// The student teaches Dr. Feynman; he nudges them to keep going. The tree grows
// with explanation quality. Reuses /api/feynman (which reuses the existing
// library, RAG output and sessions store). Does not touch existing functionality.
//
// Entry URL:  /LectureLens/course/<lectureId>/feynman?creator=student&topic=<title>
// ─────────────────────────────────────────────────────────────────────────────

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Send, Volume2, VolumeX, Music, Music2, Clock, Sprout } from "lucide-react";
import TutorAvatar, { type TutorAvatarVariant } from "@/app/LectureLens/components/TutorAvatar";

const TUTOR_NAME = "Dr. Feynman";
const MUSIC_SRC = ""; // drop a looping track in /public and set its path to enable music

type Difficulty = "kid" | "teen" | "adult";
type ConceptState = "uncovered" | "covered" | "weak";
type Stage = "greeting" | "mood" | "difficulty" | "teaching" | "results";

const MOODS = [
  { k: "happy", e: "😄", label: "Happy" },
  { k: "bored", e: "😒", label: "Bored" },
  { k: "sad", e: "😢", label: "Sad" },
];
const MOOD_FALLBACK: Record<string, string> = {
  happy: "Love that energy — let's pour it into teaching me something! ⚡",
  bored: "Let's shake off the boredom — explaining something your way makes it fun again. ✨",
  sad: "Be gentle with yourself today — teaching one small idea can lift the whole mood. 💛",
};
const LEVELS: { k: Difficulty; label: string; blurb: string }[] = [
  { k: "kid", label: "Like a kid", blurb: "everyday words & examples" },
  { k: "teen", label: "Like a teenager", blurb: "some terms, clear reasoning" },
  { k: "adult", label: "Like an adult", blurb: "precise and deep" },
];
const slug = (s: string) => (s || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "anon";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ─── Dr. Feynman avatar (full) ───────────────────────────────────────────────
// circular head badge for the teaching header
function AvatarBadge({ speaking }: { speaking?: boolean }) {
  return (
    <span className={`fy-badge ${speaking ? "speaking" : ""}`}>
      <svg viewBox="58 88 144 132" width="100%" height="100%" aria-hidden="true">
        <rect x="40" y="70" width="180" height="180" fill="#7aa489" />
        <ellipse cx="130" cy="150" rx="56" ry="60" fill="#f0c49b" />
        <path d="M74 152 C66 88 98 64 130 64 C162 64 194 88 186 152 C183 126 178 116 160 110 C160 96 148 90 134 94 C112 78 88 96 86 118 C80 128 77 134 74 152 Z" fill="#5f4a39" />
        <g stroke="#3a2f23" strokeWidth="3.4" fill="#fff" fillOpacity=".12"><rect x="84" y="142" width="34" height="29" rx="13" /><rect x="142" y="142" width="34" height="29" rx="13" /></g>
        <path d="M118 155 q12 -5 24 0" fill="none" stroke="#3a2f23" strokeWidth="3.4" />
        <circle cx="102" cy="157" r="3.6" fill="#43301f" /><circle cx="160" cy="157" r="3.6" fill="#43301f" />
        <path d="M112 190 q18 8 36 0" fill="none" stroke="#9c5a44" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// ─── Growth tree ─────────────────────────────────────────────────────────────
const TC = { trunk: "#7a6450", deep: "#2f5a48", mid: "#477a62", light: "#6aa085", pale: "#9cc3ae", ground: "rgba(255,255,255,.14)", amber: "#e0a663" };
type TStage = "planted" | "sprout" | "young" | "growing" | "flourishing";
function stageFor(p: number): TStage { const x = p / 100; if (x <= 0.001) return "planted"; if (x < 0.18) return "sprout"; if (x < 0.4) return "young"; if (x < 0.72) return "growing"; return "flourishing"; }
function GrowthTree({ points = 0, size = 130 }: { points?: number; size?: number }) {
  const s = stageFor(points); const props = { width: size, height: size * (220 / 180), viewBox: "0 0 180 220" as const };
  if (s === "planted") return (<svg {...props}><ellipse cx="90" cy="208" rx="22" ry="5" fill={TC.ground} /><ellipse cx="90" cy="200" rx="16" ry="6" fill="rgba(255,255,255,.18)" /><circle cx="90" cy="196" r="5" fill={TC.trunk} /></svg>);
  if (s === "sprout") return (<svg {...props}><ellipse cx="90" cy="208" rx="24" ry="5" fill={TC.ground} /><path d="M89,208 C90,188 87,176 90,158" stroke={TC.trunk} strokeWidth={4} fill="none" strokeLinecap="round" /><ellipse cx="80" cy="156" rx="9" ry="5" fill={TC.mid} transform="rotate(-25 80 156)" /><ellipse cx="100" cy="156" rx="9" ry="5" fill={TC.mid} transform="rotate(25 100 156)" /><circle cx="90" cy="148" r="9" fill={TC.deep} /><circle cx="89" cy="146" r="6" fill={TC.mid} /></svg>);
  if (s === "young") return (<svg {...props}><ellipse cx="90" cy="208" rx="32" ry="6" fill={TC.ground} /><path d="M84,208 C84,180 84,160 86,140 L94,140 C96,160 96,180 96,208 Z" fill={TC.trunk} /><circle cx="90" cy="120" r="30" fill={TC.deep} /><circle cx="74" cy="128" r="18" fill={TC.deep} /><circle cx="106" cy="128" r="18" fill={TC.deep} /><circle cx="88" cy="118" r="24" fill={TC.mid} /><circle cx="82" cy="112" r="14" fill={TC.light} /><circle cx="80" cy="108" r="7" fill={TC.pale} /></svg>);
  if (s === "growing") return (<svg {...props}><ellipse cx="90" cy="208" rx="42" ry="7" fill={TC.ground} /><path d="M82,208 C83,178 82,158 84,112 L96,112 C98,158 97,178 98,208 Z" fill={TC.trunk} /><path d="M87,148 C73,134 62,122 54,108" stroke={TC.trunk} strokeWidth={6} fill="none" strokeLinecap="round" /><path d="M93,154 C108,142 118,128 126,114" stroke={TC.trunk} strokeWidth={6} fill="none" strokeLinecap="round" /><circle cx="90" cy="86" r="40" fill={TC.deep} /><circle cx="56" cy="104" r="24" fill={TC.deep} /><circle cx="124" cy="104" r="24" fill={TC.deep} /><circle cx="88" cy="84" r="33" fill={TC.mid} /><circle cx="80" cy="76" r="20" fill={TC.light} /><circle cx="74" cy="68" r="9" fill={TC.pale} /><circle cx="106" cy="84" r="4" fill={TC.amber} /></svg>);
  return (<svg {...props}><ellipse cx="90" cy="208" rx="52" ry="8" fill={TC.ground} /><path d="M81,208 C82,176 80,156 84,100 L96,100 C100,156 98,176 99,208 Z" fill={TC.trunk} /><path d="M86,140 C68,120 54,100 44,82" stroke={TC.trunk} strokeWidth={7} fill="none" strokeLinecap="round" /><path d="M94,150 C114,132 128,114 138,96" stroke={TC.trunk} strokeWidth={7} fill="none" strokeLinecap="round" /><circle cx="90" cy="72" r="46" fill={TC.deep} /><circle cx="50" cy="90" r="28" fill={TC.deep} /><circle cx="132" cy="90" r="28" fill={TC.deep} /><circle cx="92" cy="38" r="28" fill={TC.deep} /><circle cx="88" cy="70" r="38" fill={TC.mid} /><circle cx="76" cy="62" r="22" fill={TC.light} /><circle cx="72" cy="52" r="8" fill={TC.pale} /><circle cx="112" cy="70" r="4" fill={TC.amber} /></svg>);
}

// ─── Auto-typing ─────────────────────────────────────────────────────────────
function AutoTyping({ text, onDone, speed = 34 }: { text: string; onDone?: () => void; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); }, [text]);
  useEffect(() => {
    if (n >= text.length) { onDone?.(); return; }
    const t = setTimeout(() => setN((x) => x + 1), speed);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, text]);
  return <>{text.slice(0, n)}{n < text.length && <span className="fy-caret">▍</span>}</>;
}

interface Msg { id: string; role: "ai" | "me"; text: string; typed: boolean; after?: () => void }
interface ConceptLite { id: string; name: string }
interface Report { understanding: number; mastered: string[]; gaps: string[]; wrote: string; missing: string; better: string; improve: string[]; summary: string }

// floating question-mark buddy you tap for a hint
function HintBuddy() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#fbf5e6" stroke="#6f7d57" strokeWidth="2.5" />
      <circle cx="23" cy="25" r="2.7" fill="#3f3726" />
      <circle cx="41" cy="25" r="2.7" fill="#3f3726" />
      <text x="32" y="52" textAnchor="middle" fontSize="34" fontWeight="800" fill="#b06a3c" fontFamily="Georgia, serif">?</text>
    </svg>
  );
}

export default function FeynmanChallenge() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const lectureId = params?.id ?? "";
  const creator = search.get("creator") === "teacher" ? "teacher" : "student";
  const topicParam = search.get("topic") || "";
  const topic = topicParam && topicParam !== lectureId ? topicParam : "this topic";
  const back = `/LectureLens/course/${lectureId}?creator=${creator}`;

  const [name, setName] = useState("");
  const [stage, setStage] = useState<Stage>("greeting");
  const [err, setErr] = useState("");

  // audio prefs
  const [musicOn, setMusicOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef(true); voiceRef.current = voiceOn;

  // conversation
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quick, setQuick] = useState<"mood" | "difficulty" | null>(null);
  const [botTyping, setBotTyping] = useState(false);
  const [grading, setGrading] = useState(false);
  const queueRef = useRef<{ text: string; after?: () => void }[]>([]);
  const activeRef = useRef(false);

  // session
  const [difficulty, setDifficulty] = useState<Difficulty>("teen");
  const [moodLabel, setMoodLabel] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [concepts, setConcepts] = useState<ConceptLite[]>([]);
  const [states, setStates] = useState<Record<string, ConceptState>>({});
  const [coverage, setCoverage] = useState({ covered: 0, total: 0, percent: 0 });
  const [treePoints, setTreePoints] = useState(0);
  const [score, setScore] = useState(0);
  const [mastery, setMastery] = useState("Emerging");
  const [remaining, setRemaining] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState("");
  // hint cloud bubble (left-side buddy)
  const [hintOpen, setHintOpen] = useState(false);
  const [hintText, setHintText] = useState("");
  const [hintLoading, setHintLoading] = useState(false);

  const timerRef = useRef<any>(null);
  const finishingRef = useRef(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLInputElement | null>(null);
  // live mirrors of state the async finish()/timer needs (avoids stale closures)
  const sessionIdRef = useRef("");
  const conceptsRef = useRef<ConceptLite[]>([]);
  const statesRef = useRef<Record<string, ConceptState>>({});
  const coverageRef = useRef({ covered: 0, total: 0, percent: 0 });
  const teaching = stage === "teaching";
  const speaking = botTyping || grading;
  // tutor avatar matches the difficulty the student picked (adult = original feynman)
  const tutorVariant: TutorAvatarVariant = difficulty === "kid" ? "kid" : difficulty === "adult" ? "feynman" : "teen";

  // prefs
  useEffect(() => { setName(localStorage.getItem("grove_name") || ""); setMusicOn(localStorage.getItem("grove_music") === "on"); setVoiceOn(localStorage.getItem("grove_voice") !== "off"); }, []);
  useEffect(() => { localStorage.setItem("grove_music", musicOn ? "on" : "off"); const a = musicRef.current; if (!a) return; a.volume = 0.26; if (musicOn && MUSIC_SRC) a.play().catch(() => {}); else a.pause(); }, [musicOn]);
  useEffect(() => { localStorage.setItem("grove_voice", voiceOn ? "on" : "off"); if (!voiceOn) { try { window.speechSynthesis?.cancel(); } catch {} } }, [voiceOn]);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [messages, grading, quick]);
  useEffect(() => { if (teaching && !botTyping && !grading) composerRef.current?.focus(); }, [teaching, botTyping, grading]);

  function speak(text: string) {
    if (!voiceRef.current) return;
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined; if (!synth) return;
    try { synth.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/[🌱🌳🌟⚡💛🌙😄🙂😣😴😕🤔😊😎🧵]/g, "")); u.rate = 0.99; u.pitch = 1.02; setTimeout(() => { try { synth.resume(); synth.speak(u); } catch {} }, 60); } catch {}
  }

  // sequential AI line queue
  function advance() {
    const next = queueRef.current.shift();
    if (!next) { activeRef.current = false; return; }
    activeRef.current = true;
    const id = uid();
    setMessages((m) => [...m, { id, role: "ai", text: next.text, typed: false, after: next.after }]);
    setBotTyping(true);
    speak(next.text);
  }
  function say(lines: { text: string; after?: () => void }[]) { queueRef.current.push(...lines); if (!activeRef.current) advance(); }
  function onTyped(msg: Msg) {
    setBotTyping(false);
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, typed: true } : x)));
    msg.after?.();
    advance();
  }
  function pushMe(text: string) { setMessages((m) => [...m, { id: uid(), role: "me", text, typed: true }]); }
  function resetConvo() { queueRef.current = []; activeRef.current = false; setBotTyping(false); setMessages([]); }

  // ── greeting (runs once name is known) ──
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    say([
      { text: `Hi${name ? ` ${name}` : ""}! 👋 I'm ${TUTOR_NAME}, and honestly, I learn best when someone teaches me.` },
      { text: "Before we dive in… how are you feeling today?", after: () => { setStage("mood"); setQuick("mood"); } },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function pickMood(m: { k: string; e: string; label: string }) {
    setQuick(null); setMoodLabel(m.label);
    resetConvo();                                  // fresh screen — old greeting text clears
    setStage("difficulty");
    setGrading(true);
    let quote = MOOD_FALLBACK[m.k] || "Thanks for sharing. 🌱";
    try {
      const r = await fetch("/api/feynman", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cheer", mood: m.k }) });
      const d = await r.json();
      if (d?.quote) quote = d.quote;
    } catch {}
    setGrading(false);
    say([
      { text: quote },
      { text: "When you're ready, I'd love for you to teach me. How should I learn it?", after: () => setQuick("difficulty") },
    ]);
  }

  function applySnapshot(d: any) {
    if (d.states) { setStates(d.states); statesRef.current = d.states; }
    if (d.coverage) { setCoverage(d.coverage); coverageRef.current = d.coverage; }
    if (typeof d.treePoints === "number") setTreePoints(d.treePoints);
    if (typeof d.score === "number") setScore(d.score);
    if (d.mastery) setMastery(d.mastery);
    if (typeof d.remainingTime === "number") setRemaining(d.remainingTime);
  }

  async function pickLevel(l: Difficulty) {
    setQuick(null); setDifficulty(l);
    setGrading(true);
    try {
      const sid = `feyn:${creator}:${lectureId}:${slug(name)}:${Date.now().toString(36)}`;
      const r = await fetch("/api/feynman", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", lectureId, creator, topic: topicParam !== lectureId ? topicParam : "", difficulty: l, studentName: name || undefined, mood: moodLabel, sessionId: sid }) });
      const d = await r.json(); setGrading(false);
      if (!d.ok) { setErr(d.error || "Could not start."); say([{ text: "Hmm, I couldn't open the lecture just now. Try again in a moment?" }]); return; }
      setSessionId(d.sessionId); setConcepts(d.concepts || []); applySnapshot(d); setRemaining(d.duration || 300);
      sessionIdRef.current = d.sessionId; conceptsRef.current = d.concepts || [];
      const end = (d.startTime || Date.now()) + (d.duration || 300) * 1000;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => { const left = Math.max(0, Math.round((end - Date.now()) / 1000)); setRemaining(left); if (left <= 0) { clearInterval(timerRef.current); finish(); } }, 1000);
      resetConvo();                                 // fresh teaching screen
      setStage("teaching");
      say([{ text: d.opening || d.message || `Teach me about ${topic} in your own words. 🌱` }]);
    } catch { setGrading(false); setErr("Could not reach the service."); say([{ text: "I couldn't reach my notes just now — mind trying again?" }]); }
  }

  async function submitExplain() {
    const content = input.trim();
    if (!content || grading || botTyping) return;
    pushMe(content); setInput(""); setGrading(true); clearHint();
    try {
      const r = await fetch("/api/feynman", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "explain", sessionId, content }) });
      const d = await r.json(); setGrading(false);
      if (!d.ok && d.error) { say([{ text: "I didn't quite catch that — say it another way? 😊" }]); return; }
      applySnapshot(d);
      if (Array.isArray(d.coveredNow) && d.coveredNow.length) {
        const names = (d.coveredNow as string[]).map((id) => concepts.find((c) => c.id === id)?.name).filter(Boolean);
        setToast(`🌱 ${names.length > 1 ? `${names.length} concepts` : names[0] || "Concept"} taken root!`);
        setTimeout(() => setToast(""), 2600);
      }
      say([{ text: d.message || "Keep teaching me! 😊", after: d.done ? () => finish() : undefined }]);
    } catch { setGrading(false); say([{ text: "Oops, I lost the thread — could you try again? 😊" }]); }
  }

  async function requestHint() {
    if (hintLoading) return;
    if (hintText) { setHintOpen((o) => !o); return; }   // already have one → just toggle
    setHintLoading(true); setHintOpen(true);
    try {
      const r = await fetch("/api/feynman", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "hint", sessionId }) });
      const d = await r.json(); applySnapshot(d);
      setHintText(d.message || "Try explaining the concept you feel least sure about.");
    } catch { setHintText("Try explaining the concept you feel least sure about."); }
    setHintLoading(false);
  }
  // a fresh hint should be fetched after the next answer
  function clearHint() { setHintText(""); setHintOpen(false); }

  async function finish() {
    if (finishingRef.current) return; finishingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    try { window.speechSynthesis?.cancel(); } catch {}
    const sid = sessionIdRef.current || sessionId;
    const cs = conceptsRef.current;
    const st = statesRef.current;
    const cov = coverageRef.current;
    try {
      const r = await fetch("/api/feynman", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end", sessionId: sid }) });
      const d = await r.json(); applySnapshot(d);
      if (d.report) setReport(d.report);
      else {
        const mastered = cs.filter((c) => st[c.id] === "covered").map((c) => c.name);
        const gaps = cs.filter((c) => st[c.id] !== "covered").map((c) => c.name);
        setReport({
          understanding: cov.percent, mastered, gaps,
          wrote: mastered.length ? `You explained ${mastered.slice(0, 2).join(" and ")} in your own words.` : `You started putting the ideas into your own words.`,
          missing: gaps.length ? `You didn't really get to ${gaps.slice(0, 3).join(", ")} yet.` : `You touched on every key concept.`,
          better: `Aim to make ${gaps[0] || "the trickiest idea"} clearer and more precise for this level.`,
          improve: gaps.slice(0, 3).map((n) => `Re-explain «${n}» out loud — focus on how it works, not just the name.`),
          summary: `You taught ${cov.covered}/${cov.total} concepts (${cov.percent}%). ${mastered.length ? `Nice work on ${mastered[0]} — ` : ""}keep tending your tree! 🌳`,
        });
      }
    } catch {
      const mastered = cs.filter((c) => st[c.id] === "covered").map((c) => c.name);
      const gaps = cs.filter((c) => st[c.id] !== "covered").map((c) => c.name);
      setReport({ understanding: cov.percent, mastered, gaps, wrote: "You taught it in your own words — the hard part is done.", missing: gaps.length ? `Still to cover: ${gaps.slice(0, 3).join(", ")}.` : "You covered the key ideas.", better: "Tighten up the fuzzier parts on a second pass.", improve: gaps.slice(0, 3).map((n) => `Re-explain «${n}» in your own words.`), summary: "Lovely work — keep tending your tree! 🌳" });
    }
    setStage("results");
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); try { window.speechSynthesis?.cancel(); } catch {} }, []);

  const mm = String(Math.floor(remaining / 60));
  const ss = String(remaining % 60).padStart(2, "0");

  // ── render ──
  return (
    <div className="fy-root">
      <audio ref={musicRef} loop preload="auto" src={MUSIC_SRC || undefined} />

      <AnimatePresence mode="wait">
        {stage === "results" ? (
          /* ───── RESULTS ───── */
          <motion.section key="results" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="fy-results">
            <div className="fy-result-head">
              <GrowthTree points={treePoints} size={180} />
              <div>
                <span className="fy-eyebrow">Feynman Challenge · {LEVELS.find((l) => l.k === difficulty)?.label}</span>
                <h2 className="fy-serif fy-h2">You taught {topic}</h2>
                <p className="fy-result-score"><b>{report?.understanding ?? coverage.percent}%</b> understanding · {score} pts · <span className="fy-tag" data-m={mastery}>{mastery}</span></p>
              </div>
            </div>
            <div className="fy-cards">
              <div className="fy-card wide"><h3>What you taught me</h3><p>{report?.wrote || "—"}</p>{report && report.mastered.length ? <div className="fy-card-chips">{report.mastered.map((c) => <span key={c} className="fy-mini-chip ok">✓ {c}</span>)}</div> : null}</div>
              <div className="fy-card wide"><h3>What you left out</h3><p>{report?.missing || "—"}</p>{report && report.gaps.length ? <div className="fy-card-chips">{report.gaps.map((c) => <span key={c} className="fy-mini-chip gap">○ {c}</span>)}</div> : null}</div>
              <div className="fy-card wide"><h3>What could be better</h3><p>{report?.better || "—"}</p></div>
              <div className="fy-card wide"><h3>How to improve · {LEVELS.find((l) => l.k === difficulty)?.label}</h3>{report && report.improve.length ? <ol>{report.improve.map((r, i) => <li key={i}>{r}</li>)}</ol> : <p className="fy-dim">—</p>}</div>
              <div className="fy-card wide fy-sum"><p>{report?.summary || "Lovely work explaining the ideas in your own words."}</p></div>
            </div>
            <div className="fy-result-actions">
              <button className="fy-btn ghost" onClick={() => window.location.reload()}>Teach again</button>
              <Link href={back} className="fy-btn primary" style={{ textDecoration: "none" }}>Back to course</Link>
            </div>
          </motion.section>
        ) : (
          /* ───── CONVERSATION (greeting → mood → difficulty → teaching) ───── */
          <motion.section key="convo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className={`fy-stage ${teaching ? "is-teaching" : ""}`}>
            {/* header */}
            <header className="fy-head">
              <div className="fy-head-l">
                {teaching
                  ? <button className="fy-end" onClick={finish}><ArrowLeft size={16} /> End</button>
                  : <Link href={back} className="fy-end"><ArrowLeft size={16} /> Leave</Link>}
              </div>

              <div className="fy-head-c">
                {teaching ? (
                  <div className="fy-stats">
                    <span className={`fy-stat ${remaining <= 30 ? "low" : ""}`}><Clock size={14} /> {mm}:{ss}</span>
                    <span className="fy-stat"><Sprout size={14} /> {coverage.covered}/{coverage.total}</span>
                    <span className="fy-tag" data-m={mastery}>{mastery}</span>
                  </div>
                ) : (
                  <span className="fy-brand">✦ The Feynman Challenge</span>
                )}
              </div>

              <div className="fy-head-r">
                {teaching && <span className="fy-who"><AvatarBadge speaking={speaking} /> {TUTOR_NAME}</span>}
                <button className={`fy-ctrl ${musicOn ? "on" : ""}`} onClick={() => setMusicOn((m) => !m)} aria-label={musicOn ? "Music off" : "Music on"} title={MUSIC_SRC ? "" : "Set MUSIC_SRC to enable music"}>{musicOn ? <Music size={17} /> : <Music2 size={17} />}</button>
                <button className={`fy-ctrl ${voiceOn ? "on" : ""}`} onClick={() => setVoiceOn((v) => !v)} aria-label={voiceOn ? "Voice off" : "Voice on"}>{voiceOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
              </div>
            </header>

            {/* hero avatar before teaching */}
            {!teaching && (
              <motion.div className="fy-hero" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
                <TutorAvatar variant="feynman" speaking={speaking} />
              </motion.div>
            )}

            <div className="fy-body">
              {/* left: growing tree (centered) + progress */}
              {teaching && (
                <aside className="fy-aside">
                  <div className="fy-tree-wrap"><GrowthTree points={treePoints} size={250} /></div>
                  <div className="fy-bar"><div className="fy-bar-fill" style={{ width: `${coverage.percent}%` }} /></div>
                  <p className="fy-pts">{score} pts · {coverage.percent}%</p>
                  <div className="fy-chips">{concepts.map((c) => <span key={c.id} className={`fy-chip ${states[c.id] || "uncovered"}`}>{c.name}</span>)}</div>
                </aside>
              )}

              {/* conversation */}
              <div className="fy-conv">
                <div className="fy-thread" ref={threadRef}>
                  {messages.map((m) => (
                    m.role === "ai" ? (
                      <div key={m.id} className="fy-ai">
                        <p className="fy-msg">
                          {!m.typed ? <AutoTyping text={m.text} onDone={() => onTyped(m)} /> : m.text}
                        </p>
                      </div>
                    ) : (
                      <div key={m.id} className="fy-me"><div className="fy-me-bubble"><p className="fy-msg">{m.text}</p></div></div>
                    )
                  ))}
                  {grading && <div className="fy-ai"><div className="fy-typing" aria-label="thinking"><span /><span /><span /></div></div>}

                  {/* quick replies */}
                  {quick === "mood" && (
                    <div className="fy-moods">
                      {MOODS.map((m) => <button key={m.k} className="fy-mood" onClick={() => pickMood(m)} aria-label={m.label}>{m.e}</button>)}
                    </div>
                  )}
                  {quick === "difficulty" && (
                    <div className="fy-pills">
                      {LEVELS.map((l) => <button key={l.k} className="fy-pill col" onClick={() => pickLevel(l.k)}><b>{l.label}</b><small>{l.blurb}</small></button>)}
                    </div>
                  )}
                </div>

                {/* composer (teaching only) */}
                {teaching && (
                  <form className="fy-composer" onSubmit={(e) => { e.preventDefault(); submitExplain(); }}>
                    <input ref={composerRef} className="fy-input" placeholder={botTyping ? "Listening…" : "Explain it in your own words…"} value={input} onChange={(e) => setInput(e.target.value)} disabled={grading || botTyping} autoComplete="off" />
                    <button className="fy-send" disabled={grading || botTyping || !input.trim()} aria-label="send"><Send size={18} /></button>
                  </form>
                )}
              </div>

              {/* hovering hint buddy — right side; tap the ? face for a cloud tip */}
              {teaching && (
                <div className="fy-hint">
                  <AnimatePresence>
                    {hintOpen && (
                      <motion.div className="fy-cloud" initial={{ opacity: 0, x: 8, scale: 0.92 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}>
                        {hintLoading ? "thinking of a tip…" : hintText}
                        <span className="fy-cloud-tail" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <button className="fy-hint-buddy" onClick={requestHint} aria-label="Get a hint">
                    <HintBuddy />
                  </button>
                  <span className="fy-hint-label">need a hint?</span>
                </div>
              )}
            </div>

            {/* tutor in the bottom-right — reflects the chosen difficulty level */}
            {teaching && (
              <motion.div className="fy-tutor-corner" aria-hidden="true" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
                <TutorAvatar variant={tutorVariant} speaking={speaking} />
              </motion.div>
            )}

            <AnimatePresence>
              {toast && <motion.div className="fy-toast" initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}>{toast}</motion.div>}
            </AnimatePresence>
            {err && !teaching && <p className="fy-err">{err}</p>}
          </motion.section>
        )}
      </AnimatePresence>

      <style jsx global>{`
        :root { color-scheme: light; }
        .fy-root {
          --paper:#f1e8d2; --paper2:#ece2c8; --surface:#fbf5e6; --surface2:#f6eeda;
          --ink:#3f3726; --ink-soft:#6a6048; --muted:#8c8064; --line:rgba(63,55,38,.14);
          --sage:#6f7d57; --sage-deep:#525f3c; --clay:#b06a3c; --gold:#bb8d39; --cream:#f8f2e0;
          min-height:100vh; position:relative; color:var(--ink); font-size:17px;
          font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
          background:
            radial-gradient(120% 70% at 50% -8%, #fbf4e1, transparent 60%),
            linear-gradient(168deg, #f4ecd6 0%, #ece2c8 58%, #e6dcbf 100%);
          background-attachment:fixed;
        }
        /* faint vintage vignette for calm focus */
        .fy-root::after { content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
          background: radial-gradient(120% 80% at 50% 40%, transparent 62%, rgba(74,64,42,.10) 100%); }
        .fy-serif { font-family:"Fraunces",Georgia,serif; }
        .fy-eyebrow { font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); }
        .fy-h2 { font-size:33px; line-height:1.14; margin:4px 0 8px; color:var(--ink); }
        .fy-dim { color:var(--muted); margin:0; }
        .fy-err { text-align:center; color:#a8552f; margin:14px 0; }
        .fy-caret { color:var(--clay); margin-left:1px; animation:fybl 1s steps(1) infinite; }
        @keyframes fybl { 0%,50%{opacity:1;} 51%,100%{opacity:0;} }

        .fy-btn { padding:13px 24px; border-radius:14px; border:1px solid var(--line); background:var(--surface); color:var(--ink); font-size:15px; cursor:pointer; box-shadow:0 1px 0 rgba(63,55,38,.05); transition:transform .1s,background .15s; }
        .fy-btn:hover { background:#fff8ea; } .fy-btn:active { transform:scale(.98); }
        .fy-btn.primary { background:var(--sage); color:var(--cream); border-color:var(--sage); box-shadow:0 2px 0 rgba(82,95,60,.3); }
        .fy-btn.primary:hover { background:#647150; }

        /* proper header */
        .fy-head { position:sticky; top:0; z-index:20; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:14px;
          padding:14px 22px; margin:0 -22px 4px; background:rgba(251,245,230,.82); backdrop-filter:blur(8px);
          border-bottom:1px solid var(--line); }
        .fy-head-l { justify-self:start; } .fy-head-c { justify-self:center; } .fy-head-r { justify-self:end; display:flex; align-items:center; gap:8px; }
        .fy-brand { font-family:"Fraunces",serif; font-size:15px; letter-spacing:.08em; color:var(--sage-deep); }
        .fy-end { display:inline-flex; align-items:center; gap:6px; background:none; border:none; color:var(--muted); font-size:14px; cursor:pointer; text-decoration:none; }
        .fy-end:hover { color:var(--ink); }
        .fy-stats { display:flex; align-items:center; gap:13px; }
        .fy-stat { display:inline-flex; align-items:center; gap:5px; font-size:13px; color:var(--ink-soft); font-variant-numeric:tabular-nums; }
        .fy-stat.low { color:var(--clay); }
        .fy-tag { padding:4px 11px; border-radius:13px; font-size:11px; letter-spacing:.06em; text-transform:uppercase; background:var(--surface2); border:1px solid var(--line); color:var(--ink-soft); }
        .fy-tag[data-m="Mastered"] { background:var(--sage); color:var(--cream); border-color:var(--sage); }
        .fy-tag[data-m="Developing"] { background:rgba(187,141,57,.18); color:#8a6620; border-color:rgba(187,141,57,.3); }
        .fy-who { display:inline-flex; align-items:center; gap:8px; font-size:13px; color:var(--ink-soft); }
        .fy-ctrl { width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:50%; border:1px solid var(--line); background:var(--surface); color:var(--muted); cursor:pointer; transition:background .15s,color .15s; }
        .fy-ctrl:hover { background:#fff8ea; } .fy-ctrl.on { color:var(--sage-deep); }

        /* stage / layout */
        .fy-stage { position:relative; z-index:1; min-height:100vh; max-width:1340px; margin:0 auto; padding:0 26px 28px; display:flex; flex-direction:column; }
        .fy-hero { display:flex; justify-content:center; margin:26px 0 -4px; }

        .fy-body { flex:1; display:flex; gap:40px; min-height:0; padding-top:8px; }
        /* left rail: tree sits centered in the vertical middle */
        .fy-aside { flex:0 0 280px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; }
        .fy-tree-wrap { display:flex; align-items:flex-end; justify-content:center; min-height:300px; }
        .fy-bar { width:100%; height:8px; border-radius:6px; background:var(--surface2); border:1px solid var(--line); overflow:hidden; }
        .fy-bar-fill { height:100%; background:linear-gradient(90deg, var(--sage), #8a9a6b); border-radius:6px; transition:width .7s cubic-bezier(.2,.7,.2,1); }
        .fy-pts { font-size:13px; color:var(--sage-deep); font-weight:600; margin:0; }
        .fy-chips { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
        .fy-chip { font-size:11.5px; padding:5px 11px; border-radius:13px; border:1px solid var(--line); color:var(--muted); background:var(--surface); transition:all .3s; }
        .fy-chip.covered { background:var(--sage); color:var(--cream); border-color:var(--sage); }
        .fy-chip.weak { border-color:var(--clay); color:var(--clay); background:#fbf0e4; }

        /* hint buddy + cloud bubble */
        .fy-hint { position:relative; display:flex; flex-direction:column; align-items:center; gap:5px; margin-top:6px; }
        .fy-hint-buddy { width:58px; height:58px; padding:0; border:none; background:none; cursor:pointer; transition:transform .15s; filter:drop-shadow(0 4px 8px rgba(63,55,38,.16)); }
        .fy-hint-buddy:hover { transform:translateY(-2px) rotate(-4deg); }
        .fy-hint-label { font-size:12px; color:var(--muted); }
        .fy-cloud { position:absolute; bottom:78px; left:50%; transform:translateX(-50%); width:210px; background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:12px 15px; font-size:14px; line-height:1.45; color:var(--ink); box-shadow:0 10px 26px rgba(63,55,38,.16); z-index:5; }
        .fy-cloud-tail { position:absolute; bottom:-7px; left:50%; transform:translateX(-50%) rotate(45deg); width:14px; height:14px; background:var(--surface); border-right:1px solid var(--line); border-bottom:1px solid var(--line); }

        /* conversation */
        .fy-conv { flex:1; display:flex; flex-direction:column; min-height:0; }
        .fy-thread { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:24px; padding:20px 6px; max-height:72vh; }
        .fy-stage:not(.is-teaching) .fy-thread { max-height:none; align-items:center; text-align:center; }
        .fy-ai { max-width:76ch; }
        .fy-stage:not(.is-teaching) .fy-ai { text-align:center; }
        /* same font + size for BOTH the AI and the user */
        .fy-msg { font-family:"Fraunces",Georgia,serif; font-size:20px; line-height:1.6; margin:0; color:inherit; font-weight:400; }
        .fy-stage:not(.is-teaching) .fy-msg { font-size:24px; }
        .fy-ai .fy-msg { color:var(--ink); }
        .fy-me { display:flex; justify-content:flex-end; }
        .fy-me-bubble { background:var(--sage); color:var(--cream); padding:11px 18px; border-radius:18px; border-bottom-right-radius:6px; max-width:72ch; box-shadow:0 4px 14px rgba(82,95,60,.18); }
        .fy-me-bubble .fy-msg { color:var(--cream); }
        .fy-typing { display:inline-flex; gap:7px; padding:6px 2px; }
        .fy-typing span { width:9px; height:9px; border-radius:50%; background:var(--muted); animation:fyDot 1.4s ease-in-out infinite; }
        .fy-typing span:nth-child(2){animation-delay:.2s;} .fy-typing span:nth-child(3){animation-delay:.4s;}
        @keyframes fyDot { 0%,80%,100%{opacity:.25;transform:scale(.8);} 40%{opacity:1;transform:scale(1);} }

        /* quick reply pills */
        .fy-pills { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; padding:8px 0 2px; }
        .fy-pill { display:inline-flex; align-items:center; gap:7px; padding:11px 20px; border-radius:26px; border:1px solid var(--line); background:var(--surface); color:var(--ink); font-size:15px; cursor:pointer; box-shadow:0 4px 14px rgba(63,55,38,.08); transition:transform .12s, box-shadow .15s, background .15s; }
        .fy-pill:hover { transform:translateY(-2px); background:#fff8ea; box-shadow:0 8px 20px rgba(63,55,38,.12); }
        .fy-pill.col { flex-direction:column; align-items:flex-start; gap:1px; padding:12px 20px; }
        .fy-pill.col small { color:var(--muted); font-size:12px; }
        .fy-pill-e { font-size:18px; }

        /* big mood faces (sad / bored / happy) — emoji only, no text */
        .fy-moods { display:flex; gap:20px; justify-content:center; padding:10px 0 2px; }
        .fy-mood { width:78px; height:78px; border-radius:50%; border:1px solid var(--line); background:var(--surface); font-size:40px; line-height:1; cursor:pointer; box-shadow:0 6px 18px rgba(63,55,38,.1); transition:transform .14s, box-shadow .15s, background .15s; display:flex; align-items:center; justify-content:center; }
        .fy-mood:hover { transform:translateY(-3px) scale(1.05); background:#fff8ea; box-shadow:0 12px 26px rgba(63,55,38,.16); }

        /* composer */
        .fy-composer { display:flex; gap:10px; align-items:center; padding-top:12px; }
        .fy-input { flex:1; padding:16px 22px; border:1px solid var(--line); border-radius:30px; background:var(--surface); font-size:16px; color:var(--ink); outline:none; box-shadow:inset 0 1px 2px rgba(63,55,38,.05); transition:box-shadow .15s,border-color .15s; }
        .fy-input:focus { border-color:var(--sage); box-shadow:0 0 0 3px rgba(111,125,87,.16); }
        .fy-input:disabled { opacity:.75; }
        .fy-input::placeholder { color:var(--muted); }
        .fy-send { min-width:52px; height:52px; border-radius:50%; border:none; background:var(--sage); color:var(--cream); cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(82,95,60,.25); transition:transform .12s,background .15s; }
        .fy-send:hover { transform:translateY(-1px); background:#647150; } .fy-send:disabled { opacity:.4; cursor:default; transform:none; }

        /* report mini-chips */
        .fy-card-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
        .fy-mini-chip { font-size:12px; padding:4px 10px; border-radius:12px; border:1px solid var(--line); }
        .fy-mini-chip.ok { background:rgba(111,125,87,.14); color:var(--sage-deep); border-color:rgba(111,125,87,.3); }
        .fy-mini-chip.gap { background:rgba(176,106,60,.1); color:var(--clay); border-color:rgba(176,106,60,.3); }

        .fy-toast { position:fixed; bottom:26px; left:50%; transform:translateX(-50%); background:var(--sage-deep); color:var(--cream); padding:11px 22px; border-radius:24px; font-size:15px; font-weight:600; box-shadow:0 12px 30px rgba(82,95,60,.3); z-index:40; }

        /* avatar styles now live in app/LectureLens/components/TutorAvatar.tsx */
        .fy-badge { display:inline-block; width:30px; height:30px; border-radius:50%; overflow:hidden; box-shadow:0 2px 6px rgba(74,64,42,.22); }
        .fy-badge svg { display:block; width:100%; height:100%; }
        /* difficulty-matched tutor tucked into the bottom-right empty space */
        .fy-tutor-corner { position:fixed; right:26px; bottom:108px; z-index:15; pointer-events:none; transform:scale(.84); transform-origin:bottom right; }

        /* results */
        .fy-results { position:relative; z-index:1; max-width:760px; margin:0 auto; padding:54px 24px 80px; min-height:100vh; display:flex; flex-direction:column; }
        .fy-result-head { display:flex; align-items:center; gap:26px; margin-bottom:20px; }
        .fy-result-score { font-size:16px; color:var(--ink-soft); margin:6px 0 0; }
        .fy-result-score b { font-size:24px; color:var(--sage-deep); }
        .fy-cards { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .fy-card { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:18px 20px; box-shadow:0 6px 18px rgba(63,55,38,.06); }
        .fy-card.wide { grid-column:1 / -1; }
        .fy-card h3 { font-family:"Fraunces",serif; font-size:16px; margin:0 0 9px; color:var(--ink); }
        .fy-card ul, .fy-card ol { margin:0; padding-left:18px; }
        .fy-card li { font-size:15px; line-height:1.6; color:var(--ink); }
        .fy-card li.ok { list-style:none; margin-left:-18px; color:var(--sage-deep); }
        .fy-card li.gap { list-style:none; margin-left:-18px; color:var(--clay); }
        .fy-card p { margin:0; font-size:15px; line-height:1.65; color:var(--ink); }
        .fy-sum { background:var(--surface2); border-color:rgba(111,125,87,.3); }
        .fy-sum p { font-family:"Fraunces",serif; font-size:18px; }
        .fy-result-actions { display:flex; gap:12px; margin-top:22px; }

        @media (prefers-reduced-motion:reduce){ .fy-caret,.fy-stat.low{animation:none;} }
        @media (max-width:820px){
          .fy-head { grid-template-columns:auto 1fr auto; padding:12px 16px; margin:0 -16px 4px; }
          .fy-brand { display:none; }
          .fy-body { flex-direction:column; gap:16px; }
          .fy-aside { order:1; flex:none; justify-content:flex-start; }
          .fy-tree-wrap { min-height:0; }
          .fy-conv { order:2; }
          .fy-msg { font-size:19px; }
          .fy-stage:not(.is-teaching) .fy-msg { font-size:21px; }
          .fy-mood { width:66px; height:66px; font-size:34px; }
          .fy-cards { grid-template-columns:1fr; }
          .fy-result-head { flex-direction:column; text-align:center; }
          .fy-tutor-corner { display:none; }
        }
      `}</style>
    </div>
  );
}