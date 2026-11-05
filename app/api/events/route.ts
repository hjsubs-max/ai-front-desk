import { putJson, readJsonList } from "@/lib/server/blob";
import { allow, clientKey } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Batch {
  sessionId: string;
  view: string;
  sentAt: string;
  events: { name: string; props?: Record<string, unknown>; ts: number }[];
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
  const events = body.events
    .filter((e) => e && NAME.test(e.name))
    .slice(0, 200)
    .map((e) => ({ name: e.name, ts: Number(e.ts) || Date.now(), props: sanitize(e.props) }));
  if (!events.length) return new Response(null, { status: 204 });
  const day = new Date().toISOString().slice(0, 10);
  await putJson(`events/${day}/${body.sessionId}.json`, { sessionId: body.sessionId, view: String(body.view).slice(0, 10), sentAt: new Date().toISOString(), events });
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

export async function GET() {
  const batches = await readJsonList<Batch>("events/", 300, 60_000);
  const sessions = new Set<string>();
  const counts: Record<string, number> = {};
  const sessionsWith: Record<string, Set<string>> = {};
  for (const b of batches) {
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
  });
}
