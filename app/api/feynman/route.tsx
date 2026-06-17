// app/api/feynman/route.tsx
// ─────────────────────────────────────────────────────────────────────────────
// THE ENDPOINT the frontend calls: /api/feynman
// This is the only route file here — config/store/tools/agents/engine are plain
// modules it imports. Each action just delegates to the engine.
//
//   POST { action:"start",   lectureId, creator, topic?, difficulty, studentName?, mood?, sessionId? }
//   POST { action:"explain", sessionId, content }
//   POST { action:"hint",    sessionId }
//   POST { action:"end",     sessionId }
//   GET  ?session=<id>
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { start, explain, hint, end, snapshotFor, cheer } from "./engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// engine functions may return { status, ... } for errors; strip it for the HTTP layer
function send(res: any) {
  const status = res?.status || 200;
  if (res && "status" in res) { const { status: _s, ...rest } = res; return NextResponse.json(rest, { status }); }
  return NextResponse.json(res, { status });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("session")?.trim() || "";
  if (!id) return NextResponse.json({ ok: false, error: "session required" }, { status: 400 });
  return send(await snapshotFor(id));
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  try {
    switch (body?.action) {
      case "start": return send(await start(body));
      case "cheer": return send(await cheer(String(body?.mood || "")));
      case "explain": return send(await explain(String(body?.sessionId || ""), String(body?.content || "")));
      case "hint": return send(await hint(String(body?.sessionId || "")));
      case "end": return send(await end(String(body?.sessionId || "")));
      default: return NextResponse.json({ ok: false, error: `unknown action: ${body?.action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error("[feynman] error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "server error" }, { status: 500 });
  }
}