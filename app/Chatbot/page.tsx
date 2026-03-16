

'use client';

import { useChat } from '@ai-sdk/react';
import { User, Bot, Send, Upload } from 'lucide-react';
import { useState } from 'react';

export default function Chat() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);

    if (!file) {
      setUploadStatus('');
      return;
    }

    if (file.type !== 'application/pdf') {
      setSelectedFile(null);
      setUploadStatus('✗ Only PDF files are supported');
      return;
    }

    setUploadStatus(`Selected: ${file.name}`);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadStatus('✗ Please choose a PDF first');
      return;
    }

    setUploading(true);
    setUploadStatus('Uploading + vectorizing...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile); // MUST be "file" (your API expects this)

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
      setSelectedFile(null);
      setTimeout(() => setUploadStatus(''), 5000);
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
      <header className="bg-black text-white p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-white">AI Teacher Assistant</h1>

          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFilePick}
              disabled={uploading}
              className="hidden"
              id="file-upload"
            />

            <label
              htmlFor="file-upload"
              className={`flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg cursor-pointer hover:bg-gray-200 transition ${
                uploading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Upload className="w-5 h-5" />
              <span>{selectedFile ? 'Change PDF' : 'Choose PDF'}</span>
            </label>

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className={`px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition ${
                uploading || !selectedFile ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {uploading ? 'Working...' : 'Upload & Vectorize'}
            </button>
          </div>
        </div>

        {uploadStatus && (
          <div className="max-w-4xl mx-auto mt-2">
            <p className="text-sm text-center">{uploadStatus}</p>
          </div>
        )}
      </header>

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


