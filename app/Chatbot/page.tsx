

'use client';

import { useChat } from '@ai-sdk/react';
import { User, Bot, Send, Upload, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

export default function Chat() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [visionModel, setVisionModel] = useState('llama3.2-vision');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [parserOutput, setParserOutput] = useState('');
  const [parserModelUsed, setParserModelUsed] = useState('');

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);

    if (!file) {
      setUploadStatus('');
      setParserOutput('');
      setParserModelUsed('');
      return;
    }

    const supported = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!supported.includes(file.type)) {
      setSelectedFile(null);
      setUploadStatus('✗ Only PDF, PNG, and JPG/JPEG are supported');
      return;
    }

    setUploadStatus(`Selected: ${file.name} (${visionModel})`);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadStatus('✗ Please choose a PDF first');
      return;
    }

    setUploading(true);
    setParserOutput('');
    setUploadStatus(`Uploading + parsing with ${visionModel}...`);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('visionModel', visionModel);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadStatus(`✗ Error: ${data.error ?? 'Upload failed'}`);
        return;
      }

      setUploadStatus(`✓ ${data.message}`);
      setParserOutput(data.parserOutput ?? '');
      setParserModelUsed(data.parserModel ?? visionModel);
      setSelectedFile(null);
      setTimeout(() => setUploadStatus(''), 7000);
    } catch (e) {
      setUploadStatus('✗ Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      <nav className="navbar" style={{padding: '14px 18px', margin: '14px auto 0', width: 'min(1100px, calc(100% - 24px))', background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(15, 23, 42, 0.08)', borderRadius: '999px', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.10)', position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}>
          <Link href="/" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', border: '1px solid rgba(15, 23, 42, 0.08)', cursor: 'pointer', transition: 'all 180ms ease', textDecoration: 'none', color: '#121629'}} onMouseEnter={(e) => {e.currentTarget.style.background = 'rgba(15, 23, 42, 0.12)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.08)';}} onMouseLeave={(e) => {e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'; e.currentTarget.style.boxShadow = 'none';}}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 style={{fontSize: '18px', fontWeight: 900, color: '#121629', margin: 0, letterSpacing: '-0.02em'}}>Dr Feynman</h1>
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
          <input
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg,.jpg,.jpeg"
            onChange={handleFilePick}
            disabled={uploading}
            className="hidden"
            id="file-upload"
          />

          <select
            value={visionModel}
            onChange={(e) => setVisionModel(e.target.value)}
            disabled={uploading}
            style={{padding: '10px 12px', borderRadius: '999px', border: '1px solid rgba(15, 23, 42, 0.08)', background: 'rgba(255, 255, 255, 0.9)', color: '#121629', fontWeight: 700, fontSize: '14px'}}
            aria-label="Vision parser model"
          >
            <option value="llama3.2-vision">llama3.2-vision</option>
            <option value="gemma3">gemma3</option>
            <option value="llava">llava</option>
          </select>

          <label
            htmlFor="file-upload"
            style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(255, 255, 255, 0.9)', color: '#121629', borderRadius: '999px', cursor: uploading ? 'not-allowed' : 'pointer', border: '1px solid rgba(15, 23, 42, 0.08)', fontWeight: 800, fontSize: '14px', transition: 'all 180ms ease', opacity: uploading ? 0.5 : 1}}
            onMouseEnter={(e) => {if (!uploading) {e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'; e.currentTarget.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.10)';}}}
            onMouseLeave={(e) => {e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)'; e.currentTarget.style.boxShadow = 'none';}}
          >
            <Upload className="w-4 h-4" />
            <span>{selectedFile ? 'Change File' : 'Choose PDF/PNG/JPG'}</span>
          </label>

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(255, 255, 255, 0.9)', color: '#121629', borderRadius: '999px', border: '1px solid rgba(15, 23, 42, 0.08)', cursor: uploading || !selectedFile ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '14px', transition: 'all 180ms ease', opacity: uploading || !selectedFile ? 0.5 : 1}}
            onMouseEnter={(e) => {if (!uploading && selectedFile) {e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'; e.currentTarget.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.10)';}}}
            onMouseLeave={(e) => {e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)'; e.currentTarget.style.boxShadow = 'none';}}
          >
            {uploading ? 'Uploading...' : 'Parse & Index'}
          </button>
        </div>
      </nav>

      {uploadStatus && (
        <div style={{textAlign: 'center', padding: '8px 18px', fontSize: '14px', color: '#121629', maxWidth: '1100px', margin: '0 auto', width: '100%'}}>
          <p>{uploadStatus}</p>
        </div>
      )}

      {parserOutput && (
        <div style={{maxWidth: '1100px', margin: '0 auto', width: '100%', padding: '0 18px 8px'}}>
          <div style={{border: '1px solid rgba(15, 23, 42, 0.12)', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.9)', padding: '12px'}}>
            <p style={{margin: '0 0 8px', fontWeight: 800, color: '#121629', fontSize: '14px'}}>Parser output preview ({parserModelUsed || visionModel})</p>
            <div style={{whiteSpace: 'pre-wrap', color: '#1f2937', fontSize: '13px', maxHeight: '180px', overflowY: 'auto'}}>
              {parserOutput}
            </div>
          </div>
        </div>
      )}

      {/* rest of your chat UI unchanged */}
      <div className="flex-1 overflow-hidden flex justify-center">
        <div className="w-full max-w-4xl flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    m.role === 'user' ? 'bg-black order-2' : 'bg-gray-600 order-1'
                  }`}
                >
                  {m.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
                </div>

                <div
                  className={`p-3 rounded-lg shadow-md max-w-[75%] ${
                    m.role === 'user' ? 'bg-black text-white order-1' : 'bg-gray-200 text-black order-2'
                  }`}
                >
                  {m.parts.map((part, index) => {
                    if (part.type === 'text') {
                      return (
                        <div key={`${m.id}-${index}`} className="whitespace-pre-wrap">
                          {part.text}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}
          </div>

          <div>
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
              <div className="flex space-x-2">
                <input
                  className="flex-1 p-3 pb-14 mb-4 bg-white h-30 text-black border border-gray-400 focus:outline-none rounded-xl"
                  value={input}
                  placeholder="Type your message..."
                  onChange={(e) => setInput(e.target.value)}
                />

                <button
                  type="submit"
                  className="px-4 py-2 mb-4 bg-gray-800 text-white rounded-lg hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-600 shadow-md flex items-center justify-center"
                  disabled={status !== 'ready'}
                >
                  {status === 'submitted' || status === 'streaming' ? (
                    <div className="w-5 h-5 border-t-2 border-white rounded-full animate-spin"></div>
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}


