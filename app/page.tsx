"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./Homepage.css";

type StepKey = "pick" | "simplify" | "gaps" | "review";

export default function Homepage() {
  const [loaded, setLoaded] = useState(false);
  const [openStep, setOpenStep] = useState<StepKey | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const steps = useMemo(
    () => [
      {
        key: "pick" as const,
        step: 1,
        title: "Pick a Topic",
        icon: "🧠",
        subtitle: "Choose what you want to understand more deeply.",
        bullets: [
          "Pick a random topic (surprise me!)",
          "Pick a challenging topic (level up!)",
          "AI detects where you struggle most using BERT Topic Modeling",
          "See a mini analytics view of “hard topics” + a Fact of the Day",
        ],
        cardAccent: "accent-blue",
        details:
          "Start with a topic you’re learning right now. Dr Feynman helps you choose what matters most by surfacing your highest-friction areas and nudging you toward the best next topic.",
      },
      {
        key: "simplify" as const,
        step: 2,
        title: "Simplify the Topic",
        icon: "💬",
        subtitle: "Teach it back in plain language—like explaining to a friend.",
        bullets: [
          "Explain concepts to the AI facilitator",
          "Tracks your explanations and saves versions",
          "Summarizes what you said (so you can refine it)",
          "Gives clear, friendly explanations when needed",
        ],
        cardAccent: "accent-green",
        details:
          "You do the talking. The AI listens, summarizes, and helps you rephrase. Teaching forces clarity—and clarity is what we’re building.",
      },
      {
        key: "gaps" as const,
        step: 3,
        title: "Identify Knowledge Gaps",
        icon: "🔎",
        subtitle: "Find the fuzzy parts with gentle, Socratic questions.",
        bullets: [
          "Adaptive Socratic questioning",
          "Guided learning paths",
          "AI explains after gaps are identified",
          "Turns confusion into checkpoints you can conquer",
        ],
        cardAccent: "accent-purple",
        details:
          "When your explanation has a jump, Dr Feynman pauses and asks the perfect follow-up question—until every step makes sense end-to-end.",
      },
      {
        key: "review" as const,
        step: 4,
        title: "Review",
        icon: "✅",
        subtitle: "Polish your understanding and make it stick.",
        bullets: [
          "Response Optimization (clearer explanations)",
          "RAG Enhancement (more accurate support)",
          "Prompt Optimization (ask better questions)",
          "Checklist-style review and improvement meter",
        ],
        cardAccent: "accent-orange",
        details:
          "Review turns a good explanation into a great one. We help you rewrite, fact-check, and improve your questions so your learning accelerates.",
      },
    ],
    []
  );

  const toggleStep = (key: StepKey) => {
    setOpenStep((prev) => (prev === key ? null : key));
  };

  return (
    <div className={`homepage-container ${loaded ? "page-loaded" : ""}`}>
      {/* Entrance curtain */}
      <div className="entrance-curtain" />

      {/* Floating education doodles */}
      <div className="bg-doodles" aria-hidden="true">
        <span className="doodle doodle-1">📐</span>
        <span className="doodle doodle-2">🧪</span>
        <span className="doodle doodle-3">📚</span>
        <span className="doodle doodle-4">🔬</span>
        <span className="doodle doodle-5">✏️</span>
        <span className="doodle doodle-6">🧮</span>
        <span className="doodle doodle-7">🎓</span>
        <span className="doodle doodle-8">💡</span>
        <span className="doodle doodle-9">⚛️</span>
        <span className="doodle doodle-10">🌍</span>
      </div>

      {/* Sticky Navbar */}
      <nav className="navbar" role="navigation" aria-label="Primary">
        <div className="nav-left">
          <Link href="/" className="brand">
            <span className="mascot" aria-hidden="true">
              🧑‍🔬
            </span>
            <span className="brand-text">Dr Feynman</span>
          </Link>
        </div>

        <div className="nav-right">
          <a className="pill pill-soft" href="#home">
            Home
          </a>
          <a className="pill pill-blue" href="#chatbot">
            Chatbot
          </a>
          <a className="pill pill-purple" href="#collabot">
            Collabot
          </a>
          <a className="pill pill-green" href="#about">
            About
          </a>
        </div>
      </nav>

      {/* HERO */}
      <header id="home" className="hero">
        <div className="hero-bg" aria-hidden="true">
          <div className="shape shape-1" />
          <div className="shape shape-2" />
          <div className="shape shape-3" />
          <div className="shape shape-4" />
        </div>

        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-kicker">
              Learn faster by teaching
            </div>

            <h1 className="hero-title">Dr Feynman</h1>

            <p className="hero-subtitle">Learn by Teaching with AI</p>

            <p className="hero-desc">
              An AI-powered platform that enhances the <strong>Feynman learning technique</strong>{" "}
              using LLMs—so you can explain clearly, find gaps, and build real understanding.
            </p>

            <div className="hero-actions">
              <Link className="btn btn-primary" href="/start">
                Start Learning
              </Link>
              <Link className="btn btn-secondary" href="/Chatbot">
                Try Chatbot
              </Link>
            </div>

            <div className="hero-floats" aria-hidden="true">
              <span className="float float-1">🧠</span>
              <span className="float float-2">📚</span>
              <span className="float float-3">💡</span>
              <span className="float float-4">💬</span>
              <span className="float float-5">🧪</span>
            </div>
          </div>

          <div className="hero-right" aria-label="Cartoon scientist illustration">
            <div className="mascot-card">
              <div className="mascot-top">
                <div className="mascot-badge">AI Tutor</div>
              </div>

              <div className="mascot-body">
                {/* Simple “cartoon scientist” illustration built from shapes */}
                <div className="scientist">
                  <div className="hair" />
                  <div className="head">
                    <div className="eye eye-l" />
                    <div className="eye eye-r" />
                    <div className="smile" />
                  </div>
                  <div className="coat">
                    <div className="coat-pocket" />
                    <div className="coat-btn coat-btn-1" />
                    <div className="coat-btn coat-btn-2" />
                  </div>
                  <div className="atom" aria-hidden="true">
                    ⚛️
                  </div>
                </div>

                <div className="mini-icons" aria-hidden="true">
                  <span className="mini mini-1">💬</span>
                  <span className="mini mini-2">📖</span>
                  <span className="mini mini-3">💡</span>
                  <span className="mini mini-4">🧠</span>
                </div>
              </div>

              <div className="mascot-footer">
                <div className="pill tiny pill-soft">Playful</div>
                <div className="pill tiny pill-green">Guided</div>
                <div className="pill tiny pill-blue">Accurate</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ABOUT / STEPS */}
      <section id="about" className="section about">
        <div className="section-head center">
          <h2 className="section-title">How Dr Feynman Enhances the Feynman Technique</h2>
          <p className="section-subtitle">
            Four friendly steps. Big understanding. Tap a card to expand details.
          </p>
        </div>

        <div className="steps-grid">
          {steps.map((s) => {
            const isOpen = openStep === s.key;
            return (
              <article
                key={s.key}
                className={`step-card ${s.cardAccent} ${isOpen ? "open" : ""}`}
              >
                <div className="step-top">
                  <div className="step-icon" aria-hidden="true">
                    {s.icon}
                  </div>
                  <div className="step-meta">
                    <div className="step-number">Step {s.step}</div>
                    <h3 className="step-title">{s.title}</h3>
                    <p className="step-subtitle">{s.subtitle}</p>
                  </div>
                </div>

                {s.key === "pick" && (
                  <div className="mini-analytics" aria-label="Topic difficulty mini chart">
                    <div className="mini-analytics-title">
                      <span aria-hidden="true">📊</span> Difficult topics (sample)
                    </div>
                    <div className="bars" aria-hidden="true">
                      <div className="bar b1" />
                      <div className="bar b2" />
                      <div className="bar b3" />
                      <div className="bar b4" />
                    </div>
                    <details className="fact-dropdown">
                      <summary>Fact of the Day</summary>
                      <div className="fact-body">
                        Lightning can heat the air around it to ~30,000°C—about 5× hotter than the sun’s surface.
                      </div>
                    </details>
                  </div>
                )}

                <ul className="step-bullets">
                  {s.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>

                <button
                  className="dropdown-toggle"
                  onClick={() => toggleStep(s.key)}
                  aria-expanded={isOpen}
                  aria-controls={`step-details-${s.key}`}
                >
                  <span>{isOpen ? "Hide details" : "More details"}</span>
                  <span className={`chev ${isOpen ? "up" : ""}`} aria-hidden="true">
                    ▾
                  </span>
                </button>

                <div
                  id={`step-details-${s.key}`}
                  className={`step-details ${isOpen ? "show" : ""}`}
                >
                  <p>{s.details}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* CHATBOT */}
      <section id="chatbot" className="section split chatbot">
        <div className="split-inner">
          <div className="split-illustration">
            <div className="big-illustration-card">
              <div className="big-icon" aria-hidden="true">
                🤖
              </div>
              <div className="bubble bubble-1" aria-hidden="true">
                💬
              </div>
              <div className="bubble bubble-2" aria-hidden="true">
                💡
              </div>
              <div className="bubble bubble-3" aria-hidden="true">
                📚
              </div>
            </div>
          </div>

          <div className="split-text">
            <h2 className="section-title">Chatbot Mode</h2>
            <p className="section-subtitle">
              Practice the Feynman technique by explaining concepts to an AI tutor that guides your
              learning.
            </p>
            <Link className="btn btn-primary" href="/Chatbot">
              Open Chatbot
            </Link>
          </div>
        </div>
      </section>

      {/* COLLABOT */}
      <section id="collabot" className="section split collabot">
        <div className="split-inner reverse">
          <div className="split-illustration">
            <div className="big-illustration-card">
              <div className="big-icon" aria-hidden="true">
                🧑‍🤝‍🧑
              </div>
              <div className="assist" aria-hidden="true">
                🤖
              </div>
              <div className="bubble bubble-1" aria-hidden="true">
                💬
              </div>
              <div className="bubble bubble-2" aria-hidden="true">
                🔎
              </div>
            </div>
          </div>

          <div className="split-text">
            <h2 className="section-title">Collabot – Collaborative Learning Mode</h2>
            <p className="section-subtitle">
              Students explain concepts together while the AI guides discussion and identifies
              knowledge gaps.
            </p>
            <Link className="btn btn-secondary" href="/Collabot">
              Enter Collabot
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="homepage-footer">
        <p>
          "If you want to master something, teach it." — <em>Richard Feynman</em>
        </p>
      </footer>
    </div>
  );
}