"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addCenterAnswer, addMenuWeek, fixCalendarDate, markGapFixed, preview } from "@/lib/client/edit";
import { SAMPLE_FLAGGED, SAMPLE_STRUGGLES, SAMPLE_WEEK } from "@/lib/client/sample";
import { demoNow, stampTime, update, type Sandbox } from "@/lib/client/store";
import { track } from "@/lib/client/track";
import { addDays, fmtLong, weekStart } from "@/lib/dates";
import { answerText } from "@/lib/evals/check";
import type { AskResult, Gap } from "@/lib/types";
import OpsShell from "./OpsShell";

export default function Asked() {
  return <OpsShell active="asked">{(s) => <AskedBody s={s} />}</OpsShell>;
}

interface GapRow extends Gap {
  count: number;
  question: string;
  sampleCount: number;
}

function gapsFor(s: Sandbox): GapRow[] {
  const now = demoNow(s);
  const nextMonday = addDays(weekStart(now.date), 7);
  const rows = new Map<string, GapRow>();
  const add = (g: Gap, question: string, sample: number) => {
    const r = rows.get(g.key) ?? { ...g, count: 0, question, sampleCount: 0 };
    r.count += sample || 1;
    r.sampleCount += sample;
    rows.set(g.key, r);
  };
  if (now.date < "2026-11-27") add({ key: "calendar:2026-11-27", label: "Friday, Nov 27 (the day after Thanksgiving)", kind: "calendar", date: "2026-11-27" }, "Is there care the day after Thanksgiving?", 6);
  add({ key: `menu:${nextMonday}`, label: `Menu for the week of ${fmtLong(nextMonday)}`, kind: "menu", date: nextMonday }, `What's for lunch on ${fmtLong(nextMonday)}?`, 3);
  for (const e of s.thread) {
    const g = e.result?.gap;
    if (!g) continue;
    // Menu gaps for any day of next week roll up into the weekly menu gap.
    if (g.kind === "menu" && g.date && weekStart(g.date) === nextMonday) add({ ...g, key: `menu:${nextMonday}`, date: nextMonday, label: `Menu for the week of ${fmtLong(nextMonday)}` }, e.question, 0);
    else add(g, e.question, 0);
  }
  for (const i of s.inbox) if (i.couldHaveAnswered && i.kind === "message") add({ key: `general:${i.id}`, label: i.text.slice(0, 120), kind: "general" }, i.text, 0);
  return [...rows.values()].filter((r) => !s.fixedGaps.includes(r.key)).sort((a, b) => b.count - a.count);
}

function AskedBody({ s }: { s: Sandbox }) {
  const live = s.thread.filter((e) => e.kind === "qa" && e.result);
  const liveAnswered = live.filter((e) => ["fact", "policy", "request"].includes(e.result!.route)).length;
  const livePerson = live.filter((e) => ["person", "emergency", "draft"].includes(e.result!.route)).length + s.thread.filter((e) => e.kind === "message").length;
  const liveUnanswered = live.filter((e) => e.result!.route === "unknown").length;
  const total = SAMPLE_WEEK.questions + live.length;
  const pct = (n: number) => `${Math.round((n / Math.max(1, total)) * 100)}%`;
  const verifiedLive = live.filter((e) => e.verified);
  const wrongLive = verifiedLive.filter((e) => e.verified === "incorrect").length + (s.sampleVerified === "incorrect" ? 1 : 0);
  const gaps = useMemo(() => gapsFor(s), [s]);
  const [sel, setSel] = useState<string | null>(null);
  const gap = gaps.find((g) => g.key === sel) ?? gaps[0];
  const flaggedLive = live.filter((e) => e.feedback?.reason === "wrong" && !e.verified);
  const misread = live.filter((e) => e.feedback?.reason === "missed").length;
  const could = s.inbox.filter((i) => i.couldHaveAnswered).length;
  return (
    <>
      <div className="spread" style={{ alignItems: "baseline" }}>
        <h1 style={{ fontSize: 24 }}>What parents asked this week</h1>
        <span className="xs muted">Sample week plus {live.length} question{live.length === 1 ? "" : "s"} from this browser</span>
      </div>
      <div className="tiles">
        <Tile label="Questions" value={String(total)} />
        <Tile label="Answered without staff" value={pct(SAMPLE_WEEK.answered + liveAnswered)} />
        <Tile label="Sent to a person" value={pct(SAMPLE_WEEK.toPerson + livePerson)} />
        <Tile label="Unanswered" value={pct(SAMPLE_WEEK.unanswered + liveUnanswered)} />
        <Tile label="Wrong facts, checked by staff" value={`${SAMPLE_WEEK.wrongFacts + wrongLive} of ${SAMPLE_WEEK.checked + verifiedLive.length + (s.sampleVerified ? 1 : 0)}`} />
        <Tile label="Went straight to a person" value={`${SAMPLE_WEEK.straightToPersonPct}%`} sub="of visits · top topics: schedule changes, billing" />
      </div>

      {(s.sampleVerified === null || flaggedLive.length > 0) && (
        <section aria-label="Check a flagged answer" className="card stack" style={{ borderColor: "var(--amber-line)" }}>
          <div className="spread">
            <span className="tag tag-amber">Flagged by a parent · wrong or out of date</span>
          </div>
          {flaggedLive.map((e) => (
            <FlagRow
              key={e.id}
              q={e.question}
              a={answerText(e.result!).slice(0, 220)}
              src={e.result!.sources.map((x) => `${x.label} (${x.updated})`).join(", ") || "No source"}
              at={stampTime(e.stamp)}
              onVerify={(v) =>
                update((st) => {
                  const x = st.thread.find((t) => t.id === e.id);
                  if (x) x.verified = v;
                })
              }
            />
          ))}
          {s.sampleVerified === null && (
            <FlagRow
              q={SAMPLE_FLAGGED.question}
              a={SAMPLE_FLAGGED.answer}
              src={SAMPLE_FLAGGED.source}
              at={SAMPLE_FLAGGED.at}
              sample
              onVerify={(v) =>
                update((st) => {
                  st.sampleVerified = v;
                })
              }
            />
          )}
          <span className="xs muted">Either way, brightwheel adds the question to the assistant&apos;s quality checks.</span>
        </section>
      )}

      <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
        <section aria-label="Where the assistant struggled" className="card stack" style={{ flex: "1 1 340px", minWidth: 0 }}>
          <h2 style={{ fontSize: 17 }}>Where the assistant struggled</h2>
          <span className="small muted">Grouped by cause, so one fix covers many questions.</span>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {SAMPLE_STRUGGLES.map((x) => {
              const extra = x.cause.startsWith("Missing") ? liveUnanswered : x.cause.startsWith("Sent to a person") ? could : x.cause.startsWith("Misread") ? misread : 0;
              return (
                <li key={x.cause} className="spread" style={{ borderTop: "1px solid var(--line)", padding: "10px 0", flexWrap: "nowrap" }}>
                  <span className="stack" style={{ gap: 2 }}>
                    <b className="small">{x.cause}</b>
                    <span className="small muted">{x.example}</span>
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: x.count + extra === 0 && x.cause.startsWith("Answered") ? "var(--green)" : undefined }}>{x.count + extra}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Fix a gap" className="card stack" style={{ flex: "1 1 340px", minWidth: 0, border: "2px solid var(--ai)" }}>
          {gap ? (
            <>
              <div className="spread">
                <span className="xs bold" style={{ color: "var(--ai-ink)" }}>
                  Fix a gap · asked {gap.count} time{gap.count === 1 ? "" : "s"}
                </span>
                {gaps.length > 1 && (
                  <select className="select" style={{ width: "auto", minHeight: 36 }} value={gap.key} onChange={(e) => setSel(e.target.value)} aria-label="Choose a gap">
                    {gaps.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label.slice(0, 50)} ({g.count})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <GapFixer key={gap.key} gap={gap} s={s} />
            </>
          ) : (
            <div className="ok-box">No open gaps. Ask the parent desk something it can&apos;t answer to see one appear here.</div>
          )}
        </section>
      </div>

      <section className="card stack" aria-label="Recent questions">
        <h2 style={{ fontSize: 17 }}>Recent questions from this browser</h2>
        {live.length === 0 ? (
          <p className="small muted">
            None yet. <Link href="/parent">Ask the parent desk something.</Link>
          </p>
        ) : (
          <div className="scroll-x">
            <table className="t">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Question</th>
                  <th>What happened</th>
                  <th>Routed by</th>
                  <th>Parent said</th>
                </tr>
              </thead>
              <tbody>
                {[...live].reverse().slice(0, 15).map((e) => (
                  <tr key={e.id}>
                    <td className="small">{stampTime(e.stamp)}</td>
                    <td>{e.question}</td>
                    <td className="small">{outcome(e.result!)}</td>
                    <td className="small muted">{e.result!.classifier === "rules" ? "Backup rules" : e.result!.classifier.replace("claude-", "").replace(/-/g, " ")}</td>
                    <td className="small">{e.feedback ? (e.feedback.value === "yes" ? "Yes" : `No: ${e.feedback.reason}`) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function outcome(r: AskResult): string {
  switch (r.route) {
    case "fact":
      return "Answered from records";
    case "policy":
      return "Answered from the handbook";
    case "request":
      return "Request sent to staff";
    case "person":
      return `Sent to a person (${r.handoff?.category ?? ""})`;
    case "emergency":
      return "Emergency: call now";
    case "draft":
      return "AI draft for staff to send";
    case "unknown":
      return "No answer on file";
    default:
      return "Off topic";
  }
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tile">
      <span className="small muted">{label}</span>
      <span className="num">{value}</span>
      {sub && <span className="xs muted">{sub}</span>}
    </div>
  );
}

function FlagRow({ q, a, src, at, sample, onVerify }: { q: string; a: string; src: string; at: string; sample?: boolean; onVerify: (v: "correct" | "incorrect") => void }) {
  return (
    <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <p>
        <b>Asked:</b> &ldquo;{q}&rdquo; <b>Answered:</b> &ldquo;{a}&rdquo;
      </p>
      <span className="small">
        Source used: {src} · {at} {sample && <span className="tag tag-gray">Sample</span>}
      </span>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            onVerify("correct");
            track("answer_verified", { result: "correct" });
          }}
        >
          Correct as answered
        </button>
        <Link
          href="/ops/source"
          className="btn btn-primary"
          onClick={() => {
            onVerify("incorrect");
            track("answer_verified", { result: "incorrect" });
          }}
        >
          Incorrect: fix the source
        </Link>
      </div>
    </div>
  );
}

function GapFixer({ gap, s }: { gap: GapRow; s: Sandbox }) {
  const [status, setStatus] = useState<"closed" | "open" | "shortened">("closed");
  const [note, setNote] = useState(gap.kind === "calendar" ? "Thanksgiving break" : "");
  const [lunches, setLunches] = useState<string[]>(["", "", "", "", ""]);
  const [answer, setAnswer] = useState("");
  const [saved, setSaved] = useState(false);
  const [pv, setPv] = useState<AskResult | null | "loading">(null);
  const save = () => {
    if (gap.kind === "calendar" && gap.date) fixCalendarDate(gap.date, status, note || (status === "closed" ? "Closed" : "Open"), "07:00", status === "shortened" ? "15:00" : "18:00");
    else if (gap.kind === "menu" && gap.date) addMenuWeek(gap.date, lunches);
    else addCenterAnswer(gap.question, answer);
    setSaved(true);
    track("gap_fixed", { kind: gap.kind });
  };
  const runPreview = async () => {
    setPv("loading");
    setPv(await preview(gap.question));
  };
  return (
    <div className="stack">
      <h2 style={{ fontSize: 17 }}>&ldquo;{gap.question}&rdquo;</h2>
      {gap.kind === "calendar" && (
        <>
          <span className="small">Your calendar has no entry for {gap.label}, so parents were sent to a person.</span>
          <label className="field">
            {gap.date ? fmtLong(gap.date) : "Date"}
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="closed">Closed</option>
              <option value="open">Open, normal hours</option>
              <option value="shortened">Open, shortened hours (7:00 AM to 3:00 PM)</option>
            </select>
          </label>
          <label className="field">
            Name parents see
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Thanksgiving break" />
          </label>
        </>
      )}
      {gap.kind === "menu" && (
        <>
          <span className="small">Next week&apos;s menu isn&apos;t posted, so the assistant can&apos;t answer lunch questions for it.</span>
          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d, i) => (
            <label key={d} className="field">
              {d}
              <input
                className="input"
                value={lunches[i]}
                placeholder={["Bean and cheese quesadilla, corn", "Baked fish sticks, rice", "Turkey and cheese wrap, apple slices", "Chicken pasta with peas", "Cheese pizza, carrot sticks"][i]}
                onChange={(e) => setLunches((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </label>
          ))}
        </>
      )}
      {gap.kind === "general" && (
        <>
          <span className="small">Nothing in your information covers this. Add an answer; the assistant will give it word for word.</span>
          <label className="field">
            Your answer
            <textarea className="textarea" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Write it the way you'd say it to a parent." />
          </label>
        </>
      )}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={saved || (gap.kind === "general" && !answer.trim())} onClick={save}>
          {saved ? "Saved" : gap.kind === "calendar" ? "Save to calendar" : gap.kind === "menu" ? "Save menu" : "Add to your information"}
        </button>
        <button type="button" className="btn" onClick={() => void runPreview()}>
          Preview the assistant&apos;s answer
        </button>
        {saved && (
          <button type="button" className="btn-link" onClick={() => markGapFixed(gap.key)}>
            Mark fixed
          </button>
        )}
      </div>
      {pv === "loading" && <span className="small muted">Asking the assistant…</span>}
      {pv && pv !== "loading" && (
        <div className="stack" style={{ background: "var(--bg)", borderRadius: 10, padding: 12 }}>
          <span className="xs bold" style={{ color: "var(--ai-ink)" }}>Preview: what a parent would see now</span>
          <span>{answerText(pv)}</span>
        </div>
      )}
      <span className="xs muted">The next parent who asks gets this answer. In production, brightwheel&apos;s quality checks run automatically after every edit; in this prototype they run from the team view.</span>
    </div>
  );
}
