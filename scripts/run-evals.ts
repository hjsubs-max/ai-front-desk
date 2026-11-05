// Runs the quality checks locally. Without ANTHROPIC_API_KEY this runs the rule-based baseline.
// Usage: node --experimental-strip-types scripts/run-evals.ts [rules|haiku|sonnet]

import { CASES, EVAL_NOW, SLICE_INFO } from "../lib/evals/cases.ts";
import { checkCase, type CaseResult } from "../lib/evals/check.ts";
import { answerQuestion } from "../lib/engine/pipeline.ts";
import { buildKnowledge } from "../lib/seed.ts";

const model = (process.argv[2] ?? "rules") as "rules" | "haiku" | "sonnet";
const knowledge = buildKnowledge(EVAL_NOW.date);
const results: CaseResult[] = [];
for (const c of CASES) {
  const r = await answerQuestion({ question: c.question, now: EVAL_NOW, knowledge: structuredClone(knowledge), model, channel: "eval" });
  results.push(checkCase(c, r));
}
const bySlice = new Map<string, CaseResult[]>();
for (const r of results) bySlice.set(r.slice, [...(bySlice.get(r.slice) ?? []), r]);
console.log(`Model: ${model}`);
for (const [slice, rs] of bySlice) {
  console.log(`${SLICE_INFO[slice as keyof typeof SLICE_INFO].label.padEnd(42)} ${rs.filter((x) => x.passed).length}/${rs.length}`);
}
const fails = results.filter((r) => !r.passed);
console.log(`\nTotal ${results.length - fails.length}/${results.length}\n`);
for (const r of fails) console.log(`${r.id} [${r.set}] ${r.question}\n   -> ${r.failures.join("; ")}`);
