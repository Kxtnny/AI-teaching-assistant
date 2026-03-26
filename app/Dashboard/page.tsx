"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./Homepage.css";

type StepKey = "pick" | "simplify" | "gaps" | "review";

export default function Dashboard() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);



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
          <a className="pill pill-orange" href="/Dashboard">
            Dashboard
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

            <h1 className="hero-title">Learning Analytics Dashboard</h1>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/Dashboard/EducatorView">
                Educator
              </Link>
              <Link className="btn btn-secondary" href="/Dashboard/LearnerView">
                Learner
              </Link>
            </div>
          </div>

          
        </div>
      </header>
      {/* FOOTER */}
      <footer className="homepage-footer">
        <p>
          "If you want to master something, teach it." — <em>Richard Feynman</em>
        </p>
      </footer>
    </div>
  );
}