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

  const pollRef = useRef<number | null>(null);

  const currentLecture = useMemo(
    () => library.find((l) => l.lecture_id === currentLectureId),
    [library, currentLectureId]
  );

  // ✅ Use teacher API route
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

  async function deleteLecture() {
    if (!currentLectureId) return alert("Select lecture first.");
    if (!confirm("Delete this lecture?")) return;
    const res = await api("deleteLecture", { lectureId: currentLectureId });
    if (!res?.ok) return alert(res.error || "Delete failed");
    setCurrentLectureId("");
    setProgress({ lectureId: null, stage: "idle", percent: 0, done: true });
    await refreshLibrary();
    setStatusMsg("Lecture deleted.");
  }

  const readyCount = library.filter((l) => l.status === "Ready").length;

  return (
    <div className="teacherPage">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">🎓</div>
          <div>
            <h2>Lumen</h2>
            <p>Educator Studio</p>
          </div>
        </div>

        <nav className="nav">
          <button className="navItem active">Overview</button>
          <button className="navItem">Upload Lecture</button>
          <button className="navItem">My Lectures</button>
          <button className="navItem muted" disabled>Doubt Analytics (later)</button>
        </nav>
      </aside>

      <main className="main">
        <section className="hero">
          <div>
            <p className="eyebrow">WELCOME BACK</p>
            {/* ✅ Normalized heading */}
            <h1>Your teaching dashboard</h1>
            <p className="sub">
              Upload material for students. Processing and publishing are handled automatically.
            </p>
          </div>
          <label className="newLectureBtn">
            <input
              type="file"
              accept=".pdf,.mp4,.mov,.mkv,.mp3,.wav,.m4a,.flac,.png,.jpg,.jpeg,.webp"
              onChange={onUpload}
              disabled={loading}
            />
            + New lecture
          </label>
        </section>

        <section className="stats">
          <div className="card"><h3>Lectures</h3><p>{library.length}</p></div>
          <div className="card"><h3>Ready</h3><p>{readyCount}</p></div>
          <div className="card"><h3>Processing</h3><p>{library.filter((l) => l.status !== "Ready").length}</p></div>
          <div className="card"><h3>Status</h3><p style={{ fontSize: 14 }}>{statusMsg}</p></div>
        </section>

        <section className="uploadPanel">
          <h2>Upload a lecture</h2>
          <p>Share a video, audio, PDF, or image. Students will access processed content.</p>

          <div className="dropzoneRow">
            <label className="dropzone">
              <input
                type="file"
                accept=".pdf,.mp4,.mov,.mkv,.mp3,.wav,.m4a,.flac,.png,.jpg,.jpeg,.webp"
                onChange={onUpload}
                disabled={loading}
              />
              <strong>Drop your lecture here</strong>
              <span>Video, Audio, PDF, or Image • Click to upload</span>
            </label>
          </div>

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
            <button onClick={deleteLecture} disabled={!currentLectureId} className="dangerGhost">
              Delete Current
            </button>
          </div>

          {progress.lectureId === currentLectureId && !progress.done && (
            <div className="progressWrap">
              <div className="progressTop">
                <span>{progress.stage}</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="track">
                <div className="fill" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}
        </section>

        <section className="lectures">
          <div className="sectionHead">
            <h2>My lectures</h2>
          </div>
          <div className="lectureGrid">
            {library.map((l) => (
              <button
                key={l.lecture_id}
                className={`lectureCard ${currentLectureId === l.lecture_id ? "active" : ""}`}
                onClick={() => setCurrentLectureId(l.lecture_id)}
              >
                <div className="pill">{l.status}</div>
                <h4 title={l.title}>{l.title}</h4>
                <p>{l.lecture_id}</p>
              </button>
            ))}
          </div>
        </section>
      </main>

      <style jsx>{`
        .teacherPage { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; background: #f6f4f1; color: #171717; }
        .sidebar { border-right: 1px solid #e5e2dd; padding: 22px 16px; background: #f5f3f0; }
        .brand { display: flex; gap: 10px; align-items: center; margin-bottom: 20px; }
        .logo { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: #111; color: #fff; }
        .brand h2 { margin: 0; font-size: 30px; font-family: serif; }
        .brand p { margin: 0; color: #716b63; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }

        .nav { display: grid; gap: 8px; }
        .navItem { text-align: left; border: 1px solid #e8e4df; background: transparent; border-radius: 12px; padding: 10px 12px; cursor: pointer; }
        .navItem.active { background: #ece8e3; font-weight: 700; }
        .navItem.muted { opacity: .5; cursor: not-allowed; }

        .main { padding: 28px 34px; }
        .hero { display: flex; justify-content: space-between; align-items: end; gap: 12px; margin-bottom: 20px; }
        .eyebrow { letter-spacing: .2em; font-size: 11px; color: #8a8379; margin: 0 0 8px; }
        h1 { margin: 0; font-size: 42px; line-height: 1.15; font-family: serif; } /* normalized */
        .sub { color: #5f5951; max-width: 680px; }
        .newLectureBtn { border-radius: 999px; padding: 12px 18px; background: #151210; color: #fff; font-weight: 600; cursor: pointer; }
        .newLectureBtn input { display: none; }

        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
        .card { border: 1px solid #e3dfd9; border-radius: 16px; padding: 16px; background: #f9f7f4; }
        .card h3 { margin: 0 0 8px; color: #7a7268; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
        .card p { margin: 0; font-size: 36px; font-family: serif; }

        .uploadPanel { border: 1px solid #e3dfd9; border-radius: 18px; padding: 18px; background: #fbfaf8; margin-bottom: 18px; }
        .uploadPanel h2 { margin: 0 0 4px; font-size: 34px; font-family: serif; } /* normalized */
        .uploadPanel p { margin: 0 0 14px; color: #5f5951; }

        .dropzoneRow { margin-bottom: 14px; }
        .dropzone { display: grid; place-items: center; text-align: center; border: 1px dashed #bfb8af; border-radius: 16px; padding: 36px; background: #f7f5f2; cursor: pointer; }
        .dropzone input { display: none; }
        .dropzone strong { font-size: 24px; font-family: serif; }
        .dropzone span { color: #6f675d; }

        .metaGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
        .metaGrid input, .metaGrid textarea, .metaGrid select {
          width: 100%; border: 1px solid #ddd7cf; border-radius: 12px; background: #fff;
          padding: 10px 12px; font-size: 14px;
        }
        .metaGrid textarea { grid-column: span 2; min-height: 90px; }

        .actionRow { display: flex; gap: 8px; margin-bottom: 10px; }
        .primary, .dangerGhost {
          border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; font-weight: 600;
        }
        .primary { background: #171310; color: #fff; }
        .dangerGhost { background: #fbe8e6; color: #8f1f1f; }

        .progressWrap { border: 1px solid #d9d2ca; border-radius: 10px; padding: 8px; background: #fff; }
        .progressTop { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
        .track { height: 10px; background: #ece7e2; border-radius: 999px; overflow: hidden; }
        .fill { height: 100%; background: linear-gradient(90deg,#18130f,#5f5750); }

        .sectionHead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .sectionHead h2 { margin: 0; font-size: 34px; font-family: serif; } /* normalized */
        .lectureGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .lectureCard { text-align: left; border: 1px solid #e1ddd7; background: #fff; border-radius: 14px; padding: 12px; cursor: pointer; }
        .lectureCard.active { outline: 2px solid #171310; }
        .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #f1ece7; color: #655d54; font-size: 11px; margin-bottom: 8px; }
        .lectureCard h4 { margin: 0 0 6px; font-size: 20px; font-family: serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lectureCard p { margin: 0; color: #7d766d; font-size: 12px; }

        @media (max-width: 1100px) {
          .teacherPage { grid-template-columns: 1fr; }
          .stats { grid-template-columns: repeat(2, 1fr); }
          .lectureGrid { grid-template-columns: 1fr; }
          .metaGrid { grid-template-columns: 1fr; }
          .metaGrid textarea { grid-column: auto; }
        }
      `}</style>
    </div>
  );
}