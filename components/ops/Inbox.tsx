"use client";

import Link from "next/link";
import { useState } from "react";
import { ACTION_META, operatorAct } from "@/lib/client/actions";
import { demoNow, minutesLeft, stampTime, type InboxItem, type Sandbox } from "@/lib/client/store";
import OpsShell from "./OpsShell";

export default function Inbox() {
  return <OpsShell active="inbox">{(s) => <InboxBody s={s} />}</OpsShell>;
}

function tagClass(i: InboxItem): string {
  if (i.kind === "handoff" || (i.kind === "message" && i.category && i.category !== "H7")) return "tag-blue";
  if (i.kind === "request" || i.kind === "draft") return "tag-amber";
  return "tag-gray";
}

function InboxBody({ s }: { s: Sandbox }) {
  const now = demoNow(s);
  const open = s.inbox
    .filter((i) => i.status === "open")
    .sort((a, b) => (minutesLeft(a, now) ?? 1e9) - (minutesLeft(b, now) ?? 1e9));
  const done = s.inbox.filter((i) => i.status !== "open" && i.status !== "cancelled");
  return (
    <>
      <div className="spread" style={{ alignItems: "baseline" }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 24 }}>Inbox</h1>
          <span className="small muted">Questions the assistant sent to a person, requests waiting for you, and messages. Soonest promise first.</span>
        </div>
        <span className="xs muted">Items marked sample are other families; yours appear as you use the parent desk</span>
      </div>
      {open.length === 0 && (
        <div className="ok-box">
          Nothing waiting. <Link href="/parent">Open the parent desk</Link> and ask something to see it arrive here.
        </div>
      )}
      {open.map((i) => (
        <Item key={i.id} i={i} s={s} />
      ))}
      {done.length > 0 && (
        <details className="card">
          <summary style={{ cursor: "pointer", minHeight: 32, fontWeight: 700 }}>Done today ({done.length})</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {done.map((i) => (
              <div key={i.id} className="spread small" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <span>
                  <b>{i.family}</b> · {i.requestKind ? ACTION_META[i.requestKind].label : i.title}: {i.text.slice(0, 80)}
                </span>
                <span className="muted">{i.history[i.history.length - 1]?.text} · {stampTime(i.history[i.history.length - 1]?.stamp ?? i.createdStamp)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function Due({ i, s }: { i: InboxItem; s: Sandbox }) {
  const left = minutesLeft(i, demoNow(s));
  if (left == null) return <span className="small muted">{i.dueLabel}</span>;
  if (i.kind === "message" && left > 60) return <span className="small muted">{i.dueLabel}</span>;
  if (left < 0) return <span className="small fail">Overdue by {-left} min</span>;
  const verb = i.kind === "request" ? (i.requestKind && ACTION_META[i.requestKind].needs === "confirm" ? "Confirm" : "Acknowledge") : "Reply due";
  return <span className={`small bold`} style={{ color: left <= 10 ? "var(--red)" : "var(--amber)" }}>{verb} {verb === "Reply due" ? "in" : "within"} {left} min</span>;
}

function Item({ i, s }: { i: InboxItem; s: Sandbox }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState(i.kind === "draft" ? i.draftText ?? "" : "");
  const [declining, setDeclining] = useState(false);
  const needs = i.requestKind ? ACTION_META[i.requestKind].needs : null;
  return (
    <article className="card stack" aria-label={`${i.family} ${i.title}`}>
      <div className="spread">
        <div className="row">
          <span className={`tag ${tagClass(i)}`}>{i.title}</span>
          <span className="small bold">
            {i.family} · {i.child}, {i.room}
          </span>
          {i.sample && <span className="tag tag-gray">Sample</span>}
        </div>
        <Due i={i} s={s} />
      </div>
      <p style={{ fontSize: 15, whiteSpace: "pre-wrap" }}>{i.kind === "request" ? i.text : `"${i.text}"`}</p>
      {i.summary && i.kind !== "draft" && (
        <p className="small" style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 12px" }}>
          <b>Drafted summary:</b> {i.summary}
        </p>
      )}
      {i.kind === "message" && <span className="small muted">Sent straight to staff; no AI answer was attempted.{i.category ? " The safety check flagged it, so it moved up." : " The safety check found no urgent topic."}</span>}
      {i.kind === "draft" && (
        <label className="field">
          AI draft, from the center&apos;s information. Edit if needed, then send.
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {(replying || declining) && i.kind !== "draft" && (
        <label className="field">
          {declining ? "Note to the parent" : "Your reply"}
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </label>
      )}
      <div className="row">
        {i.kind === "request" && needs === "confirm" && !declining && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => operatorAct(i.id, "confirm")}>
              Confirm
            </button>
            <button type="button" className="btn" onClick={() => setDeclining(true)}>
              Decline with a note
            </button>
          </>
        )}
        {declining && (
          <button type="button" className="btn btn-primary" onClick={() => operatorAct(i.id, "decline", text || "We can't provide lunch today.")}>
            Send decline
          </button>
        )}
        {i.kind === "request" && needs === "acknowledge" && (
          <button type="button" className="btn btn-primary" onClick={() => operatorAct(i.id, "acknowledge")}>
            Acknowledge
          </button>
        )}
        {i.kind === "handoff" && i.category === "H4" && !replying && (
          <button type="button" className="btn btn-primary" onClick={() => operatorAct(i.id, "approve")}>
            Approve and tell the {i.room} teacher
          </button>
        )}
        {i.kind === "draft" && (
          <button type="button" className="btn btn-primary" onClick={() => operatorAct(i.id, "send", text)}>
            Send answer
          </button>
        )}
        {(i.kind === "handoff" || i.kind === "message") &&
          (replying ? (
            <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => operatorAct(i.id, "reply", text)}>
              Send reply
            </button>
          ) : (
            <button type="button" className={`btn${i.category === "H4" ? "" : " btn-primary"}`} onClick={() => setReplying(true)}>
              Reply
            </button>
          ))}
        {i.kind === "message" && (
          <>
            <button type="button" className="btn" onClick={() => operatorAct(i.id, "reply", "We called you back.")}>
              Call back
            </button>
            {i.couldHaveAnswered ? (
              <span className="small muted">Marked: the assistant could have answered this</span>
            ) : (
              <button type="button" className="btn-link" onClick={() => operatorAct(i.id, "could_have_answered")}>
                The assistant could have answered this
              </button>
            )}
          </>
        )}
      </div>
      {i.kind === "handoff" && i.category === "H4" && <span className="small muted">On approval, {i.child}&apos;s room teacher and the front desk are told who is picking up, and photo ID is checked at the door.</span>}
    </article>
  );
}
