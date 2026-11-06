"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CASES, SLICE_INFO } from "@/lib/evals/cases";
import type { CaseResult } from "@/lib/evals/check";
import type { StoredRun } from "@/lib/evals/run";

type Model = "haiku" | "sonnet" | "rules";
const MODEL_LABEL: Record<string, string> = {
  haiku: "Claude Haiku 5.5",
  sonnet: "Claude Sonnet 5.5",
  rules: "Rules only (no model)",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
};

function modelKey(m: string): Model {
  return m.includes("sonnet") ? "sonnet" : m.includes("haiku") ? "haiku" : "rules";
}

export default function TeamView() {
  const [status, setStatus] = useState<{ model: string; hasKey: boolean; storage: boolean; engine: string } | null>(null);
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [model, setModel] = useState<Model>("haiku");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<CaseResult[]>([]);
  const [error, setError] = useState("");
  const [localRun, setLocalRun] = useState<StoredRun | null>(null);
  const [clicks, setClicks] = useState<{
    sessions: number;
    counts: Record<string, number>;
    sessionsWith: Record<string, number>;
    questions?: number;
    feedback?: ({ value?: string; reason?: string; traceId?: string } | undefined)[];
    traces?: { id: string; ts: number; q: string; route: string; model: string; category?: string; latencyMs: number; fallback: boolean; answer: string; session: string }[];
  } | null>(null);
  const stop = useRef(false);

  const load = useCallback(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
    fetch("/api/evals").then((r) => r.json()).then((d) => setRuns(d.runs ?? [])).catch(() => {});
    fetch("/api/events").then((r) => r.json()).then(setClicks).catch(() => {});
  }, []);
  const loadQuestions = () => {
    fetch("/api/events", { headers: { "x-team-code": code } })
      .then((r) => r.json())
      .then(setClicks)
      .catch(() => {});
  };
  useEffect(load, [load]);

  const run = async () => {
    setRunning(true);
    setError("");
    setProgress([]);
    stop.current = false;
    const runId = Math.random().toString(36).slice(2);
    const startedAt = new Date().toISOString();
    const results: (CaseResult & { sig: string })[] = [];
    const queue = [...CASES];
    const worker = async () => {
      while (queue.length && !stop.current) {
        const c = queue.shift()!;
        try {
          const res = await fetch("/api/eval-case", { method: "POST", headers: { "content-type": "application/json", "x-team-code": code }, body: JSON.stringify({ caseId: c.id, model, runId }) });
          const d = await res.json();
          if (!res.ok) {
            setError(d.error ?? `HTTP ${res.status}`);
            stop.current = true;
            return;
          }
          results.push(d);
          setProgress([...results]);
        } catch (e) {
          setError((e as Error).message);
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (!stop.current) {
      const res = await fetch("/api/evals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, label: label || undefined, model, startedAt, results }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.run) setLocalRun(d.run);
      else setError(d.error ?? "Run finished but was not saved");
      load();
    }
    setRunning(false);
  };

  const allRuns = localRun && !runs.some((r) => r.runId === localRun.runId) ? [localRun, ...runs] : runs;
  const latestBy = (m: Model) => allRuns.find((r) => modelKey(r.model) === m);
  const shown = localRun ?? runs[0] ?? null;
  const prev = shown ? allRuns.find((r) => r.runId !== shown.runId && modelKey(r.model) === modelKey(shown.model)) : null;
  const sets = CASES.reduce<Record<string, number>>((a, c) => ((a[c.set] = (a[c.set] ?? 0) + 1), a), {});

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <div className="banner">
        <span>Take-home prototype · fictional center and data</span>
        <Link href="/">About</Link>
      </div>
      <header style={{ background: "#24242b", color: "#fff", padding: "14px 24px" }} className="spread">
        <div className="stack" style={{ gap: 2 }}>
          <span className="xs" style={{ color: "#cfcfd8" }}>
            brightwheel team view · not shown to centers
          </span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Front desk quality</span>
        </div>
        <Link href="/ops/usage" style={{ color: "#fff", fontWeight: 700 }} className="small">
          Back to the operator view
        </Link>
      </header>
      <main className="landing" style={{ maxWidth: 1180, paddingTop: 24 }}>
        <section className="card stack" aria-label="Run the quality checks">
          <div className="spread">
            <div className="stack" style={{ gap: 2 }}>
              <h1 style={{ fontSize: 22 }}>Quality checks · Sunnyside Daycare</h1>
              <span className="small muted">
                {CASES.length} cases run against the fixed center data with the clock at Wed, Nov 4, 2026, 7:45 AM. In production they run automatically on every content edit, every prompt or model change, and nightly. Every check is code; no model grades another model.
              </span>
            </div>
          </div>
          {status && (
            <span className="small">
              Live model: <b>{MODEL_LABEL[status.model] ?? status.model}</b> · API key {status.hasKey ? "connected" : <span className="fail">not set (answers use the backup rules)</span>} · result storage {status.storage ? "connected" : "not set"} · engine {status.engine}
            </span>
          )}
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field">
              Model
              <select className="select" value={model} onChange={(e) => setModel(e.target.value as Model)} disabled={running}>
                <option value="haiku">Claude Haiku 5.5</option>
                <option value="sonnet">Claude Sonnet 5.5</option>
                <option value="rules">Rules only (baseline)</option>
              </select>
            </label>
            <label className="field">
              Version label
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. v2: tighter routing" disabled={running} />
            </label>
            {model === "sonnet" && (
              <label className="field">
                Team code
                <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="if required" />
              </label>
            )}
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={running}>
              {running ? `Running ${progress.length} of ${CASES.length}…` : "Run now"}
            </button>
            {running && (
              <button type="button" className="btn" onClick={() => (stop.current = true)}>
                Stop
              </button>
            )}
          </div>
          {running && (
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${(progress.length / CASES.length) * 100}%` }} />
            </div>
          )}
          {error && <span className="notice">{error}</span>}
          {shown ? <RunTable run={shown} prev={prev ?? null} /> : <p className="small muted">No runs recorded yet. Press Run now.</p>}
        </section>

        <section className="card stack" aria-label="Model comparison">
          <h2 style={{ fontSize: 22 }}>Model comparison</h2>
          <span className="small muted">Same cases, same checks. Decision rule: a model that misses any must-go-to-a-person case is out; otherwise the cheaper, faster one wins. With about 85 cases, a gap of one or two is noise.</span>
          <div className="scroll-x">
            <table className="t">
              <thead>
                <tr>
                  <th>Measure</th>
                  {(["haiku", "sonnet", "rules"] as Model[]).map((m) => (
                    <th key={m}>{MODEL_LABEL[m]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="bold">Checks passed, all cases</td>
                  {(["haiku", "sonnet", "rules"] as Model[]).map((m) => {
                    const r = latestBy(m);
                    return <td key={m}>{r ? `${r.passed} of ${r.total}` : <span className="muted">After first run</span>}</td>;
                  })}
                </tr>
                <tr>
                  <td className="bold">Must go to a person</td>
                  {(["haiku", "sonnet", "rules"] as Model[]).map((m) => {
                    const r = latestBy(m)?.slices.find((x) => x.slice === "person");
                    return <td key={m} className={r ? (r.passed === r.total ? "pass" : "fail") : ""}>{r ? `${r.passed} of ${r.total}` : <span className="muted">-</span>}</td>;
                  })}
                </tr>
                <tr>
                  <td className="bold">Sealed set (never used for fixes)</td>
                  {(["haiku", "sonnet", "rules"] as Model[]).map((m) => {
                    const r = latestBy(m)?.sets.sealed;
                    return <td key={m}>{r ? `${r.passed} of ${r.total}` : <span className="muted">-</span>}</td>;
                  })}
                </tr>
                <tr>
                  <td className="bold">Median response time</td>
                  {(["haiku", "sonnet", "rules"] as Model[]).map((m) => {
                    const r = latestBy(m);
                    return <td key={m}>{r ? `${(r.medianLatencyMs / 1000).toFixed(1)} s` : <span className="muted">-</span>}</td>;
                  })}
                </tr>
                <tr>
                  <td className="bold">Cost per 100 questions</td>
                  {(["haiku", "sonnet", "rules"] as Model[]).map((m) => {
                    const r = latestBy(m);
                    return <td key={m}>{r ? (r.costPer100 != null ? `$${r.costPer100.toFixed(3)}` : "$0") : <span className="muted">-</span>}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
          <section className="card stack" style={{ flex: "1 1 340px" }} aria-label="Where test cases come from">
            <h2 style={{ fontSize: 18 }}>Where test cases come from</h2>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Development set ({sets.dev}): question type × family stage × phrasing, including the five assignment questions word for word</li>
              <li>Sealed set ({sets.sealed}): written before any tuning and never used for fixes, to see whether fixes generalize</li>
              <li>Over-escalation set ({sets.over}): harmless questions with alarming words that should be answered, not sent to staff</li>
              <li>Manipulation set ({sets.adversarial}): off-topic requests and attempts to make the assistant say or approve something</li>
              <li>In production: every edge case in the use cases, and every error a center confirms through staff checks</li>
            </ul>
          </section>
          <section className="card stack" style={{ flex: "1 1 340px" }} aria-label="When a check fails">
            <h2 style={{ fontSize: 18 }}>When a check fails</h2>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>
                <b>Behavior check</b> (same for every center): the affected topic switches to &ldquo;AI drafts, staff send&rdquo; until fixed; operators see one line in Usage
              </li>
              <li>
                <b>Fact check</b> (against the center&apos;s current records): the operator is pointed to the conflicting entries; a menu edit never counts as a failure
              </li>
            </ul>
          </section>
        </div>

        <section className="card stack" aria-label="Live clickstream">
          <h2 style={{ fontSize: 22 }}>Live clickstream, all visitors</h2>
          <span className="small muted">Anonymous session IDs, no personal data. Recent batches across everyone who has opened this prototype.</span>
          {clicks && clicks.sessions > 0 ? (
            <div className="scroll-x">
              <table className="t">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Sessions</th>
                    <th>Events</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="bold">Sessions recorded</td>
                    <td>{clicks.sessions}</td>
                    <td />
                  </tr>
                  {Object.entries(clicks.counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <tr key={k}>
                        <td>{k.replace(/_/g, " ")}</td>
                        <td>{clicks.sessionsWith[k]}</td>
                        <td>{v}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small muted">{status?.storage ? "No sessions recorded yet." : "Event storage isn't connected in this deployment, so events stay in each visitor's browser."}</p>
          )}
        </section>

        <section className="card stack" aria-label="Parent questions, all visitors">
          <h2 style={{ fontSize: 22 }}>Parent questions, all visitors</h2>
          <span className="small muted">
            The raw material for error analysis: what parents typed (emails and numbers removed), how the desk routed it, and any feedback. {clicks?.questions ?? 0} recorded. Visible to the brightwheel team only.
          </span>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field">
              Team code
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} type="password" autoComplete="off" />
            </label>
            <button type="button" className="btn" onClick={loadQuestions} disabled={!code}>
              Show questions
            </button>
            {clicks?.traces?.length ? (
              <a
                className="btn"
                href={URL.createObjectURL(new Blob([JSON.stringify({ traces: clicks.traces, feedback: clicks.feedback }, null, 2)], { type: "application/json" }))}
                download="front-desk-questions.json"
              >
                Download as JSON
              </a>
            ) : null}
          </div>
          {clicks?.traces?.length ? (
            <div className="scroll-x">
              <table className="t">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Question</th>
                    <th>Route</th>
                    <th>Answer shown</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {clicks.traces.slice(0, 60).map((t) => {
                    const fb = clicks.feedback?.find((f) => f?.traceId === t.id);
                    return (
                      <tr key={t.id}>
                        <td className="small">{new Date(t.ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                        <td>{t.q}</td>
                        <td className="small">
                          {t.route}
                          {t.category ? ` (${t.category})` : ""}
                          {t.fallback ? " · backup rules" : ""}
                        </td>
                        <td className="small" style={{ maxWidth: 360 }}>{t.answer.slice(0, 160)}{t.answer.length > 160 ? "…" : ""}</td>
                        <td className="small">{fb ? (fb.value === "yes" ? "Yes" : `No: ${fb.reason}`) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small muted">{clicks?.questions ? "Enter the team code to see them." : "No questions recorded yet."}</p>
          )}
        </section>

        <section className="card stack" aria-label="Experiments across centers">
          <h2 style={{ fontSize: 22 }}>Experiments across centers</h2>
          <span className="small muted">One center&apos;s traffic is too small to test button sets: about 384 visits per group are needed to detect a 10-point change in a 40% tap rate. Experiments pool similar centers; results reach operators as recommendations.</span>
          <div className="spread" style={{ background: "var(--bg)", borderRadius: 10, padding: 12 }}>
            <span className="small">
              <b>&ldquo;Picking up early&rdquo; in the drop-off buttons</b> · single-site centers, 60 to 120 children · 1 in 10 visits · week 2 of 4
            </span>
            <span className="tag tag-gray">Sample data · result pending</span>
          </div>
        </section>
      </main>
    </div>
  );
}

function RunTable({ run, prev }: { run: StoredRun; prev: StoredRun | null }) {
  return (
    <div className="stack">
      <span className="small">
        Showing <b>{run.label || "latest run"}</b> · {MODEL_LABEL[run.model] ?? run.model} · {new Date(run.finishedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {run.passed} of {run.total} passed
        {run.fallbacks ? ` · ${run.fallbacks} answered by backup rules` : ""}
      </span>
      <div className="scroll-x">
        <table className="t">
          <thead>
            <tr>
              <th>Area</th>
              <th>Kind</th>
              <th>{prev ? prev.label || "Previous run" : "Previous run"}</th>
              <th>{run.label || "This run"}</th>
              <th>Bar</th>
            </tr>
          </thead>
          <tbody>
            {run.slices.map((x) => {
              const p = prev?.slices.find((y) => y.slice === x.slice);
              const ok = x.passed === x.total;
              return (
                <tr key={x.slice}>
                  <td className="bold">{x.label}</td>
                  <td>{x.kind}</td>
                  <td>{p ? `${p.passed} of ${p.total}` : <span className="muted">-</span>}</td>
                  <td className={ok ? "pass" : "fail"}>
                    {x.passed} of {x.total}
                  </td>
                  <td>{x.bar}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {run.failures.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", minHeight: 32, fontWeight: 700 }}>{run.failures.length} failing cases</summary>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            {run.failures.map((f) => (
              <li key={f.id}>
                <b>{f.id}</b> [{f.set}, {SLICE_INFO[f.slice as keyof typeof SLICE_INFO]?.label}] &ldquo;{f.question}&rdquo;: {f.failures.join("; ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
