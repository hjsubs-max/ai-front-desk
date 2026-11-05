"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACTION_META, ask, bookTour, cancelRequest, createAction, giveFeedback, sendDirectMessage, sendOfferedHandoff } from "@/lib/client/actions";
import { demoNow, stampTime, useSandbox, type InboxItem, type Sandbox, type ThreadEntry } from "@/lib/client/store";
import { setView, track } from "@/lib/client/track";
import { addDays, fmtLong, fmtShort, fmtStamp, fmtTime, isWeekend, toMinutes } from "@/lib/dates";
import { isOpenNow, nextOpenDay, openStatus } from "@/lib/engine/pipeline";
import type { ActionKind, Block, CenterNow, Knowledge, TourSlot } from "@/lib/types";
import Banner from "./Banner";
import { ACTION_ICONS, ArrowUp, Back, Calendar, Doc, Mic, Person, Sparkle } from "./Icons";

type View = "home" | "thread" | "talk";
type Sheet = { kind: "action"; action: ActionKind } | { kind: "source"; id: string } | null;

export default function ParentApp() {
  const s = useSandbox();
  const [view, setV] = useState<View>("home");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [talkPrefill, setTalkPrefill] = useState("");
  const [, setTick] = useState(0);
  const opened = useRef(false);

  useEffect(() => {
    setView("parent");
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (s && !opened.current) {
      opened.current = true;
      track("desk_opened");
      track("today_card_viewed");
    }
  }, [s]);

  if (!s) return <div className="phone" aria-busy="true" />;
  const now = demoNow(s);

  const goTalk = (prefill = "", from = "home") => {
    setTalkPrefill(prefill);
    setV("talk");
    track("talk_to_person_opened", { from });
  };

  return (
    <div className="phone">
      <Banner s={s} />
      {view === "home" && <Home s={s} now={now} onAsked={() => setV("thread")} onAction={(a) => setSheet({ kind: "action", action: a })} onTalk={() => goTalk("", "home")} onOpenThread={() => setV("thread")} />}
      {view === "thread" && <Thread s={s} now={now} onBack={() => setV("home")} onSource={(id) => setSheet({ kind: "source", id })} onTalk={(q) => goTalk(q, "answer")} />}
      {view === "talk" && <Talk s={s} prefill={talkPrefill} onBack={() => setV(s.thread.length ? "thread" : "home")} onSent={() => setV("thread")} />}
      {sheet?.kind === "action" && (
        <ActionSheet
          s={s}
          now={now}
          action={sheet.action}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            setV("thread");
          }}
        />
      )}
      {sheet?.kind === "source" && <SourceSheet k={s.knowledge} now={now} id={sheet.id} onClose={() => setSheet(null)} />}
    </div>
  );
}

// ---------------- Home ----------------

function windowFor(now: CenterNow): "dropoff" | "pickup" {
  return now.minutes < 12 * 60 + 30 ? "dropoff" : "pickup";
}

function Home({ s, now, onAsked, onAction, onTalk, onOpenThread }: { s: Sandbox; now: CenterNow; onAsked: () => void; onAction: (a: ActionKind) => void; onTalk: () => void; onOpenThread: () => void }) {
  const win = windowFor(now);
  const actions = s.pins[win].slice(0, 4);
  const k = s.knowledge;
  const active = s.inbox.filter((i) => !i.sample && i.status !== "cancelled");
  const suggestions = useMemo(() => suggestFor(k, now, win), [k, now, win]);
  return (
    <>
      <header className="p-header">
        <div className="p-title">
          <span className="xs muted">{k.center.name}</span>
          <span className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>Front desk</span>
            <span className="tag tag-ai">
              <Sparkle /> AI
            </span>
          </span>
        </div>
        <button type="button" className="btn-link" style={{ textDecoration: "underline", textUnderlineOffset: 3, fontSize: 13 }} onClick={onTalk}>
          Talk to a person
        </button>
      </header>
      <main className="p-main">
        <TodayCard k={k} now={now} win={win} />
        <section aria-label="Let the center know" className="stack">
          <div className="spread">
            <h2 style={{ fontSize: 15 }}>Let the center know</h2>
            <span className="xs muted">{win === "dropoff" ? "Drop-off" : "Pickup"}</span>
          </div>
          <div className="actions-grid">
            {actions.map((a) => {
              const Icon = ACTION_ICONS[a];
              return (
                <button
                  key={a}
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    track("action_tapped", { action: a, window: win });
                    onAction(a);
                  }}
                >
                  <span style={{ color: "var(--ai-ink)", display: "flex" }}>
                    <Icon />
                  </span>
                  {ACTION_META[a].label}
                </button>
              );
            })}
          </div>
        </section>
        {active.length > 0 && (
          <section aria-label="Your requests" className="stack">
            <h2 style={{ fontSize: 15 }}>Today with the center</h2>
            {active.slice(0, 3).map((i) => (
              <button
                key={i.id}
                type="button"
                className="card spread"
                style={{ textAlign: "left", padding: 12 }}
                onClick={() => {
                  track("request_status_viewed", { status: i.status });
                  onOpenThread();
                }}
              >
                <span className="small">{i.requestKind ? ACTION_META[i.requestKind].label : i.kind === "message" ? "Message to staff" : "Question for staff"}</span>
                <StatusTag item={i} />
              </button>
            ))}
          </section>
        )}
      </main>
      <footer className="p-footer">
        <div className="row" aria-label="Suggested questions">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              className="chip"
              onClick={async () => {
                onAsked();
                await ask(q, "suggestion");
              }}
            >
              {q}
            </button>
          ))}
        </div>
        <AskBar placeholder="Ask anything about Sunnyside" onSubmit={onAsked} />
      </footer>
    </>
  );
}

function suggestFor(k: Knowledge, now: CenterNow, win: "dropoff" | "pickup"): string[] {
  const out: string[] = [];
  if (win === "pickup") out.push("Late pickup fee?");
  const soon = k.calendar.entries.find((e) => e.date > now.date && e.date <= addDays(now.date, 14) && e.status !== "open");
  if (soon && win === "dropoff") out.push(`Open on ${soon.name}?`);
  if (now.date < "2026-11-27") out.push("Day after Thanksgiving?");
  out.push("Winter break dates?");
  return Array.from(new Set(out)).slice(0, 2);
}

function TodayCard({ k, now, win }: { k: Knowledge; now: CenterNow; win: "dropoff" | "pickup" }) {
  const st = openStatus(now.date, k);
  const closedToday = st.value === "closed" || st.value === "weekend";
  const open = isOpenNow(now, k);
  const entry = st.entry;
  const close = entry?.close ?? k.hours.close;
  const lunch = k.menu.days.find((m) => m.date === now.date)?.lunch;
  const tomorrow = nextOpenDay(now.date, k);
  const tomorrowLunch = k.menu.days.find((m) => m.date === tomorrow)?.lunch;
  const headsUp = k.calendar.entries.find((e) => e.date > now.date && e.date <= addDays(now.date, 14) && e.status !== "open");
  const tag = closedToday ? { cls: "tag-gray", text: "Closed today" } : open ? { cls: "tag-green", text: win === "pickup" ? `Open until ${fmtTime(close)}` : "Open" } : now.minutes < toMinutes(k.hours.open) ? { cls: "tag-amber", text: `Opens ${fmtTime(k.hours.open)}` } : { cls: "tag-gray", text: "Closed now" };
  return (
    <section aria-label="Today at the center" className="card stack" style={{ borderRadius: 16 }}>
      <div className="spread">
        <h1 style={{ fontSize: 18 }}>Today · {fmtShort(now.date).replace(",", "")}</h1>
        <span className={`tag ${tag.cls}`}>{tag.text}</span>
      </div>
      {closedToday ? (
        <p className="small">
          {entry ? `Closed for ${entry.name}. ` : "Closed on weekends. "}We reopen {fmtLong(nextOpenDay(now.date, k))} at {fmtTime(k.hours.open)}.
        </p>
      ) : (
        <div className="today-grid">
          {win === "dropoff" ? (
            <>
              <span className="muted">Hours</span>
              <span>
                {fmtTime(entry?.open ?? k.hours.open)} to {fmtTime(close)}
              </span>
              <span className="muted">Lunch</span>
              <span>{lunch ?? "Not posted yet"}</span>
            </>
          ) : (
            <>
              <span className="muted">Pickup</span>
              <span>
                By {fmtTime(close)}; late fee after {fmtTime(k.hours.lateFeeAfter)}
              </span>
              <span className="muted">Tomorrow</span>
              <span>
                {isWeekend(addDays(now.date, 1)) || tomorrow !== addDays(now.date, 1) ? `Closed; next open ${fmtShort(tomorrow)}` : `${fmtShort(tomorrow)}, ${fmtTime(k.hours.open)} to ${fmtTime(k.hours.close)}`}
                {tomorrowLunch ? ` · lunch is ${tomorrowLunch.split(",")[0].toLowerCase()}` : ""}
              </span>
            </>
          )}
        </div>
      )}
      {headsUp && (
        <div className="heads-up">
          <span style={{ color: "var(--ai-ink)", display: "flex", marginTop: 1 }}>
            <Calendar size={18} />
          </span>
          <span>
            <b>Heads up:</b> {headsUp.status === "closed" ? "closed" : "shorter hours"} {fmtShort(headsUp.date)} for {headsUp.name}
          </span>
        </div>
      )}
      <span className="xs muted">From the center&apos;s calendar and menu · updated {fmtStamp(k.menu.updatedAt, now)}</span>
    </section>
  );
}

// ---------------- Ask bar with voice ----------------

type SR = { start: () => void; stop: () => void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; lang: string; interimResults: boolean };

function AskBar({ placeholder, onSubmit }: { placeholder: string; onSubmit?: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [fromVoice, setFromVoice] = useState(false);
  const rec = useRef<SR | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setVoiceOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  const submit = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    onSubmit?.();
    setText("");
    await ask(q, fromVoice ? "voice" : "text");
    setFromVoice(false);
    setBusy(false);
  };
  const toggleMic = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new C();
    r.lang = "en-US";
    r.interimResults = true;
    r.onresult = (e) => {
      const t = Array.from(e.results as unknown as { 0: { transcript: string } }[]).map((x) => x[0].transcript).join(" ");
      setText(t);
      setFromVoice(true);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    track("voice_started");
    r.start();
  };
  return (
    <form
      className="askbar"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="ask" className="sr-only">
        Ask a question
      </label>
      <input id="ask" value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening…" : placeholder} maxLength={600} autoComplete="off" />
      {voiceOk && (
        <button type="button" className={`round${listening ? " listening" : ""}`} aria-label={listening ? "Stop listening" : "Speak your question"} aria-pressed={listening} onClick={toggleMic}>
          <Mic />
        </button>
      )}
      <button type="submit" className="round send" aria-label="Send question" disabled={busy || !text.trim()}>
        <span style={{ color: "#fff", display: "flex" }}>
          <ArrowUp />
        </span>
      </button>
    </form>
  );
}

// ---------------- Thread ----------------

function Thread({ s, now, onBack, onSource, onTalk }: { s: Sandbox; now: CenterNow; onBack: () => void; onSource: (id: string) => void; onTalk: (q: string) => void }) {
  const end = useRef<HTMLDivElement>(null);
  const pending = s.thread.length;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pending]);
  return (
    <>
      <header className="p-header">
        <button type="button" className="btn-link row" style={{ gap: 6, textDecoration: "none" }} onClick={onBack}>
          <Back /> Today
        </button>
        <span className="tag tag-ai" style={{ padding: "6px 10px" }}>
          <Sparkle /> AI assistant
        </span>
      </header>
      <main className="p-main" aria-live="polite">
        {s.thread.length === 0 && <p className="muted small">Ask a question or use a button on the Today screen.</p>}
        {s.thread.map((e) => (
          <Entry key={e.id} e={e} s={s} now={now} onSource={onSource} onTalk={onTalk} />
        ))}
        <div ref={end} />
      </main>
      <footer className="p-footer">
        <AskBar placeholder="Ask another question" />
      </footer>
    </>
  );
}

function itemFor(s: Sandbox, e: ThreadEntry): InboxItem | undefined {
  return e.inboxId ? s.inbox.find((i) => i.id === e.inboxId) : undefined;
}

function Entry({ e, s, now, onSource, onTalk }: { e: ThreadEntry; s: Sandbox; now: CenterNow; onSource: (id: string) => void; onTalk: (q: string) => void }) {
  const item = itemFor(s, e);
  if (e.kind === "action") {
    return (
      <>
        <div className="bubble-q">{e.question}</div>
        {item && <RequestCard item={item} />}
      </>
    );
  }
  if (e.kind === "message") {
    return (
      <>
        <div className="bubble-q">{e.question}</div>
        {item && <RequestCard item={item} />}
      </>
    );
  }
  if (!e.result) {
    return (
      <>
        <div className="bubble-q">{e.question}</div>
        <div className="answer" aria-busy="true">
          <span className="label">
            <Sparkle /> Checking Sunnyside&apos;s information…
          </span>
        </div>
      </>
    );
  }
  const r = e.result;
  const child = s.knowledge.family.children[0]?.name ?? "your child";
  return (
    <>
      <div className="bubble-q">{e.question}</div>
      {r.route === "emergency" ? (
        <section className="emergency-card" aria-label="Emergency">
          <p style={{ fontSize: 18, fontWeight: 700 }}>If this is an emergency, call 911 now.</p>
          <p className="small">Then call the center. Staff have been alerted.</p>
          <a className="btn btn-blue btn-block" href="tel:911" onClick={() => track("call_tapped", { to: "911" })}>
            Call 911
          </a>
          <a className="btn btn-block" href={`tel:${s.knowledge.center.phone.replace(/\D/g, "")}`} onClick={() => track("call_tapped", { to: "center" })}>
            Call the center: {s.knowledge.center.phone}
          </a>
        </section>
      ) : r.route === "person" && r.handoff?.mode === "offer" ? (
        <>
          <AnswerCard e={e} s={s} onSource={onSource} onTalk={onTalk} hideFeedback />
          <section className="person-card" aria-label="Next step with staff">
            <div className="row" style={{ alignItems: "flex-start", gap: 10, flexWrap: "nowrap" }}>
              <span style={{ color: "var(--blue)", display: "flex" }}>
                <Person />
              </span>
              <div className="stack" style={{ gap: 4 }}>
                <span style={{ fontWeight: 700 }}>Only our staff can decide about {child} today.</span>
                <span className="small">
                  {item ? `Sent to ${r.handoff.to}.` : `Send her symptoms and ${s.knowledge.center.director}, the director, will reply.`} Reply: {r.handoff.dueLabel.toLowerCase()}.
                </span>
              </div>
            </div>
            {item ? (
              <HandoffStatus item={item} />
            ) : (
              <button type="button" className="btn btn-blue btn-block" onClick={() => sendOfferedHandoff(e.id)}>
                Send to staff
              </button>
            )}
            <CallLink phone={s.knowledge.center.phone} />
          </section>
        </>
      ) : r.route === "person" ? (
        <section className="person-card" aria-label="Sent to a person">
          <span className="xs bold" style={{ color: "var(--blue)" }}>
            Sent to a person
          </span>
          <Blocks blocks={r.blocks} first onSlot={() => {}} />
          <div className="kv">
            <div>
              <span className="muted">Sent to</span>
              <b>{r.handoff?.to}</b>
            </div>
            <div>
              <span className="muted">Reply by</span>
              <b>{r.handoff?.dueLabel}</b>
            </div>
            <div>
              <span className="muted">Status</span>
              <span>{item ? statusText(item) : "Sending…"}</span>
            </div>
          </div>
          {item?.reply && <StaffReply item={item} />}
          <CallLink phone={s.knowledge.center.phone} solid />
        </section>
      ) : r.route === "draft" ? (
        <section className="answer" aria-label="Staff will reply">
          <span className="label">
            <Sparkle /> AI assistant
          </span>
          <Blocks blocks={r.blocks} onSlot={() => {}} />
          <div className="kv" style={{ background: "var(--bg)" }}>
            <div>
              <span className="muted">Reply by</span>
              <b>{r.handoff?.dueLabel}</b>
            </div>
            <div>
              <span className="muted">Status</span>
              <span>{item ? statusText(item) : "Sending…"}</span>
            </div>
          </div>
          {item?.reply && <StaffReply item={item} />}
        </section>
      ) : (
        <>
          <AnswerCard e={e} s={s} onSource={onSource} onTalk={onTalk} />
          {r.route === "unknown" && r.handoff?.mode === "offer" && (
            <section className="person-card" aria-label="Send to staff">
              {item ? (
                <HandoffStatus item={item} />
              ) : (
                <button type="button" className="btn btn-blue btn-block" onClick={() => sendOfferedHandoff(e.id)}>
                  Send my question to staff
                </button>
              )}
            </section>
          )}
          {item && r.route === "request" && <RequestCard item={item} />}
        </>
      )}
    </>
  );
}

function CallLink({ phone, solid }: { phone: string; solid?: boolean }) {
  return (
    <a className={solid ? "btn btn-blue btn-block" : "btn-link"} style={solid ? {} : { display: "flex", justifyContent: "center", alignItems: "center", color: "var(--blue)" }} href={`tel:${phone.replace(/\D/g, "")}`} onClick={() => track("call_tapped", { to: "center" })}>
      Call the center: {phone}
    </a>
  );
}

function AnswerCard({ e, s, onSource, onTalk, hideFeedback }: { e: ThreadEntry; s: Sandbox; onSource: (id: string) => void; onTalk: (q: string) => void; hideFeedback?: boolean }) {
  const r = e.result!;
  const [reasonOpen, setReasonOpen] = useState(false);
  const hasAiWording = r.aiText.length > 0 && r.route === "policy";
  return (
    <article className="answer" aria-label="Answer">
      <span className="label">
        <Sparkle /> {r.route === "out_of_scope" ? "AI assistant" : "AI answer from Sunnyside's information"}
      </span>
      <Blocks blocks={r.blocks} collapseQuotes={hasAiWording} onSlot={(slot) => bookTour(slot)} />
      {r.sources.length > 0 && (
        <div className="row">
          {r.sources.map((src) => (
            <button
              key={src.id}
              type="button"
              className="source-chip"
              onClick={() => {
                track("source_opened", { source: src.id });
                onSource(src.id);
              }}
            >
              <Doc />
              <span>
                <b>{src.label}</b> · {src.updated}
              </span>
            </button>
          ))}
        </div>
      )}
      {r.fallback && <span className="xs muted">Answered with the backup rules: {r.fallback}.</span>}
      {!hideFeedback && r.route !== "out_of_scope" && r.route !== "request" && (
        <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          {e.feedback ? (
            <span className="small muted">
              Thanks for the feedback.{e.feedback.reason === "wrong" ? " Staff will check this answer." : ""}
            </span>
          ) : reasonOpen ? (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small">What was wrong?</span>
              <div className="row">
                {[
                  ["wrong", "Wrong or out of date"],
                  ["missed", "Didn't answer what I asked"],
                  ["unclear", "Hard to understand"],
                  ["person", "I needed a person"],
                ].map(([k, label]) => (
                  <button key={k} type="button" className="chip" onClick={() => giveFeedback(e.id, "no", k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="spread">
              <span className="small">Did this answer your question?</span>
              <span className="row">
                <button type="button" className="btn btn-sm" onClick={() => giveFeedback(e.id, "yes")}>
                  Yes
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setReasonOpen(true)}>
                  No
                </button>
                <button
                  type="button"
                  className="btn-link"
                  style={{ fontSize: 13 }}
                  onClick={() => {
                    track("ask_person_tapped");
                    onTalk(e.question);
                  }}
                >
                  Ask a person
                </button>
              </span>
            </div>
          )}
        </div>
      )}
      {r.related.length > 0 && <Related items={r.related} />}
    </article>
  );
}

function Related({ items }: { items: string[] }) {
  return (
    <div className="row" aria-label="Related questions">
      {items.map((q) => (
        <button key={q} type="button" className="chip" onClick={() => void ask(q, "suggestion")}>
          {q}
        </button>
      ))}
    </div>
  );
}

function Blocks({ blocks, collapseQuotes, onSlot, first }: { blocks: Block[]; collapseQuotes?: boolean; onSlot: (s: TourSlot) => void; first?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "text")
          return (
            <p key={i} style={{ fontSize: first && i === 0 ? 17 : 15, fontWeight: first && i === 0 ? 700 : 400, lineHeight: 1.45 }}>
              {b.strong && !first ? <b>{b.strong} </b> : null}
              {b.text}
            </p>
          );
        if (b.type === "quote")
          return collapseQuotes ? (
            <details key={i}>
              <summary className="small" style={{ cursor: "pointer", minHeight: 32 }}>
                Handbook text, word for word
              </summary>
              <blockquote className="quote">&ldquo;{b.text}&rdquo;</blockquote>
            </details>
          ) : (
            <blockquote key={i} className="quote">
              &ldquo;{b.text}&rdquo;
            </blockquote>
          );
        if (b.type === "list")
          return (
            <ul key={i}>
              {b.items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          );
        return (
          <div key={i} className="row">
            {b.slots.map((slot) => (
              <button key={slot.id} type="button" className="chip" onClick={() => onSlot(slot)}>
                {fmtShort(slot.date)} · {fmtTime(slot.time)}
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}

function statusText(i: InboxItem): string {
  const last = i.history[i.history.length - 1];
  const at = stampTime(last.stamp);
  switch (i.status) {
    case "open":
      return `Sent ${stampTime(i.createdStamp)} · waiting for staff`;
    case "acknowledged":
      return `${last.text} · ${at}`;
    case "confirmed":
      return `${last.text} · ${at}`;
    case "declined":
      return `Declined · ${at}`;
    case "replied":
    case "sent":
      return `Staff replied · ${at}`;
    case "booked":
      return `Booked · ${at}`;
    case "cancelled":
      return `Cancelled · ${at}`;
  }
}

function StatusTag({ item }: { item: InboxItem }) {
  const map: Record<string, [string, string]> = {
    open: ["tag-amber", "Waiting for staff"],
    acknowledged: ["tag-green", "Seen by staff"],
    confirmed: ["tag-green", "Confirmed"],
    declined: ["tag-red", "Declined"],
    replied: ["tag-green", "Staff replied"],
    sent: ["tag-green", "Staff replied"],
    booked: ["tag-green", "Booked"],
    cancelled: ["tag-gray", "Cancelled"],
  };
  const [cls, text] = map[item.status];
  return <span className={`tag ${cls}`}>{text}</span>;
}

function StaffReply({ item }: { item: InboxItem }) {
  return (
    <div className="kv" style={{ background: "#fff", border: "1px solid var(--line)" }}>
      <span className="xs bold">From Sunnyside staff</span>
      <span>{item.reply}</span>
    </div>
  );
}

function HandoffStatus({ item }: { item: InboxItem }) {
  return (
    <div className="kv">
      <div>
        <span className="muted">Status</span>
        <span>{statusText(item)}</span>
      </div>
      <div>
        <span className="muted">Reply by</span>
        <b>{item.dueLabel}</b>
      </div>
      {item.reply && <span>{item.reply}</span>}
    </div>
  );
}

function RequestCard({ item }: { item: InboxItem }) {
  const meta = item.requestKind ? ACTION_META[item.requestKind] : null;
  const done = ["acknowledged", "confirmed", "replied", "sent", "booked"].includes(item.status);
  const title = meta ? `${meta.label} · ${item.child}` : item.kind === "message" ? "Message to staff" : "Sent to staff";
  return (
    <section className={`request-card${done ? " done" : item.status === "declined" ? " declined" : ""}`} aria-label="Request status">
      <div className="spread">
        <span style={{ fontWeight: 700 }}>{title}</span>
        <StatusTag item={item} />
      </div>
      <ol className="timeline">
        {item.history.map((h, i) => (
          <li key={i}>
            <span className={`dot${i > 0 && (item.status === "declined" || item.status === "cancelled") && i === item.history.length - 1 ? " red" : i > 0 ? " green" : ""}`} aria-hidden="true" />
            <span>
              {h.text} · {stampTime(h.stamp)}
            </span>
          </li>
        ))}
        {item.status === "open" && (
          <li>
            <span className="dot open" aria-hidden="true" />
            <span className="muted">
              Staff {meta?.needs === "confirm" ? "confirm" : meta?.needs === "acknowledge" ? "acknowledge" : "reply"} · {item.dueLabel.toLowerCase()}
            </span>
          </li>
        )}
      </ol>
      {item.reply && <StaffReply item={item} />}
      {meta?.needs === "confirm" && item.status === "open" && <span className="xs muted">Nothing is confirmed until staff confirm it. You&apos;ll see the status change here.</span>}
      {item.status === "open" && item.kind === "request" && (
        <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => cancelRequest(item.id)}>
          Cancel request
        </button>
      )}
    </section>
  );
}

// ---------------- Action sheet ----------------

function ActionSheet({ s, now, action, onClose, onDone }: { s: Sandbox; now: CenterNow; action: ActionKind; onClose: () => void; onDone: () => void }) {
  const k = s.knowledge;
  const child = k.family.children[0]?.name ?? "your child";
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [onList, setOnList] = useState("No");
  const lunch = k.menu.days.find((m) => m.date === now.date)?.lunch;
  const times: Record<string, string[]> = {
    running_late: ["8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "Later"],
    picking_up_early: ["12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"],
    late_for_pickup: ["6:05 PM", "6:15 PM", "6:30 PM", "Later"],
  };
  const reasons = ["Family day", "Appointment", "Sick", "Other"];
  const submit = () => {
    switch (action) {
      case "running_late":
        createAction(action, `${child} is running late${choice ? `, arriving about ${choice}` : ""}${note ? `. ${note}` : ""}`);
        break;
      case "picking_up_early":
        createAction(action, `Picking ${child} up early${choice ? ` at ${choice}` : ""}${note ? `. ${note}` : ""}`);
        break;
      case "late_for_pickup":
        createAction(action, `Late for pickup${choice ? `, arriving about ${choice}` : ""}${note ? `. ${note}` : ""}`);
        break;
      case "absent_today":
      case "absent_tomorrow":
        createAction(action, `${child} will be absent ${action === "absent_today" ? "today" : "tomorrow"}${choice ? ` (${choice.toLowerCase()})` : ""}${note ? `. ${note}` : ""}`);
        break;
      case "forgot_lunch":
        createAction(action, `Provide lunch today ($6, added to next invoice)${note ? `. ${note}` : ""}`);
        break;
      case "child_unwell":
        createAction(action, `${child} is unwell: ${note || "no details given"}`, { category: "H3", summary: `Parent reports symptoms: ${note || "no details"}. Handbook 4.2 applies; staff decide.` });
        break;
      case "someone_else_pickup":
        createAction(action, `${name || "Someone else"} is picking ${child} up today. On the approved list: ${onList}.${note ? ` ${note}` : ""}`, {
          category: "H4",
          summary: `One-time pickup by ${name || "a person not named"} (${onList === "Yes" ? "parent says they are on the list" : "not on the approved list"}). Handbook 3.4: director approval and photo ID.`,
        });
        break;
      default:
        break;
    }
    onDone();
  };
  const meta = ACTION_META[action];
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={meta.label} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <h2 style={{ fontSize: 18 }}>{meta.label}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        {times[action] && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small bold">{action === "picking_up_early" ? "Pickup time" : "About what time?"}</span>
            <div className="row">
              {times[action].map((t) => (
                <button key={t} type="button" className={`chip${choice === t ? " on" : ""}`} aria-pressed={choice === t} onClick={() => setChoice(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        {(action === "absent_today" || action === "absent_tomorrow") && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small bold">Reason (optional)</span>
            <div className="row">
              {reasons.map((t) => (
                <button key={t} type="button" className={`chip${choice === t ? " on" : ""}`} aria-pressed={choice === t} onClick={() => setChoice(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        {action === "forgot_lunch" && (
          <div className="stack">
            <p>
              Today&apos;s lunch is <b>{lunch ? lunch.toLowerCase() : "not posted yet"}</b>.
            </p>
            <p className="small">The kitchen can provide it for $6, added to your next invoice. Staff confirm by 10:30 AM (Handbook 5.1).</p>
          </div>
        )}
        {action === "late_for_pickup" && <p className="small">Pickups after {fmtTime(k.hours.lateFeeAfter)} are charged $1 per minute, added to your next invoice (Handbook 3.6).</p>}
        {action === "child_unwell" && (
          <p className="small">
            Only staff can decide whether {child} can come in. Tell them what&apos;s going on and {k.center.director}, the director, will reply within 15 minutes during open hours.
          </p>
        )}
        {action === "someone_else_pickup" && (
          <>
            <p className="small">A one-time pickup by someone not on {child}&apos;s approved list needs the director&apos;s approval. Staff always check photo ID (Handbook 3.4).</p>
            <label className="field">
              Who is picking up?
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name and relationship" />
            </label>
            <div className="stack" style={{ gap: 6 }}>
              <span className="small bold">Are they on {child}&apos;s approved pickup list?</span>
              <div className="row">
                {["Yes", "No", "Not sure"].map((t) => (
                  <button key={t} type="button" className={`chip${onList === t ? " on" : ""}`} aria-pressed={onList === t} onClick={() => setOnList(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <label className="field">
          {action === "child_unwell" ? "Symptoms" : "Note for staff (optional)"}
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder={action === "child_unwell" ? "For example: fever of 100.8 since last night, eating less" : ""} />
        </label>
        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={action === "child_unwell" && !note.trim()}>
          {action === "forgot_lunch" ? "Ask staff to provide lunch" : meta.needs === "person" ? "Send to staff" : "Let the center know"}
        </button>
        <span className="xs muted">
          {meta.needs === "confirm" ? "Nothing is confirmed until staff confirm it." : meta.needs === "person" ? "A person decides; the assistant never does." : "Goes to staff now. You'll see when they've seen it."}
        </span>
      </div>
    </div>
  );
}

// ---------------- Source sheet ----------------

function SourceSheet({ k, now, id, onClose }: { k: Knowledge; now: CenterNow; id: string; onClose: () => void }) {
  let title = "";
  let body: React.ReactNode = null;
  if (id === "calendar") {
    title = "Center calendar · Holidays 2026–27";
    body = (
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {k.calendar.entries
          .filter((e) => e.date >= addDays(now.date, -1))
          .map((e) => (
            <li key={e.id} className="small">
              {fmtShort(e.date)}: {e.name} ({e.status === "shortened" ? `open ${fmtTime(e.open!)} to ${fmtTime(e.close!)}` : e.status})
            </li>
          ))}
      </ul>
    );
  } else if (id === "hours") {
    title = "Center hours";
    body = <p>Monday to Friday, {fmtTime(k.hours.open)} to {fmtTime(k.hours.close)}. Late fee after {fmtTime(k.hours.lateFeeAfter)}.</p>;
  } else if (id === "tuition") {
    title = "Tuition and fees";
    body = (
      <table className="t">
        <thead>
          <tr>
            <th>Room</th>
            <th>Full time</th>
            <th>Part time</th>
          </tr>
        </thead>
        <tbody>
          {k.tuition.rows.map((r) => (
            <tr key={r.room}>
              <td>
                {r.room}
                <div className="xs muted">{r.ages}</div>
              </td>
              <td>${r.fullTime.toLocaleString()}</td>
              <td>${r.partTime.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (id === "menu") {
    title = "Menu";
    body = (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {k.menu.days.map((d) => (
          <li key={d.date} className="small">
            {fmtShort(d.date)}: {d.lunch}
          </li>
        ))}
      </ul>
    );
  } else if (id === "tours") {
    title = "Tour times";
    body = <p className="small">Tuesdays and Thursdays at 10:00 AM and 3:30 PM.</p>;
  } else if (id.startsWith("handbook:")) {
    const sec = k.handbook.sections.find((x) => `handbook:${x.id}` === id);
    title = `Family Handbook ${sec?.id} · ${sec?.title}`;
    body = <blockquote className="quote">{sec?.text}</blockquote>;
  } else if (id.startsWith("answer:")) {
    const a = k.answers.items.find((x) => `answer:${x.id}` === id);
    title = "Center answers";
    body = (
      <div className="stack">
        <b>{a?.question}</b>
        <p>{a?.answer}</p>
      </div>
    );
  }
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <h2 style={{ fontSize: 17 }}>{title}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        {body}
        <span className="xs muted">This is the record the assistant answered from. Staff keep it up to date in the control center.</span>
      </div>
    </div>
  );
}

// ---------------- Talk to a person ----------------

function Talk({ s, prefill, onBack, onSent }: { s: Sandbox; prefill: string; onBack: () => void; onSent: () => void }) {
  const k = s.knowledge;
  const child = k.family.children[0];
  const [about, setAbout] = useState(`${child.name} (${child.room})`);
  const [text, setText] = useState(prefill);
  const [warn, setWarn] = useState(false);
  return (
    <>
      <header className="p-header">
        <button type="button" className="btn-link row" style={{ gap: 6, textDecoration: "none" }} onClick={onBack}>
          <Back /> Back
        </button>
        <span className="xs muted">{k.center.name}</span>
      </header>
      <main className="p-main">
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 20 }}>Talk to someone at Sunnyside</h1>
          <p className="small muted">Staff are here {fmtTime(k.hours.open)} to {fmtTime(k.hours.close)}. If this is an emergency, call 911.</p>
        </div>
        {warn && (
          <div className="emergency-card">
            <b>If this is an emergency, call 911 now, then call the center.</b>
            <span className="small">Your message was sent and staff were alerted.</span>
          </div>
        )}
        <section className="card stack">
          <b>Call the front desk</b>
          <span className="small muted">Best for anything urgent today.</span>
          <a className="btn btn-blue" href={`tel:${k.center.phone.replace(/\D/g, "")}`} onClick={() => track("call_tapped", { to: "center" })}>
            Call {k.center.phone}
          </a>
        </section>
        <section className="card stack">
          <b>Send a message to staff</b>
          <span className="small muted">Goes straight to staff; the assistant doesn&apos;t answer it. Usually answered the same day during open hours.</span>
          <div className="stack" style={{ gap: 6 }}>
            <span className="small bold">About</span>
            <div className="row">
              {[`${child.name} (${child.room})`, "Our family in general"].map((t) => (
                <button key={t} type="button" className={`chip${about === t ? " on" : ""}`} aria-pressed={about === t} onClick={() => setAbout(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            Your message
            <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} maxLength={800} />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!text.trim()}
            onClick={() => {
              const r = sendDirectMessage(text.trim(), about === "Our family in general" ? "" : about);
              if (r.category === "H1" || r.category === "H2") {
                setWarn(true);
                setText("");
                return;
              }
              onSent();
            }}
          >
            Send to staff
          </button>
          <span className="xs muted">You&apos;ll see the status here, like any request. If you mention an emergency or an injury, you&apos;ll be asked to call first.</span>
        </section>
        <Link href="/ops" className="xs muted" style={{ textAlign: "center" }}>
          See what staff see: open the control center
        </Link>
      </main>
    </>
  );
}
