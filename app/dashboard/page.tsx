'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';

interface Evaluation {
  understanding: number;
  engagement: number;
  criticalThinking: number;
  communication: number;
  progress: number;
  summary: string;
  topics: string[];
  suggestions: string[];
}

export default function DashboardPage() {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [lastAnalyzedCount, setLastAnalyzedCount] = useState(0);

  const fetchEvaluation = async () => {
    try {
      setLoading(true);
      setError('');

      // Get messages from localStorage
      const messagesStr = localStorage.getItem('chatMessages');
      const currentMessageCount = parseInt(localStorage.getItem('lastMessageCount') || '0');

      if (!messagesStr || currentMessageCount === 0) {
        setError('No conversation data available. Start chatting first!');
        setLoading(false);
        return;
      }

      const messages = JSON.parse(messagesStr);

      // Only fetch new evaluation if there are new messages
      const cachedEvaluation = localStorage.getItem('cachedEvaluation');
      if (cachedEvaluation && lastAnalyzedCount === currentMessageCount) {
        setEvaluation(JSON.parse(cachedEvaluation));
        setLoading(false);
        return;
      }

      // Call the summary API
      const response = await fetch('/api/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setEvaluation(data.evaluation);
        setLastAnalyzedCount(currentMessageCount);
        // Cache the evaluation
        localStorage.setItem('cachedEvaluation', JSON.stringify(data.evaluation));
        localStorage.setItem('lastAnalyzedCount', currentMessageCount.toString());
      } else {
        setError(data.error || 'Failed to generate evaluation');
      }
    } catch (err) {
      setError('Failed to fetch evaluation. Make sure the chat is running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load cached data on mount
    const cachedEvaluation = localStorage.getItem('cachedEvaluation');
    const cachedCount = parseInt(localStorage.getItem('lastAnalyzedCount') || '0');
    
    if (cachedEvaluation) {
      setEvaluation(JSON.parse(cachedEvaluation));
      setLastAnalyzedCount(cachedCount);
      setLoading(false);
    } else {
      fetchEvaluation();
    }
  }, []);

  const MetricCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-700 mb-3">{label}</h3>
      <div className="relative pt-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-3xl font-bold" style={{ color }}>{value}%</span>
        </div>
        <div className="overflow-hidden h-3 text-xs flex rounded-full bg-gray-200">
          <div
            style={{ width: `${value}%`, backgroundColor: color }}
            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500"
          ></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-black text-white p-4 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Chat</span>
            </Link>
            <h1 className="text-2xl font-bold">Learning Performance Dashboard</h1>
          </div>
          <button
            onClick={fetchEvaluation}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-8">
        {loading && !evaluation && (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-gray-300 border-t-black rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">Analyzing conversation...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {evaluation && (
          <>
            {/* Metrics Grid */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Your Learning Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <MetricCard label="Understanding" value={evaluation.understanding} color="#3b82f6" />
                <MetricCard label="Engagement" value={evaluation.engagement} color="#10b981" />
                <MetricCard label="Critical Thinking" value={evaluation.criticalThinking} color="#8b5cf6" />
                <MetricCard label="Communication" value={evaluation.communication} color="#f59e0b" />
                <MetricCard label="Progress" value={evaluation.progress} color="#ec4899" />
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-700 mb-3">Overall Performance</h3>
                  <div className="text-3xl font-bold text-gray-800">
                    {Math.round(
                      (evaluation.understanding +
                        evaluation.engagement +
                        evaluation.criticalThinking +
                        evaluation.communication +
                        evaluation.progress) /
                        5
                    )}%
                  </div>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Your Learning Summary</h2>
              <p className="text-gray-700 leading-relaxed">{evaluation.summary}</p>
            </div>

            {/* Topics */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Topics You Explored</h2>
              <div className="flex flex-wrap gap-2">
                {evaluation.topics && evaluation.topics.length > 0 ? (
                  evaluation.topics.map((topic, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                    >
                      {topic}
                    </span>
                  ))
                ) : (
                  <p className="text-gray-500">No specific topics identified yet. Continue the conversation for better analysis.</p>
                )}
              </div>
            </div>

            {/* Suggestions */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Tips to Improve Your Learning</h2>
              <ul className="space-y-2">
                {evaluation.suggestions && evaluation.suggestions.length > 0 ? (
                  evaluation.suggestions.map((suggestion, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold mt-1">•</span>
                      <span className="text-gray-700">{suggestion}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-gray-500">No suggestions available yet. Have a longer conversation for detailed feedback.</li>
                )}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
