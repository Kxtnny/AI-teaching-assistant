"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { useMemo, useState, useRef, useEffect } from "react";
import styles from "./page.module.css";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const contentId = params.id;
  const creator = (searchParams.get("creator") === "teacher" ? "teacher" : "student") as
    | "teacher"
    | "student";
  const contentKind = searchParams.get("contentKind") === "document" ? "document" : "video";

  const apiBase = useMemo(
    () => (creator === "teacher" && contentKind !== "document" ? "/api/teacher-lecture" : "/api/upload-pdf"),
    [creator, contentKind]
  );

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const adjustTextareaHeight = () => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  async function send() {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput("");

    const next = [...messages, { role: "user", content: q } as Msg];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", contentId, question: q, history: next }),
      }).then((r) => r.json());

      if (!res?.ok) {
        setMessages((p) => [...p, { role: "assistant", content: `Error: ${res?.error || "Chat failed"}` }]);
      } else {
        setMessages((p) => [...p, { role: "assistant", content: res.reply || "No reply" }]);
      }
    } catch (error) {
      setMessages((p) => [...p, { role: "assistant", content: "Error: Failed to connect to server" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.chatWrapper}>
        {/* Header */}
        <div className={styles.header}>
          <Link href={`/LectureLens/course/${contentId}?creator=${creator}&contentKind=${contentKind}`} className={styles.backButton}>
            ← Back to Course
          </Link>
          <div className={styles.headerInfo}>
            <h1 className={styles.title}>Lecture Assistant</h1>
            <p className={styles.subtitle}>Ask me anything about this lecture</p>
          </div>
        </div>

        {/* Messages Area */}
        <div className={styles.messagesArea}>
          <div className={styles.messagesContainer}>
            {messages.length === 0 ? (
              <div className={styles.welcomeScreen}>
                <div className={styles.welcomeIcon}>💬</div>
                <h2>Welcome to the Chat!</h2>
                <p>Ask me anything about the lecture content</p>
                <div className={styles.suggestions}>
                  <button 
                    className={styles.suggestionBtn}
                    onClick={() => setInput("Can you summarize the key points?")}
                  >
                    📝 Summarize key points
                  </button>
                  <button 
                    className={styles.suggestionBtn}
                    onClick={() => setInput("What are the main concepts covered?")}
                  >
                    🎯 Main concepts
                  </button>
                  <button 
                    className={styles.suggestionBtn}
                    onClick={() => setInput("Can you explain this in more detail?")}
                  >
                    🔍 Explain in detail
                  </button>
                </div>
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <div key={i} className={`${styles.messageWrapper} ${m.role === "user" ? styles.userMessage : styles.assistantMessage}`}>
                    <div className={styles.avatar}>
                      {m.role === "user" ? "👤" : "🤖"}
                    </div>
                    <div className={styles.messageContent}>
                      <div className={styles.messageText}>{m.content}</div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className={`${styles.messageWrapper} ${styles.assistantMessage}`}>
                    <div className={styles.avatar}>🤖</div>
                    <div className={styles.messageContent}>
                      <div className={styles.typingIndicator}>
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className={styles.inputArea}>
          <div className={styles.inputContainer}>
            <textarea
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about this lecture..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
            />
            <button 
              className={styles.sendButton} 
              onClick={send} 
              disabled={loading || !input.trim()}
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}