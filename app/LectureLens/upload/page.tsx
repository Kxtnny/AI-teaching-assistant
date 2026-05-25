"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useRef, useState } from "react";
import styles from "./page.module.css";

type ProcessProgress = {
  contentId: string | null;
  stage: string;
  percent: number;
  done: boolean;
  error?: string;
};

const DESC_STORAGE_KEY = "student_upload_descriptions_v1";
const TITLE_STORAGE_KEY = "student_upload_titles_v1";

function Sidebar() {
  const pathname = usePathname();
  const isHome = pathname === "/LectureLens";
  const isUpload = pathname === "/LectureLens/upload";

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.back}>← Back to home</Link>
      <div className={styles.sideTop}>
        <div className={styles.miniLogo}>🎓</div>
        <div className={styles.miniText}>
          <strong>Student</strong>
          <span>Learning Hub</span>
        </div>
      </div>

      <nav className={styles.menu}>
        <Link href="/LectureLens" className={`${styles.menuItem} ${isHome ? styles.active : ""}`}>
          <span className={styles.icon}>▦</span>
          <span>Overview</span>
        </Link>
        <Link href="/LectureLens" className={`${styles.menuItem} ${isHome ? styles.activeSoft : ""}`}>
          <span className={styles.icon}>▭</span>
          <span>My Courses</span>
        </Link>
        <Link href="/LectureLens/upload" className={`${styles.menuItem} ${isUpload ? styles.active : ""}`}>
          <span className={styles.icon}>⇪</span>
          <span>Upload Lecture</span>
        </Link>
        <button className={`${styles.menuItem} ${styles.muted}`} disabled>
          <span className={styles.icon}>✧</span>
          <span>Doubt Analytics</span>
        </button>
      </nav>
    </aside>
  );
}

export default function StudentUploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentContentId, setCurrentContentId] = useState("");
  const [statusMsg, setStatusMsg] = useState("Ready.");
  const [uploadDone, setUploadDone] = useState(false);

  const [progress, setProgress] = useState<ProcessProgress>({
    contentId: null,
    stage: "idle",
    percent: 0,
    done: true,
  });

  const pollRef = useRef<number | null>(null);

  async function api(action: string, payload: any = {}, isForm = false) {
    if (isForm) return fetch("/api/lecture", { method: "POST", body: payload }).then((r) => r.json());
    return fetch("/api/lecture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    }).then((r) => r.json());
  }

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(contentId: string) {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      const res = await api("progress", { contentId });
      if (!res?.ok) return;
      const p = res.progress as ProcessProgress;
      setProgress(p);
      setStatusMsg(`Processing: ${p.stage} (${p.percent}%)`);
      if (p.done) {
        stopPolling();
        setProcessing(false);
      }
    }, 1000);
  }

  function saveOptionalMeta(contentId: string) {
    if (!contentId) return;
    try {
      const titleMap = JSON.parse(localStorage.getItem(TITLE_STORAGE_KEY) || "{}");
      const descMap = JSON.parse(localStorage.getItem(DESC_STORAGE_KEY) || "{}");
      if (customTitle.trim()) titleMap[contentId] = customTitle.trim();
      if (description.trim()) descMap[contentId] = description.trim();
      localStorage.setItem(TITLE_STORAGE_KEY, JSON.stringify(titleMap));
      localStorage.setItem(DESC_STORAGE_KEY, JSON.stringify(descMap));
    } catch {}
  }

  async function uploadOnly(file: File) {
    const fd = new FormData();
    fd.append("action", "upload");
    fd.append("file", file);
    fd.append("creator", "student");

    setUploading(true);
    setStatusMsg("Uploading...");
    const res = await api("upload", fd, true);
    setUploading(false);

    if (!res?.ok) return alert(res.error || "Upload failed");

    const contentId = res.lecture?.lecture_id || "";
    setCurrentContentId(contentId);
    setSelectedFile(file);
    saveOptionalMeta(contentId);
    setUploadDone(true);
    setStatusMsg(res.duplicate ? "Duplicate detected. Existing lecture loaded. You can process again." : "Upload complete. Click Process Lecture.");
  }

  async function processLecture() {
    if (!currentContentId) return alert("Upload/select lecture first.");
    setProcessing(true);
    setProgress({ contentId: currentContentId, stage: "starting", percent: 1, done: false });
    setStatusMsg("Processing started...");
    startPolling(currentContentId);

    const res = await api("process", { contentId: currentContentId, language: "en" });
    if (!res?.ok) {
      stopPolling();
      setProcessing(false);
      setProgress((p) => ({ ...p, done: true, stage: "failed", percent: 100 }));
      return alert(res.error || "Processing failed");
    }

    setProgress({ contentId: currentContentId, stage: "completed", percent: 100, done: true });
    setStatusMsg("Lecture processed successfully.");
    setProcessing(false);
    stopPolling();
  }

  async function deleteCurrent() {
    if (!currentContentId) return alert("No lecture selected.");
    if (!confirm("Delete current uploaded lecture?")) return;
    const res = await api("deleteLecture", { contentId: currentContentId });
    if (!res?.ok) return alert(res.error || "Delete failed");
    stopPolling();
    setCurrentContentId("");
    setSelectedFile(null);
    setUploadDone(false);
    setProgress({ contentId: null, stage: "idle", percent: 0, done: true });
    setStatusMsg("Current lecture deleted.");
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <section className={styles.panel}>
          <h1>Upload a lecture</h1>
          <p>Drop/select file, edit optional fields, then click Process Lecture.</p>

          <div className={styles.label}>LECTURE FILE</div>
          <label className={styles.dropzone} onDrop={async (e) => { e.preventDefault(); if (!uploading && !processing && e.dataTransfer.files?.[0]) await uploadOnly(e.dataTransfer.files[0]); }} onDragOver={(e) => e.preventDefault()}>
            <input
              type="file"
              accept=".pdf,.mp4,.mov,.mkv,.mp3,.wav,.m4a,.flac,.png,.jpg,.jpeg,.webp"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadOnly(f); }}
              disabled={uploading || processing}
            />
            <strong>Drop your lecture/video here</strong>
            <span>Video, Audio, PDF, or Image • Click or drag to upload</span>
          </label>

          <div className={styles.fields}>
            <div className={styles.fieldLabel}>NAME OF THE CONTENT (OPTIONAL)</div>
            <input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="e.g. Introduction to Linear Algebra" />
            <div className={styles.fieldLabel}>DESCRIPTION (OPTIONAL)</div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short summary of what students will learn..." />
          </div>

          {(uploading || processing || (progress.contentId && !progress.done)) && (
            <div className={styles.progressWrap}>
              <div className={styles.progressTop}>
                <span>{uploading ? "Uploading..." : progress.stage}</span>
                <span>{uploading ? "..." : `${progress.percent}%`}</span>
              </div>
              <div className={styles.track}>
                <div className={styles.fill} style={{ width: `${uploading ? 20 : progress.percent}%` }} />
              </div>
            </div>
          )}

          <div className={styles.actionRow}>
            <button className={styles.primary} onClick={processLecture} disabled={!uploadDone || processing || uploading}>
              {processing ? "Processing..." : "Process Lecture"}
            </button>
            <button className={styles.dangerGhost} onClick={deleteCurrent} disabled={!currentContentId || uploading || processing}>
              Delete Current
            </button>
          </div>

          <p className={styles.status}>{statusMsg}</p>
          {selectedFile && <p className={styles.fileHint}>Selected: {selectedFile.name}</p>}
        </section>
      </main>
    </div>
  );
}