'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, Upload } from 'lucide-react';

type ChatItem = {
  role: 'user' | 'assistant';
  content: string;
};

const MODEL_OPTIONS = ['llama3.2-vision', 'gemma3', 'llava'] as const;

export default function VisionLabPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [model, setModel] = useState<(typeof MODEL_OPTIONS)[number]>('llama3.2-vision');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [chat, setChat] = useState<ChatItem[]>([]);

  const acceptedFileHint = useMemo(() => 'PDF, PNG, JPG, JPEG', []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      setStatus('');
      return;
    }

    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      setSelectedFile(null);
      setStatus('Unsupported file. Use PDF, PNG, JPG, or JPEG.');
      return;
    }

    setSelectedFile(file);
    setStatus(`Loaded ${file.name}`);
  };

  const onAsk = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      setStatus('Upload a file first.');
      return;
    }

    if (!question.trim()) {
      setStatus('Type a question first.');
      return;
    }

    const nextUserQuestion = question.trim();
    const nextChat = [...chat, { role: 'user' as const, content: nextUserQuestion }];
    setChat(nextChat);
    setQuestion('');
    setLoading(true);
    setStatus(`Asking ${model}...`);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('question', nextUserQuestion);
      formData.append('model', model);
      formData.append('history', JSON.stringify(chat));

      const res = await fetch('/api/vision-chat', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Request failed');
        return;
      }

      const answer = String(data.answer || '').trim() || 'No answer returned.';
      setChat((prev) => [...prev, { role: 'assistant', content: answer }]);
      setStatus(`Answered by ${data.model || model}`);
    } catch {
      setStatus('Request failed. Check Ollama and server logs.');
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setChat([]);
    setStatus('Chat cleared.');
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <nav
        style={{
          padding: '14px 18px',
          margin: '14px auto 0',
          width: 'min(1100px, calc(100% - 24px))',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(15, 23, 42, 0.08)',
          borderRadius: '999px',
          boxShadow: '0 10px 24px rgba(15, 23, 42, 0.10)',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(15, 23, 42, 0.06)',
              border: '1px solid rgba(15, 23, 42, 0.08)',
              textDecoration: 'none',
              color: '#121629',
            }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 style={{ fontSize: '18px', fontWeight: 900, color: '#121629', margin: 0 }}>
            Vision Lab
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as (typeof MODEL_OPTIONS)[number])}
            disabled={loading}
            style={{
              padding: '10px 12px',
              borderRadius: '999px',
              border: '1px solid rgba(15, 23, 42, 0.08)',
              background: 'rgba(255, 255, 255, 0.9)',
              color: '#121629',
              fontWeight: 700,
              fontSize: '14px',
            }}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <input
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg,.jpg,.jpeg"
            onChange={onFileChange}
            disabled={loading}
            className="hidden"
            id="vision-file-upload"
          />
          <label
            htmlFor="vision-file-upload"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              background: 'rgba(255, 255, 255, 0.9)',
              color: '#121629',
              borderRadius: '999px',
              cursor: loading ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(15, 23, 42, 0.08)',
              fontWeight: 800,
              fontSize: '14px',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <Upload className="w-4 h-4" />
            <span>{selectedFile ? 'Change file' : 'Upload file'}</span>
          </label>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-5xl p-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div>Mode: file-grounded only (no Socratic/Feynman prompting)</div>
          <div>Accepted file types: {acceptedFileHint}</div>
          {selectedFile && <div>Current file: {selectedFile.name}</div>}
          {status && <div className="mt-1 font-semibold">{status}</div>}
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 min-h-[420px] max-h-[62vh] overflow-y-auto">
          {chat.length === 0 && (
            <div className="text-sm text-slate-500">
              Upload a file, choose a model, and ask questions directly about that file.
            </div>
          )}

          {chat.map((item, idx) => (
            <div key={`${item.role}-${idx}`} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  item.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'
                }`}
              >
                {item.content}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={onAsk} className="mt-4">
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about the uploaded file..."
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !selectedFile}
              className="rounded-xl bg-slate-900 px-4 py-3 text-white disabled:opacity-50"
            >
              {loading ? 'Thinking...' : <Send className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={clearChat}
              disabled={loading || chat.length === 0}
              className="rounded-xl border border-slate-300 px-4 py-3 text-slate-700 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
