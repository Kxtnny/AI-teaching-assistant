"use client";

// app/LectureLens/components/TutorAvatar.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared tutor avatar. Self-contained: carries its own scoped styles + keyframes,
// so it animates correctly on any page regardless of that page's CSS.
//
// Two visual variants (kept identical to their original inline implementations):
//   • "grove"   — used on the active-learning primer (speech waves + name label)
//   • "feynman" — used on the Dr. Feynman challenge hero (responsive width)
//
// Usage:
//   <TutorAvatar speaking={isSpeaking} />                    // grove (default)
//   <TutorAvatar variant="feynman" speaking={isSpeaking} />  // feynman
// ─────────────────────────────────────────────────────────────────────────────

export type TutorAvatarVariant = "grove" | "feynman";

interface TutorAvatarProps {
  speaking?: boolean;
  variant?: TutorAvatarVariant;
  /** Extra class names forwarded to the avatar root (e.g. for layout overrides). */
  className?: string;
  /** Grove variant only — the small label under the figure. */
  label?: string;
}

export default function TutorAvatar({
  speaking = false,
  variant = "grove",
  className = "",
  label = "Dr. Feynman",
}: TutorAvatarProps) {
  if (variant === "feynman") {
    return (
      <div className={`fy-avatar ${speaking ? "speaking" : ""} ${className}`.trim()}>
        <svg viewBox="0 0 260 380" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <linearGradient id="fS" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#f4cda6" /><stop offset="1" stopColor="#e0a574" /></linearGradient>
            <linearGradient id="fA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#edbd92" /><stop offset="1" stopColor="#d99f6d" /></linearGradient>
            <linearGradient id="fH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7b6450" /><stop offset="1" stopColor="#4f3d2f" /></linearGradient>
            <linearGradient id="fC" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stopColor="#6f9a7e" /><stop offset="1" stopColor="#456a55" /></linearGradient>
            <radialGradient id="fK" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#e58a63" stopOpacity="0.5" /><stop offset="1" stopColor="#e58a63" stopOpacity="0" /></radialGradient>
          </defs>
          <ellipse cx="130" cy="368" rx="74" ry="10" fill="#1f352c" opacity=".25" />
          <path d="M58 380 C52 290 74 250 130 250 C186 250 198 290 192 380 Z" fill="url(#fC)" />
          <path d="M130 252 C112 252 100 262 94 280 L130 304 L166 280 C160 262 148 252 130 252 Z" fill="#fbf6e6" />
          <path d="M112 254 L130 276 L148 254" fill="none" stroke="#fbf6e6" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M66 286 C48 306 46 334 56 360" fill="none" stroke="url(#fC)" strokeWidth="28" strokeLinecap="round" /><circle cx="58" cy="360" r="14" fill="url(#fA)" />
          <g className="fy-arm"><path d="M190 282 C228 268 244 248 252 226" fill="none" stroke="url(#fC)" strokeWidth="28" strokeLinecap="round" /><circle cx="252" cy="223" r="14.5" fill="url(#fA)" /></g>
          <rect x="114" y="202" width="32" height="38" rx="14" fill="#e0a574" /><ellipse cx="130" cy="206" rx="34" ry="13" fill="#c98c58" opacity=".45" />
          <ellipse cx="130" cy="150" rx="56" ry="60" fill="url(#fS)" />
          <ellipse cx="75" cy="154" rx="10" ry="14" fill="#e0a574" /><ellipse cx="185" cy="154" rx="10" ry="14" fill="#e0a574" />
          <path d="M74 152 C66 88 98 64 130 64 C162 64 194 88 186 152 C183 126 178 116 160 110 C160 96 148 90 134 94 C112 78 88 96 86 118 C80 128 77 134 74 152 Z" fill="url(#fH)" />
          <path d="M77 146 q3 -18 12 -28" fill="none" stroke="#b6a890" strokeWidth="3" strokeLinecap="round" opacity=".5" />
          <ellipse cx="98" cy="170" rx="14" ry="10" fill="url(#fK)" /><ellipse cx="162" cy="170" rx="14" ry="10" fill="url(#fK)" />
          <g stroke="#3a2f23" strokeWidth="3.4" fill="#fffdf6" fillOpacity=".12"><rect x="84" y="142" width="34" height="29" rx="13" /><rect x="142" y="142" width="34" height="29" rx="13" /></g>
          <path d="M118 155 q12 -5 24 0" fill="none" stroke="#3a2f23" strokeWidth="3.4" />
          <g className="fy-eyes"><ellipse cx="101" cy="156" rx="6" ry="6.8" fill="#fff" /><ellipse cx="159" cy="156" rx="6" ry="6.8" fill="#fff" /><circle cx="102" cy="157" r="3.7" fill="#43301f" /><circle cx="160" cy="157" r="3.7" fill="#43301f" /><circle cx="100.3" cy="154.8" r="1.2" fill="#fff" /><circle cx="158.3" cy="154.8" r="1.2" fill="#fff" /></g>
          <g><path d="M88 133 q12 -7 25 -1" fill="none" stroke="#5a4634" strokeWidth="3.6" strokeLinecap="round" /><path d="M147 132 q13 -6 25 1" fill="none" stroke="#5a4634" strokeWidth="3.6" strokeLinecap="round" /></g>
          <path d="M127 160 q-6 14 4 19" fill="none" stroke="#c98c58" strokeWidth="3.2" strokeLinecap="round" />
          <g><path d="M110 189 q20 9 40 0" fill="none" stroke="#9c5a44" strokeWidth="3.4" strokeLinecap="round" /><ellipse className="fy-mouth" cx="130" cy="191" rx="13" ry="3.4" fill="#7a3f30" /></g>
        </svg>

        <style jsx>{`
          .fy-avatar { position:relative; width:188px; filter:drop-shadow(0 12px 20px rgba(74,64,42,.18)); animation:fyBob 5s ease-in-out infinite; }
          .fy-avatar svg { display:block; width:100%; height:auto; }
          .fy-avatar.speaking { animation:fyBob 2.8s ease-in-out infinite; }
          @keyframes fyBob { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-5px);} }
          .fy-eyes { transform-box:fill-box; transform-origin:center; animation:fyBlink 5.5s ease-in-out infinite; }
          @keyframes fyBlink { 0%,94%,100%{transform:scaleY(1);} 97%{transform:scaleY(.1);} }
          .fy-mouth { transform-box:fill-box; transform-origin:center; transform:scaleY(.35); }
          .fy-avatar.speaking .fy-mouth { animation:fyTalk .3s ease-in-out infinite; }
          @keyframes fyTalk { 0%,100%{transform:scaleY(.4);} 50%{transform:scaleY(1.6);} }
          .fy-avatar.speaking .fy-arm { animation:fyGes 2.8s ease-in-out infinite; transform-box:fill-box; transform-origin:55% 92%; }
          @keyframes fyGes { 0%,100%{transform:rotate(0);} 50%{transform:rotate(-6deg);} }
          @media (prefers-reduced-motion:reduce){ .fy-avatar,.fy-avatar.speaking,.fy-mouth,.fy-arm,.fy-eyes{animation:none;} }
          @media (max-width:820px){ .fy-avatar { width:140px; } }
        `}</style>
      </div>
    );
  }

  // ── grove (default) ──
  return (
    <div className={`grv-avatar ${speaking ? "speaking" : ""} ${className}`.trim()}>
      <svg viewBox="0 0 240 360" width="210" height="315" aria-hidden="true">
        <defs>
          <linearGradient id="grvSkin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3c79f" /><stop offset="1" stopColor="#e3a878" />
          </linearGradient>
          <linearGradient id="grvSkinArm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eebd92" /><stop offset="1" stopColor="#dca06f" />
          </linearGradient>
          <linearGradient id="grvHair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6f5743" /><stop offset="1" stopColor="#46362a" />
          </linearGradient>
          <linearGradient id="grvCardi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5d8a6c" /><stop offset="1" stopColor="#3a5a46" />
          </linearGradient>
          <radialGradient id="grvCheek" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#e98f68" stopOpacity="0.55" /><stop offset="1" stopColor="#e98f68" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ground shadow */}
        <ellipse cx="120" cy="348" rx="62" ry="9" fill="#3a2f23" opacity=".10" />

        {/* torso / cardigan */}
        <path d="M58 360 C54 280 70 246 120 246 C170 246 186 280 182 360 Z" fill="url(#grvCardi)" />
        {/* cardigan shading on the right */}
        <path d="M120 246 C170 246 186 280 182 360 L150 360 C156 300 150 262 120 250 Z" fill="#34503f" opacity=".45" />
        {/* shirt V */}
        <path d="M120 248 C104 248 92 258 86 274 L120 296 L154 274 C148 258 136 248 120 248 Z" fill="#fbf6e6" />
        <path d="M120 250 L120 300" stroke="#e2dac4" strokeWidth="3" />
        {/* collar */}
        <path d="M104 250 L120 270 L136 250" fill="none" stroke="#fbf6e6" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        {/* buttons */}
        <circle cx="120" cy="312" r="3" fill="#2f4a39" /><circle cx="120" cy="332" r="3" fill="#2f4a39" />

        {/* resting left arm */}
        <path d="M64 280 C48 300 46 326 56 348" fill="none" stroke="url(#grvCardi)" strokeWidth="26" strokeLinecap="round" />
        <circle cx="58" cy="348" r="13" fill="url(#grvSkinArm)" />

        {/* gesturing right arm toward the board */}
        <g className="grv-avatar-arm">
          <path d="M176 276 C212 262 226 244 234 224" fill="none" stroke="url(#grvCardi)" strokeWidth="26" strokeLinecap="round" />
          <circle cx="234" cy="221" r="13.5" fill="url(#grvSkinArm)" />
          {/* thumb hint */}
          <path d="M228 212 q8 -3 12 4" fill="none" stroke="#cf9163" strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* neck + chin shadow */}
        <rect x="106" y="198" width="28" height="34" rx="12" fill="#e3a878" />
        <ellipse cx="120" cy="200" rx="30" ry="12" fill="#cf9163" opacity=".4" />

        {/* head */}
        <ellipse cx="120" cy="150" rx="50" ry="54" fill="url(#grvSkin)" />
        {/* ears */}
        <ellipse cx="71" cy="152" rx="9" ry="12" fill="#e3a878" />
        <ellipse cx="169" cy="152" rx="9" ry="12" fill="#e3a878" />
        <ellipse cx="71" cy="152" rx="4" ry="6" fill="#cf9163" opacity=".6" />
        <ellipse cx="169" cy="152" rx="4" ry="6" fill="#cf9163" opacity=".6" />

        {/* hair — swept side part */}
        <path d="M70 150 C64 96 92 74 120 74 C150 74 178 96 172 150 C170 128 166 118 150 112 C150 100 140 96 128 98 C108 84 86 100 84 120 C80 128 72 132 70 150 Z" fill="url(#grvHair)" />
        <path d="M120 74 C150 74 178 96 172 150 C170 128 166 118 150 112 C150 100 140 96 128 98 Z" fill="#3a2c21" opacity=".35" />

        {/* cheeks */}
        <ellipse cx="92" cy="166" rx="13" ry="9" fill="url(#grvCheek)" />
        <ellipse cx="148" cy="166" rx="13" ry="9" fill="url(#grvCheek)" />

        {/* glasses */}
        <g stroke="#3a2f23" strokeWidth="3.2" fill="#fffdf6" fillOpacity=".10">
          <rect x="80" y="140" width="30" height="26" rx="11" />
          <rect x="130" y="140" width="30" height="26" rx="11" />
        </g>
        <path d="M110 152 q10 -5 20 0" fill="none" stroke="#3a2f23" strokeWidth="3.2" />
        <path d="M80 150 L70 148" stroke="#3a2f23" strokeWidth="3" strokeLinecap="round" />
        <path d="M160 150 L170 148" stroke="#3a2f23" strokeWidth="3" strokeLinecap="round" />

        {/* eyes (blink via CSS group) */}
        <g className="grv-avatar-eyes">
          <ellipse cx="95" cy="153" rx="5.4" ry="6.2" fill="#fff" />
          <ellipse cx="145" cy="153" rx="5.4" ry="6.2" fill="#fff" />
          <circle cx="96" cy="154" r="3.4" fill="#3a2a1e" />
          <circle cx="146" cy="154" r="3.4" fill="#3a2a1e" />
          <circle cx="94.4" cy="152" r="1.1" fill="#fff" />
          <circle cx="144.4" cy="152" r="1.1" fill="#fff" />
        </g>

        {/* brows */}
        <g className="grv-avatar-brows">
          <path d="M84 132 q11 -6 22 -1" fill="none" stroke="#4a3a2c" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M134 131 q11 -5 22 1" fill="none" stroke="#4a3a2c" strokeWidth="3.4" strokeLinecap="round" />
        </g>

        {/* nose */}
        <path d="M118 158 q-5 12 3 16" fill="none" stroke="#cf9163" strokeWidth="3" strokeLinecap="round" />

        {/* mouth — opens/closes when speaking */}
        <g className="grv-avatar-mouth-g">
          <path className="grv-avatar-lip" d="M104 184 q16 6 32 0" fill="none" stroke="#9c5a44" strokeWidth="3.2" strokeLinecap="round" />
          <ellipse className="grv-avatar-mouth" cx="120" cy="186" rx="11" ry="3" fill="#7a3f30" />
        </g>
      </svg>

      <span className="grv-speech-waves" aria-hidden><span /><span /><span /></span>
      <span className="grv-avatar-name">{label}</span>

      <style jsx>{`
        .grv-avatar { flex:0 0 auto; position:relative; display:flex; flex-direction:column; align-items:center; align-self:center; filter:drop-shadow(0 12px 20px rgba(58,54,44,.18)); animation:grvBob 5s ease-in-out infinite; }
        .grv-avatar svg { display:block; }
        .grv-avatar-name { margin-top:4px; font-family:ui-sans-serif,system-ui,sans-serif; font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted,#8a8270); }
        /* gentle idle bob; livelier when speaking */
        .grv-avatar.speaking { animation:grvBob 2.8s ease-in-out infinite; }
        @keyframes grvBob { 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-5px); } }
        /* eyes blink periodically */
        .grv-avatar-eyes { transform-box:fill-box; transform-origin:center; animation:grvBlink 5.5s ease-in-out infinite; }
        @keyframes grvBlink { 0%,94%,100%{ transform:scaleY(1); } 97%{ transform:scaleY(.1); } }
        /* mouth: still when idle, opening/closing when speaking */
        .grv-avatar-mouth { transform-box:fill-box; transform-origin:center; transform:scaleY(.35); }
        .grv-avatar-lip { opacity:.9; }
        .grv-avatar.speaking .grv-avatar-mouth { animation:grvTalk .3s ease-in-out infinite; }
        @keyframes grvTalk { 0%,100%{ transform:scaleY(.4); } 50%{ transform:scaleY(1.6); } }
        .grv-avatar.speaking .grv-avatar-arm { animation:grvGesture 2.8s ease-in-out infinite; transform-box:fill-box; transform-origin:55% 92%; }
        @keyframes grvGesture { 0%,100%{ transform:rotate(0deg); } 50%{ transform:rotate(-6deg); } }
        /* speech waves near the mouth side */
        .grv-speech-waves { position:absolute; top:34%; right:-10px; display:flex; flex-direction:column; gap:5px; opacity:0; transition:opacity .25s; }
        .grv-avatar.speaking .grv-speech-waves { opacity:1; }
        .grv-speech-waves span { display:block; width:16px; height:3px; border-radius:2px; background:var(--sage,#6aa085); animation:grvWave 1s ease-in-out infinite; }
        .grv-speech-waves span:nth-child(2){ width:22px; animation-delay:.15s; }
        .grv-speech-waves span:nth-child(3){ width:12px; animation-delay:.3s; }
        @keyframes grvWave { 0%,100%{ opacity:.3; transform:scaleX(.7); } 50%{ opacity:1; transform:scaleX(1); } }
        @media (prefers-reduced-motion:reduce){ .grv-avatar,.grv-avatar.speaking,.grv-avatar-mouth,.grv-avatar-arm,.grv-avatar-eyes,.grv-speech-waves span{animation:none;} }
        @media (max-width:960px){
          .grv-avatar { align-self:center; order:-1; margin-bottom:-22px; z-index:2; }
          .grv-avatar svg { width:132px; height:198px; }
          .grv-speech-waves { display:none; }
        }
      `}</style>
    </div>
  );
}
