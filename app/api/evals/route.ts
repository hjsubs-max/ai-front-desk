import { CASES, SLICE_INFO } from "@/lib/evals/cases";
import type { CaseResult } from "@/lib/evals/check";
import { PRICES } from "@/lib/engine/claude";
import { ENGINE_VERSION } from "@/lib/engine/pipeline";
import { invalidate, putJson, readJsonList } from "@/lib/server/blob";
import { allow, clientKey } from "@/lib/server/rateLimit";
import { sign } from "@/lib/server/sign";
import type { StoredRun } from "@/lib/evals/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET() {
  const runs = await readJsonList<StoredRun>("evalruns/", 30, 20_000);
  runs.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  return Response.json({ runs });
}

export async function POST(req: Request) {
  if (!allow(`evalsave:${clientKey(req)}`, 10, 60 * 60_000)) return Response.json({ error: "Too many runs saved" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { runId: string; label?: string; model: string; startedAt: string; results: (CaseResult & { sig: string })[] } | null;
  if (!body?.runId || !Array.isArray(body.results)) return Response.json({ error: "Bad run" }, { status: 400 });
  const valid = body.results.filter(
    (r) => r.sig === sign({ runId: body.runId, id: r.id, passed: r.passed, classifier: r.classifier, failures: r.failures }) && CASES.some((c) => c.id === r.id),
  );
  if (valid.length < CASES.length * 0.9) return Response.json({ error: "Run incomplete or not verified" }, { status: 400 });
  const stored = summarize(body.runId, body.label ?? "", body.model, body.startedAt, valid);
  await putJson(`evalruns/${stored.finishedAt.slice(0, 19).replace(/[:T]/g, "-")}-${body.model}.json`, stored);
  invalidate("evalruns/");
  return Response.json({ ok: true, run: stored });
}

function summarize(runId: string, label: string, model: string, startedAt: string, results: CaseResult[]): StoredRun {
  const slices = Object.entries(SLICE_INFO).map(([slice, info]) => {
    const rs = results.filter((r) => r.slice === slice);
    return { slice, label: info.label, kind: info.kind, bar: info.bar, passed: rs.filter((r) => r.passed).length, total: rs.length };
  });
  const sets: Record<string, { passed: number; total: number }> = {};
  for (const r of results) {
    sets[r.set] ??= { passed: 0, total: 0 };
    sets[r.set].total++;
    if (r.passed) sets[r.set].passed++;
  }
  const lat = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const classifier = results.find((r) => r.classifier !== "rules")?.classifier;
  const price = classifier ? PRICES[classifier] : undefined;
  const tokens = results.reduce((s, r) => ({ input: s.input + r.usage.input, output: s.output + r.usage.output }), { input: 0, output: 0 });
  const costPer100 = price ? ((tokens.input * price.input + tokens.output * price.output) / 1e6) * (100 / results.length) : null;
  return {
    runId,
    label,
    model: classifier ?? model,
    engine: ENGINE_VERSION,
    startedAt,
    finishedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    slices,
    sets,
    medianLatencyMs: lat[Math.floor(lat.length / 2)] ?? 0,
    costPer100,
    fallbacks: results.filter((r) => r.fallback).length,
    failures: results
      .filter((r) => !r.passed)
      .map((r) => ({ id: r.id, set: r.set, slice: r.slice, question: r.set === "sealed" ? r.question : r.question, failures: r.failures, route: r.route })),
  };
}
