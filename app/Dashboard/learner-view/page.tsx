"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "../dashboard.css";
import { Container } from "lucide-react";

type StepKey = "pick" | "simplify" | "gaps" | "review";

export default function Dashboard() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);



  return (
    <div className={`dashboard-container ${loaded ? "page-loaded" : ""}`}>
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
          <a className="pill pill-orange" href="/dashboard">
            Dashboard
          </a>
        </div>
      </nav>

      
      {/* FOOTER */}
      <footer className="quote-footer">
        <p>
          "If you want to master something, teach it." — <em>Richard Feynman</em>
        </p>
      </footer>
    </div>
  );
}