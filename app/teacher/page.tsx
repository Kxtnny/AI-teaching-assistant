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

type TabKey = "overview" | "upload" | "courses" | "analytics";

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
    <div className="teacherPage">
      <aside className="sidebar">
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
          <button className={`navItem ${activeTab === "analytics" ? "active" : ""}`} onClick={() => setActiveTab("analytics")}>
            Doubt Analytics
          </button>
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

        {activeTab === "analytics" && (
          <section className="analyticsWrap">
            <div className="analyticsStats">
              <div className="card"><h3>Total Students</h3><p>128</p></div>
              <div className="card"><h3>Avg. Struggle Index</h3><p>62%</p></div>
              <div className="card"><h3>Topics with High Difficulty</h3><p>7</p></div>
              <div className="card"><h3>Students Needing Support</h3><p>23</p></div>
            </div>

            <div className="figGrid">
              <div className="figCard">
                <h4>Difficulty by Topic</h4>
                <div className="bars">
                  <div className="barRow"><span>Backprop</span><div className="bar"><i style={{ width: "86%" }} /></div><b>86</b></div>
                  <div className="barRow"><span>Thermo</span><div className="bar"><i style={{ width: "78%" }} /></div><b>78</b></div>
                  <div className="barRow"><span>Grad Desc</span><div className="bar"><i style={{ width: "64%" }} /></div><b>64</b></div>
                  <div className="barRow"><span>Chain Rule</span><div className="bar"><i style={{ width: "58%" }} /></div><b>58</b></div>
                  <div className="barRow"><span>Matrices</span><div className="bar"><i style={{ width: "41%" }} /></div><b>41</b></div>
                </div>
              </div>

              <div className="figCard">
                <h4>Weekly Assistance Requests</h4>
                <div className="spark">
                  <div style={{ height: 34 }} />
                  <div style={{ height: 52 }} />
                  <div style={{ height: 46 }} />
                  <div style={{ height: 70 }} />
                  <div style={{ height: 64 }} />
                  <div style={{ height: 82 }} />
                  <div style={{ height: 60 }} />
                </div>
                <div className="sparkLabels">
                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                </div>
              </div>

              <div className="figCard">
                <h4>Students by Severity</h4>
                <div className="donutWrap">
                  <div className="donut" />
                  <ul className="legend">
                    <li><em className="dot high" /> High (9)</li>
                    <li><em className="dot med" /> Medium (10)</li>
                    <li><em className="dot low" /> Low (4)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="tableCard">
              <h3>Students requiring assistance by topic</h3>
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Topic</th>
                    <th>Severity</th>
                    <th>Sessions flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {assistanceRows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <span className="studentHover">
                          {r.student}
                          <span className="studentTooltip">
                            <strong>{r.student}</strong>
                            <small>{r.email}</small>
                            <small><b>Weak areas:</b> {r.weakAreas}</small>
                            <small><b>Completion:</b> {r.completion}</small>
                            <small><b>Last active:</b> {r.lastSeen}</small>
                          </span>
                        </span>
                      </td>
                      <td>{r.topic}</td>
                      <td><span className={`sev ${r.severity.toLowerCase()}`}>{r.severity}</span></td>
                      <td>{r.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <style jsx>{`
        .teacherPage { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; background: #f6f4f1; color: #171717; }
        .sidebar { border-right: 1px solid #e5e2dd; padding: 16px 12px; background: #f7f5f2; }
        .nav { display: grid; gap: 8px; margin-top: 8px; }
        .navItem { text-align: left; border: 1px solid #e8e4df; background: #fff; border-radius: 12px; padding: 10px 12px; cursor: pointer; font-weight: 600; }
        .navItem.active { background: #ece8e3; }

        .main { padding: 24px; }
        .heroPlain { margin-bottom: 14px; }
        .eyebrow { letter-spacing: .18em; font-size: 11px; color: #8a8379; margin: 0 0 6px; }
        h1 { margin: 0; font-size: 52px; line-height: 1.05; font-family: serif; }
        .sub { margin: 6px 0 0; color: #5f5951; }

        .stats, .analyticsStats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
        .card { border: 1px solid #e3dfd9; border-radius: 16px; padding: 16px; background: #f9f7f4; }
        .card h3 { margin: 0 0 8px; color: #7a7268; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
        .card p { margin: 0; font-size: 34px; font-family: serif; }

        .uploadPanel { border: 1px solid #e3dfd9; border-radius: 18px; padding: 18px; background: #fbfaf8; margin-bottom: 18px; }
        .uploadPanel h2 { margin: 0 0 4px; font-size: 38px; font-family: serif; }
        .uploadPanel p { margin: 0 0 14px; color: #5f5951; }
        .fieldLabel { margin: 0 0 10px; font-size: 13px; letter-spacing: .15em; color: #61584d; font-weight: 700; }

        .dropzone { display: grid; place-items: center; text-align: center; border: 1px dashed #bfb8af; border-radius: 16px; padding: 34px; background: #f7f5f2; cursor: pointer; margin-bottom: 14px; }
        .dropzone input { display: none; }
        .dropzone strong { font-size: 34px; font-family: serif; }
        .dropzone span { color: #6f675d; font-size: 16px; }

        .metaGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
        .metaGrid input, .metaGrid textarea, .metaGrid select {
          width: 100%; border: 1px solid #ddd7cf; border-radius: 12px; background: #fff; padding: 10px 12px; font-size: 14px;
        }
        .metaGrid textarea { grid-column: span 2; min-height: 90px; }

        .actionRow { display: flex; gap: 8px; margin-bottom: 10px; }
        .primary, .dangerGhost { border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; font-weight: 600; }
        .primary { background: #171310; color: #fff; }
        .dangerGhost { background: #fbe8e6; color: #8f1f1f; }

        .progressWrap { border: 1px solid #d9d2ca; border-radius: 10px; padding: 8px; background: #fff; }
        .progressTop { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
        .track { height: 10px; background: #ece7e2; border-radius: 999px; overflow: hidden; }
        .fill { height: 100%; background: linear-gradient(90deg,#18130f,#5f5750); }

        .sectionHead h2 { margin: 0 0 10px; font-size: 36px; font-family: serif; }

        .grid { display: grid; grid-template-columns: repeat(3, minmax(240px, 1fr)); gap: 14px; }
        .courseCard { position: relative; border: 1px solid #e1ddd7; border-radius: 16px; overflow: hidden; background: #fff; }
        .deleteBtn { position: absolute; top: 10px; right: 10px; z-index: 3; border: 1px solid #ead9d4; background: #fff; color: #8e1f1f; border-radius: 10px; padding: 5px 8px; cursor: pointer; }
        .cover { height: 150px; position: relative; display: grid; place-items: center; }
        .tone0 { background: linear-gradient(135deg, #4658d6, #3346b8); }
        .tone1 { background: linear-gradient(135deg, #9f5a21, #7f451a); }
        .tone2 { background: linear-gradient(135deg, #1f7b65, #165d4d); }
        .tone3 { background: linear-gradient(135deg, #6b2aac, #4f1d84); }
        .tone4 { background: linear-gradient(135deg, #a72866, #7f1f4e); }
        .tone5 { background: linear-gradient(135deg, #19758d, #13596b); }
        .topBadge { position: absolute; top: 10px; left: 10px; font-size: 11px; border-radius: 999px; padding: 4px 8px; background: rgba(0,0,0,.35); color: #fff; }
        .centerGlyph { font-family: serif; font-size: 64px; color: rgba(255,255,255,.45); }
        .body { padding: 14px; }
        .body h3 { margin: 0 0 6px; font-size: 24px; font-family: serif; }
        .subText { margin: 0 0 8px; color: #7a7268; font-size: 14px; }
        .metaRow { font-size: 12px; color: #665f55; border-top: 1px solid #eee8e1; padding-top: 10px; }

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