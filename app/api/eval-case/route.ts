import { CASES, EVAL_NOW } from "@/lib/evals/cases";
import { checkCase } from "@/lib/evals/check";
import { answerQuestion } from "@/lib/engine/pipeline";
import { allow, clientKey } from "@/lib/server/rateLimit";
import { sign } from "@/lib/server/sign";
import { buildKnowledge } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { caseId, model, runId } = (await req.json().catch(() => ({}))) as { caseId?: string; model?: string; runId?: string };
  const c = CASES.find((x) => x.id === caseId);
  if (!c || !runId) return Response.json({ error: "Unknown case" }, { status: 400 });
  const m = model === "sonnet" ? "sonnet" : model === "rules" ? "rules" : "haiku";
  if (m === "sonnet" && process.env.TEAM_CODE && req.headers.get("x-team-code") !== process.env.TEAM_CODE) {
    return Response.json({ error: "Sonnet runs need the team code" }, { status: 403 });
  }
  if (m !== "rules" && !allow(`evalcase:${clientKey(req)}`, 400, 60 * 60_000)) {
    return Response.json({ error: "Run limit reached; try again later" }, { status: 429 });
  }
  const r = await answerQuestion({ question: c.question, now: EVAL_NOW, knowledge: buildKnowledge(EVAL_NOW.date), model: m, channel: "eval" });
  const result = checkCase(c, r);
  const sig = sign({ runId, id: result.id, passed: result.passed, classifier: result.classifier, failures: result.failures });
  return Response.json({ ...result, sig });
}
