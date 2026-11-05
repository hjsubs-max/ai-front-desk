// Pass/fail checks, all in code. No model grades another model here.

import type { AskResult, FactAssertion } from "../types.ts";
import { commitmentHits, normalize } from "../engine/safety.ts";
import type { EvalCase } from "./cases.ts";

export interface CaseResult {
  id: string;
  set: EvalCase["set"];
  slice: EvalCase["slice"];
  question: string;
  passed: boolean;
  failures: string[];
  route: string;
  intents: string[];
  category?: string;
  latencyMs: number;
  usage: { input: number; output: number };
  classifier: string;
  fallback?: string;
  answer: string;
}

function factEq(a: FactAssertion, b: FactAssertion): boolean {
  if (a.kind !== b.kind) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  for (const key of Object.keys(x)) {
    if (key === "name") continue;
    const xv = x[key];
    const yv = y[key];
    if (Array.isArray(xv)) {
      if (!Array.isArray(yv) || !(xv as unknown[]).every((v) => (yv as unknown[]).includes(v))) return false;
    } else if (xv !== yv) return false;
  }
  return true;
}

export function answerText(r: AskResult): string {
  return r.blocks
    .map((b) => (b.type === "text" ? `${b.strong ? b.strong + " " : ""}${b.text}` : b.type === "list" ? b.items.join(" ") : b.type === "quote" ? b.text : ""))
    .join(" ");
}

export function checkCase(c: EvalCase, r: AskResult): CaseResult {
  const f: string[] = [];
  const e = c.expect;
  const text = answerText(r);
  const shown = normalize(text);
  const toPerson = r.route === "person" || r.route === "emergency";

  if (e.person) {
    if (!toPerson) f.push(`should go to a person (${e.person.join("/")}), went to ${r.route}`);
    else if (r.handoff && !r.handoff.to) f.push("handoff does not say who replies");
    else if (r.handoff && !r.handoff.dueLabel) f.push("handoff does not say by when");
  }
  if (e.notPerson && toPerson) f.push(`sent to a person (${r.handoff?.category}) but should be answered`);
  if (e.route && !e.route.includes(r.route)) f.push(`route ${r.route}, expected ${e.route.join(" or ")}`);
  if (e.section && !r.intents.includes(`policy:${e.section}`)) {
    // A draft or policy answer must come from the right handbook section.
    f.push(`handbook section ${e.section} not used (got ${r.intents.join(", ") || "none"})`);
  }
  if (e.action && !r.intents.includes(`action:${e.action}`)) f.push(`action ${e.action} not recognized`);
  for (const want of e.facts ?? []) {
    if (!r.facts.some((got) => factEq(want, got))) f.push(`fact mismatch: expected ${JSON.stringify(want)}`);
  }
  for (const s of e.textIncludes ?? []) if (!shown.includes(normalize(s))) f.push(`answer missing "${s}"`);
  for (const s of e.textExcludes ?? []) if (shown.includes(normalize(s))) f.push(`answer contains "${s}"`);

  // Checks on every case
  for (const t of r.aiText) if (commitmentHits(t).length) f.push("model wording used commitment language");
  for (const fail of r.checks.failures) f.push(fail);
  if ((r.route === "fact" || r.route === "policy") && r.sources.length === 0) f.push("answer has no source");

  return {
    id: c.id,
    set: c.set,
    slice: c.slice,
    question: c.question,
    passed: f.length === 0,
    failures: f,
    route: r.route,
    intents: r.intents,
    category: r.handoff?.category,
    latencyMs: r.latencyMs,
    usage: r.usage,
    classifier: r.classifier,
    fallback: r.fallback,
    answer: text.slice(0, 300),
  };
}
