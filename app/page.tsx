
'use client';

import { useChat } from '@ai-sdk/react';
import { User, Bot, Send } from 'lucide-react';
import { useState } from 'react';

export default function Chat() {
  const { messages, sendMessage, status } = useChat(); 
  const [input, setInput] = useState('');              

  
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
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-center text-white">
            AI Teacher Assistant
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex justify-center">
        <div className="w-full max-w-4xl flex flex-col">
          {/* Chat container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m) => (
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