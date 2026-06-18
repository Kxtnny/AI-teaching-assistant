"use client";

// app/LectureLens/learn/[id]/page.tsx  (v9)
//
// Changes from v8 — challenge only. Mentor + primer are byte-identical.
//   1) Format picker is now a TWO-STEP card:
//        step 1 → choose MCQ or Open
//        step 2 → configure: number of questions (5/7/10) for MCQ, or level (kid/teen/adult) for Open
//   2) Assessment header replaces the timer with:
//        - MCQ: "Question 3 of 7" progress
//        - Open: "open reflection · {level}" + a Done button so the student can wrap up
//          whenever they're happy with their tree.
//   3) Timer state removed. The session ends when the question count is reached (MCQ)
//      or the student presses Done / hits the safety cap (Open).

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Send, Volume2, VolumeX } from "lucide-react";
import TutorAvatar from "@/app/LectureLens/components/TutorAvatar";

type Phase = "entry" | "primer" | "learning" | "bridge" | "format" | "assessment" | "summary";
type Tone = "playful" | "guided" | "accurate";
type Format = "mcq" | "open";
type Level = "kid" | "teen" | "adult";

const TONES: { key: Tone; label: string }[] = [
  { key: "playful", label: "Playful" }, { key: "guided", label: "Guided" }, { key: "accurate", label: "Accurate" },
];
const STARTERS = ["Teach me the basics", "Walk me through an example", "Why does this matter?"];
const COUNT_OPTIONS = [5, 7, 10];
const LEVEL_OPTIONS: { k: Level; l: string; hint: string }[] = [
  { k: "kid",   l: "Explain to me like a kid",       hint: "everyday words, concrete examples" },
  { k: "teen",  l: "Explain to me like a teenager",  hint: "some technical terms, clear reasoning" },
  { k: "adult", l: "Explain to me like an adult",    hint: "precise terminology and depth" },
];
const THRESHOLD = 4;
const slug = (s: string) => (s || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "anon";
const fade = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -14 }, transition: { duration: 0.5 } };

// ─── Classroom backdrop ──────────────────────────────────────────────────────
function ClassroomBackdrop() {
  return (
    <svg className="grv-classroom" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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

// ─── GrowthTree ──────────────────────────────────────────────────────────────
const TC = { trunk: "#6E5A47", trunkDark: "#5A4838", deep: "#3E6E5C", mid: "#538C76", light: "#6FA98E", pale: "#9CC3AE", ground: "#E7E2D5", amber: "#C2703D" };
type Stage = "planted" | "sprout" | "young" | "growing" | "flourishing";
function stageFor(points: number, max = 100): Stage {
  const p = points / max;
  if (p <= 0.001) return "planted"; if (p < 0.2) return "sprout"; if (p < 0.45) return "young"; if (p < 0.85) return "growing"; return "flourishing";
}
function GrowthTree({ points = 0, max = 100, stage, size = 160 }: { points?: number; max?: number; stage?: Stage; size?: number }) {
  const s = stage ?? stageFor(points, max);
  const props = { width: size, height: size * (220 / 180), viewBox: "0 0 180 220" as const };
  if (s === "planted") return (<svg {...props}><ellipse cx="90" cy="208" rx="22" ry="5" fill={TC.ground} /><ellipse cx="90" cy="200" rx="18" ry="7" fill="#D8CFB8" /><circle cx="90" cy="195" r="5" fill={TC.trunk} /></svg>);
  if (s === "sprout") return (
    <svg {...props}><ellipse cx="90" cy="208" rx="24" ry="5" fill={TC.ground} />
      <path d="M89,208 C90,188 87,176 90,158" stroke={TC.trunk} strokeWidth={4} fill="none" strokeLinecap="round" />
      <ellipse cx="80" cy="156" rx="9" ry="5" fill={TC.mid} transform="rotate(-25 80 156)" />
      <ellipse cx="100" cy="156" rx="9" ry="5" fill={TC.mid} transform="rotate(25 100 156)" />
      <circle cx="90" cy="148" r="9" fill={TC.deep} /><circle cx="89" cy="146" r="6" fill={TC.mid} /><circle cx="86" cy="144" r="3" fill={TC.light} /></svg>
  );
  if (s === "young") return (
    <svg {...props}><ellipse cx="90" cy="208" rx="32" ry="6" fill={TC.ground} />
      <path d="M84,208 C84,180 84,160 86,140 L94,140 C96,160 96,180 96,208 Z" fill={TC.trunk} />
      <path d="M93,140 C95,170 95,190 96,208 L93,208 C93,190 92,170 91,142 Z" fill={TC.trunkDark} opacity={0.55} />
      <circle cx="90" cy="120" r="30" fill={TC.deep} /><circle cx="74" cy="128" r="18" fill={TC.deep} /><circle cx="106" cy="128" r="18" fill={TC.deep} />
      <circle cx="88" cy="118" r="24" fill={TC.mid} /><circle cx="78" cy="126" r="13" fill={TC.mid} /><circle cx="102" cy="126" r="13" fill={TC.mid} />
      <circle cx="82" cy="112" r="14" fill={TC.light} /><circle cx="98" cy="116" r="11" fill={TC.light} />
      <circle cx="80" cy="108" r="7" fill={TC.pale} /><circle cx="94" cy="110" r="5" fill={TC.pale} /></svg>
  );
  if (s === "growing") return (
    <svg {...props}><ellipse cx="90" cy="208" rx="42" ry="7" fill={TC.ground} />
      <path d="M82,208 C83,178 82,158 84,112 L96,112 C98,158 97,178 98,208 Z" fill={TC.trunk} />
      <path d="M95,112 C97,158 97,178 98,208 L94,208 C94,178 93,158 92,114 Z" fill={TC.trunkDark} opacity={0.55} />
      <path d="M87,148 C73,134 62,122 54,108" stroke={TC.trunk} strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d="M93,154 C108,142 118,128 126,114" stroke={TC.trunk} strokeWidth={6} fill="none" strokeLinecap="round" />
      <circle cx="90" cy="86" r="40" fill={TC.deep} /><circle cx="56" cy="104" r="24" fill={TC.deep} /><circle cx="124" cy="104" r="24" fill={TC.deep} /><circle cx="90" cy="56" r="22" fill={TC.deep} />
      <circle cx="88" cy="84" r="33" fill={TC.mid} /><circle cx="62" cy="102" r="18" fill={TC.mid} /><circle cx="118" cy="102" r="17" fill={TC.mid} /><circle cx="90" cy="60" r="16" fill={TC.mid} />
      <circle cx="80" cy="76" r="20" fill={TC.light} /><circle cx="102" cy="80" r="17" fill={TC.light} /><circle cx="86" cy="62" r="13" fill={TC.light} />
      <circle cx="74" cy="68" r="9" fill={TC.pale} /><circle cx="96" cy="66" r="7" fill={TC.pale} /><circle cx="106" cy="84" r="4" fill={TC.amber} /></svg>
  );
  return (
    <svg {...props}><ellipse cx="90" cy="208" rx="52" ry="8" fill={TC.ground} />
      <path d="M81,208 C82,176 80,156 84,100 L96,100 C100,156 98,176 99,208 Z" fill={TC.trunk} />
      <path d="M95,100 C97,156 97,176 99,208 L94,208 C94,176 93,156 92,102 Z" fill={TC.trunkDark} opacity={0.55} />
      <path d="M86,140 C68,120 54,100 44,82" stroke={TC.trunk} strokeWidth={7} fill="none" strokeLinecap="round" />
      <path d="M94,150 C114,132 128,114 138,96" stroke={TC.trunk} strokeWidth={7} fill="none" strokeLinecap="round" />
      <path d="M90,124 C92,100 90,80 92,60" stroke={TC.trunk} strokeWidth={5} fill="none" strokeLinecap="round" />
      <circle cx="90" cy="72" r="46" fill={TC.deep} /><circle cx="50" cy="90" r="28" fill={TC.deep} /><circle cx="132" cy="90" r="28" fill={TC.deep} /><circle cx="92" cy="38" r="28" fill={TC.deep} /><circle cx="68" cy="52" r="22" fill={TC.deep} /><circle cx="116" cy="52" r="22" fill={TC.deep} />
      <circle cx="88" cy="70" r="38" fill={TC.mid} /><circle cx="58" cy="88" r="22" fill={TC.mid} /><circle cx="124" cy="88" r="22" fill={TC.mid} /><circle cx="92" cy="44" r="20" fill={TC.mid} />
      <circle cx="76" cy="62" r="22" fill={TC.light} /><circle cx="106" cy="66" r="20" fill={TC.light} /><circle cx="86" cy="44" r="14" fill={TC.light} /><circle cx="62" cy="78" r="11" fill={TC.light} />
      <circle cx="72" cy="52" r="8" fill={TC.pale} /><circle cx="98" cy="48" r="7" fill={TC.pale} /><circle cx="82" cy="60" r="6" fill={TC.pale} />
      <circle cx="112" cy="70" r="4" fill={TC.amber} /><circle cx="68" cy="70" r="3.5" fill={TC.amber} /></svg>
  );
}

// ─── Whiteboard ──────────────────────────────────────────────────────────────
function Whiteboard({ children, minHeight = 440 }: { children: React.ReactNode; minHeight?: number }) {
  return (
    <div className="grv-board">
      <div className="grv-board-frame">
        <div className="grv-board-inner" style={{ minHeight }}>{children}</div>
      </div>
      <div className="grv-board-tray" aria-hidden>
        <span className="grv-marker red" />
        <span className="grv-marker green" />
        <span className="grv-marker dark" />
      </div>
    </div>
  );
}

interface Primer { sections: { title: string; bullets: string[] }[]; keyTerms: string[] }

export default function GrovePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const lectureId = params?.id ?? "";
  const creator = search.get("creator") === "teacher" ? "teacher" : "student";
  const topicParam = search.get("topic") || "";

  const [phase, setPhase] = useState<Phase>("entry");
  const [name, setName] = useState("");
  const [tone, setTone] = useState<Tone>("guided");
  const [sessionId, setSessionId] = useState("");
  const [topicName, setTopicName] = useState("");
  const [err, setErr] = useState("");
  const toneRef = useRef(tone); toneRef.current = tone;
  const nameRef = useRef(name); nameRef.current = name;

  const validParam = topicParam && topicParam !== lectureId ? topicParam : "";
  const displayTopic = topicName || validParam || "this lecture";
  const entryTitle = validParam || "Your learning session";

  useEffect(() => { setName(localStorage.getItem("grove_name") || ""); setTone((localStorage.getItem("grove_tone") as Tone) || "guided"); }, []);
  useEffect(() => { if (name) localStorage.setItem("grove_name", name); }, [name]);
  useEffect(() => { localStorage.setItem("grove_tone", tone); }, [tone]);

  // ── primer / lecture (bullet slides) ──────────────────────────────────────
  const [primer, setPrimer] = useState<Primer | null>(null);
  const [primerIdx, setPrimerIdx] = useState(0);     // 0 = journey intro, 1.. = lecture sections
  const [primerLoading, setPrimerLoading] = useState(false);

  // a static "what to expect" slide that maps the whole 3-scene journey
  const introSlide = useMemo(() => ({
    kind: "intro" as const,
    title: "How this session works",
    bullets: [
      `First — the Lecture. I'll walk you through ${displayTopic} one key point at a time.`,
      "Next — the Conversation. We explore it together; ask anything and I adapt to how you think.",
      "Finally — the Challenge. Answer questions to grow your tree and see what's taken root.",
    ],
  }), [displayTopic]);

  const lectureSlides = useMemo(
    () => (primer?.sections || []).map((s) => ({ kind: "lecture" as const, title: s.title, bullets: s.bullets })),
    [primer]
  );
  const slides = useMemo(() => [introSlide, ...lectureSlides], [introSlide, lectureSlides]);
  const slide = slides[primerIdx];
  const bullets = slide?.bullets || [];
  const isIntro = slide?.kind === "intro";
  const isLastSlide = primerIdx === slides.length - 1;
  const isLastLecture = !isIntro && isLastSlide;

  // mentor context built from the lecture bullets
  const primerContext = useMemo(
    () => (primer ? primer.sections.map((s) => `${s.title}: ${s.bullets.join("; ")}`).join("\n") : ""),
    [primer]
  );

  // reveal bullets one at a time; the tutor reads each aloud (Web Speech API)
  const [shown, setShown] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const slideDone = !!slide && shown >= bullets.length;

  // pace + narrate the current bullet (index = shown - 1)
  useEffect(() => {
    if (phase !== "primer" || !slide || bullets.length === 0) { setSpeaking(false); return; }
    const idx = Math.min(shown, bullets.length) - 1;
    if (idx < 0) return;
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;

    // muted or unsupported → silent timer pacing, mouth still moves for life
    if (muted || !synth) {
      setSpeaking(shown < bullets.length);
      if (shown >= bullets.length) return;
      const t = setTimeout(() => setShown((n) => Math.min(bullets.length, n + 1)), 1100);
      return () => clearTimeout(t);
    }

    // spoken → read this bullet, advance when it finishes.
    let cancelled = false;
    let startTimer: any;
    const u = new SpeechSynthesisUtterance(bullets[idx]);
    u.rate = 0.98; u.pitch = 1.02;
    u.onstart = () => { if (!cancelled) setSpeaking(true); };
    u.onend = () => {
      if (cancelled) return;
      setSpeaking(false);
      setShown((n) => (n < bullets.length ? n + 1 : n));
    };
    u.onerror = () => { if (!cancelled) { setSpeaking(false); setShown((n) => (n < bullets.length ? n + 1 : n)); } };
    // Chrome drops an utterance if speak() is called in the same tick as cancel();
    // cancel first, then speak on the next tick. The cleanup clears this timer, so a
    // stale slide's utterance is discarded before it can start.
    try { synth.cancel(); } catch {}
    startTimer = setTimeout(() => {
      if (cancelled) return;
      try { synth.resume(); synth.speak(u); } catch {}
    }, 70);
    return () => { cancelled = true; clearTimeout(startTimer); try { synth.cancel(); } catch {} };
  }, [shown, slide, bullets.length, muted, phase]);

  // stop any narration when leaving the lecture or unmounting
  useEffect(() => {
    if (phase !== "primer") { try { window.speechSynthesis?.cancel(); } catch {} setSpeaking(false); }
  }, [phase]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch {} }, []);

  // change slide + reset the reveal in the same batch (no stale-state window)
  function goToSlide(n: number) { setShown(1); setSpeaking(false); setPrimerIdx(Math.max(0, n)); }

  async function beginJourney() {
    setErr("");
    if (!name.trim()) return setErr("Please enter your name.");
    const sid = `${creator}:${lectureId}:${slug(name)}:${Date.now().toString(36)}`;
    setSessionId(sid); setPhase("primer"); setPrimerLoading(true); setPrimerIdx(0); setShown(1);
    try {
      const r = await fetch("/api/primer", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lectureId, creator, sessionId: sid, studentName: name, topic: validParam, tone }) });
      const data = await r.json();
      if (data.title) setTopicName(data.title);
      if (data.primer) setPrimer(data.primer); else setErr(data.error || "Could not load the lecture.");
    } catch { setErr("Could not start the session."); } finally { setPrimerLoading(false); }
  }

  // mentor (learning)
  const [transport] = useState(() => new DefaultChatTransport({
    api: "/api/mentor",
    body: () => ({ mode: toneRef.current, lectureId, creator, studentName: nameRef.current || undefined, primerContext }),
  }));
  const { messages, sendMessage, status } = useChat({ transport, onError: () => setErr("Mentor failed. Check server logs.") });
  const [input, setInput] = useState("");
  const userTurns = messages.filter((m) => m.role === "user").length;
  const txt = (m: any) => (m?.parts || []).filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ");
  function submitLearning(e: React.FormEvent) { e.preventDefault(); if (!input.trim()) return; sendMessage({ text: input.trim() }); setInput(""); }
  function useStarter(s: string) { sendMessage({ text: s }); }
  const isThinking = status === "submitted" || (status === "streaming" && messages[messages.length - 1]?.role !== "assistant");

  const composerRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (phase === "learning") composerRef.current?.focus(); }, [phase, messages.length]);

  // ─── challenge — v9 ─────────────────────────────────────────────────────────
  // format picker has a "configure" sub-step
  const [pendingFormat, setPendingFormat] = useState<Format | null>(null);
  const [mcqCount, setMcqCount] = useState<number>(7);
  const [openLevel, setOpenLevel] = useState<Level>("teen");
  useEffect(() => { if (phase === "format") setPendingFormat(null); }, [phase]);

  // active-session state
  const [format, setFormat] = useState<Format>("open");
  const [activeLevel, setActiveLevel] = useState<Level>("teen");
  const [activeCount, setActiveCount] = useState<number>(7);
  const [assessMsgs, setAssessMsgs] = useState<any[]>([]);
  const [points, setPoints] = useState(0);
  const [progress, setProgress] = useState<{ asked: number; total: number } | null>(null);
  const [remaining, setRemaining] = useState(180);   // open-mode countdown
  const timerRef = useRef<any>(null);
  const [ended, setEnded] = useState(false);
  const [endHeadline, setEndHeadline] = useState("");
  const [feedback, setFeedback] = useState("");
  const [grading, setGrading] = useState(false);
  const [answer, setAnswer] = useState("");
  const esRef = useRef<EventSource | null>(null);
  const currentMCQ = useMemo(() => [...assessMsgs].reverse().find((m) => m.kind === "mcq"), [assessMsgs]);
  const lastBotText = useMemo(() => [...assessMsgs].reverse().find((m) => m.role === "facilitator" && m.kind === "text"), [assessMsgs]);

  async function startAssessment(fmt: Format, opts: { questionCount?: number; level?: Level }) {
    setFormat(fmt); setPhase("assessment");
    setAssessMsgs([]); setEnded(false); setFeedback(""); setEndHeadline(""); setPoints(0); setProgress(null);
    if (fmt === "mcq") setActiveCount(opts.questionCount || 7);
    if (fmt === "open") setActiveLevel(opts.level || "teen");
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const transcript = messages.map((m) => `${m.role}: ${txt(m)}`).join("\n");
    const r = await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start_session", sessionId, format: fmt,
        questionCount: opts.questionCount, level: opts.level,
        topic: displayTopic, lectureId, creator, studentName: name, transcript,
      }) });
    const data = await r.json().catch(() => ({}));
    if (fmt === "open" && data?.startTime && data?.duration) {
      const end = data.startTime + data.duration * 1000;
      const tick = () => setRemaining(Math.max(0, Math.round((end - Date.now()) / 1000)));
      tick(); timerRef.current = setInterval(tick, 1000);
    }
    const es = new EventSource(`/api/challenge?stream&sessionId=${encodeURIComponent(sessionId)}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      let msg: any; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.kind === "status") {
        setPoints(msg.totalPoints);
        if (msg.progress) setProgress(msg.progress);
        if (typeof msg.remainingTime === "number") setRemaining(msg.remainingTime);
        return;
      }
      if (msg.kind === "ended") {
        setEnded(true); setFeedback(msg.feedback || "");
        setEndHeadline(msg.headline || "Session complete");
        setPoints(msg.totalPoints ?? 0);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        return;
      }
      setAssessMsgs((prev) => [...prev, msg]);
      if (msg.role === "facilitator") setGrading(false);
    };
  }
  useEffect(() => () => { esRef.current?.close(); if (timerRef.current) clearInterval(timerRef.current); }, []);

  // open-mode: when the countdown hits zero, ask the server to wrap up
  useEffect(() => {
    if (phase === "assessment" && format === "open" && !ended && remaining === 0) {
      endChallenge();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [remaining, phase, format, ended]);

  async function submitOpen() {
    if (!answer.trim()) return; setGrading(true);
    setAssessMsgs((p) => [...p, { id: `s-${Date.now()}`, role: "student", content: answer.trim() }]);
    const text = answer.trim(); setAnswer("");
    await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, content: text }) }).catch(() => setGrading(false));
  }
  async function pickMCQ(idx: number) {
    setGrading(true);
    await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, pickedIndex: idx }) }).catch(() => setGrading(false));
  }
  async function endChallenge() {
    await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end_session", sessionId }) }).catch(() => {});
  }
  function goSummary() { esRef.current?.close(); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } setPhase("summary"); }

  const back = `/LectureLens/course/${lectureId}?creator=${creator}`;

  // header tag for assessment
  const headerTag = format === "mcq"
    ? `multiple choice · question ${Math.min((progress?.asked ?? 0) + (ended ? 0 : 1), activeCount)} of ${activeCount}`
    : `open reflection · ${activeLevel}`;
  const mm = String(Math.floor(remaining / 60));
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="grv-root">
      <ClassroomBackdrop />

      <AnimatePresence mode="wait">

        {phase === "entry" && (
          <motion.div key="entry" {...fade} className="grv-scene center">
            <Link href={back} className="grv-back grv-board-back">← Back to course</Link>
            <Whiteboard minHeight={460}>
              <h1 className="grv-serif grv-h1">{entryTitle}</h1>
              <p className="grv-sub">A guided session — read, explore, then test what's taken root.</p>
              <input className="grv-input on-board" placeholder="Your name…" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="grv-tones on-board">
                {TONES.map((t) => <button key={t.key} className={`grv-chip on-board ${tone === t.key ? "on" : ""}`} onClick={() => setTone(t.key)}>{t.label}</button>)}
              </div>
              {err && <p className="grv-err">{err}</p>}
              <button className="grv-btn primary" style={{ marginTop: 24 }} onClick={beginJourney}>Plant the seed →</button>
            </Whiteboard>
          </motion.div>
        )}

        {phase === "primer" && (
          <motion.div key="primer" {...fade} className="grv-scene center">
            <Link href={back} className="grv-back grv-board-back">← Back</Link>

            <button
              className={`grv-sound-toggle ${muted ? "muted" : ""}`}
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute the tutor" : "Mute the tutor"}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              <span>{muted ? "Muted" : "Sound on"}</span>
            </button>

            <div className="grv-primer-stage">
              <TutorAvatar speaking={speaking && !!slide} />

              <Whiteboard minHeight={440}>
                {/* waiting on the lecture (intro is shown instantly; only lecture slides need the API) */}
                {!slide && (
                  <p className="grv-serif grv-h2" style={{ color: "var(--ink-board)" }}>Preparing your lecture…</p>
                )}

                {slide && (
                  <div className="grv-board-text" onClick={() => setShown(bullets.length)}>
                    {isIntro && <span className="grv-board-eyebrow">Welcome{name ? `, ${name}` : ""}</span>}
                    {!isIntro && <span className="grv-board-eyebrow">Lecture · {primerIdx} of {lectureSlides.length}</span>}

                    <h2 className="grv-serif grv-h2">{slide.title}</h2>

                    <ul className="grv-bullets">
                      <AnimatePresence initial={false}>
                        {bullets.slice(0, shown).map((bl, i) => (
                          <motion.li
                            key={`${primerIdx}-${i}`}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.35, ease: "easeOut" }}
                            className="grv-bullet"
                          >
                            <span className="grv-bullet-mark" aria-hidden>
                              {isIntro ? <span className="grv-step-num">{i + 1}</span> : "🌱"}
                            </span>
                            <span>{bl}</span>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>

                    {primer && primer.keyTerms.length > 0 && isLastLecture && slideDone && (
                      <div className="grv-terms">{primer.keyTerms.map((t) => <span key={t} className="grv-chip term on-board">{t}</span>)}</div>
                    )}
                  </div>
                )}
              </Whiteboard>
            </div>

            <div className="grv-primer-foot">
              <div className="grv-dots">{slides.map((_, i) => <span key={i} className={`grv-dot ${i === primerIdx ? "on" : ""}`} />)}</div>
              <div className="grv-foot-row">
                {primerIdx > 0 && <button className="grv-btn ghost" onClick={() => goToSlide(primerIdx - 1)}>Back</button>}

                {isIntro
                  ? <button className="grv-btn primary" disabled={!primer} onClick={() => goToSlide(1)}>
                      {primer ? "Begin the lecture →" : (primerLoading ? "Preparing lecture…" : "Loading…")}
                    </button>
                  : isLastLecture
                    ? <button className="grv-btn primary" onClick={() => setPhase("learning")}>Explore this together →</button>
                    : <button className="grv-btn primary" onClick={() => goToSlide(primerIdx + 1)}>Next →</button>}
              </div>
            </div>
          </motion.div>
        )}

        {/* Mentor — unchanged from v8 */}
        {phase === "learning" && (
          <motion.div key="learning" {...fade} className="grv-scene mentor-scene">
            <div className="grv-vignette" aria-hidden />
            <div className="grv-topbar mentor">
              <Link href={back} className="grv-back"><ArrowLeft size={20} /></Link>
              <div className="grv-tones grv-center">{TONES.map((t) => <button key={t.key} className={`grv-chip ${tone === t.key ? "on" : ""}`} onClick={() => setTone(t.key)}>{t.label}</button>)}</div>
              <div />
            </div>
            <div className="grv-convo">
              {messages.length === 0 && !isThinking && (
                <>
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="grv-msg tutor">
                    <p className="grv-serif grv-line">What would you like to explore about {displayTopic}?</p>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }} className="grv-starters">
                    {STARTERS.map((s) => <button key={s} className="grv-starter" onClick={() => useStarter(s)}>{s}</button>)}
                  </motion.div>
                </>
              )}
              {messages.slice(-3).map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut" }} className={m.role === "assistant" ? "grv-msg tutor" : "grv-msg user"}>
                  {m.role === "user" && <span className="grv-user-tag">YOU</span>}
                  <p className="grv-serif grv-line">{txt(m)}</p>
                </motion.div>
              ))}
              {isThinking && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grv-msg tutor">
                  <div className="grv-thinking" aria-label="thinking"><span /><span /><span /></div>
                </motion.div>
              )}
            </div>
            <form onSubmit={submitLearning} className="grv-composer mentor-composer">
              <input ref={composerRef} className="grv-input big" placeholder="Type your thought…" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" />
              <button className="grv-send" disabled={status !== "ready" || !input.trim()} aria-label="send"><Send size={20} /></button>
            </form>
            {userTurns >= THRESHOLD && (
              <button className="grv-ready" onClick={() => setPhase("bridge")}>
                <span>Ready for the test</span>
                <motion.span className="grv-ready-arrow" animate={{ x: [0, 6, 0] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}>→</motion.span>
              </button>
            )}
          </motion.div>
        )}

        {phase === "bridge" && (
          <motion.div key="bridge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grv-overlay">
            <div className="grv-card">
              <div style={{ display: "flex", justifyContent: "center" }}><GrowthTree points={points} size={70} /></div>
              <h2 className="grv-serif grv-h2" style={{ margin: "12px 0 22px" }}>Ready to test your understanding?</h2>
              <div className="grv-stack">
                <button className="grv-btn ghost" onClick={() => setPhase("learning")}>Keep exploring</button>
                <button className="grv-btn primary" onClick={() => setPhase("format")}>Begin the challenge</button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── FORMAT picker — two-step card ─────────────────────────────── */}
        {phase === "format" && (
          <motion.div key="format" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grv-overlay">
            <div className="grv-card wide">
              <AnimatePresence mode="wait">
                {!pendingFormat && (
                  <motion.div key="step1" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                    <h2 className="grv-serif grv-h2" style={{ marginBottom: 20 }}>How would you like to be tested?</h2>
                    <div className="grv-row">
                      <button className="grv-btn ghost" style={{ flex: 1 }} onClick={() => setPendingFormat("mcq")}>Multiple choice</button>
                      <button className="grv-btn ghost" style={{ flex: 1 }} onClick={() => setPendingFormat("open")}>Open reflection</button>
                    </div>
                  </motion.div>
                )}
                {pendingFormat === "mcq" && (
                  <motion.div key="step2-mcq" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                    <h2 className="grv-serif grv-h2" style={{ marginBottom: 14 }}>How many questions?</h2>
                    <p className="grv-sub" style={{ marginBottom: 22 }}>Each correct answer grows your tree by the same amount.</p>
                    <div className="grv-pick-row">
                      {COUNT_OPTIONS.map((n) => (
                        <button key={n} className={`grv-pick ${mcqCount === n ? "on" : ""}`} onClick={() => setMcqCount(n)}>
                          <span className="grv-pick-num">{n}</span>
                          <span className="grv-pick-sub">+{Math.floor(100 / n)} pts each</span>
                        </button>
                      ))}
                    </div>
                    <div className="grv-row" style={{ marginTop: 22 }}>
                      <button className="grv-btn ghost" onClick={() => setPendingFormat(null)}>← Back</button>
                      <button className="grv-btn primary" style={{ flex: 1 }} onClick={() => startAssessment("mcq", { questionCount: mcqCount })}>Begin →</button>
                    </div>
                  </motion.div>
                )}
                {pendingFormat === "open" && (
                  <motion.div key="step2-open" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                    <h2 className="grv-serif grv-h2" style={{ marginBottom: 14 }}>Explain it like I'm a…</h2>
                    <p className="grv-sub" style={{ marginBottom: 22 }}>You'll have 3 minutes. Answers are graded against the level you choose.</p>
                    <div className="grv-pick-row stack">
                      {LEVEL_OPTIONS.map((opt) => (
                        <button key={opt.k} className={`grv-pick wide ${openLevel === opt.k ? "on" : ""}`} onClick={() => setOpenLevel(opt.k)}>
                          <span className="grv-pick-num grv-pick-num-sm">{opt.l}</span>
                          <span className="grv-pick-sub">{opt.hint}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grv-row" style={{ marginTop: 22 }}>
                      <button className="grv-btn ghost" onClick={() => setPendingFormat(null)}>← Back</button>
                      <button className="grv-btn primary" style={{ flex: 1 }} onClick={() => startAssessment("open", { level: openLevel })}>Begin →</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ── ASSESSMENT — no timer; progress for mcq; Done for open ───── */}
        {phase === "assessment" && (
          <motion.div key="assessment" {...fade} className="grv-scene challenge">
            <div className="grv-topbar">
              <span className="grv-tag">{headerTag}</span>
              {format === "open" && !ended && (
                <div className="grv-open-controls">
                  <span className={`grv-timer ${remaining <= 30 ? "low" : ""}`}>{mm}:{ss}</span>
                  <button className="grv-btn ghost small" onClick={endChallenge} disabled={grading}>Done →</button>
                </div>
              )}
            </div>
            <div className="grv-challenge-center">
              <GrowthTree points={points} size={200} />
              <p className="grv-score">{points} / 100</p>

              {!ended && (format === "mcq" && currentMCQ ? (
                <div className="grv-q">
                  <p className="grv-serif grv-question">{currentMCQ.content}</p>
                  <div className="grv-mcq-list">
                    {currentMCQ.options.map((opt: string, i: number) => (
                      <button key={i} className="grv-mcq" disabled={grading} onClick={() => pickMCQ(i)}>{String.fromCharCode(65 + i)} · {opt}</button>
                    ))}
                  </div>
                </div>
              ) : !ended ? (
                <div className="grv-q">
                  {lastBotText && <p className="grv-serif grv-question">{lastBotText.content}</p>}
                  <form className="grv-composer" onSubmit={(e) => { e.preventDefault(); submitOpen(); }}>
                    <input className="grv-input big" placeholder="Your answer…" value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={grading} />
                    <button className="grv-send" disabled={grading || !answer.trim()} aria-label="send"><Send size={20} /></button>
                  </form>
                </div>
              ) : null)}

              {grading && <p className="grv-shimmer">tending your tree…</p>}

              {ended && (
                <div className="grv-q" style={{ textAlign: "center" }}>
                  <p className="grv-serif grv-question">{endHeadline}</p>
                  <button className="grv-btn primary" style={{ marginTop: 4 }} onClick={goSummary}>See your results →</button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {phase === "summary" && (
          <motion.div key="summary" {...fade} className="grv-scene">
            <div className="grv-challenge-center" style={{ paddingTop: 24 }}>
              <GrowthTree points={points} size={210} />
              <p className="grv-score">{points} / 100</p>
            </div>
            <div className="grv-report"><div className="grv-feedback">{feedback || "Loading your report…"}</div></div>
            <div className="grv-row" style={{ justifyContent: "center", marginTop: 22 }}>
              <button className="grv-btn ghost" onClick={() => setPhase("learning")}>Tend it further</button>
              <Link href={back} className="grv-btn ghost" style={{ textDecoration: "none" }}>Back to course</Link>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      <style jsx global>{`
        :root { color-scheme: light; }
        .grv-root {
          --paper:#f6f0e2; --surface:#fffdf6; --ink:#332a20; --muted:#8a8270;
          --sage:#4f7a5f; --sage-deep:#3c5e49; --clay:#c2703d;
          --line:rgba(58,54,44,.10);
          --board-frame:#5a4838; --board-frame-deep:#4a3a2c; --board-interior:#ede0c8;
          --ink-board:#3a2f23; --muted-board:#8c7a60;
          --tutor-ink:#332a20; --student-ink:#5d4f3d; --student-label:#8a7c66;
          min-height:100vh; position:relative; color:var(--ink); font-size:18px;
          font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
          background:
            radial-gradient(120% 75% at 50% -10%, rgba(255,251,238,.85), transparent 60%),
            var(--paper);
        }
        .grv-classroom { position:fixed; inset:0; width:100%; height:100%; z-index:0; pointer-events:none; opacity:.07; }
        .grv-serif { font-family:"Fraunces",Georgia,"Times New Roman",serif; }

        .grv-scene { position:relative; z-index:1; max-width:1080px; margin:0 auto; padding:48px 32px 140px; min-height:100vh; display:flex; flex-direction:column; }
        .grv-scene.center { justify-content:center; align-items:center; text-align:center; }

        /* Whiteboard */
        .grv-board { width:100%; max-width:920px; margin:0 auto; position:relative; }
        .grv-board-frame { background:var(--board-frame); background-image: linear-gradient(180deg, #6b5440 0%, #5a4838 50%, #4d3c2e 100%); border-radius:16px; padding:22px; box-shadow: 0 24px 52px rgba(58,54,44,.24), inset 0 1px 0 rgba(255,255,255,.06), inset 0 -2px 0 rgba(0,0,0,.18); position:relative; }
        .grv-board-inner { background:var(--board-interior); border-radius:8px; padding:64px 64px; box-shadow: inset 0 2px 8px rgba(58,46,30,.15), inset 0 -1px 4px rgba(58,46,30,.06); display:flex; flex-direction:column; align-items:center; text-align:center; gap:14px; }
        .grv-board-tray { position:relative; margin:-2px auto 0; background:var(--board-frame-deep); width:58%; height:20px; border-radius:0 0 10px 10px; display:flex; align-items:center; justify-content:center; gap:20px; box-shadow: 0 10px 18px rgba(58,54,44,.24), inset 0 1px 0 rgba(255,255,255,.05); }
        .grv-marker { width:38px; height:9px; border-radius:5px; box-shadow:0 1px 2px rgba(0,0,0,.2); }
        .grv-marker.red { background:#c2703d; } .grv-marker.green { background:#4f7a5f; } .grv-marker.dark { background:#2a2622; }
        .grv-board-back { display:inline-block; margin:0 auto 22px; }
        .grv-board-inner .grv-h1, .grv-board-inner .grv-h2 { color:var(--ink-board); }
        .grv-board-inner .grv-sub { color:var(--muted-board); }
        .grv-board-text { display:flex; flex-direction:column; align-items:center; text-align:center; width:100%; }
        .grv-read { font-size:22px; line-height:1.8; margin:18px 0 0; max-width:46ch; color:var(--ink-board); }
        .grv-caret { color:var(--clay); animation:grvblink 1s steps(1) infinite; margin-left:2px; }

        /* ── primer stage: avatar beside the board ── */
        .grv-primer-stage { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; max-width:1160px; margin:0 auto; }
        .grv-primer-stage .grv-board { margin:0; flex:1 1 auto; min-width:0; }

        .grv-board-eyebrow { font-family:ui-sans-serif,system-ui,sans-serif; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted-board); margin-bottom:10px; }

        /* bullets — left-aligned lecture points */
        .grv-bullets { list-style:none; padding:0; margin:22px 0 0; width:100%; max-width:48ch; display:flex; flex-direction:column; gap:16px; text-align:left; }
        .grv-bullet { display:flex; align-items:flex-start; gap:14px; font-size:21px; line-height:1.5; color:var(--ink-board); }
        .grv-bullet-mark { flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; margin-top:2px; font-size:16px; }
        .grv-step-num { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:var(--sage); color:#fbf7ee; font-family:"Fraunces",serif; font-size:15px; font-weight:600; }

        /* tutor avatar styles now live in app/LectureLens/components/TutorAvatar.tsx */

        /* sound toggle */
        .grv-sound-toggle { position:absolute; top:24px; right:28px; display:inline-flex; align-items:center; gap:8px; padding:9px 16px; border-radius:24px; border:1px solid var(--line); background:var(--surface); color:var(--sage-deep); font-size:14px; cursor:pointer; box-shadow:0 4px 14px rgba(58,54,44,.08); transition:background .15s,color .15s,transform .12s; z-index:5; }
        .grv-sound-toggle:hover { background:#fbf7ee; transform:translateY(-1px); }
        .grv-sound-toggle.muted { color:var(--muted); }
        .grv-h1 { font-size:48px; line-height:1.1; margin:0; }
        .grv-h2 { font-size:36px; line-height:1.2; margin:0; }
        .grv-sub { color:var(--muted); margin-top:6px; font-size:19px; }
        .grv-err { color:#b04a3a; margin-top:8px; }

        /* shared */
        .grv-input { width:100%; padding:16px 20px; border:1px solid var(--line); border-radius:14px; background:var(--surface); font-size:19px; color:var(--ink); outline:none; transition:border-color .15s, box-shadow .15s; }
        .grv-input.on-board { max-width:460px; background:#fbf6e6; border-color:rgba(90,72,56,.22); color:var(--ink-board); }
        .grv-input.big { font-size:20px; padding:18px 24px; border-radius:18px; }
        .grv-input:focus { border-color:var(--sage); box-shadow:0 0 0 3px rgba(79,122,95,.16); }
        .grv-tones { display:flex; gap:10px; }
        .grv-tones.on-board { justify-content:center; flex-wrap:wrap; }
        .grv-chip { font-size:15px; padding:9px 18px; border-radius:24px; background:#ece6d7; color:var(--sage-deep); border:none; cursor:pointer; transition:background .18s,color .18s,transform .12s; }
        .grv-chip:hover { background:#e3dcc9; } .grv-chip:active { transform:scale(.97); }
        .grv-chip.on { background:var(--sage); color:#fff; }
        .grv-chip.term { background:#eef0ea; color:var(--sage-deep); cursor:default; }
        .grv-chip.on-board { background:#fbf6e6; border:1px solid rgba(90,72,56,.18); }
        .grv-chip.on-board.on { background:var(--sage); color:#fff; border-color:var(--sage); }
        .grv-btn { padding:14px 26px; border-radius:14px; border:1px solid var(--line); background:var(--surface); color:var(--ink); font-size:17px; cursor:pointer; transition:transform .1s,background .15s,box-shadow .15s; }
        .grv-btn:hover { background:#fbf7ee; } .grv-btn:active { transform:scale(.98); }
        .grv-btn.primary { background:var(--sage); color:#fbf7ee; border-color:var(--sage); box-shadow:0 2px 0 rgba(60,94,73,.25); }
        .grv-btn.primary:hover { background:#46704f; }
        .grv-btn.ghost { background:var(--surface); }
        .grv-btn.small { padding:8px 16px; font-size:14px; border-radius:20px; }
        .grv-stack { display:flex; flex-direction:column; gap:12px; }
        .grv-row { display:flex; gap:12px; }
        .grv-topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
        .grv-topbar.mentor { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; width:min(75vw, 1100px); margin:0 auto 28px; }
        .grv-back { color:var(--muted); text-decoration:none; font-size:15px; display:inline-flex; align-items:center; gap:6px; }
        .grv-back:hover { color:var(--ink); }

        /* base composer fits its parent */
        .grv-composer { display:flex; gap:12px; width:100%; margin:0 auto; }
        .grv-send { display:flex; align-items:center; justify-content:center; min-width:64px; height:62px; border:none; border-radius:18px; background:var(--sage); color:#fbf7ee; cursor:pointer; transition:transform .12s, background .15s, box-shadow .15s; box-shadow:0 4px 14px rgba(60,94,73,.22); }
        .grv-send:hover { background:#46704f; transform:translateY(-1px); box-shadow:0 6px 18px rgba(60,94,73,.32); }
        .grv-send:active { transform:translateY(0) scale(.97); }
        .grv-send:disabled { opacity:.45; cursor:default; transform:none; box-shadow:none; }

        /* mentor */
        .grv-scene.mentor-scene { padding-top:40px; padding-bottom:80px; max-width:none; }
        .grv-vignette { position:fixed; inset:0; z-index:0; pointer-events:none; background: radial-gradient(60% 60% at 50% 50%, transparent 50%, rgba(58,42,30,.06) 90%, rgba(58,42,30,.10) 100%); }
        .grv-convo { flex:1; display:flex; flex-direction:column; justify-content:center; gap:52px; padding:32px 0; width:min(75vw, 900px); margin:0 auto; }
        .grv-msg { display:flex; flex-direction:column; align-items:center; gap:14px; width:100%; }
        .grv-line { font-family:"Fraunces",Georgia,serif; font-size:28px; line-height:1.55; margin:0; max-width:44ch; text-align:center; font-weight:400; letter-spacing:.005em; }
        .grv-msg.tutor .grv-line { color:var(--tutor-ink); }
        .grv-msg.user  .grv-line { color:var(--student-ink); }
        .grv-user-tag { display:inline-block; font-family:ui-sans-serif,system-ui,sans-serif; font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--student-label); padding:5px 12px; border-radius:14px; background:rgba(138,124,102,.10); }
        .grv-starters { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-top:6px; }
        .grv-starter { padding:11px 20px; border-radius:24px; background:rgba(79,122,95,.08); border:1px solid rgba(79,122,95,.22); color:var(--sage-deep); font-family:"Fraunces",Georgia,serif; font-style:italic; font-size:16px; cursor:pointer; transition:background .18s,border-color .18s,transform .12s; }
        .grv-starter:hover { background:rgba(79,122,95,.16); border-color:var(--sage); } .grv-starter:active { transform:scale(.97); }
        .grv-thinking { display:inline-flex; gap:8px; padding:8px 4px; justify-content:center; }
        .grv-thinking span { width:11px; height:11px; border-radius:50%; background:var(--muted); animation:grvDot 1.4s ease-in-out infinite; }
        .grv-thinking span:nth-child(2) { animation-delay:.2s; }
        .grv-thinking span:nth-child(3) { animation-delay:.4s; }
        @keyframes grvDot { 0%,80%,100%{opacity:.25;transform:scale(.85);} 40%{opacity:1;transform:scale(1);} }
        .grv-scene.mentor-scene .grv-composer { width:min(75vw, 800px); margin:0 auto; }
        .grv-scene.mentor-scene .grv-input.big { box-shadow:0 6px 20px rgba(58,54,44,.06); }

        .grv-ready { position:fixed; right:28px; top:50%; transform:translateY(-50%); display:flex; align-items:center; gap:12px; padding:16px 22px; border-radius:28px; background:var(--surface); color:var(--sage-deep); border:1.5px solid var(--sage); cursor:pointer; font-size:16px; font-weight:500; box-shadow:0 8px 22px rgba(60,94,73,.18); z-index:8; animation:grvReadyPulse 2.5s ease-in-out infinite; }
        .grv-ready:hover { background:var(--sage); color:#fff; box-shadow:0 10px 26px rgba(60,94,73,.28); }
        .grv-ready-arrow { font-size:22px; line-height:1; display:inline-block; }
        @keyframes grvReadyPulse { 0%,100%{box-shadow:0 8px 22px rgba(60,94,73,.18);} 50%{box-shadow:0 8px 28px rgba(60,94,73,.3);} }

        .grv-primer-foot { display:flex; flex-direction:column; align-items:center; gap:16px; margin-top:32px; }
        .grv-foot-row { display:flex; gap:12px; }
        .grv-dots { display:flex; gap:8px; }
        .grv-dot { width:8px; height:8px; border-radius:50%; background:#d6cfbd; } .grv-dot.on { background:var(--sage); }
        .grv-terms { display:flex; flex-wrap:wrap; gap:8px; margin-top:22px; justify-content:center; }

        /* challenge */
        .grv-scene.challenge { justify-content:flex-start; }
        .grv-tag { font-size:14px; color:var(--muted); letter-spacing:.04em; text-transform:lowercase; }
        .grv-open-controls { display:flex; align-items:center; gap:14px; }
        .grv-timer { font-variant-numeric:tabular-nums; color:var(--sage-deep); font-size:20px; font-weight:600; transition:color .2s; }
        .grv-timer.low { color:var(--clay); animation:grvPulseTime 1s ease-in-out infinite; }
        @keyframes grvPulseTime { 0%,100%{opacity:1;} 50%{opacity:.55;} }
        .grv-challenge-center { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; max-width:680px; margin:0 auto; width:100%; }
        .grv-score { color:var(--sage-deep); font-size:20px; margin:0; font-weight:600; }
        .grv-q { width:100%; max-width:620px; margin-top:8px; }
        .grv-question { font-size:24px; line-height:1.45; text-align:center; margin:0 0 22px; }
        .grv-mcq-list { display:flex; flex-direction:column; gap:12px; }
        .grv-mcq { display:block; width:100%; text-align:left; padding:18px 20px; border-radius:14px; border:1px solid var(--line); background:var(--surface); color:var(--ink); font-size:17px; cursor:pointer; transition:background .15s,border-color .15s; }
        .grv-mcq:hover { background:#f3eee2; border-color:var(--sage); }
        .grv-mcq:disabled { opacity:.6; cursor:default; }
        .grv-shimmer { text-align:center; color:var(--muted); margin-top:14px; animation:grvshimmer 1.2s ease-in-out infinite; }

        /* summary */
        .grv-report { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:28px 30px; max-width:760px; margin:22px auto 0; width:100%; }
        .grv-feedback { white-space:pre-wrap; font-size:17px; line-height:1.75; color:var(--ink); }

        /* overlays */
        .grv-overlay { position:fixed; inset:0; background:rgba(58,54,44,.22); backdrop-filter:blur(2px); display:flex; align-items:center; justify-content:center; z-index:20; padding:24px; }
        .grv-card { background:var(--surface); border-radius:20px; padding:32px 30px; max-width:460px; width:100%; text-align:center; border:1px solid var(--line); box-shadow:0 18px 50px rgba(58,54,44,.14); }
        .grv-card.wide { max-width:540px; }

        /* picker (count for mcq / level for open) */
        .grv-pick-row { display:flex; gap:14px; justify-content:center; }
        .grv-pick-row.stack { flex-direction:column; align-items:stretch; }
        .grv-pick {
          flex:1; min-width:0;
          display:flex; flex-direction:column; align-items:center; gap:6px;
          padding:20px 14px;
          background:var(--surface); color:var(--ink);
          border:2px solid var(--line); border-radius:18px;
          cursor:pointer; transition:all .18s;
        }
        .grv-pick.wide { flex-direction:column; align-items:flex-start; justify-content:center; gap:4px; padding:16px 22px; text-align:left; }
        .grv-pick.wide .grv-pick-num-sm { font-size:20px; }
        .grv-pick:hover { background:#fbf7ee; border-color:rgba(79,122,95,.4); }
        .grv-pick:active { transform:scale(.98); }
        .grv-pick.on { background:#eef3ed; border-color:var(--sage); box-shadow:0 0 0 3px rgba(79,122,95,.14); }
        .grv-pick-num { font-family:"Fraunces",Georgia,serif; font-size:36px; line-height:1; color:var(--sage-deep); font-weight:500; }
        .grv-pick-num-sm { font-size:22px; }
        .grv-pick-sub { font-size:13px; color:var(--muted); }

        @keyframes grvshimmer { 0%,100%{opacity:.4;} 50%{opacity:1;} }
        @keyframes grvblink { 0%,50%{opacity:1;} 51%,100%{opacity:0;} }
        @media (prefers-reduced-motion:reduce){ .grv-ready,.grv-shimmer,.grv-caret,.grv-thinking span,.grv-timer.low{animation:none;} }
        @media (max-width:1100px){ .grv-convo,.grv-scene.mentor-scene .grv-composer,.grv-topbar.mentor { width:88vw; } }
        @media (max-width:960px){
          .grv-board-inner { padding:48px 36px; } .grv-board { max-width:100%; }
          .grv-primer-stage { flex-direction:column; gap:0; }
          .grv-sound-toggle { top:16px; right:16px; }
        }
        @media (max-width:640px){ .grv-h1{font-size:36px;} .grv-line{font-size:22px;} .grv-ready { right:14px; padding:12px 16px; font-size:14px; } .grv-board-inner { padding:36px 22px; } .grv-pick-num{font-size:30px;} .grv-bullet{font-size:18px;} }
      `}</style>
    </div>
  );
}