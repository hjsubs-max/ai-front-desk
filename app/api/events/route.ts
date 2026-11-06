import { putJson, readJsonList } from "@/lib/server/blob";
import { allow, clientKey } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TraceIn {
  id: string;
  ts: number;
  q: string;
  channel: string;
  route: string;
  intents: string[];
  model: string;
  category?: string;
  latencyMs: number;
  gap?: string;
  fallback: boolean;
  answer: string;
}

interface Batch {
  sessionId: string;
  view: string;
  sentAt: string;
  events: { name: string; props?: Record<string, unknown>; ts: number }[];
  traces?: TraceIn[];
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

function cleanTraces(raw: unknown): TraceIn[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((t: Partial<TraceIn>) => ({
    id: str(t.id, 40),
    ts: Number(t.ts) || Date.now(),
    q: str(t.q, 300),
    channel: str(t.channel, 12),
    route: str(t.route, 16),
    intents: Array.isArray(t.intents) ? t.intents.slice(0, 5).map((x) => str(x, 40)) : [],
    model: str(t.model, 30),
    category: t.category ? str(t.category, 4) : undefined,
    latencyMs: Number(t.latencyMs) || 0,
    gap: t.gap ? str(t.gap, 100) : undefined,
    fallback: Boolean(t.fallback),
    answer: str(t.answer, 600),
  })).filter((t) => t.q);
}

const NAME = /^[a-z_]{2,40}$/;

export async function POST(req: Request) {
  if (!allow(`ev:${clientKey(req)}`, 60, 60_000)) return new Response(null, { status: 429 });
  let body: Batch;
  try {
    body = JSON.parse(await req.text()) as Batch;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!body?.sessionId || !/^[a-z0-9-]{8,40}$/i.test(body.sessionId) || !Array.isArray(body.events)) return new Response(null, { status: 400 });
  const traces = cleanTraces(body.traces);
  const events = body.events
    .filter((e) => e && NAME.test(e.name))
    .slice(0, 200)
    .map((e) => ({ name: e.name, ts: Number(e.ts) || Date.now(), props: sanitize(e.props) }));
  if (!events.length && !traces.length) return new Response(null, { status: 204 });
  const day = new Date().toISOString().slice(0, 10);
  await putJson(`events/${day}/${body.sessionId}.json`, { sessionId: body.sessionId, view: String(body.view).slice(0, 10), sentAt: new Date().toISOString(), events, traces });
  return new Response(null, { status: 204 });
}

function sanitize(p: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!p || typeof p !== "object") return out;
  for (const [k, v] of Object.entries(p as Record<string, unknown>).slice(0, 12)) {
    if (!/^[a-zA-Z_]{1,30}$/.test(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 60);
  }
  return out;
}

export async function GET(req: Request) {
  // Aggregate counts are public. What visitors typed is returned only with the team code,
  // and never when no team code is configured.
  const code = process.env.TEAM_CODE;
  const showText = Boolean(code) && (req.headers.get("x-team-code") === code || new URL(req.url).searchParams.get("team") === code);
  const batches = await readJsonList<Batch>("events/", 300, 60_000);
  const sessions = new Set<string>();
  const counts: Record<string, number> = {};
  const sessionsWith: Record<string, Set<string>> = {};
  const traces: (TraceIn & { session: string })[] = [];
  for (const b of batches) {
    for (const t of b.traces ?? []) traces.push({ ...t, session: b.sessionId.slice(0, 6) });
    sessions.add(b.sessionId);
    for (const e of b.events) {
      counts[e.name] = (counts[e.name] ?? 0) + 1;
      (sessionsWith[e.name] ??= new Set()).add(b.sessionId);
    }
  }
  return Response.json({
    batches: batches.length,
    sessions: sessions.size,
    counts,
    sessionsWith: Object.fromEntries(Object.entries(sessionsWith).map(([k, v]) => [k, v.size])),
    questions: traces.length,
    feedback: showText ? batches.flatMap((b) => b.events.filter((ev) => ev.name === "feedback_given").map((ev) => ev.props)) : undefined,
    traces: showText ? traces.sort((x, y) => y.ts - x.ts).slice(0, 200) : undefined,
  });
}
