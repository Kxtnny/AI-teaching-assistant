import { NextResponse } from 'next/server';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

type HistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const SUPPORTED_MODELS = new Set(['gemma3', 'llama3.2-vision', 'llava']);

function normalizeModel(modelRaw: string | null) {
  const model = (modelRaw || 'llama3.2-vision').trim();
  return SUPPORTED_MODELS.has(model) ? model : 'llama3.2-vision';
}

function parseHistory(historyRaw: unknown): HistoryMessage[] {
  if (!Array.isArray(historyRaw)) return [];

  return historyRaw
    .filter((message): message is HistoryMessage => {
      if (!message || typeof message !== 'object') return false;
      const role = (message as { role?: unknown }).role;
      const content = (message as { content?: unknown }).content;
      return (role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim().length > 0;
    })
    .map((message) => ({ role: message.role, content: message.content }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const question = String(body?.question || '').trim();
    const context = String(body?.context || '').trim();
    const history = parseHistory(body?.history);
    const model = normalizeModel(typeof body?.model === 'string' ? body.model : null);

    if (!question) {
      return NextResponse.json({ ok: false, error: 'Missing question' }, { status: 400 });
    }

    if (!context) {
      return NextResponse.json({ ok: false, error: 'No parsed content context available yet' }, { status: 400 });
    }

    const llm = new ChatOllama({ model, temperature: 0.1 });
    const system = new SystemMessage(
      'You are a concise study assistant. Answer only from the provided parsed file context. If the answer is not in the context, say so clearly.'
    );

    const messages = [
      system,
      new HumanMessage(`Parsed file context:\n${context}`),
      ...history.slice(-8).map((message) =>
        message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content)
      ),
      new HumanMessage(question),
    ];

    const response = await llm.invoke(messages);

    return NextResponse.json({
      ok: true,
      reply: String(response.content || '').trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error('Upload Q&A error:', error);
    return NextResponse.json({ ok: false, error: `Upload Q&A failed: ${message}` }, { status: 500 });
  }
}
