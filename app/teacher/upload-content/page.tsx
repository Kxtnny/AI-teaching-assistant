"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

type ProcessProgress = {
  contentId: string | null;
  stage: string;
  percent: number;
  done: boolean;
  error?: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };
type VisionModel = "llava" | "gemma3" | "llama3.2-vision";

export default function UploadContentPage() {
  const [currentContentId, setCurrentContentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Ready for a content upload.");
  const [progress, setProgress] = useState<ProcessProgress>({
    contentId: null,
    stage: "idle",
    percent: 0,
    done: true,
  });

  const [contentName, setContentName] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [visionModel, setVisionModel] = useState<VisionModel>("llama3.2-vision");
  const [description, setDescription] = useState("");
  const [pendingContentFile, setPendingContentFile] = useState<File | null>(null);
  const [contentMode, setContentMode] = useState<"upload" | "chat">("upload");
  const [processedContentOutput, setProcessedContentOutput] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [indexingOk, setIndexingOk] = useState<boolean | null>(null);
  const [indexingError, setIndexingError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [retrievalNotice, setRetrievalNotice] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [visionMenuOpen, setVisionMenuOpen] = useState(false);
  const visionMenuRef = useRef<HTMLDivElement | null>(null);

  async function api(action: string, payload: any = {}, isForm = false) {
    return fetch("/api/teacher-lecture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    }).then((r) => r.json());
  }

  async function hydrateProcessedContent(contentId: string) {
    const res = await api("load", { contentId });
    if (!res?.ok) throw new Error(res?.error || "Failed to load processed content");

    setContentMode("chat");
    setProcessedContentOutput(
      res.description || res.transcript || res.summary || res.memory || "Processing completed, but no parser output was returned."
    );
    setRawContent(res.transcript || (res.chunks ? (Array.isArray(res.chunks) ? res.chunks.join("\n\n---\n\n") : String(res.chunks)) : ""));
    setIndexingOk(null);
    setIndexingError(null);
    setRetrievalNotice(null);
    setChatMessages([
      {
        role: "assistant",
        content:
          "The content is indexed and ready for questions. Ask anything about the uploaded file, and I will answer using the parsed material.",
      },
    ]);
    setStatusMsg("Content processed, indexed in RAG, and ready for chat.");
    setLoading(false);
  }

  useEffect(() => {
    return () => undefined;
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (visionMenuRef.current && !visionMenuRef.current.contains(event.target as Node)) {
        setVisionMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setVisionMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function uploadFile(f?: File | null) {
    if (!f) return;

    const fd = new FormData();
    fd.append("file", f);

    const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());

    if (!res?.ok) {
      throw new Error(res?.error || "Upload failed");
    }

    return res;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setPendingContentFile(file);
    setCurrentContentId("");
    setProcessedContentOutput("");
    setChatMessages([]);
    setContentMode("upload");
    if (file && !contentName.trim()) {
      const base = file.name.replace(/\.[^/.]+$/, "");
      setContentName(base);
    }
    setStatusMsg(file ? `Selected ${file.name}. Click Process Content to continue.` : "Ready for a content upload.");
  }

  async function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    if (loading) return;
    const file = e.dataTransfer.files?.[0] || null;
    setPendingContentFile(file);
    setCurrentContentId("");
    setProcessedContentOutput("");
    setChatMessages([]);
    setContentMode("upload");
    if (file && !contentName.trim()) {
      const base = file.name.replace(/\.[^/.]+$/, "");
      setContentName(base);
    }
    setStatusMsg(file ? `Selected ${file.name}. Click Process Content to continue.` : "Ready for a content upload.");
  }

  async function processContent() {
    let contentId = currentContentId;

    if (!pendingContentFile) return alert("Upload/select content first.");

    setLoading(true);
    setContentMode("chat");
    setProcessedContentOutput("Processing content...\n\nThe document description will appear here when it is ready.");
    setRawContent("");
    setChatMessages([
      {
        role: "assistant",
        content:
          "The content is being processed. The document description will appear here once parsing finishes.",
      },
    ]);
    setRetrievalNotice(null);
    setIndexingOk(null);
    setIndexingError(null);
    setProgress({ contentId: contentId || null, stage: "starting", percent: 18, done: false });
    setStatusMsg("Uploading and processing content...");

    let uploadRes: any;
    try {
      uploadRes = await uploadFile(pendingContentFile);
    } catch (error: any) {
      setProgress((p) => ({ ...p, done: true, stage: "failed", percent: 100, error: String(error?.message || error) }));
      setLoading(false);
      alert(String(error?.message || error));
      return;
    }

    contentId = uploadRes?.contentId || uploadRes?.lecture?.lecture_id || "";
    if (!contentId) {
      setLoading(false);
      alert("Upload succeeded but no content ID was returned.");
      return;
    }

    setCurrentContentId(contentId);
    setProgress({ contentId, stage: "completed", percent: 100, done: true });
    setProcessedContentOutput(
      uploadRes?.parserOutput || uploadRes?.description || uploadRes?.transcript || uploadRes?.summary || uploadRes?.message ||
        "Upload completed and content is ready."
    );
    setRawContent(uploadRes?.transcript || uploadRes?.parserOutput || "");
    setIndexingOk(null);
    setIndexingError(null);
    setRetrievalNotice(null);
    setChatMessages([
      {
        role: "assistant",
        content:
          "The content is indexed and ready for questions. Ask anything about the uploaded file, and I will answer using the parsed material.",
      },
    ]);
    setStatusMsg("Content processed and ready for chat.");
    setLoading(false);
  }

  async function sendContentChat() {
    const question = chatInput.trim();
    if (!question || !currentContentId) return;

    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: question }];
    setChatMessages(nextMessages);
    setChatInput("");
    setLoading(true);

    try {
      const res = await api("chat", {
        contentId: currentContentId,
        question,
        history: chatMessages,
      });

      if (!res?.ok) {
        alert(res.error || "Chat failed");
        setChatMessages(nextMessages);
        return;
      }

      setRetrievalNotice(res.retrieval_notice || null);
      setChatMessages([...nextMessages, { role: "assistant", content: res.reply || "No response returned." }]);
    } finally {
      setLoading(false);
    }
  }

  function resetContentFlow() {
    setPendingContentFile(null);
    setCurrentContentId("");
    setContentMode("upload");
    setProcessedContentOutput("");
    setContentName("");
    setChatInput("");
    setChatMessages([]);
    setRetrievalNotice(null);
    setIndexingOk(null);
    setIndexingError(null);
    setProgress({ contentId: null, stage: "idle", percent: 0, done: true });
    setStatusMsg("Ready for another content upload.");
  }

  function clearPendingContentFile() {
    setPendingContentFile(null);
    setCurrentContentId("");
    setProcessedContentOutput("");
    setContentName("");
    setChatMessages([]);
    setChatInput("");
    setRetrievalNotice(null);
    setContentMode("upload");
    setStatusMsg("Ready for a content upload.");
  }

  function chooseVisionModel(model: VisionModel) {
    setVisionModel(model);
    setVisionMenuOpen(false);
  }

  async function doneAndDelete() {
    if (currentContentId) {
      const confirmed = confirm("Delete this temporary content and all generated files/vectors?");
      if (!confirmed) return;

      setLoading(true);
      try {
        const res = await api("deleteLecture", { contentId: currentContentId });
        if (!res?.ok) {
          alert(res.error || "Delete failed");
          return;
        }
      } finally {
        setLoading(false);
      }
    }

    resetContentFlow();
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">UPLOAD CONTENT</p>
          <h1>Dedicated Upload Content page</h1>
          <p className="subtitle">Everything in the Upload Content box, expanded into its own page.</p>
        </div>
        <Link href="/teacher" className="backLink">← Back to teacher dashboard</Link>
      </section>

      <section className="panel uploadPanel">
        <div className="panelHeader">
          <div>
            <h2>Upload content</h2>
            <p className="panelHint">Drag and drop a file, choose a VLM, process it, then chat with the extracted material.</p>
          </div>
          <button className="ghostButton" onClick={resetContentFlow}>Reset</button>
        </div>

        {contentMode === "chat" ? (
          <div className="contentChatShell">
            {!progress.done && progress.stage !== "idle" && (
              <div className="progressWrap contentProgressWrap">
                <div className="progressTop">
                  <span>{progress.stage}</span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="track"><div className="fill" style={{ width: `${progress.percent}%` }} /></div>
              </div>
            )}

            <div className="chatIntro">
              <div>
                <div className="fieldLabel">RAG OUTPUT</div>
                <h3>{pendingContentFile?.name || contentName || "Processed content"}</h3>
              </div>
              <button onClick={doneAndDelete} className="dangerGhost">Done</button>
            </div>

            {indexingOk === false && (
              <div className="indexingWarning">
                <strong>Indexing warning:</strong> The content was processed but indexing to the vector store failed.
                {indexingError ? ` (${indexingError})` : ""}
                <div style={{ marginTop: 8 }}>
                  <button
                    className="primary"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const res = await api("retryIndex", { contentId: currentContentId });
                        if (res?.ok) {
                          setIndexingOk(true);
                          setIndexingError(null);
                          setStatusMsg("Indexing retried and succeeded.");
                        } else {
                          setIndexingOk(false);
                          setIndexingError(res?.error || "Retry failed");
                          setStatusMsg("Indexing retry failed.");
                          alert("Indexing retry failed: " + (res?.error || "unknown"));
                        }
                      } catch (e: any) {
                        setIndexingOk(false);
                        setIndexingError(String(e?.message || e));
                        alert("Indexing retry error: " + String(e?.message || e));
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading || !currentContentId}
                  >
                    {loading ? "Retrying..." : "Retry indexing"}
                  </button>
                </div>
              </div>
            )}

            {retrievalNotice && (
              <div className="retrievalNotice">
                <strong>Search notice:</strong> {retrievalNotice}
              </div>
            )}

            <div className="toggleRow">
              <div />
              <button className="dangerGhost" onClick={() => setShowRaw((s) => !s)}>
                {showRaw ? "Show summary" : "Show raw text"}
              </button>
            </div>

            <div className="parserOutputPanel">
              <div className="sectionMiniTitle">Document description</div>
              <pre className="parserOutput">{showRaw ? rawContent || processedContentOutput : processedContentOutput}</pre>
            </div>

            <div className="chatPanel">
              <div className="sectionMiniTitle">Ask questions about this file</div>
              <div className="chatHistory">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`chatBubble ${msg.role}`}>
                    <span>{msg.content}</span>
                  </div>
                ))}
              </div>
              <div className="chatComposer">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about key concepts, formulas, or specific sections..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (currentContentId && contentMode === "chat") void sendContentChat();
                    }
                  }}
                  disabled={loading || !currentContentId || contentMode !== "chat"}
                />
                <button className="primary" onClick={sendContentChat} disabled={loading || !chatInput.trim() || !currentContentId || contentMode !== "chat"}>
                  {loading ? "Thinking..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="statusLine">
              <span>{statusMsg}</span>
              <span>{currentContentId ? `Content ID: ${currentContentId}` : "No content processed yet"}</span>
            </div>

            <p>Drop/select file, fill the fields, then click Process Content.</p>

            <div className="fieldLabel">CONTENT FILE</div>

            <label
              className={`dropzone ${dragActive ? "dragActive" : ""}`}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
            >
              <input
                type="file"
                accept=".pdf,.mp4,.mov,.mkv,.mp3,.wav,.m4a,.flac,.png,.jpg,.jpeg,.webp"
                onChange={onUpload}
                disabled={loading}
              />
              <strong>Drop your content here</strong>
              <span>PDF or Image • Click or drag to upload</span>
            </label>

            {pendingContentFile && (
              <div className="selectedFileChip" title={pendingContentFile.name}>
                <button type="button" className="fileRemoveBtn" onClick={clearPendingContentFile} aria-label="Remove selected file">
                  ×
                </button>
                <span className="fileIcon" aria-hidden="true">📄</span>
                <span className="fileName">{pendingContentFile.name}</span>
              </div>
            )}

            <div className="metaGrid">
              <input placeholder="Name of the content" value={contentName} onChange={(e) => setContentName(e.target.value)} />
              <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <input placeholder="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <div className="selectField" ref={visionMenuRef}>
                <button
                  type="button"
                  className={`selectButton ${visionMenuOpen ? "open" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={visionMenuOpen}
                  onClick={() => setVisionMenuOpen((open) => !open)}
                >
                  <span className="selectLabel">{visionModel}</span>
                  <span className="selectCaret" aria-hidden="true">▾</span>
                </button>

                {visionMenuOpen && (
                  <div className="selectMenu" role="listbox" aria-label="Vision language model">
                    {(["llava", "gemma3", "llama3.2-vision"] as VisionModel[]).map((model) => (
                      <button
                        key={model}
                        type="button"
                        role="option"
                        aria-selected={visionModel === model}
                        className={`selectOption ${visionModel === model ? "selected" : ""}`}
                        onClick={() => chooseVisionModel(model)}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="actionRow">
              <button onClick={processContent} disabled={loading || !pendingContentFile} className="primary">
                {loading ? "Working..." : "Process Content"}
              </button>
            </div>

            {progress.contentId === currentContentId && !progress.done && (
              <div className="progressWrap">
                <div className="progressTop">
                  <span>{progress.stage}</span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="track"><div className="fill" style={{ width: `${progress.percent}%` }} /></div>
              </div>
            )}
          </>
        )}
      </section>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 28px;
          background: linear-gradient(180deg, #f7f4ef 0%, #f1ece5 100%);
          color: #171310;
        }
        .hero {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 18px;
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
          font-size: clamp(32px, 4vw, 54px);
          line-height: 1.05;
        }
        .subtitle {
          margin: 10px 0 0;
          max-width: 820px;
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
          white-space: nowrap;
        }
        .backLink:hover { background: #f3ece4; }
        .panel {
          border: 1px solid #e3ddd5;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.84);
          padding: 20px;
          backdrop-filter: blur(8px);
          box-shadow: 0 10px 30px rgba(31, 26, 22, 0.06);
        }
        .uploadPanel {
          display: grid;
          gap: 14px;
        }
        .panelHeader {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .panelHeader h2 {
          margin: 0;
          font-size: 34px;
        }
        .panelHint,
        .statusLine,
        p {
          color: #5f5951;
        }
        .statusLine {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 13px;
        }
        .ghostButton,
        .dangerGhost,
        .primary {
          border: 0;
          border-radius: 12px;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 600;
          font-family: inherit;
        }
        .ghostButton {
          background: #f3ece6;
          color: #6f6257;
        }
        .ghostButton:hover {
          background: #e9dfd6;
          color: #171310;
        }
        .primary {
          background: #171310;
          color: #fff;
        }
        .dangerGhost {
          background: #fbe8e6;
          color: #8f1f1f;
        }
        .contentChatShell {
          display: grid;
          gap: 14px;
        }
        .chatIntro {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: start;
        }
        .chatIntro h3 {
          margin: 2px 0 0;
          font-size: 24px;
        }
        .sectionMiniTitle,
        .fieldLabel {
          margin-bottom: 10px;
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #756b61;
          font-weight: 700;
        }
        .parserOutputPanel,
        .chatPanel {
          border: 1px solid #e5dfd7;
          border-radius: 16px;
          background: #fff;
          padding: 14px;
        }
        .indexingWarning {
          border: 1px solid #f5c6cb;
          background: #fff1f2;
          color: #6b1b1b;
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 13px;
        }
        .retrievalNotice {
          border: 1px solid #d6d0c8;
          background: #f8f6f2;
          color: #5d5349;
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 13px;
        }
        .parserOutput {
          margin: 0;
          max-height: 240px;
          overflow: auto;
          white-space: pre-wrap;
          font-size: 13px;
          line-height: 1.55;
          color: #1f1a16;
        }
        .chatHistory {
          display: grid;
          gap: 10px;
          max-height: 320px;
          overflow: auto;
          padding-right: 4px;
          margin-bottom: 12px;
        }
        .chatBubble {
          display: flex;
        }
        .chatBubble span {
          max-width: min(88%, 760px);
          border-radius: 16px;
          padding: 10px 12px;
          font-size: 14px;
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .chatBubble.user { justify-content: flex-end; }
        .chatBubble.user span { background: #1f1a16; color: #fff; }
        .chatBubble.assistant span { background: #f2ede7; color: #1f1a16; }
        .chatComposer {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .chatComposer input {
          flex: 1;
          border: 1px solid #ddd7cf;
          border-radius: 12px;
          background: #fff;
          padding: 12px 14px;
          font-size: 14px;
        }
        .toggleRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .dropzone {
          display: grid;
          place-items: center;
          text-align: center;
          border: 1px dashed #bfb8af;
          border-radius: 18px;
          padding: 34px;
          background: #f7f5f2;
          cursor: pointer;
          transition: border-color .15s ease, background .15s ease, transform .15s ease;
        }
        .dropzone.dragActive {
          border-color: #171310;
          background: #efebe6;
          transform: scale(1.01);
        }
        .dropzone input { display: none; }
        .dropzone strong { font-size: 34px; }
        .dropzone span { color: #6f675d; font-size: 16px; }
        .selectedFileChip {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid #ddd7cf;
          border-radius: 999px;
          background: #fff;
          max-width: 100%;
        }
        .fileRemoveBtn {
          width: 24px;
          height: 24px;
          border: 0;
          border-radius: 999px;
          background: #f3ece6;
          color: #6e6458;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
          flex: 0 0 auto;
        }
        .fileRemoveBtn:hover { background: #e9dfd6; color: #1f1a16; }
        .fileIcon { font-size: 16px; }
        .fileName {
          font-size: 14px;
          color: #1f1a16;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .metaGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 12px;
        }
        .metaGrid input,
        .metaGrid textarea {
          width: 100%;
          border: 1px solid #ddd7cf;
          border-radius: 12px;
          background: #fff;
          padding: 10px 12px;
          font-size: 14px;
          font-family: inherit;
        }
        .metaGrid textarea {
          grid-column: span 2;
          min-height: 90px;
        }
        .selectField {
          position: relative;
          width: 100%;
        }
        .selectButton {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid #ddd7cf;
          border-radius: 14px;
          background: linear-gradient(180deg, #fff, #faf7f3);
          color: #1f1a16;
          padding: 10px 14px;
          font-size: 14px;
          font-family: inherit;
          cursor: pointer;
        }
        .selectButton.open {
          border-color: #b9aa9a;
          box-shadow: 0 0 0 3px rgba(143, 129, 114, 0.12);
        }
        .selectLabel {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .selectCaret {
          flex: 0 0 auto;
          color: #7b7268;
          font-size: 12px;
          line-height: 1;
        }
        .selectMenu {
          position: absolute;
          z-index: 20;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          padding: 6px;
          border: 1px solid #ddd7cf;
          border-radius: 18px;
          background: rgba(255, 252, 248, 0.98);
          box-shadow: 0 12px 30px rgba(31, 26, 22, 0.12);
          backdrop-filter: blur(10px);
        }
        .selectOption {
          width: 100%;
          display: flex;
          align-items: center;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: #1f1a16;
          padding: 10px 12px;
          font-size: 14px;
          text-align: left;
          cursor: pointer;
        }
        .selectOption:hover { background: #f2ece5; }
        .selectOption.selected { background: #e9dfd4; font-weight: 700; }
        .actionRow {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
        }
        .progressWrap {
          border: 1px solid #d9d2ca;
          border-radius: 10px;
          padding: 8px;
          background: #fff;
        }
        .progressTop {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 6px;
        }
        .track {
          height: 10px;
          background: #ece7e2;
          border-radius: 999px;
          overflow: hidden;
        }
        .fill {
          height: 100%;
          background: linear-gradient(90deg,#18130f,#5f5750);
        }
        @media (max-width: 900px) {
          .hero,
          .panelHeader,
          .chatIntro,
          .statusLine,
          .toggleRow,
          .chatComposer {
            grid-template-columns: 1fr;
            display: grid;
          }
          .metaGrid {
            grid-template-columns: 1fr;
          }
          .metaGrid textarea {
            grid-column: span 1;
          }
          .backLink {
            width: fit-content;
          }
        }
      `}</style>
    </main>
  );
}
