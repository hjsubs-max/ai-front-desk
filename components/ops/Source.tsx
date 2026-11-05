"use client";

import { useState } from "react";
import { ACTION_META } from "@/lib/client/actions";
import { addCenterAnswer, addMenuWeek, editKnowledge, fixCalendarDate, setTopic } from "@/lib/client/edit";
import { demoNow, update, type Sandbox } from "@/lib/client/store";
import { track } from "@/lib/client/track";
import { addDays, fmtShort, fmtStamp, fmtTime, weekStart } from "@/lib/dates";
import { openStatus } from "@/lib/engine/pipeline";
import { TOPIC_LABELS } from "@/lib/seed";
import type { ActionKind, TopicKey, TopicSetting } from "@/lib/types";
import OpsShell from "./OpsShell";

export default function Source() {
  return <OpsShell active="source">{(s) => <SourceBody s={s} />}</OpsShell>;
}

type Editor = "hours" | "calendar" | "tuition" | "menu" | "menu-next" | "handbook" | "answers" | null;

function SourceBody({ s }: { s: Sandbox }) {
  const [open, setOpen] = useState<Editor>(null);
  const k = s.knowledge;
  const now = demoNow(s);
  const nextMonday = addDays(weekStart(now.date), 7);
  const nextWeekPosted = k.menu.days.some((d) => d.date >= nextMonday && d.date < addDays(nextMonday, 5));
  const calendarGaps = [] as string[];
  for (let i = 0; i < 60; i++) {
    const d = addDays(now.date, i);
    if (openStatus(d, k).value === "unknown") calendarGaps.push(d);
  }
  const rows: { key: Editor; item: string; updated: string; status: string; bad?: boolean }[] = [
    { key: "hours", item: "Hours", updated: `${fmtStamp(k.hours.updatedAt, now)} · ${k.hours.updatedBy}`, status: "Current" },
    { key: "calendar", item: "Holiday calendar 2026–27", updated: `${fmtStamp(k.calendar.updatedAt, now)} · ${k.calendar.updatedBy}`, status: calendarGaps.length ? `Missing ${calendarGaps.map((d) => fmtShort(d).split(", ")[1]).join(", ")}` : "Current", bad: calendarGaps.length > 0 },
    { key: "tuition", item: "Tuition and fees", updated: `${fmtStamp(k.tuition.updatedAt, now)} · ${k.tuition.updatedBy}`, status: "Current" },
    { key: "menu", item: "Menu, this week", updated: `${fmtStamp(k.menu.updatedAt, now)} · ${k.menu.updatedBy}`, status: "Current" },
    { key: "menu-next", item: "Menu, next week", updated: nextWeekPosted ? fmtStamp(k.menu.updatedAt, now) : "Not added", status: nextWeekPosted ? "Current" : "Missing", bad: !nextWeekPosted },
    { key: "handbook", item: `Handbook, ${k.handbook.sections.length} sections`, updated: `${fmtStamp(k.handbook.updatedAt, now)} · ${k.handbook.updatedBy}`, status: "Current" },
    { key: "answers", item: `Center answers, ${k.answers.items.length}`, updated: `${fmtStamp(k.answers.updatedAt, now)}`, status: "Current" },
  ];
  return (
    <>
      <section className="card stack" aria-label="Your information">
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 22 }}>Your information</h1>
          <span className="small muted">The assistant answers only from what is here. In brightwheel this would come from your existing calendar, menus and billing, not a second copy.</span>
        </div>
        <div className="scroll-x">
          <table className="t">
            <thead>
              <tr>
                <th>Item</th>
                <th>Last updated</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="bold">{r.item}</td>
                  <td className="small">{r.updated}</td>
                  <td>{r.bad ? <span className="tag tag-amber">{r.status}</span> : <span className="small pass">{r.status}</span>}</td>
                  <td>
                    <button type="button" className="btn btn-sm" aria-expanded={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)}>
                      {open === r.key ? "Close" : r.bad ? "Fix" : "Edit"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {open === "hours" && <HoursEditor s={s} />}
        {open === "calendar" && <CalendarEditor s={s} gaps={calendarGaps} />}
        {open === "tuition" && <TuitionEditor s={s} />}
        {open === "menu" && <MenuEditor s={s} monday={weekStart(now.date)} />}
        {open === "menu-next" && <MenuEditor s={s} monday={nextMonday} />}
        {open === "handbook" && <HandbookEditor s={s} />}
        {open === "answers" && <AnswersEditor s={s} />}
      </section>
      <TopicSettings s={s} />
      <Pins s={s} />
    </>
  );
}

function Saved({ show }: { show: boolean }) {
  return show ? <span className="small pass">Saved. The next answer uses it.</span> : null;
}

function HoursEditor({ s }: { s: Sandbox }) {
  const [o, setO] = useState(s.knowledge.hours.open);
  const [c, setC] = useState(s.knowledge.hours.close);
  const [saved, setSaved] = useState(false);
  return (
    <div className="card stack" style={{ background: "var(--bg)" }}>
      <div className="row">
        <label className="field">
          Opens
          <input className="input" type="time" value={o} onChange={(e) => setO(e.target.value)} />
        </label>
        <label className="field">
          Closes
          <input className="input" type="time" value={c} onChange={(e) => setC(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            editKnowledge("hours", (k) => {
              k.hours.open = o;
              k.hours.close = c;
            });
            setSaved(true);
          }}
        >
          Save hours
        </button>
        <Saved show={saved} />
      </div>
    </div>
  );
}

function CalendarEditor({ s, gaps }: { s: Sandbox; gaps: string[] }) {
  const now = demoNow(s);
  const [date, setDate] = useState(gaps[0] ?? "");
  const [name, setName] = useState(gaps.length ? "Thanksgiving break" : "");
  const [status, setStatus] = useState<"closed" | "open" | "shortened">("closed");
  const [saved, setSaved] = useState(false);
  const upcoming = s.knowledge.calendar.entries.filter((e) => e.date >= now.date).slice(0, 12);
  return (
    <div className="card stack" style={{ background: "var(--bg)" }}>
      {gaps.length > 0 && <div className="notice">No decision recorded for {gaps.map((d) => fmtShort(d)).join(", ")}. Days next to a holiday and a weekend aren&apos;t assumed open, so parents asking are sent to a person.</div>}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field">
          Date
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 180 }}>
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Staff training day" />
        </label>
        <label className="field">
          Status
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="closed">Closed</option>
            <option value="open">Open, normal hours</option>
            <option value="shortened">Open, 7:00 AM to 3:00 PM</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!date}
          onClick={() => {
            fixCalendarDate(date, status, name, "07:00", status === "shortened" ? "15:00" : "18:00");
            setSaved(true);
          }}
        >
          Save to calendar
        </button>
      </div>
      <Saved show={saved} />
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {upcoming.map((e) => (
          <li key={e.id}>
            {fmtShort(e.date)}: {e.name} · {e.status === "shortened" ? `open ${fmtTime(e.open!)} to ${fmtTime(e.close!)}` : e.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TuitionEditor({ s }: { s: Sandbox }) {
  const [rows, setRows] = useState(s.knowledge.tuition.rows.map((r) => ({ ...r })));
  const [saved, setSaved] = useState(false);
  return (
    <div className="card stack" style={{ background: "var(--bg)" }}>
      <table className="t">
        <thead>
          <tr>
            <th>Room</th>
            <th>Full time ($/month)</th>
            <th>Part time ($/month)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.room}>
              <td>{r.room}</td>
              <td>
                <input className="input" type="number" aria-label={`${r.room} full time`} value={r.fullTime} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, fullTime: Number(e.target.value) } : y)))} />
              </td>
              <td>
                <input className="input" type="number" aria-label={`${r.room} part time`} value={r.partTime} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, partTime: Number(e.target.value) } : y)))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            editKnowledge("tuition", (k) => {
              k.tuition.rows = rows;
            });
            setSaved(true);
          }}
        >
          Save tuition
        </button>
        <Saved show={saved} />
      </div>
    </div>
  );
}

function MenuEditor({ s, monday }: { s: Sandbox; monday: string }) {
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const [lunches, setLunches] = useState(days.map((d) => s.knowledge.menu.days.find((m) => m.date === d)?.lunch ?? ""));
  const [saved, setSaved] = useState(false);
  return (
    <div className="card stack" style={{ background: "var(--bg)" }}>
      {days.map((d, i) => (
        <label key={d} className="field">
          {fmtShort(d)}
          <input className="input" value={lunches[i]} onChange={(e) => setLunches((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Lunch" />
        </label>
      ))}
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            addMenuWeek(monday, lunches);
            setSaved(true);
          }}
        >
          Save menu
        </button>
        <Saved show={saved} />
      </div>
    </div>
  );
}

function HandbookEditor({ s }: { s: Sandbox }) {
  const secs = s.knowledge.handbook.sections;
  const [id, setId] = useState(secs[0].id);
  const sec = secs.find((x) => x.id === id)!;
  const [text, setText] = useState(sec.text);
  const [saved, setSaved] = useState(false);
  const missing = sec.required.filter((r) => !text.toLowerCase().includes(r.toLowerCase()));
  return (
    <div className="card stack" style={{ background: "var(--bg)" }}>
      <label className="field">
        Section
        <select
          className="select"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setText(secs.find((x) => x.id === e.target.value)!.text);
            setSaved(false);
          }}
        >
          {secs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id} {x.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Text parents see quoted
        <textarea className="textarea" style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <span className="small">
        Conditions the assistant must always keep: {sec.required.map((r) => `"${r}"`).join(", ")}
        {missing.length > 0 && <span className="fail"> · missing from your text: {missing.join(", ")}</span>}
      </span>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            editKnowledge("handbook", (k) => {
              const x = k.handbook.sections.find((y) => y.id === id)!;
              x.text = text;
              x.required = x.required.filter((r) => text.toLowerCase().includes(r.toLowerCase()));
            }, `handbook:${id}`);
            setSaved(true);
          }}
        >
          Save section
        </button>
        <Saved show={saved} />
      </div>
    </div>
  );
}

function AnswersEditor({ s }: { s: Sandbox }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  return (
    <div className="card stack" style={{ background: "var(--bg)" }}>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {s.knowledge.answers.items.map((x) => (
          <li key={x.id}>
            <b>{x.question}</b> {x.answer}
          </li>
        ))}
      </ul>
      <label className="field">
        Question parents ask
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <label className="field">
        Your answer (given word for word)
        <textarea className="textarea" value={a} onChange={(e) => setA(e.target.value)} />
      </label>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!q.trim() || !a.trim()}
        onClick={() => {
          addCenterAnswer(q.trim(), a.trim());
          setQ("");
          setA("");
        }}
      >
        Add answer
      </button>
    </div>
  );
}

const LOCKED = ["Decisions about a child's health", "Pickup authority and custody", "Emergencies and safeguarding", "Billing disputes and exceptions", "Complaints and incidents"];
const SETTINGS: [TopicSetting, string][] = [
  ["ai", "AI answers"],
  ["draft", "AI drafts, staff send"],
  ["person", "Always a person"],
];

function TopicSettings({ s }: { s: Sandbox }) {
  const topics = Object.keys(TOPIC_LABELS) as TopicKey[];
  return (
    <section className="card stack" aria-label="What the assistant may do">
      <div className="stack" style={{ gap: 4 }}>
        <h2 style={{ fontSize: 20 }}>What the assistant may do, by topic</h2>
        <span className="small muted">Safety topics are locked to a person. Everything else is your choice, and takes effect on the next question.</span>
      </div>
      <div className="scroll-x">
        <table className="t">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Setting</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t}>
                <td>{TOPIC_LABELS[t]}</td>
                <td>
                  <div className="seg" role="radiogroup" aria-label={TOPIC_LABELS[t]}>
                    {SETTINGS.map(([v, label]) => (
                      <button key={v} type="button" role="radio" aria-checked={s.knowledge.topics[t] === v} className={s.knowledge.topics[t] === v ? "on" : ""} onClick={() => setTopic(t, v)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {LOCKED.map((t) => (
              <tr key={t}>
                <td>{t}</td>
                <td>
                  <span className="tag tag-blue">Always a person · locked</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Pins({ s }: { s: Sandbox }) {
  const all = Object.keys(ACTION_META).filter((a) => a !== "book_tour") as ActionKind[];
  const toggle = (win: "dropoff" | "pickup", a: ActionKind) => {
    update((st) => {
      const list = st.pins[win];
      st.pins[win] = list.includes(a) ? list.filter((x) => x !== a) : [...list, a];
    });
    track("action_pin_changed", { window: win, action: a });
  };
  const recommended = !s.pins.dropoff.includes("picking_up_early");
  return (
    <section className="card stack" aria-label="Let the center know buttons">
      <div className="stack" style={{ gap: 4 }}>
        <h2 style={{ fontSize: 20 }}>&ldquo;Let the center know&rdquo; buttons</h2>
        <span className="small muted">Parents see the first four pinned buttons for the time of day. Only requests with a form, routing and a reply time can be buttons.</span>
      </div>
      {recommended && (
        <div className="spread" style={{ background: "var(--ai-soft)", borderRadius: 10, padding: 12 }}>
          <span className="small" style={{ flex: "1 1 320px" }}>
            <b>Recommended:</b> parents here typed &ldquo;picking up early&rdquo; 9 times before 10 AM this week, and centers like yours that added it to the drop-off buttons saw fewer typed requests (brightwheel experiment, sample data).
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              update((st) => {
                st.pins.dropoff = ["picking_up_early", ...st.pins.dropoff.filter((x) => x !== "picking_up_early")];
              });
              track("action_pin_changed", { window: "dropoff", action: "picking_up_early", from: "recommendation" });
            }}
          >
            Add it
          </button>
        </div>
      )}
      <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
        {(["dropoff", "pickup"] as const).map((win) => (
          <div key={win} className="stack" style={{ flex: "1 1 280px" }}>
            <b className="small">{win === "dropoff" ? "Drop-off · opening to 12:30 PM" : "Pickup · 12:30 PM to closing"}</b>
            {s.pins[win].length > 4 && <span className="notice">Only the first four show. Unpin one.</span>}
            {all.map((a) => {
              const idx = s.pins[win].indexOf(a);
              return (
                <div key={a} className="spread" style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                  <span className="small">
                    {ACTION_META[a].label}
                    {idx >= 0 && idx < 4 && <span className="xs muted"> · showing</span>}
                  </span>
                  <button type="button" className={`btn btn-sm${idx >= 0 ? " btn-primary" : ""}`} aria-pressed={idx >= 0} onClick={() => toggle(win, a)}>
                    {idx >= 0 ? "Pinned" : "Pin"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <span className="xs muted">Recommendations come from what parents type here and from brightwheel&apos;s experiments across many centers. You decide what to pin.</span>
    </section>
  );
}
