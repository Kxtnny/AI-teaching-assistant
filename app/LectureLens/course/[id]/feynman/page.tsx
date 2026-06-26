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
import { ArrowLeft, Send, Volume2, VolumeX, Music, Music2, Clock, Sprout, ChevronDown, Lightbulb, X } from "lucide-react";
import Image from "next/image";

const TUTOR_NAME = "Dr. Feynman";
const MUSIC_SRC = ""; // drop a looping track in /public and set its path to enable music

type Difficulty = "kid" | "teen" | "adult";
type ConceptState = "uncovered" | "covered" | "weak";
type Stage = "teaching" | "results";

// inline version picker (shown as a Dr. Feynman bubble in the chat)
const VERSIONS: { k: Difficulty; label: string; desc: string; emoji: string }[] = [
  { k: "kid", label: "Kid Feynman", desc: "Simple & playful", emoji: "🧒" },
  { k: "teen", label: "Teen Feynman", desc: "Curious & energetic", emoji: "🧑" },
  { k: "adult", label: "Adult Feynman", desc: "Deep & rigorous", emoji: "🧑‍🔬" },
];

const LEVELS: { k: Difficulty; label: string; blurb: string; desc: string; tint: string; accent: string }[] = [
  { k: "kid", label: "Like a kid", blurb: "everyday words & examples", desc: "Simple analogies and relatable stories. No jargon.", tint: "#faf2e2", accent: "#b06a3c" },
  { k: "teen", label: "Like a teenager", blurb: "some terms, clear reasoning", desc: "Key vocabulary with a clear, logical flow.", tint: "#eef2fb", accent: "#41619a" },
  { k: "adult", label: "Like an adult", blurb: "precise and deep", desc: "Technical terminology and rigorous definitions.", tint: "#eef4ec", accent: "#566f4d" },
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

// circular avatar used in chat bubbles + persona cards.
// "feynman" = the AI tutor; kid/teen/adult = the persona the student picked.
// Stylized but more realistic: gradient shading, hair shape, shoulders peeking up.
function Face({ variant, size = 36 }: { variant: Difficulty | "feynman"; size?: number }) {
  const id = variant; // local gradient ids must be unique per variant
  const p = { width: size, height: size };

  if (variant === "feynman") return (
    <svg viewBox="0 0 120 120" {...p} aria-hidden="true">
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="40%" r="70%"><stop offset="0%" stopColor="#9bc1a8" /><stop offset="100%" stopColor="#6f9a82" /></radialGradient>
        <linearGradient id={`sk-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f6d2ab" /><stop offset="100%" stopColor="#e3b489" /></linearGradient>
      </defs>
      <rect width="120" height="120" rx="60" fill={`url(#bg-${id})`} />
      {/* shoulders / coat */}
      <path d="M14 122 C 22 96, 44 90, 60 90 C 76 90, 98 96, 106 122 Z" fill="#cfb784" />
      <path d="M14 122 C 22 96, 44 90, 60 90 C 76 90, 98 96, 106 122 Z" fill="#000" opacity=".06" />
      {/* neck */}
      <rect x="50" y="82" width="20" height="14" rx="6" fill={`url(#sk-${id})`} />
      {/* face */}
      <ellipse cx="60" cy="60" rx="29" ry="33" fill={`url(#sk-${id})`} />
      <ellipse cx="60" cy="80" rx="22" ry="6" fill="#000" opacity=".05" />
      {/* hair: salt-and-pepper, slightly receded */}
      <path d="M31 56 C 30 30, 50 18, 60 18 C 70 18, 90 30, 89 56 C 84 44, 76 38, 60 38 C 44 38, 35 44, 31 56 Z" fill="#3a2f23" />
      <path d="M31 56 C 30 30, 50 18, 60 18 C 70 18, 90 30, 89 56 C 84 44, 76 38, 60 38 C 44 38, 35 44, 31 56 Z" fill="#fff" opacity=".12" />
      {/* glasses */}
      <g stroke="#2a2218" strokeWidth="2.2" fill="#fff" fillOpacity=".12">
        <rect x="36" y="56" width="20" height="16" rx="6" />
        <rect x="64" y="56" width="20" height="16" rx="6" />
        <path d="M56 64 h8" />
      </g>
      <circle cx="46" cy="64" r="2.2" fill="#2a2218" />
      <circle cx="74" cy="64" r="2.2" fill="#2a2218" />
      {/* warm smile */}
      <path d="M50 82 q10 7 20 0" fill="none" stroke="#8a4a36" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );

  if (variant === "kid") return (
    <svg viewBox="0 0 120 120" {...p} aria-hidden="true">
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="40%" r="70%"><stop offset="0%" stopColor="#fde0a7" /><stop offset="100%" stopColor="#e9b96d" /></radialGradient>
        <linearGradient id={`sk-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbd9b6" /><stop offset="100%" stopColor="#ecb98e" /></linearGradient>
      </defs>
      <rect width="120" height="120" rx="60" fill={`url(#bg-${id})`} />
      {/* tee / shoulders */}
      <path d="M16 122 C 24 100, 44 94, 60 94 C 76 94, 96 100, 104 122 Z" fill="#e88f60" />
      <path d="M16 122 C 24 100, 44 94, 60 94 C 76 94, 96 100, 104 122 Z" fill="#000" opacity=".06" />
      <rect x="51" y="86" width="18" height="12" rx="6" fill={`url(#sk-${id})`} />
      {/* slightly rounder face for a kid */}
      <ellipse cx="60" cy="64" rx="30" ry="31" fill={`url(#sk-${id})`} />
      {/* fluffy hair */}
      <path d="M30 58 C 30 28, 52 20, 60 20 C 68 20, 90 28, 90 58 C 84 50, 76 46, 60 46 C 44 46, 36 50, 30 58 Z" fill="#7a4a28" />
      <path d="M34 52 q12 -16 26 -12" fill="none" stroke="#5d3719" strokeWidth="2" opacity=".5" />
      {/* big bright eyes */}
      <ellipse cx="48" cy="66" rx="4.6" ry="5.2" fill="#fff" />
      <ellipse cx="72" cy="66" rx="4.6" ry="5.2" fill="#fff" />
      <circle cx="49" cy="67" r="3" fill="#3a2f23" />
      <circle cx="73" cy="67" r="3" fill="#3a2f23" />
      <circle cx="50" cy="66" r="1" fill="#fff" />
      <circle cx="74" cy="66" r="1" fill="#fff" />
      {/* rosy cheeks */}
      <circle cx="42" cy="76" r="5" fill="#f4a890" opacity=".55" />
      <circle cx="78" cy="76" r="5" fill="#f4a890" opacity=".55" />
      {/* big happy smile */}
      <path d="M48 82 q12 10 24 0" fill="none" stroke="#a85940" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );

  if (variant === "teen") return (
    <svg viewBox="0 0 120 120" {...p} aria-hidden="true">
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="40%" r="70%"><stop offset="0%" stopColor="#c2d5ef" /><stop offset="100%" stopColor="#8aa8d6" /></radialGradient>
        <linearGradient id={`sk-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f4cba4" /><stop offset="100%" stopColor="#deab83" /></linearGradient>
      </defs>
      <rect width="120" height="120" rx="60" fill={`url(#bg-${id})`} />
      {/* hoodie shoulders */}
      <path d="M14 122 C 22 96, 44 92, 60 92 C 76 92, 98 96, 106 122 Z" fill="#5a73a3" />
      <path d="M14 122 C 22 96, 44 92, 60 92 C 76 92, 98 96, 106 122 Z" fill="#000" opacity=".08" />
      <rect x="51" y="84" width="18" height="14" rx="6" fill={`url(#sk-${id})`} />
      {/* face, slightly slimmer than kid */}
      <ellipse cx="60" cy="62" rx="28" ry="32" fill={`url(#sk-${id})`} />
      {/* swept hair with side fringe */}
      <path d="M30 60 C 28 28, 50 18, 60 18 C 72 18, 92 28, 90 60 C 84 42, 78 38, 60 38 C 44 38, 36 44, 30 60 Z" fill="#2f2436" />
      <path d="M34 38 Q 50 28, 70 36 L 64 50 Q 50 44, 38 54 Z" fill="#1f1828" />
      {/* eyes with a faint brow line */}
      <path d="M42 56 q6 -3 12 0" stroke="#2f2436" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M66 56 q6 -3 12 0" stroke="#2f2436" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <ellipse cx="48" cy="64" rx="3.2" ry="3.8" fill="#fff" />
      <ellipse cx="72" cy="64" rx="3.2" ry="3.8" fill="#fff" />
      <circle cx="49" cy="65" r="2.2" fill="#2f2436" />
      <circle cx="73" cy="65" r="2.2" fill="#2f2436" />
      {/* small smile */}
      <path d="M52 80 q8 5 16 0" fill="none" stroke="#9a5a44" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );

  // adult — clean cut, glasses, business-casual collar
  return (
    <svg viewBox="0 0 120 120" {...p} aria-hidden="true">
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="40%" r="70%"><stop offset="0%" stopColor="#b6d0b0" /><stop offset="100%" stopColor="#7d9d78" /></radialGradient>
        <linearGradient id={`sk-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f2c79e" /><stop offset="100%" stopColor="#d9a373" /></linearGradient>
      </defs>
      <rect width="120" height="120" rx="60" fill={`url(#bg-${id})`} />
      {/* blazer shoulders */}
      <path d="M14 122 C 22 96, 44 90, 60 90 C 76 90, 98 96, 106 122 Z" fill="#374759" />
      <path d="M14 122 C 22 96, 44 90, 60 90 C 76 90, 98 96, 106 122 Z" fill="#000" opacity=".1" />
      {/* shirt v */}
      <path d="M50 96 L 60 110 L 70 96 Z" fill="#f3eedb" />
      <rect x="51" y="82" width="18" height="14" rx="6" fill={`url(#sk-${id})`} />
      {/* face */}
      <ellipse cx="60" cy="60" rx="28" ry="32" fill={`url(#sk-${id})`} />
      {/* short tidy hair */}
      <path d="M32 54 C 34 28, 52 20, 60 20 C 68 20, 86 28, 88 54 C 82 42, 76 40, 60 40 C 44 40, 38 42, 32 54 Z" fill="#43352a" />
      {/* light stubble shadow */}
      <path d="M40 78 Q 60 86, 80 78 Q 76 86, 60 88 Q 44 86, 40 78 Z" fill="#3a2f23" opacity=".1" />
      {/* glasses */}
      <g stroke="#2a2218" strokeWidth="2" fill="#fff" fillOpacity=".1">
        <rect x="38" y="58" width="18" height="14" rx="4" />
        <rect x="64" y="58" width="18" height="14" rx="4" />
        <path d="M56 65 h8" />
      </g>
      <circle cx="47" cy="65" r="2" fill="#2a2218" />
      <circle cx="73" cy="65" r="2" fill="#2a2218" />
      {/* light brow above each lens */}
      <path d="M40 54 q8 -2 16 0" stroke="#2a2218" strokeWidth="1.6" fill="none" />
      <path d="M64 54 q8 -2 16 0" stroke="#2a2218" strokeWidth="1.6" fill="none" />
      {/* subtle smile */}
      <path d="M52 82 q8 4 16 0" fill="none" stroke="#9c5a44" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// Dr. Feynman avatar — uses the real picture, zoomed + centered in a circle
function FeynmanPic({ size = 48 }: { size?: number }) {
  const inner = Math.round(size * 1.4); // render bigger than the circle so the figure fills it
  return (
    <span className="fy-pic" style={{ width: size, height: size }}>
      <Image src="/feynman-pic.png" alt="Dr. Feynman" width={inner} height={inner} priority style={{ objectFit: "cover", objectPosition: "center 18%" }} />
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
  const [nameDraft, setNameDraft] = useState("");
  const [stage, setStage] = useState<Stage>("teaching");
  const [nameModal, setNameModal] = useState(true);     // ask the name in a centered popup
  const [versionPicked, setVersionPicked] = useState(false); // inline version selection done?
  const [hintModalOpen, setHintModalOpen] = useState(false); // centered hint popup
  const [err, setErr] = useState("");

  // audio prefs
  const [musicOn, setMusicOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef(true); voiceRef.current = voiceOn;

  // conversation
  const [messages, setMessages] = useState<Msg[]>([]);
  const [botTyping, setBotTyping] = useState(false);
  const [grading, setGrading] = useState(false);
  const queueRef = useRef<{ text: string; after?: () => void }[]>([]);
  const activeRef = useRef(false);

  // session
  const [difficulty, setDifficulty] = useState<Difficulty>("teen");
  const [sessionId, setSessionId] = useState("");
  const [concepts, setConcepts] = useState<ConceptLite[]>([]);
  const [states, setStates] = useState<Record<string, ConceptState>>({});
  const [coverage, setCoverage] = useState({ covered: 0, total: 0, percent: 0 });
  const [treePoints, setTreePoints] = useState(0);
  const [score, setScore] = useState(0);
  const [mastery, setMastery] = useState("Emerging");
  const [remaining, setRemaining] = useState(300);
  const [report, setReport] = useState<Report | null>(null);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState("");
  // hint popup text (centered modal)
  const [hintText, setHintText] = useState("");
  const [hintLoading, setHintLoading] = useState(false);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const toggleCard = (id: string) => setOpenCards((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

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

  // prefs
  useEffect(() => { setName(localStorage.getItem("grove_name") || ""); setMusicOn(localStorage.getItem("grove_music") === "on"); setVoiceOn(localStorage.getItem("grove_voice") !== "off"); }, []);
  useEffect(() => { localStorage.setItem("grove_music", musicOn ? "on" : "off"); const a = musicRef.current; if (!a) return; a.volume = 0.26; if (musicOn && MUSIC_SRC) a.play().catch(() => {}); else a.pause(); }, [musicOn]);
  useEffect(() => { localStorage.setItem("grove_voice", voiceOn ? "on" : "off"); if (!voiceOn) { try { window.speechSynthesis?.cancel(); } catch {} } }, [voiceOn]);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [messages, grading]);
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

  // prefill the name field from a previous visit
  useEffect(() => { const n = localStorage.getItem("grove_name") || ""; setName(n); setNameDraft(n); }, []);

  // name popup → save name, close modal, the student opens the conversation
  function submitName() {
    const n = nameDraft.trim();
    if (!n) return;
    setName(n);
    try { localStorage.setItem("grove_name", n); } catch {}
    setNameModal(false);
    // the STUDENT greets first; the inline version picker (a Feynman bubble) follows
    pushMe(`Hello Dr. Feynman! I'm well versed with ${topic} — let me teach you.`);
  }

  function applySnapshot(d: any) {
    if (d.states) { setStates(d.states); statesRef.current = d.states; }
    if (d.coverage) { setCoverage(d.coverage); coverageRef.current = d.coverage; }
    if (typeof d.treePoints === "number") setTreePoints(d.treePoints);
    if (typeof d.score === "number") setScore(d.score);
    if (d.mastery) setMastery(d.mastery);
    if (typeof d.remainingTime === "number") setRemaining(d.remainingTime);
  }

  async function pickVersion(l: Difficulty) {
    if (versionPicked || grading) return;
    setDifficulty(l);
    setGrading(true);
    const label = VERSIONS.find((v) => v.k === l)?.label || "Dr. Feynman";
    try {
      const sid = `feyn:${creator}:${lectureId}:${slug(name)}:${Date.now().toString(36)}`;
      const r = await fetch("/api/feynman", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", lectureId, creator, topic: topicParam !== lectureId ? topicParam : "", difficulty: l, studentName: name || undefined, sessionId: sid }) });
      const d = await r.json(); setGrading(false);
      if (!d.ok) { setErr(d.error || "Could not start."); say([{ text: "Hmm, I couldn't open the lecture just now. Try again in a moment?" }]); return; }
      setSessionId(d.sessionId); setConcepts(d.concepts || []); applySnapshot(d); setRemaining(d.duration || 300);
      sessionIdRef.current = d.sessionId; conceptsRef.current = d.concepts || [];
      const end = (d.startTime || Date.now()) + (d.duration || 300) * 1000;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => { const left = Math.max(0, Math.round((end - Date.now()) / 1000)); setRemaining(left); if (left <= 0) { clearInterval(timerRef.current); finish(); } }, 1000);
      setVersionPicked(true);                          // removes the inline picker, enables input
      // confirm + first question, in one Dr. Feynman bubble
      const opening = d.opening || d.message || `Let's begin — teach me about ${topic} in your own words.`;
      say([{ text: `Great choice! I'll be the ${label} today.\n\n${opening}` }]);
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

  // the concept the hint is "for" — first one not yet covered
  function activeConcept() { return concepts.find((c) => states[c.id] !== "covered") || concepts[0]; }

  async function requestHint() {
    if (!versionPicked) return;
    setHintModalOpen(true);
    if (hintText || hintLoading) return;             // already have/loading one
    setHintLoading(true);
    try {
      const r = await fetch("/api/feynman", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "hint", sessionId }) });
      const d = await r.json(); applySnapshot(d);
      setHintText(d.message || "Try explaining the concept you feel least sure about.");
    } catch { setHintText("Try explaining the concept you feel least sure about."); }
    setHintLoading(false);
  }
  // a fresh hint should be fetched after the next answer
  function clearHint() { setHintText(""); setHintModalOpen(false); }

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
            <div className="fy-fb">
              {(() => {
                const cards = [
                  { id: "wrote", icon: "✅", title: "What you taught me", tint: "#eef4ec", accent: "#5f7d57",
                    body: (<><p>{report?.wrote || "—"}</p>{report && report.mastered.length ? <div className="fy-card-chips">{report.mastered.map((c) => <span key={c} className="fy-mini-chip ok">✓ {c}</span>)}</div> : null}</>) },
                  { id: "missing", icon: "⚠️", title: "What you left out", tint: "#faf2e2", accent: "#b06a3c",
                    body: (<><p>{report?.missing || "—"}</p>{report && report.gaps.length ? <div className="fy-card-chips">{report.gaps.map((c) => <span key={c} className="fy-mini-chip gap">○ {c}</span>)}</div> : null}</>) },
                  { id: "better", icon: "💡", title: "What could be better", tint: "#eef2fb", accent: "#41619a",
                    body: (<p>{report?.better || "—"}</p>) },
                  { id: "improve", icon: "📚", title: `How to improve · ${LEVELS.find((l) => l.k === difficulty)?.label}`, tint: "#f3eefb", accent: "#7a5aa0",
                    body: (report && report.improve.length ? <ol>{report.improve.map((r, i) => <li key={i}>{r}</li>)}</ol> : <p className="fy-dim">—</p>) },
                ];
                return cards.map((card) => {
                  const open = openCards.has(card.id);
                  return (
                    <div key={card.id} className={`fy-fb-card ${open ? "open" : ""}`} style={{ background: card.tint }}>
                      <button className="fy-fb-head" onClick={() => toggleCard(card.id)} aria-expanded={open}>
                        <span className="fy-fb-icon">{card.icon}</span>
                        <span className="fy-fb-text">
                          <span className="fy-fb-title" style={{ color: card.accent }}>{card.title}</span>
                          {!open && <span className="fy-fb-hint">Click to expand</span>}
                        </span>
                        <ChevronDown size={22} className="fy-fb-chev" style={{ transform: open ? "rotate(180deg)" : "none" }} />
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div className="fy-fb-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                            <div className="fy-fb-inner">{card.body}</div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                });
              })()}
            </div>
            <p className="fy-fb-summary">{report?.summary || "Lovely work explaining the ideas in your own words. 🌳"}</p>
            <div className="fy-result-actions">
              <button className="fy-btn ghost" onClick={() => window.location.reload()}>Teach again</button>
              <Link href={back} className="fy-btn primary" style={{ textDecoration: "none" }}>Back to course</Link>
            </div>
          </motion.section>
        ) : (
          /* ───── CONVERSATION (one continuous chat) ───── */
          <motion.section key="convo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="fy-stage is-teaching">
            {/* header — End + hint on the left, stats centered, Dr. Feynman on the right */}
            <header className="fy-head">
              <div className="fy-head-l">
                {versionPicked
                  ? <button className="fy-end" onClick={finish}><ArrowLeft size={16} /> End</button>
                  : <Link href={back} className="fy-end"><ArrowLeft size={16} /> End</Link>}
                <button className="fy-hintbtn" onClick={requestHint} disabled={!versionPicked} aria-label="Need a hint?">
                  <span className="fy-hintbtn-q">?</span> need a hint?
                </button>
              </div>

              <div className="fy-head-c">
                <div className="fy-stats">
                  <span className={`fy-stat ${remaining <= 30 ? "low" : ""}`}><Clock size={14} /> {mm}:{ss}</span>
                  <span className="fy-divider" />
                  <span className="fy-stat"><Sprout size={14} /> {coverage.covered}/{coverage.total || 5}</span>
                  <span className="fy-divider" />
                  <span className="fy-tag" data-m={mastery}>{mastery}</span>
                </div>
              </div>

              <div className="fy-head-r">
                <span className="fy-who"><FeynmanPic size={30} /> {TUTOR_NAME}</span>
                <span className="fy-divider" />
                <button className={`fy-ctrl ${musicOn ? "on" : ""}`} onClick={() => setMusicOn((m) => !m)} aria-label={musicOn ? "Music off" : "Music on"} title={MUSIC_SRC ? "" : "Set MUSIC_SRC to enable music"}>{musicOn ? <Music size={17} /> : <Music2 size={17} />}</button>
                <button className={`fy-ctrl ${voiceOn ? "on" : ""}`} onClick={() => setVoiceOn((v) => !v)} aria-label={voiceOn ? "Voice off" : "Voice on"}>{voiceOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
              </div>
            </header>

            <div className="fy-body">
              {/* left rail — growing tree + progress + concepts */}
              <aside className="fy-aside">
                <div className="fy-tree-wrap"><GrowthTree points={treePoints} size={170} /></div>
                <div className="fy-bar"><div className="fy-bar-fill" style={{ width: `${coverage.percent}%` }} /></div>
                <p className="fy-pts">{score} pts · {coverage.percent}%</p>
                <div className="fy-chips">{concepts.map((c) => <span key={c.id} className={`fy-chip ${states[c.id] || "uncovered"}`}>{c.name}</span>)}</div>
              </aside>

              {/* chat fills the rest */}
              <div className="fy-conv">
                <div className="fy-thread" ref={threadRef}>
                  {messages.map((m) => (
                    m.role === "ai" ? (
                      <div key={m.id} className="fy-row fy-ai">
                        <div className="fy-bubble fy-bubble-ai">
                          <p className="fy-msg">{!m.typed ? <AutoTyping text={m.text} onDone={() => onTyped(m)} /> : m.text}</p>
                        </div>
                        <div className="fy-avcol"><span className="fy-av"><FeynmanPic size={48} /></span><span className="fy-avname">{TUTOR_NAME}</span></div>
                      </div>
                    ) : (
                      <div key={m.id} className="fy-row fy-me">
                        <div className="fy-avcol"><span className="fy-av"><Face variant={difficulty} size={48} /></span><span className="fy-avname">{name || "You"}</span></div>
                        <div className="fy-bubble fy-bubble-me"><p className="fy-msg">{m.text}</p></div>
                      </div>
                    )
                  ))}

                  {/* inline version picker — a Dr. Feynman bubble, before any version is chosen */}
                  {!versionPicked && !grading && (
                    <div className="fy-row fy-ai">
                      <div className="fy-bubble fy-bubble-ai fy-verpick">
                        <p className="fy-msg">Hello {name || "there"}, before we begin: which version of me would you like?</p>
                        <div className="fy-veropts">
                          {VERSIONS.map((v) => (
                            <button key={v.k} className="fy-veropt" onClick={() => pickVersion(v.k)}>
                              <span className="fy-veremoji">{v.emoji}</span>
                              <span className="fy-vertext"><b>{v.label}</b><small>{v.desc}</small></span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="fy-avcol"><span className="fy-av"><FeynmanPic size={48} /></span><span className="fy-avname">{TUTOR_NAME}</span></div>
                    </div>
                  )}

                  {grading && (
                    <div className="fy-row fy-ai">
                      <div className="fy-bubble fy-bubble-ai"><div className="fy-typing" aria-label="thinking"><span /><span /><span /></div></div>
                      <div className="fy-avcol"><span className="fy-av"><FeynmanPic size={48} /></span><span className="fy-avname">{TUTOR_NAME}</span></div>
                    </div>
                  )}

                  {/* inline student input — a green bubble at the bottom */}
                  <div className="fy-row fy-me fy-composer-row">
                    <div className="fy-avcol"><span className="fy-av"><Face variant={difficulty} size={48} /></span><span className="fy-avname">{name || "You"}</span></div>
                    <form className="fy-bubble fy-bubble-me fy-composer" onSubmit={(e) => { e.preventDefault(); submitExplain(); }}>
                      <input ref={composerRef} className="fy-cinput" placeholder={!versionPicked ? "Choose a version of Dr. Feynman to begin…" : botTyping ? "Listening…" : "Explain your understanding…"} value={input} onChange={(e) => setInput(e.target.value)} disabled={!versionPicked || grading || botTyping} autoComplete="off" />
                      <button className="fy-send" disabled={!versionPicked || grading || botTyping || !input.trim()} aria-label="send"><Send size={17} /></button>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {toast && <motion.div className="fy-toast" initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}>{toast}</motion.div>}
            </AnimatePresence>
            {err && <p className="fy-err">{err}</p>}

            {/* name popup — asked once, on load */}
            <AnimatePresence>
              {nameModal && (
                <motion.div className="fy-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <motion.div className="fy-modal fy-name-modal" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.22 }}>
                    <h2 className="fy-modal-q">What's your name?</h2>
                    <p className="fy-modal-sub">So Dr. Feynman knows who's teaching today.</p>
                    <form className="fy-modal-form" onSubmit={(e) => { e.preventDefault(); submitName(); }}>
                      <input className="fy-modal-input" placeholder="Type your name…" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoComplete="off" autoFocus />
                      <button className="fy-btn primary" type="submit" disabled={!nameDraft.trim()}>Continue</button>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* hint popup — opened from the topbar button */}
            <AnimatePresence>
              {hintModalOpen && (
                <motion.div className="fy-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setHintModalOpen(false)}>
                  <motion.div className="fy-modal fy-hint-modal" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.22 }} onClick={(e) => e.stopPropagation()}>
                    <div className="fy-hint-head">
                      <span className="fy-hint-bulb"><Lightbulb size={15} /></span>
                      <div className="fy-hint-headtext">
                        <span className="fy-hint-eyebrow">Hint for</span>
                        <b className="fy-hint-concept">{activeConcept()?.name || "this concept"}</b>
                      </div>
                      <button className="fy-hint-x" onClick={() => setHintModalOpen(false)} aria-label="Close hint"><X size={15} /></button>
                    </div>
                    <div className="fy-hint-box">{hintLoading ? "Thinking of a tip…" : hintText}</div>
                    <p className="fy-hint-note">Using a hint reduces your points for this concept by 5 pts</p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
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
          padding:12px 24px; margin:0; background:rgba(251,245,230,.85); backdrop-filter:blur(8px);
          border-bottom:1px solid var(--line); }
        .fy-head-l { justify-self:start; display:flex; align-items:center; gap:12px; } .fy-head-c { justify-self:center; } .fy-head-r { justify-self:end; display:flex; align-items:center; gap:10px; }
        .fy-brand { font-family:"Fraunces",serif; font-size:15px; letter-spacing:.08em; color:var(--sage-deep); }
        .fy-end { display:inline-flex; align-items:center; gap:6px; background:none; border:none; color:var(--ink-soft); font-size:14px; font-weight:500; cursor:pointer; text-decoration:none; }
        .fy-end:hover { color:var(--ink); }
        /* topbar hint pill, beside End */
        .fy-hintbtn { display:inline-flex; align-items:center; gap:7px; padding:6px 14px 6px 7px; border-radius:999px; border:1px solid var(--line); background:var(--surface); color:var(--ink-soft); font-size:12.5px; cursor:pointer; transition:background .15s, color .15s, box-shadow .15s; }
        .fy-hintbtn:hover:not(:disabled) { background:#fff8ea; color:var(--ink); box-shadow:0 2px 8px rgba(63,55,38,.08); }
        .fy-hintbtn:disabled { opacity:.45; cursor:default; }
        .fy-hintbtn-q { width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; border:1px solid var(--line); background:var(--cream); font-weight:700; font-size:13px; color:var(--muted); }
        .fy-divider { width:1px; height:16px; background:var(--line); }
        .fy-stats { display:flex; align-items:center; gap:11px; }
        .fy-stat { display:inline-flex; align-items:center; gap:5px; font-size:13px; color:var(--ink-soft); font-variant-numeric:tabular-nums; }
        .fy-stat.low { color:var(--clay); }
        .fy-tag { padding:4px 11px; border-radius:13px; font-size:11px; letter-spacing:.06em; text-transform:uppercase; background:#e8f0eb; border:1px solid #b5d0be; color:var(--sage-deep); font-weight:600; }
        .fy-tag[data-m="Mastered"] { background:var(--sage); color:var(--cream); border-color:var(--sage); }
        .fy-tag[data-m="Developing"] { background:rgba(187,141,57,.18); color:#8a6620; border-color:rgba(187,141,57,.3); }
        .fy-who { display:inline-flex; align-items:center; gap:8px; font-size:14px; font-weight:500; color:var(--ink); }
        .fy-ctrl { width:34px; height:34px; display:flex; align-items:center; justify-content:center; border-radius:50%; border:1px solid var(--line); background:var(--surface); color:var(--muted); cursor:pointer; transition:background .15s,color .15s; }
        .fy-ctrl:hover { background:#fff8ea; } .fy-ctrl.on { color:var(--sage-deep); }

        /* stage / layout — full width */
        .fy-stage { position:relative; z-index:1; min-height:100vh; max-width:none; margin:0; padding:0; display:flex; flex-direction:column; }
        .fy-hero { display:flex; justify-content:center; margin:26px 0 -4px; }

        .fy-body { flex:1; display:flex; gap:0; min-height:0; }
        /* left rail with a divider; tree centered vertically */
        .fy-aside { flex:0 0 232px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:28px 20px; border-right:1px solid var(--line); }
        .fy-tree-wrap { display:flex; align-items:flex-end; justify-content:center; min-height:180px; }
        .fy-bar { width:100%; max-width:180px; height:7px; border-radius:6px; background:var(--surface2); border:1px solid var(--line); overflow:hidden; }
        .fy-bar-fill { height:100%; background:linear-gradient(90deg, var(--sage), #8a9a6b); border-radius:6px; transition:width .7s cubic-bezier(.2,.7,.2,1); }
        .fy-pts { font-size:13px; color:var(--sage-deep); font-weight:600; margin:0; }
        .fy-chips { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
        .fy-chip { font-size:11.5px; padding:5px 11px; border-radius:13px; border:1px solid var(--line); color:var(--muted); background:transparent; text-align:center; transition:all .3s; }
        .fy-chip.covered { background:var(--sage); color:var(--cream); border-color:var(--sage); }
        .fy-chip.weak { border-color:var(--clay); color:var(--clay); background:#fbf0e4; }

        /* inline version picker (a Dr. Feynman bubble) */
        .fy-verpick { padding:18px 22px; }
        .fy-veropts { display:flex; flex-direction:column; gap:10px; margin-top:14px; }
        .fy-veropt { display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:13px 18px; border-radius:12px; border:1px solid var(--line); background:rgba(255,255,255,.35); cursor:pointer; transition:transform .12s, background .15s, border-color .15s; }
        .fy-veropt:hover { transform:translateY(-1px); background:#fff; border-color:var(--sage); }
        .fy-veremoji { font-size:22px; line-height:1; }
        .fy-vertext { display:flex; flex-direction:column; }
        .fy-vertext b { font-size:14.5px; color:var(--ink); }
        .fy-vertext small { font-size:12.5px; color:var(--muted); }

        /* centered modal (name + hint) */
        .fy-overlay { position:fixed; inset:0; z-index:50; display:flex; align-items:center; justify-content:center; background:rgba(44,36,22,.35); backdrop-filter:blur(3px); padding:20px; }
        .fy-modal { background:var(--surface); border:1px solid var(--line); border-radius:22px; box-shadow:0 24px 60px rgba(44,36,22,.28); width:100%; max-width:440px; padding:28px; }
        .fy-name-modal { text-align:center; }
        .fy-modal-q { font-family:"Fraunces",Georgia,serif; font-size:30px; line-height:1.2; color:var(--ink); margin:0 0 6px; font-weight:500; }
        .fy-modal-sub { font-size:14px; color:var(--muted); margin:0 0 20px; }
        .fy-modal-form { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
        .fy-modal-input { flex:1; min-width:200px; padding:14px 18px; border:1px solid var(--line); border-radius:14px; background:var(--cream); font-size:16px; color:var(--ink); outline:none; }
        .fy-modal-input:focus { border-color:var(--sage); box-shadow:0 0 0 3px rgba(111,125,87,.16); }
        /* hint modal */
        .fy-hint-head { display:flex; align-items:flex-start; gap:11px; margin-bottom:16px; }
        .fy-hint-bulb { width:34px; height:34px; flex:none; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--clay); color:#fff; }
        .fy-hint-headtext { display:flex; flex-direction:column; gap:1px; flex:1; }
        .fy-hint-eyebrow { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; }
        .fy-hint-concept { font-size:16px; color:var(--ink); font-weight:600; }
        .fy-hint-x { width:30px; height:30px; flex:none; border-radius:50%; border:1px solid var(--line); background:var(--surface); color:var(--muted); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .15s; }
        .fy-hint-x:hover { background:var(--cream); color:var(--ink); }
        .fy-hint-box { background:var(--cream); border:1px solid var(--line); border-radius:14px; padding:18px; font-size:15px; line-height:1.6; color:var(--ink); }
        .fy-hint-note { font-size:12px; color:var(--muted); text-align:center; margin:16px 0 0; }

        /* conversation */
        .fy-conv { flex:1; display:flex; flex-direction:column; min-height:0; align-items:center; }
        .fy-thread { flex:1; width:100%; max-width:none; overflow-y:auto; display:flex; flex-direction:column; gap:20px; padding:24px 48px; max-height:80vh; }
        .fy-stage:not(.is-teaching) .fy-thread { max-height:none; align-items:center; text-align:center; }

        /* chat rows — student left (green), Dr. Feynman right (cream) */
        .fy-row { display:flex; align-items:flex-start; gap:14px; width:100%; }
        .fy-me { flex-direction:row; }
        .fy-ai { flex-direction:row; }
        .fy-bubble { flex:1; min-width:0; border-radius:16px; padding:16px 22px; box-shadow:0 2px 8px rgba(63,55,38,.07); }
        .fy-bubble-me { background:var(--sage); }
        .fy-bubble-ai { background:var(--surface); border:1px solid var(--line); }
        .fy-msg { font-family:"Fraunces",Georgia,serif; font-size:18px; line-height:1.6; margin:0; font-weight:400; white-space:pre-line; }
        .fy-stage:not(.is-teaching) .fy-msg { font-size:24px; }
        .fy-bubble-ai .fy-msg { color:var(--ink); }
        .fy-bubble-me .fy-msg { color:var(--cream); font-weight:500; }

        /* avatar + name column beside each bubble */
        .fy-avcol { flex:none; width:56px; display:flex; flex-direction:column; align-items:center; gap:4px; }
        .fy-av { width:48px; height:48px; border-radius:50%; overflow:hidden; box-shadow:0 2px 6px rgba(74,64,42,.18); border:2px solid var(--cream); }
        .fy-av svg { display:block; width:100%; height:100%; }
        .fy-avname { font-size:10.5px; font-weight:600; color:var(--muted); text-align:center; line-height:1.1; max-width:56px; overflow:hidden; text-overflow:ellipsis; }
        .fy-pic { display:inline-flex; align-items:center; justify-content:center; border-radius:50%; overflow:hidden; }
        .fy-pic img { object-fit:cover; object-position:center 18%; }

        /* inline composer styled as a green student bubble */
        .fy-composer-row { }
        .fy-composer { display:flex; align-items:center; gap:10px; padding:6px 8px 6px 22px; }
        .fy-cinput { flex:1; min-width:0; background:transparent; border:none; outline:none; font-family:"Fraunces",Georgia,serif; font-size:17px; color:var(--cream); padding:10px 0; }
        .fy-cinput::placeholder { color:rgba(247,243,233,.6); }
        .fy-cinput:disabled { opacity:.8; }
        .fy-send { width:42px; height:42px; flex:none; border-radius:50%; border:none; background:var(--accent, #c4956a); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(63,55,38,.2); transition:transform .12s, background .15s; }
        .fy-send:hover { transform:scale(1.05); } .fy-send:disabled { opacity:.45; cursor:default; transform:none; }
        .fy-typing { display:inline-flex; gap:7px; padding:6px 2px; }
        .fy-typing span { width:9px; height:9px; border-radius:50%; background:var(--muted); animation:fyDot 1.4s ease-in-out infinite; }
        .fy-typing span:nth-child(2){animation-delay:.2s;} .fy-typing span:nth-child(3){animation-delay:.4s;}
        @keyframes fyDot { 0%,80%,100%{opacity:.25;transform:scale(.8);} 40%{opacity:1;transform:scale(1);} }

        /* simple name screen — centered, no avatar, no preamble */
        .fy-name-screen { max-width:520px; margin:80px auto 0; text-align:center; display:flex; flex-direction:column; gap:24px; align-items:center; }
        .fy-name-q { font-family:"Fraunces",Georgia,serif; font-size:38px; line-height:1.2; color:var(--ink); margin:0; font-weight:500; }
        .fy-name-form { display:flex; gap:10px; justify-content:center; width:100%; flex-wrap:wrap; }
        .fy-name-form .fy-input { flex:1; min-width:240px; max-width:340px; padding:14px 20px; font-size:16px; }

        /* persona picker — 3 cards, each with its own avatar */
        .fy-persona { max-width:820px; margin:6px auto 0; text-align:center; }
        .fy-persona-q { font-family:"Fraunces",Georgia,serif; font-size:22px; line-height:1.5; color:var(--ink); margin:0 0 22px; }
        .fy-personas { display:flex; flex-wrap:wrap; gap:18px; justify-content:center; }
        .fy-persona-card { position:relative; width:236px; text-align:center; background:var(--surface); border:1.5px solid var(--line); border-radius:22px; padding:24px 20px 22px; cursor:pointer; box-shadow:0 6px 18px rgba(63,55,38,.07); transition:transform .16s, box-shadow .18s, border-color .18s; display:flex; flex-direction:column; align-items:center; gap:4px; }
        .fy-persona-card:hover { transform:translateY(-6px); box-shadow:0 18px 36px rgba(63,55,38,.16); border-color:var(--accent); }
        .fy-persona-face { width:96px; height:96px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:10px; box-shadow:0 4px 14px rgba(63,55,38,.12); }
        .fy-persona-face svg { border-radius:50%; }
        .fy-persona-title { font-family:"Fraunces",serif; font-size:20px; color:var(--accent); }
        .fy-persona-blurb { font-size:12.5px; color:var(--muted); }
        .fy-persona-desc { font-size:13px; line-height:1.5; color:var(--ink-soft); margin:8px 0 0; }
        .fy-persona-go { margin-top:14px; font-size:13px; font-weight:600; color:var(--accent); opacity:0; transform:translateY(4px); transition:opacity .18s, transform .18s; }
        .fy-persona-card:hover .fy-persona-go { opacity:1; transform:translateY(0); }

        /* base text input (used by the name screen) */
        .fy-input { flex:1; padding:16px 22px; border:1px solid var(--line); border-radius:30px; background:var(--surface); font-size:16px; color:var(--ink); outline:none; box-shadow:inset 0 1px 2px rgba(63,55,38,.05); transition:box-shadow .15s,border-color .15s; }
        .fy-input:focus { border-color:var(--sage); box-shadow:0 0 0 3px rgba(111,125,87,.16); }
        .fy-input:disabled { opacity:.75; }
        .fy-input::placeholder { color:var(--muted); }

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
        .fy-results { position:relative; z-index:1; max-width:920px; margin:0 auto; padding:54px 24px 80px; min-height:100vh; display:flex; flex-direction:column; }
        .fy-result-head { display:flex; align-items:center; gap:26px; margin-bottom:20px; }
        .fy-result-score { font-size:16px; color:var(--ink-soft); margin:6px 0 0; }
        .fy-result-score b { font-size:24px; color:var(--sage-deep); }
        /* feedback accordion */
        .fy-fb { display:flex; flex-direction:column; gap:16px; max-width:920px; margin:0 auto; width:100%; }
        .fy-fb-card { border:1px solid rgba(63,55,38,.1); border-radius:18px; overflow:hidden; box-shadow:0 6px 16px rgba(63,55,38,.06); transition:box-shadow .15s; }
        .fy-fb-card.open { box-shadow:0 12px 28px rgba(63,55,38,.12); }
        .fy-fb-head { width:100%; display:flex; align-items:center; gap:18px; padding:22px 26px; background:none; border:none; cursor:pointer; text-align:left; }
        .fy-fb-icon { font-size:26px; line-height:1; flex:none; }
        .fy-fb-text { display:flex; flex-direction:column; gap:3px; flex:1; min-width:0; }
        .fy-fb-title { font-family:"Fraunces",serif; font-size:21px; font-weight:600; }
        .fy-fb-hint { font-size:13.5px; color:var(--muted); }
        .fy-fb-chev { color:var(--ink-soft); flex:none; transition:transform .2s; }
        .fy-fb-body { overflow:hidden; }
        .fy-fb-inner { padding:0 26px 22px 62px; }
        .fy-fb-inner p { margin:0; font-size:16.5px; line-height:1.7; color:var(--ink); }
        .fy-fb-inner ol { margin:0; padding-left:20px; }
        .fy-fb-inner li { font-size:16.5px; line-height:1.65; color:var(--ink); margin-bottom:8px; }
        .fy-fb-summary { max-width:64ch; margin:30px auto 0; text-align:center; font-family:"Fraunces",serif; font-size:20px; line-height:1.65; color:var(--sage-deep); }
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
          .fy-persona-card { width:100%; max-width:320px; }
          .fy-fb-inner { padding-left:20px; }
          .fy-result-head { flex-direction:column; text-align:center; }
          .fy-tutor-corner { display:none; }
        }
      `}</style>
    </div>
  );
}