"use client";

import Link from "next/link";

const modules = [
  {
    title: "1. Core Syntax",
    text: "Learn variables, data types, operators, input/output, and how programs are written step by step.",
  },
  {
    title: "2. Control Flow",
    text: "Practice if statements, loops, and branching logic to build simple interactive programs.",
  },
  {
    title: "3. Functions and Reuse",
    text: "Break problems into reusable functions and understand parameters, return values, and scope.",
  },
  {
    title: "4. Problem Solving",
    text: "Apply the basics to small exercises and build confidence through guided examples.",
  },
];

const outcomes = [
  "Write small programs from scratch",
  "Read and trace basic code confidently",
  "Use loops and conditionals correctly",
  "Organize solutions into functions",
];

export default function IntroductionToProgrammingPage() {
  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">YOUR COURSES</p>
          <h1>Introduction to Programming</h1>
          <p className="subtitle">
            A beginner-friendly course card that opens into its own space for learning the fundamentals of coding.
          </p>
        </div>
        <Link href="/teacher" className="backLink">
          ← Back to teacher dashboard
        </Link>
      </section>

      <section className="contentGrid">
        <article className="panel accentPanel">
          <h2>Course Overview</h2>
          <p>
            This course introduces the logic behind programming through short lessons, guided practice,
            and simple exercises that build confidence from the first step.
          </p>
          <div className="pillRow">
            <span className="pill">Beginner</span>
            <span className="pill">Coding Basics</span>
            <span className="pill">Hands-on Practice</span>
          </div>
        </article>

        <article className="panel">
          <h2>What You Will Learn</h2>
          <ul className="list">
            {outcomes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="modulesWrap">
        <h2>Learning Modules</h2>
        <div className="moduleGrid">
          {modules.map((module) => (
            <article key={module.title} className="moduleCard">
              <h3>{module.title}</h3>
              <p>{module.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel callout">
        <h2>Ready to start?</h2>
        <p>Use this page as the entry point for a full beginner programming path.</p>
      </section>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 32px;
          background: linear-gradient(180deg, #f7f4ef 0%, #f1ece5 100%);
          color: #171310;
        }
        .hero {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 24px;
        }
        .eyebrow {
          margin: 0 0 8px;
          letter-spacing: 0.18em;
          font-size: 11px;
          color: #7a7268;
          font-weight: 700;
        }
        h1 {
          margin: 0;
          font-size: clamp(34px, 4vw, 56px);
          line-height: 1.05;
        }
        .subtitle {
          margin: 10px 0 0;
          max-width: 760px;
          color: #5f5951;
          font-size: 16px;
          line-height: 1.6;
        }
        .backLink {
          flex: 0 0 auto;
          text-decoration: none;
          color: #171310;
          background: #fff;
          border: 1px solid #ddd7cf;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }
        .contentGrid {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 16px;
          margin-bottom: 16px;
        }
        .panel {
          border: 1px solid #e3ddd5;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.78);
          padding: 20px;
          backdrop-filter: blur(8px);
          box-shadow: 0 10px 30px rgba(31, 26, 22, 0.06);
        }
        .accentPanel {
          background: linear-gradient(135deg, #fff, #f7f0e6);
        }
        .panel h2,
        .modulesWrap h2 {
          margin: 0 0 12px;
          font-size: 24px;
        }
        .panel p {
          margin: 0;
          color: #524b43;
          line-height: 1.65;
        }
        .pillRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: #171310;
          color: #fff;
          padding: 7px 11px;
          font-size: 12px;
          font-weight: 600;
        }
        .list {
          margin: 0;
          padding-left: 18px;
          color: #524b43;
          display: grid;
          gap: 10px;
        }
        .modulesWrap {
          margin-bottom: 16px;
        }
        .moduleGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .moduleCard {
          border: 1px solid #e3ddd5;
          border-radius: 18px;
          background: #fff;
          padding: 18px;
          box-shadow: 0 8px 24px rgba(31, 26, 22, 0.05);
        }
        .moduleCard h3 {
          margin: 0 0 8px;
          font-size: 18px;
        }
        .moduleCard p {
          margin: 0;
          color: #5f5951;
          line-height: 1.6;
        }
        .callout {
          display: grid;
          gap: 8px;
        }
        .callout p {
          margin: 0;
        }
        @media (max-width: 900px) {
          .hero,
          .contentGrid,
          .moduleGrid {
            grid-template-columns: 1fr;
            display: grid;
          }
          .hero {
            align-items: stretch;
          }
          .backLink {
            width: fit-content;
          }
        }
      `}</style>
    </main>
  );
}
