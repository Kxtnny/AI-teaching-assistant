
'use client';

import { useChat } from '@ai-sdk/react';
import { User, Bot, Send, Upload, LayoutDashboard, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function Chat() {
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { messages, sendMessage, status, setMessages } = useChat({
    id: 'main-chat',
  }); 
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  // Load messages from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('chatMessages');
    if (stored) {
      try {
        const parsedMessages = JSON.parse(stored);
        setLocalMessages(parsedMessages);
        if (setMessages && parsedMessages.length > 0) {
          setMessages(parsedMessages);
        }
      } catch (e) {
        console.error('Failed to parse stored messages:', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Store messages in localStorage whenever they change
  useEffect(() => {
    if (isLoaded && messages.length > 0) {
      localStorage.setItem('chatMessages', JSON.stringify(messages));
      localStorage.setItem('lastMessageCount', messages.length.toString());
      setLocalMessages(messages);
    }
  }, [messages, isLoaded]);

  // Use local messages if available and messages from hook is empty
  const displayMessages = messages.length > 0 ? messages : localMessages;

  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to clear the entire chat history?')) {
      // Clear from useChat hook
      if (setMessages) {
        setMessages([]);
      }
      // Clear from local state
      setLocalMessages([]);
      // Clear from localStorage
      localStorage.removeItem('chatMessages');
      localStorage.removeItem('lastMessageCount');
      localStorage.removeItem('cachedEvaluation');
      localStorage.removeItem('lastAnalyzedCount');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus('Uploading...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setUploadStatus(`✓ ${data.message}`);
        setTimeout(() => setUploadStatus(''), 5000);
      } else {
        setUploadStatus(`✗ Error: ${data.error}`);
      }
    } catch (error) {
      setUploadStatus('✗ Upload failed');
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()){
      sendMessage({text: input})
      setInput('');
    };
  }
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="bg-black text-white p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">
            AI Teacher Assistant
          </h1>
          
          {/* Upload button and Dashboard link */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
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
                <span>{uploading ? 'Uploading...' : 'Upload PDF'}</span>
              </label>
            </div>
            
            {/* Dashboard button */}
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition"
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Dashboard</span>
            </Link>
            
            {/* Clear Chat button */}
            <button
              onClick={handleClearChat}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              title="Clear chat history"
            >
              <Trash2 className="w-5 h-5" />
              <span>Clear Chat</span>
            </button>
          </div>
        </div>
        
        {/* Upload status */}
        {uploadStatus && (
          <div className="max-w-4xl mx-auto mt-2">
            <p className="text-sm text-center">{uploadStatus}</p>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-hidden flex justify-center">
        <div className="w-full max-w-4xl flex flex-col">
          {/* Chat container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {displayMessages.map((m) => (
              <div key={m.id} className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    m.role === 'user' ? 'bg-black order-2' : 'bg-gray-600 order-1'
                  }`}
                >
                  {m.role === 'user' ? (
                    <User className="w-5 h-5 text-white" />
                  ) : (
                    <Bot className="w-5 h-5 text-white" />
                  )}
                </div>

                <div
                  className={`p-3 rounded-lg shadow-md max-w-[75%] ${
                    m.role === 'user'
                      ? 'bg-black text-white order-1'
                      : 'bg-gray-200 text-black order-2'
                  }`}
                >
                  {m.parts.map((part, index) => {
                    switch (part.type) {
                      case "text":
                        return (
                          <div
                            key={`${m.id}-${index}`}
                            className="whitespace-pre-wrap"
                          >
                            {part.text}
                          </div>
                        );
                      default:
                        return null;
                    }
                  })}
                </div>
              </div>
            ))}
            <div/>
          </div>

          {/* Input form */}
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