"use client";

import { useEffect, useState } from "react";
import { SAMPLE_FUNNEL, SAMPLE_WAITS, SAMPLE_WEEK } from "@/lib/client/sample";
import type { Sandbox } from "@/lib/client/store";
import type { StoredRun } from "@/lib/evals/run";
import OpsShell from "./OpsShell";

export default function Usage() {
  return <OpsShell active="usage">{(s) => <UsageBody s={s} />}</OpsShell>;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function UsageBody({ s }: { s: Sandbox }) {
  const [run, setRun] = useState<StoredRun | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/evals")
      .then((r) => r.json())
      .then((d: { runs: StoredRun[] }) => setRun(d.runs.find((x) => !x.model.startsWith("rules")) ?? d.runs[0] ?? null))
      .catch(() => setRun(null));
  }, []);
  const parentEvents = s.events.filter((e) => e.view === "parent");
  const count = (name: string) => parentEvents.filter((e) => e.name === name).length;
  const aiLat = median(s.events.filter((e) => e.name === "answer_shown").map((e) => Number(e.props?.latencyMs ?? 0))) ;
  const staff = s.events.filter((e) => e.name === "request_confirmed" || e.name === "handoff_resolved").map((e) => Number(e.props?.responseMin ?? 0));
  const staffMed = median(staff);
  const onTime = s.inbox.filter((i) => !i.sample && i.status !== "open" && i.status !== "cancelled" && i.dueMinutes != null);
  const onTimePct = onTime.length ? Math.round((onTime.filter((i) => (i.history[i.history.length - 1].stamp - i.createdStamp) <= (i.dueMinutes ?? 0)).length / onTime.length) * 100) : null;
  const behaviorFailing = run ? run.slices.filter((x) => x.kind === "Behavior" && x.bar === "100%" && x.passed < x.total) : [];
  const yes = parentEvents.filter((e) => e.name === "feedback_given" && e.props?.value === "yes").length;
  const no = parentEvents.filter((e) => e.name === "feedback_given" && e.props?.value === "no").length;
  return (
    <>
      <h1 style={{ fontSize: 24 }}>Usage</h1>
      <section className={run && behaviorFailing.length ? "notice" : "ok-box"} aria-label="Quality status">
        {run === undefined ? (
          <span>Checking quality status…</span>
        ) : run ? (
          <div className="stack" style={{ gap: 4 }}>
            <b>{behaviorFailing.length ? `Quality checks: ${behaviorFailing.length} area${behaviorFailing.length > 1 ? "s" : ""} below the bar` : "Quality checks: all safety checks passing"}</b>
            <span className="small">
              In production, brightwheel checks the assistant automatically after every change to your information, and every night. Last run {new Date(run.finishedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}: {run.passed} of {run.total} checks passed.
            </span>
            <span className="small">If a safety check ever fails, that topic switches to &ldquo;AI drafts, staff send&rdquo; until brightwheel fixes it, and you&apos;ll see it here.</span>
          </div>
        ) : (
          <div className="stack" style={{ gap: 4 }}>
            <b>Quality checks: no run recorded yet</b>
            <span className="small">brightwheel runs them automatically after every change to your information, and every night.</span>
          </div>
        )}
      </section>
      <section className="card stack" aria-label="Your checks of live answers">
        <span>
          <b>Your checks of live answers:</b> {SAMPLE_WEEK.wrongFacts} wrong facts in {SAMPLE_WEEK.checked} checked this week (2 flagged by parents, 23 picked at random) <span className="tag tag-gray">Sample</span>
        </span>
      </section>
      <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
        <section className="card stack" style={{ flex: "1 1 340px", minWidth: 0 }} aria-label="How parents use the desk">
          <h2 style={{ fontSize: 17 }}>How parents use the desk</h2>
          <span className="small muted">From the clickstream. Sample: per 100 visits. This browser: event counts.</span>
          <table className="t">
            <thead>
              <tr>
                <th>Step</th>
                <th>Sample week</th>
                <th>This browser</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_FUNNEL.map(([key, label, n]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>{n}</td>
                  <td>{count(key)}</td>
                </tr>
              ))}
              <tr>
                <td>Said yes / no to &ldquo;Did this answer your question?&rdquo;</td>
                <td>30 / 4</td>
                <td>
                  {yes} / {no}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="card stack" style={{ flex: "1 1 300px", minWidth: 0 }} aria-label="How long parents wait">
          <h2 style={{ fontSize: 17 }}>How long parents wait</h2>
          <span className="small muted">From question sent to answer shown, and from handoff to staff reply.</span>
          <table className="t">
            <thead>
              <tr>
                <th>Measure</th>
                <th>Sample</th>
                <th>This browser</th>
                <th>Goal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>AI answer, median</td>
                <td>{SAMPLE_WAITS.aiMedianS} s</td>
                <td>{aiLat != null ? `${(aiLat / 1000).toFixed(1)} s` : "-"}</td>
                <td>under 15 s</td>
              </tr>
              <tr>
                <td>Staff reply to a handoff, median</td>
                <td>{SAMPLE_WAITS.staffMedianMin} min</td>
                <td>{staffMed != null ? `${staffMed} min` : "-"}</td>
                <td>under 15 min</td>
              </tr>
              <tr>
                <td>Handoffs answered in time</td>
                <td>{SAMPLE_WAITS.onTimePct}%</td>
                <td>{onTimePct != null ? `${onTimePct}%` : "-"}</td>
                <td>100%</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
