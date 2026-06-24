"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Lecture = {
  lecture_id: string;
  title: string;
  creator?: "teacher" | "student";
  status: "Uploaded" | "Audio Ready" | "Ready";
};

type ProcessProgress = {
  lectureId: string | null;
  stage: string;
  percent: number;
  done: boolean;
  error?: string;
};

type TabKey = "overview" | "upload" | "courses" ;

export default function TeacherStudioPage() {
  const [library, setLibrary] = useState<Lecture[]>([]);
  const [currentLectureId, setCurrentLectureId] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Welcome back.");
  const [progress, setProgress] = useState<ProcessProgress>({
    lectureId: null,
    stage: "idle",
    percent: 0,
    done: true,
  });

  const [contentName, setContentName] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [publishStatus, setPublishStatus] = useState("Publish to students");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  const currentLecture = useMemo(
    () => library.find((l) => l.lecture_id === currentLectureId),
    [library, currentLectureId]
  );

  async function api(action: string, payload: any = {}, isForm = false) {
    if (isForm) {
      return fetch("/api/teacher-lecture", { method: "POST", body: payload }).then((r) => r.json());
    }
    return fetch("/api/teacher-lecture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    }).then((r) => r.json());
  }

  async function refreshLibrary() {
    const res = await api("load");
    if (res?.ok) setLibrary(res.library || []);
  }

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(lectureId: string) {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      const res = await api("progress", { lectureId });
      if (!res?.ok) return;
      const p = res.progress as ProcessProgress;
      setProgress(p);
      setStatusMsg(`Processing: ${p.stage} (${p.percent}%)`);
      if (p.done) stopPolling();
    }, 1000);
  }

  useEffect(() => {
    refreshLibrary();
    return () => stopPolling();
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    const fd = new FormData();
    fd.append("action", "upload");
    fd.append("file", f);

    setLoading(true);
    setStatusMsg("Uploading...");
    const res = await api("upload", fd, true);
    setLoading(false);

    if (!res?.ok) return alert(res.error || "Upload failed");
    await refreshLibrary();
    setCurrentLectureId(res.lecture.lecture_id);

    if (res.duplicate) {
      setStatusMsg("Duplicate file found. Existing lecture selected.");
    } else {
      setStatusMsg("Upload complete. Click Process Lecture.");
      if (!contentName.trim()) setContentName(res.lecture.title || "");
    }
  }

  async function processLecture() {
    if (!currentLectureId) return alert("Upload/select lecture first.");

    setLoading(true);
    setProgress({
      lectureId: currentLectureId,
      stage: "starting",
      percent: 1,
      done: false,
    });
    setStatusMsg("Processing started...");
    startPolling(currentLectureId);

    const res = await api("process", { lectureId: currentLectureId, language: "en" });
    setLoading(false);

    if (!res?.ok) {
      stopPolling();
      setProgress((p) => ({ ...p, done: true, stage: "failed", percent: 100 }));
      return alert(res.error || "Processing failed");
    }

    await refreshLibrary();
    stopPolling();
    setProgress({
      lectureId: currentLectureId,
      stage: "completed",
      percent: 100,
      done: true,
    });
    setStatusMsg("Lecture processed and ready for students.");
  }

  async function deleteLecture(lectureId?: string) {
    const id = lectureId || currentLectureId;
    if (!id) return alert("Select lecture first.");
    if (!confirm("Delete this lecture?")) return;

    setDeletingId(id);
    const res = await api("deleteLecture", { lectureId: id });
    setDeletingId(null);

    if (!res?.ok) return alert(res.error || "Delete failed");
    if (currentLectureId === id) setCurrentLectureId("");
    setProgress({ lectureId: null, stage: "idle", percent: 0, done: true });
    await refreshLibrary();
    setStatusMsg("Lecture deleted.");
  }

  const readyCount = library.filter((l) => l.status === "Ready").length;
  const processingCount = library.filter((l) => l.status !== "Ready").length;
  const teacherCourses = library.filter((l) => l.creator !== "student");
  const coverTone = (idx: number) => ["tone0", "tone1", "tone2", "tone3", "tone4", "tone5"][idx % 6];

  const assistanceRows = [
    {
      student: "Ava Lim",
      topic: "Backpropagation",
      severity: "High",
      sessions: 4,
      email: "ava.lim@school.edu",
      weakAreas: "Chain rule, gradient flow",
      lastSeen: "2026-04-20",
      completion: "62%",
    },
    {
      student: "Noah Tan",
      topic: "Gradient Descent",
      severity: "Medium",
      sessions: 3,
      email: "noah.tan@school.edu",
      weakAreas: "Learning rate tuning",
      lastSeen: "2026-04-19",
      completion: "71%",
    },
    {
      student: "Mia Chen",
      topic: "Thermodynamics Laws",
      severity: "High",
      sessions: 5,
      email: "mia.chen@school.edu",
      weakAreas: "Entropy vs enthalpy",
      lastSeen: "2026-04-20",
      completion: "58%",
    },
    {
      student: "Liam Goh",
      topic: "Matrix Multiplication",
      severity: "Low",
      sessions: 2,
      email: "liam.goh@school.edu",
      weakAreas: "Dimension compatibility",
      lastSeen: "2026-04-18",
      completion: "82%",
    },
    {
      student: "Ethan Raj",
      topic: "Chain Rule",
      severity: "Medium",
      sessions: 3,
      email: "ethan.raj@school.edu",
      weakAreas: "Nested derivative expansion",
      lastSeen: "2026-04-17",
      completion: "69%",
    },
  ];

  return (
    <div className="ll-theme teacherPage">
      <aside className="sidebar">
        <a href="/" className="backHome">← Back to home</a>
        <nav className="nav">
          <button className={`navItem ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
            Overview
          </button>
          <button className={`navItem ${activeTab === "upload" ? "active" : ""}`} onClick={() => setActiveTab("upload")}>
            Upload Lecture
          </button>
          <button className={`navItem ${activeTab === "courses" ? "active" : ""}`} onClick={() => setActiveTab("courses")}>
            My Lectures
          </button>
          <a href="/teacher/dashboard" className="navItem">
            Dashboard
          </a>
        </nav>
      </aside>

      <main className="main">
        <section className="heroPlain">
          <div>
            <p className="eyebrow">WELCOME BACK</p>
            <h1>Your teaching dashboard</h1>
            <p className="sub">Upload material, manage lectures, and track student learning difficulty.</p>
          </div>
        </section>

        {(activeTab === "overview" || activeTab === "upload") && (
          <>
            <section className="stats">
              <div className="card"><h3>Lectures</h3><p>{library.length}</p></div>
              <div className="card"><h3>Ready</h3><p>{readyCount}</p></div>
              <div className="card"><h3>Processing</h3><p>{processingCount}</p></div>
              <div className="card"><h3>Status</h3><p style={{ fontSize: 14 }}>{statusMsg}</p></div>
            </section>

            <section className="uploadPanel">
              <h2>Upload a lecture</h2>
              <p>Drop/select file, edit optional fields, then click Process Lecture.</p>

              <div className="fieldLabel">LECTURE FILE</div>

              <label className="dropzone">
                <input
                  type="file"
                  accept=".pdf,.mp4,.mov,.mkv,.mp3,.wav,.m4a,.flac,.png,.jpg,.jpeg,.webp"
                  onChange={onUpload}
                  disabled={loading}
                />
                <strong>Drop your lecture/video here</strong>
                <span>Video, Audio, PDF, or Image • Click or drag to upload</span>
              </label>

              <div className="metaGrid">
                <input placeholder="Name of the content" value={contentName} onChange={(e) => setContentName(e.target.value)} />
                <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <input placeholder="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
                <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
                <input placeholder="Duration (minutes)" value={duration} onChange={(e) => setDuration(e.target.value)} />
                <select value={publishStatus} onChange={(e) => setPublishStatus(e.target.value)}>
                  <option>Publish to students</option>
                  <option>Draft</option>
                </select>
              </div>

              <div className="actionRow">
                <button onClick={processLecture} disabled={loading || !currentLectureId} className="primary">
                  {loading ? "Working..." : "Process Lecture"}
                </button>
                <button onClick={() => deleteLecture()} disabled={!currentLectureId} className="dangerGhost">
                  Delete Current
                </button>
              </div>

              {progress.lectureId === currentLectureId && !progress.done && (
                <div className="progressWrap">
                  <div className="progressTop">
                    <span>{progress.stage}</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div className="track"><div className="fill" style={{ width: `${progress.percent}%` }} /></div>
                </div>
              )}
            </section>
          </>
        )}

        {(activeTab === "overview" || activeTab === "courses") && (
          <section className="coursesSection">
            <div className="sectionHead"><h2>My lectures</h2></div>
            <div className="grid">
              {teacherCourses.map((c, idx) => (
                <article key={c.lecture_id} className="courseCard">
                  <button
                    className="deleteBtn"
                    onClick={() => deleteLecture(c.lecture_id)}
                    disabled={deletingId === c.lecture_id}
                    title="Delete lecture"
                  >
                    {deletingId === c.lecture_id ? "..." : "🗑"}
                  </button>

                  <div className={`cover ${coverTone(idx)}`}>
                    <span className="topBadge">TEACHER</span>
                    <div className="centerGlyph">{c.title?.[0]?.toUpperCase() || "L"}</div>
                  </div>

                  <div className="body">
                    <h3 title={c.title}>{c.title}</h3>
                    <p className="subText">Status: {c.status}</p>
                    <div className="metaRow"><span>ID: {c.lecture_id}</span></div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        
      </main>

      <style jsx>{`
        .teacherPage { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; background: var(--ll-bg); background-attachment: fixed; color: var(--ll-ink); }
        .sidebar { border-right: 1px solid var(--ll-line); padding: 18px 14px; background: rgba(246, 238, 218, 0.6); backdrop-filter: blur(6px); }
        .backHome { display: inline-block; margin-bottom: 16px; text-decoration: none; color: var(--ll-muted); font-weight: 600; font-size: 14px; padding: 2px 4px; }
        .backHome:hover { color: var(--ll-ink); }
        .nav { display: grid; gap: 8px; margin-top: 8px; }
        .navItem { text-align: left; border: 1px solid transparent; background: transparent; border-radius: 12px; padding: 11px 12px; cursor: pointer; font-weight: 600; font-size: 15px; color: var(--ll-ink-soft); text-decoration: none; display: block; transition: background .15s, color .15s; }
        .navItem:hover { background: var(--ll-surface2); color: var(--ll-ink); }
        .navItem.active { background: var(--ll-surface); color: var(--ll-ink); border-color: var(--ll-line); }

        .main { padding: 28px 30px; }
        .heroPlain { margin-bottom: 18px; }
        .eyebrow { letter-spacing: .18em; font-size: 12px; text-transform: uppercase; color: var(--ll-muted); margin: 0 0 8px; }
        h1 { margin: 0; font-size: clamp(38px, 5vw, 52px); line-height: 1.05; font-family: var(--ll-serif); font-weight: 500; color: var(--ll-ink); }
        .sub { margin: 8px 0 0; color: var(--ll-ink-soft); }

        .stats, .analyticsStats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
        .card { border: 1px solid var(--ll-line); border-radius: 16px; padding: 18px; background: var(--ll-surface); box-shadow: 0 4px 14px rgba(63, 55, 38, 0.05); }
        .card h3 { margin: 0 0 8px; color: var(--ll-muted); font-size: 12px; text-transform: uppercase; letter-spacing: .14em; }
        .card p { margin: 0; font-size: 34px; font-family: var(--ll-serif); color: var(--ll-ink); }

        .uploadPanel { border: 1px solid var(--ll-line); border-radius: 20px; padding: 24px; background: var(--ll-surface); box-shadow: 0 6px 18px rgba(63, 55, 38, 0.06); margin-bottom: 22px; }
        .uploadPanel h2 { margin: 0 0 6px; font-size: clamp(30px, 4vw, 38px); font-family: var(--ll-serif); font-weight: 500; color: var(--ll-ink); }
        .uploadPanel p { margin: 0 0 16px; color: var(--ll-ink-soft); }
        .fieldLabel { margin: 0 0 12px; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--ll-muted); font-weight: 700; }

        .dropzone { display: grid; place-items: center; text-align: center; border: 1px dashed var(--ll-line-strong); border-radius: 16px; padding: 38px; background: var(--ll-surface2); cursor: pointer; margin-bottom: 16px; transition: border-color .15s, background .15s; }
        .dropzone:hover { border-color: var(--ll-sage); background: #fff8ea; }
        .dropzone input { display: none; }
        .dropzone strong { font-size: clamp(26px, 4vw, 34px); font-family: var(--ll-serif); color: var(--ll-ink); }
        .dropzone span { color: var(--ll-muted); font-size: 16px; }

        .metaGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .metaGrid input, .metaGrid textarea, .metaGrid select {
          width: 100%; border: 1px solid var(--ll-line); border-radius: 12px; background: var(--ll-surface2); padding: 11px 13px; font-size: 14px; color: var(--ll-ink); outline: none; transition: border-color .15s, box-shadow .15s;
        }
        .metaGrid input:focus, .metaGrid textarea:focus, .metaGrid select:focus { border-color: var(--ll-sage); box-shadow: 0 0 0 3px rgba(111, 125, 87, 0.16); }
        .metaGrid input::placeholder, .metaGrid textarea::placeholder { color: var(--ll-muted); }
        .metaGrid textarea { grid-column: span 2; min-height: 90px; resize: vertical; }

        .actionRow { display: flex; gap: 10px; margin-bottom: 12px; }
        .primary, .dangerGhost { border: 1px solid var(--ll-line); border-radius: 12px; padding: 12px 20px; cursor: pointer; font-weight: 600; font-size: 15px; transition: transform .1s, background .15s; }
        .primary:active, .dangerGhost:active { transform: scale(.98); }
        .primary { background: var(--ll-sage); color: var(--ll-cream); border-color: var(--ll-sage); box-shadow: 0 2px 0 rgba(82, 95, 60, 0.3); }
        .primary:hover { background: #647150; }
        .dangerGhost { background: #fbf0e4; color: var(--ll-clay); border-color: rgba(176, 106, 60, 0.3); }
        .dangerGhost:hover { background: #f6e6d6; }
        .primary:disabled, .dangerGhost:disabled { opacity: .5; cursor: not-allowed; transform: none; }

        .progressWrap { border: 1px solid var(--ll-line); border-radius: 12px; padding: 12px; background: var(--ll-surface2); }
        .progressTop { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px; color: var(--ll-ink-soft); }
        .track { height: 10px; background: var(--ll-surface); border: 1px solid var(--ll-line); border-radius: 999px; overflow: hidden; }
        .fill { height: 100%; background: linear-gradient(90deg, var(--ll-sage), #8a9a6b); }

        .sectionHead h2 { margin: 0 0 14px; font-size: clamp(28px, 4vw, 36px); font-family: var(--ll-serif); font-weight: 500; color: var(--ll-ink); }

        .grid { display: grid; grid-template-columns: repeat(3, minmax(240px, 1fr)); gap: 16px; }
        .courseCard { position: relative; border: 1px solid var(--ll-line); border-radius: 16px; overflow: hidden; background: var(--ll-surface); box-shadow: 0 4px 14px rgba(63, 55, 38, 0.05); transition: transform .15s, box-shadow .15s; }
        .courseCard:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(63, 55, 38, 0.1); }
        .deleteBtn { position: absolute; top: 10px; right: 10px; z-index: 3; border: 1px solid rgba(176, 106, 60, 0.4); background: rgba(251, 245, 230, 0.95); color: var(--ll-clay); border-radius: 10px; padding: 5px 8px; cursor: pointer; }
        .deleteBtn:hover { background: #fbf0e4; border-color: var(--ll-clay); }
        .cover { height: 150px; position: relative; display: grid; place-items: center; }
        .tone0 { background: linear-gradient(135deg, #7a8a5e, #5f6e44); }
        .tone1 { background: linear-gradient(135deg, #c2703d, #9c552c); }
        .tone2 { background: linear-gradient(135deg, #4f7a5f, #3c5e49); }
        .tone3 { background: linear-gradient(135deg, #c79a3f, #9e7728); }
        .tone4 { background: linear-gradient(135deg, #8a6a82, #6b4f64); }
        .tone5 { background: linear-gradient(135deg, #4a7d82, #386065); }
        .topBadge { position: absolute; top: 10px; left: 10px; font-size: 11px; letter-spacing: .06em; border-radius: 999px; padding: 4px 9px; background: rgba(40, 32, 18, .32); color: #fff; }
        .centerGlyph { font-family: var(--ll-serif); font-size: 64px; color: rgba(255,255,255,.5); }
        .body { padding: 16px; }
        .body h3 { margin: 0 0 6px; font-size: 24px; font-family: var(--ll-serif); font-weight: 500; color: var(--ll-ink); }
        .subText { margin: 0 0 8px; color: var(--ll-muted); font-size: 14px; }
        .metaRow { font-size: 12px; color: var(--ll-ink-soft); border-top: 1px solid var(--ll-line); padding-top: 10px; }

        .figGrid {
          display: grid;
          grid-template-columns: 1.2fr 1fr 0.9fr;
          gap: 12px;
          margin-bottom: 14px;
        }

        .figCard {
          border: 1px solid #e6e1da;
          border-radius: 16px;
          background: linear-gradient(180deg, #ffffff 0%, #fcfbf9 100%);
          padding: 16px;
          box-shadow: 0 8px 18px rgba(20, 16, 12, 0.05);
          transition: transform .18s ease, box-shadow .18s ease;
        }
        .figCard:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 26px rgba(20, 16, 12, 0.09);
        }
        .figCard h4 {
          margin: 0 0 14px;
          font-size: 19px;
          font-family: serif;
        }

        .bars { display: grid; gap: 10px; }
        .barRow {
          display: grid;
          grid-template-columns: 92px 1fr 34px;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #5f5951;
        }
        .bar {
          height: 10px;
          background: #efe9e2;
          border-radius: 999px;
          overflow: hidden;
          position: relative;
        }
        .bar i {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, #1f1a16, #7a7269);
          border-radius: 999px;
          box-shadow: inset 0 -1px 0 rgba(255,255,255,.35);
        }
        .barRow b { font-size: 11px; color: #4b443d; }

        .spark {
          height: 100px;
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          align-items: end;
          gap: 8px;
        }
        .spark > div {
          background: linear-gradient(180deg, #242424, #8a8176);
          border-radius: 9px 9px 4px 4px;
          transition: transform .15s ease, filter .15s ease;
        }
        .spark > div:hover {
          transform: translateY(-3px);
          filter: brightness(1.08);
        }
        .sparkLabels {
          margin-top: 8px;
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          font-size: 11px;
          color: #746d64;
          text-align: center;
        }

        .donutWrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .donut {
          width: 104px;
          height: 104px;
          border-radius: 999px;
          background: conic-gradient(#ef4444 0 38%, #f59e0b 38% 80%, #10b981 80% 100%);
          position: relative;
          box-shadow: 0 10px 20px rgba(30, 20, 10, .12);
        }
        .donut::after {
          content: "";
          position: absolute;
          inset: 21px;
          background: #fff;
          border-radius: 999px;
        }
        .legend {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 6px;
          font-size: 12px;
          color: #5f5951;
        }
        .dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 999px;
          margin-right: 6px;
        }
        .dot.high { background: #ef4444; }
        .dot.med { background: #f59e0b; }
        .dot.low { background: #10b981; }

        .analyticsWrap .tableCard { border: 1px solid #e3dfd9; border-radius: 16px; padding: 16px; background: #fff; }
        .tableCard h3 { margin: 0 0 12px; font-size: 24px; font-family: serif; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #eee8e1; text-align: left; padding: 10px 8px; font-size: 14px; }

        .studentHover {
          position: relative;
          display: inline-block;
          font-weight: 600;
          color: #1f2937;
          cursor: pointer;
          border-bottom: 1px dashed #c9c0b7;
        }

        .studentTooltip {
          position: absolute;
          left: 0;
          bottom: calc(100% + 10px);
          width: 240px;
          background: #1f1a16;
          color: #fff;
          border-radius: 12px;
          padding: 10px 11px;
          display: grid;
          gap: 4px;
          opacity: 0;
          visibility: hidden;
          transform: translateY(6px);
          transition: all 0.16s ease;
          z-index: 30;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.25);
        }
        .studentTooltip::after {
          content: "";
          position: absolute;
          left: 18px;
          top: 100%;
          border: 7px solid transparent;
          border-top-color: #1f1a16;
        }
        .studentTooltip strong {
          font-size: 13px;
          margin-bottom: 2px;
        }
        .studentTooltip small {
          display: block;
          font-size: 11px;
          color: #e5ddd3;
          line-height: 1.35;
        }
        .studentHover:hover .studentTooltip {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }

        .sev { padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
        .sev.high { background: #fee2e2; color: #991b1b; }
        .sev.medium { background: #fef3c7; color: #92400e; }
        .sev.low { background: #dcfce7; color: #166534; }

        @media (max-width: 1100px) {
          .teacherPage { grid-template-columns: 1fr; }
          .stats, .analyticsStats { grid-template-columns: repeat(2, 1fr); }
          .grid { grid-template-columns: 1fr; }
          .metaGrid { grid-template-columns: 1fr; }
          .metaGrid textarea { grid-column: auto; }
          .figGrid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}