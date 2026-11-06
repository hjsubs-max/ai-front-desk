// The answer pipeline. Code decides; the model routes and, for policy only, words.
//  1. Safety screen (code)            -> must-go-to-a-person net 1
//  2. Route the question (model)       -> intents, described dates, net 2
//  3. Resolve dates, look up records   -> code
//  4. Write fact sentences             -> code templates from records
//  5. Word policy answers              -> model, from one quoted passage, then checked in code
//  6. Apply the operator's topic settings, create requests and handoffs -> code

import { addDays, fmtLong, fmtShort, fmtStamp, fmtTime, isWeekend, toMinutes } from "../dates.ts";
import type {
  AskRequestBody,
  AskResult,
  Block,
  CalendarEntry,
  CenterNow,
  FactAssertion,
  Gap,
  Handoff,
  Knowledge,
  PersonCategory,
  RequestProposal,
  Route,
  SourceRef,
  TopicKey,
} from "../types.ts";
import type { Classification, Part } from "./classification.ts";
import { classifyWithClaude, hasApiKey, MODELS, wordPolicyAnswer } from "./claude.ts";
import { resolveDate } from "./resolveDate.ts";
import { classifyWithRules } from "./rules.ts";
import { commitmentHits, normalize, safetyScreen } from "./safety.ts";

export const ENGINE_VERSION = "v3";

// ---------- helpers ----------

function money(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function childName(k: Knowledge): string {
  return k.family.children[0]?.name ?? "your child";
}

function childRoom(k: Knowledge): string {
  return k.family.children[0]?.room ?? "classroom";
}

export function entryFor(date: string, k: Knowledge): CalendarEntry | undefined {
  return k.calendar.entries.find((e) => e.date === date);
}

export function isClosedDay(date: string, k: Knowledge): boolean {
  if (isWeekend(date)) return true;
  const e = entryFor(date, k);
  return e?.status === "closed";
}

/** What to say about reopening after a closed day: never assert a day the calendar hasn't decided. */
export function reopenSentence(after: string, k: Knowledge): string {
  let d = addDays(after, 1);
  for (let i = 0; i < 30; i++) {
    const st = openStatus(d, k);
    if (st.value === "unknown") {
      const sure = nextOpenDay(d, k);
      return `The calendar doesn't say yet whether we're open on ${fmtLong(d)}; we're open again ${fmtLong(sure)} at ${fmtTime(entryFor(sure, k)?.open ?? k.hours.open)}.`;
    }
    if (st.value === "open" || st.value === "shortened") return `We reopen ${fmtLong(d)} at ${fmtTime(entryFor(d, k)?.open ?? k.hours.open)}.`;
    d = addDays(d, 1);
  }
  return "";
}

export function nextOpenDay(after: string, k: Knowledge): string {
  let d = addDays(after, 1);
  for (let i = 0; i < 30; i++) {
    if (!isClosedDay(d, k) && openStatus(d, k).value !== "unknown") return d;
    d = addDays(d, 1);
  }
  return d;
}

export function isOpenNow(now: CenterNow, k: Knowledge): boolean {
  if (isClosedDay(now.date, k)) return false;
  const e = entryFor(now.date, k);
  const open = toMinutes(e?.open ?? k.hours.open);
  const close = toMinutes(e?.close ?? k.hours.close);
  return now.minutes >= open && now.minutes < close;
}

/** Whether the calendar answers a date. A weekday squeezed between a closure and a weekend
 *  (like the day after Thanksgiving) is not assumed open: centers often close it, so the desk asks. */
export function openStatus(date: string, k: Knowledge): { value: "open" | "closed" | "shortened" | "weekend" | "unknown"; entry?: CalendarEntry } {
  const e = entryFor(date, k);
  if (e) return { value: e.status === "closed" ? "closed" : e.status === "shortened" ? "shortened" : "open", entry: e };
  if (isWeekend(date)) return { value: "weekend" };
  if (date > k.calendar.through) return { value: "unknown" };
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const prevClosed = entryFor(prev, k)?.status === "closed";
  const nextClosed = entryFor(next, k)?.status === "closed";
  if ((prevClosed && isWeekend(next)) || (nextClosed && isWeekend(prev))) return { value: "unknown" };
  return { value: "open" };
}

function src(id: string, k: Knowledge, now: CenterNow): SourceRef {
  if (id === "calendar") return { id, label: "Center calendar · Holidays 2026–27", updated: `updated ${fmtStamp(k.calendar.updatedAt, now)}` };
  if (id === "hours") return { id, label: "Center hours", updated: `updated ${fmtStamp(k.hours.updatedAt, now)}` };
  if (id === "tuition") return { id, label: "Tuition and fees", updated: `updated ${fmtStamp(k.tuition.updatedAt, now)}` };
  if (id === "menu") return { id, label: "Menu", updated: `updated ${fmtStamp(k.menu.updatedAt, now)}` };
  if (id === "tours") return { id, label: "Tour times", updated: `updated ${fmtStamp(k.tours.updatedAt, now)}` };
  if (id.startsWith("handbook:")) {
    const s = k.handbook.sections.find((x) => `handbook:${x.id}` === id);
    return { id, label: `Family Handbook ${s?.id ?? ""} · ${s?.title ?? ""}`, updated: `updated ${fmtStamp(k.handbook.updatedAt, now)}` };
  }
  if (id.startsWith("answer:")) {
    const a = k.answers.items.find((x) => `answer:${x.id}` === id);
    return { id, label: "Center answers", updated: `added ${fmtStamp(a?.createdAt ?? k.answers.updatedAt, now)}` };
  }
  return { id, label: id, updated: "" };
}

function dueFor(cat: PersonCategory | "request", now: CenterNow, k: Knowledge): { label: string; minutes: number | null } {
  const open = isOpenNow(now, k);
  const nextOpen = nextOpenDay(now.date, k);
  const whenOpen = `when the center opens, ${fmtShort(isClosedDay(now.date, k) || now.minutes >= toMinutes(k.hours.close) ? nextOpen : now.date)} at ${fmtTime(k.hours.open)}`;
  switch (cat) {
    case "H1":
    case "H2":
      return { label: "Now", minutes: 0 };
    case "H3":
    case "H4":
    case "request":
      return open ? { label: "Within 15 minutes", minutes: 15 } : { label: `Within 15 minutes ${whenOpen}`, minutes: null };
    case "H6":
      return open ? { label: `Today, by ${fmtTime(k.hours.close)}`, minutes: toMinutes(k.hours.close) - now.minutes } : { label: `The same day, ${whenOpen}`, minutes: null };
    default:
      return { label: "Within 1 business day", minutes: 24 * 60 };
  }
}

const NUM = /\$?\d+(?:[.,:]\d+)?%?/g;

function numbersOk(aiText: string, passage: string): boolean {
  const allowed = new Set((passage.match(NUM) ?? []).map((x) => x.replace(/[$,]/g, "")));
  return (aiText.match(NUM) ?? []).every((x) => allowed.has(x.replace(/[$,]/g, "")));
}

function hasPhrase(text: string, phrase: string): boolean {
  return normalize(text).includes(normalize(phrase));
}

// ---------- part renderers (all code, no model text) ----------

interface Rendered {
  route: Route;
  blocks: Block[];
  facts: FactAssertion[];
  sources: SourceRef[];
  topic?: TopicKey;
  gap?: Gap;
  sectionId?: string;
  request?: RequestProposal;
  handoff?: PersonCategory;
}

function renderOpenOnDate(part: Part, now: CenterNow, k: Knowledge): Rendered {
  const r = resolveDate(part.date, now, k) ?? { date: now.date };
  const d = r.date;
  const st = openStatus(d, k);
  const label = fmtLong(d);
  const ctx = r.context && !st.entry ? ` (${r.context})` : "";
  const sources = [src("calendar", k, now)];
  const fact: FactAssertion = { kind: "open_status", date: d, value: st.value, name: st.entry?.name };
  const isToday = d === now.date;
  if (st.value === "closed") {
    return {
      route: "fact",
      topic: "hours",
      blocks: [
        { type: "text", text: `We're closed on ${label} for ${st.entry!.name}.`, strong: "No." },
        { type: "text", text: reopenSentence(d, k) },
      ],
      facts: [fact],
      sources,
    };
  }
  if (st.value === "weekend") {
    return {
      route: "fact",
      topic: "hours",
      blocks: [{ type: "text", text: `We're open Monday to Friday, so we're closed on ${label}.`, strong: "No." }],
      facts: [fact],
      sources: [src("hours", k, now)],
    };
  }
  if (st.value === "shortened") {
    const e = st.entry!;
    return {
      route: "fact",
      topic: "hours",
      blocks: [{ type: "text", text: `On ${label} (${e.name}) we're open ${fmtTime(e.open!)} to ${fmtTime(e.close!)}.`, strong: "Yes, with shorter hours." }],
      facts: [fact],
      sources,
    };
  }
  if (st.value === "unknown") {
    return {
      route: "unknown",
      topic: "hours",
      blocks: [{ type: "text", text: `Sunnyside's calendar doesn't say yet whether we're open on ${label}${ctx}. I can send your question to staff, and they'll add it to the calendar.` }],
      facts: [fact],
      sources,
      gap: { key: `calendar:${d}`, label: `${label}${ctx}`, kind: "calendar", date: d },
    };
  }
  const e = st.entry;
  return {
    route: "fact",
    topic: "hours",
    blocks: [
      {
        type: "text",
        text: isToday
          ? `We're open today, ${label}, from ${fmtTime(e?.open ?? k.hours.open)} to ${fmtTime(e?.close ?? k.hours.close)}.`
          : `We're open on ${label}${ctx}, from ${fmtTime(e?.open ?? k.hours.open)} to ${fmtTime(e?.close ?? k.hours.close)}.`,
        strong: "Yes.",
      },
    ],
    facts: [fact],
    sources,
  };
}

function renderHours(part: Part, now: CenterNow, k: Knowledge): Rendered {
  if (part.date && part.date.kind !== "none") return renderOpenOnDate(part, now, k);
  return {
    route: "fact",
    topic: "hours",
    blocks: [
      { type: "text", text: `We're open Monday to Friday, ${fmtTime(k.hours.open)} to ${fmtTime(k.hours.close)}.` },
      { type: "text", text: `Pickup is by ${fmtTime(k.hours.close)}; a late fee applies after ${fmtTime(k.hours.lateFeeAfter)}.` },
    ],
    facts: [{ kind: "hours", open: k.hours.open, close: k.hours.close }],
    sources: [src("hours", k, now)],
  };
}

function groupClosures(entries: CalendarEntry[]): { name: string; from: string; to: string }[] {
  const out: { name: string; from: string; to: string }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.name === e.name && addDays(last.to, 1) === e.date) last.to = e.date;
    else if (last && last.name === e.name && isWeekend(addDays(last.to, 1)) && addDays(last.to, 3) === e.date) last.to = e.date;
    else out.push({ name: e.name, from: e.date, to: e.date });
  }
  return out;
}

function renderClosures(part: Part, now: CenterNow, k: Knowledge): Rendered {
  const upcoming = k.calendar.entries.filter((e) => e.date >= now.date && e.status !== "open").sort((a, b) => a.date.localeCompare(b.date));
  const q = part.query ? normalize(part.query).replace(/\bbreak\b/, "break") : "";
  let chosen = q ? upcoming.filter((e) => normalize(e.name).includes(q) || q.includes(normalize(e.name))) : [];
  const matched = chosen.length > 0;
  if (!matched) chosen = upcoming.slice(0, 8);
  const groups = groupClosures(chosen);
  const items = groups.map((g) => {
    const e = chosen.find((x) => x.date === g.from)!;
    const when = g.from === g.to ? fmtLong(g.from) : `${fmtLong(g.from)} to ${fmtLong(g.to)}`;
    return e.status === "shortened" ? `${when}: ${g.name}, open ${fmtTime(e.open!)} to ${fmtTime(e.close!)}` : `${when}: ${g.name}, closed`;
  });
  const lead = matched ? `Here are the dates from Sunnyside's calendar:` : q ? `I didn't find "${part.query}" in the calendar. Here are the next closures:` : `Upcoming closures:`;
  return {
    route: "fact",
    topic: "hours",
    blocks: [{ type: "text", text: lead }, { type: "list", items }],
    facts: [{ kind: "closures", dates: chosen.map((e) => e.date) }],
    sources: [src("calendar", k, now)],
  };
}

function renderTuition(part: Part, now: CenterNow, k: Knowledge): Rendered {
  const rows = part.room ? k.tuition.rows.filter((r) => r.room === part.room) : k.tuition.rows;
  const items = rows.map((r) => `${r.room} (${r.ages}): ${money(r.fullTime)} a month full time (5 days), or ${money(r.partTime)} a month part time (Mon, Wed, Fri)`);
  const blocks: Block[] = rows.length === 1 ? [{ type: "text", text: items[0] + "." }] : [{ type: "text", text: "Monthly tuition by room:" }, { type: "list", items }];
  blocks.push({ type: "text", text: `There's a one-time ${money(k.tuition.registrationFee)} registration fee, and siblings get ${k.tuition.siblingDiscountPct}% off.` });
  return {
    route: "fact",
    topic: "tuition",
    blocks,
    facts: rows.map((r) => ({ kind: "tuition" as const, room: r.room, fullTime: r.fullTime, partTime: r.partTime })),
    sources: [src("tuition", k, now)],
  };
}

function renderMenu(part: Part, now: CenterNow, k: Knowledge): Rendered {
  const r = resolveDate(part.date && part.date.kind !== "none" ? part.date : { kind: "today" }, now, k)!;
  const d = r.date;
  const label = d === now.date ? "today" : `on ${fmtLong(d)}`;
  const st = openStatus(d, k);
  if (st.value === "closed" || st.value === "weekend") {
    return {
      route: "fact",
      topic: "meals",
      blocks: [{ type: "text", text: st.entry ? `We're closed on ${fmtLong(d)} for ${st.entry.name}, so there's no lunch that day.` : `We're closed on ${fmtLong(d)}, so there's no lunch that day.` }],
      facts: [{ kind: "menu", date: d, lunch: null }, { kind: "open_status", date: d, value: st.value, name: st.entry?.name }],
      sources: [src("calendar", k, now)],
    };
  }
  const day = k.menu.days.find((m) => m.date === d);
  if (!day) {
    return {
      route: "unknown",
      topic: "meals",
      blocks: [{ type: "text", text: `The menu for ${fmtLong(d)} isn't posted yet. I can ask staff for you.` }],
      facts: [{ kind: "menu", date: d, lunch: null }],
      sources: [src("menu", k, now)],
      gap: { key: `menu:${d}`, label: `Menu for ${fmtLong(d)}`, kind: "menu", date: d },
    };
  }
  return {
    route: "fact",
    topic: "meals",
    blocks: [
      { type: "text", text: d === now.date ? `Today's lunch is ${day.lunch.toLowerCase()}.` : `Lunch ${label} is ${day.lunch.toLowerCase()}.` },
      { type: "text", text: k.menu.snack },
    ],
    facts: [{ kind: "menu", date: d, lunch: day.lunch }],
    sources: [src("menu", k, now)],
  };
}

function renderTours(now: CenterNow, k: Knowledge): Rendered {
  const slots = k.tours.slots.filter((s) => s.date > now.date).slice(0, 6);
  return {
    route: "fact",
    topic: "tours",
    blocks: [
      { type: "text", text: "Tours take about 30 minutes and are led by the director. Pick a time to book one:" },
      { type: "slots", slots },
    ],
    facts: [{ kind: "tour_slots", count: slots.length }],
    sources: [src("tours", k, now)],
  };
}

function renderCenterAnswer(part: Part, now: CenterNow, k: Knowledge): Rendered {
  const a = k.answers.items.find((x) => x.id === part.answer_id) ?? k.answers.items.find((x) => part.answer_id && (x.id.includes(part.answer_id) || part.answer_id.includes(x.id)));
  if (!a) return renderUnknown(now, k, "");
  return { route: "fact", topic: a.topic, blocks: [{ type: "text", text: a.answer }], facts: [], sources: [src(`answer:${a.id}`, k, now)] };
}

function renderUnknown(now: CenterNow, k: Knowledge, question: string): Rendered {
  return {
    route: "unknown",
    topic: "general",
    blocks: [{ type: "text", text: "I don't have that in Sunnyside's information. I can send your question to staff." }],
    facts: [],
    sources: [],
    gap: question ? { key: `general:${normalize(question).slice(0, 80)}`, label: question.trim().slice(0, 120), kind: "general" } : undefined,
  };
}

function renderAction(part: Part, now: CenterNow, k: Knowledge): Rendered {
  const child = childName(k);
  const detail = part.detail?.trim() ?? "";
  switch (part.action) {
    case "forgot_lunch": {
      const today = k.menu.days.find((m) => m.date === now.date);
      const meals = k.handbook.sections.find((s) => s.id === "5.1");
      const blocks: Block[] = [];
      const facts: FactAssertion[] = [{ kind: "menu", date: now.date, lunch: today?.lunch ?? null }];
      if (today) blocks.push({ type: "text", text: `Today's lunch is ${today.lunch.toLowerCase()}.` });
      blocks.push({ type: "text", text: `When a lunch is forgotten, the kitchen can provide one for $6, added to your next invoice. I've asked staff to confirm for ${child}.` });
      return {
        route: "request",
        topic: "meals",
        blocks,
        facts,
        sources: [src("menu", k, now), ...(meals ? [src("handbook:5.1", k, now)] : [])],
        request: { kind: "forgot_lunch", autoCreate: true, details: "Provide lunch today ($6, added to next invoice)" },
      };
    }
    case "late_for_pickup":
      return {
        route: "request",
        topic: "pickup",
        blocks: [
          { type: "text", text: `I've sent this to staff so the ${childRoom(k)} room knows you're on the way.` },
          { type: "text", text: `Pickups after ${fmtTime(k.hours.lateFeeAfter)} are charged $1 per minute, added to your next invoice.` },
        ],
        facts: [],
        sources: [src("handbook:3.6", k, now)],
        request: { kind: "late_for_pickup", autoCreate: true, details: detail || "Running late for pickup" },
      };
    case "book_tour":
      return renderTours(now, k);
    case "running_late":
    case "absent_today":
    case "absent_tomorrow":
    case "picking_up_early": {
      const what =
        part.action === "running_late"
          ? `${child} is running late`
          : part.action === "absent_today"
            ? `${child} will be absent today`
            : part.action === "absent_tomorrow"
              ? `${child} will be absent tomorrow`
              : `you're picking ${child} up early`;
      return {
        route: "request",
        topic: "absence",
        blocks: [{ type: "text", text: `I've sent this to staff: ${what}. You'll see when they've seen it.` }],
        facts: [],
        sources: [],
        request: { kind: part.action, autoCreate: true, details: detail },
      };
    }
    default:
      return renderUnknown(now, k, "");
  }
}

// ---------- the pipeline ----------

function personResult(cat: PersonCategory, question: string, summary: string, now: CenterNow, k: Knowledge, reason: string): Pick<AskResult, "route" | "blocks" | "sources" | "handoff"> {
  const child = childName(k);
  const due = dueFor(cat, now, k);
  const director = `${k.center.director}, Director`;
  const handoff = (mode: Handoff["mode"], to = director): Handoff => ({ category: cat, mode, to, dueLabel: due.label, dueMinutes: due.minutes, reason, summary });
  const t = normalize(question);
  switch (cat) {
    case "H1":
      return {
        route: "emergency",
        blocks: [
          { type: "text", text: "If this is an emergency, call 911 now.", strong: "Call 911." },
          { type: "text", text: `Then call the center at ${k.center.phone}. I've alerted staff.` },
        ],
        sources: [],
        handoff: handoff("urgent", "All staff on site"),
      };
    case "H2":
      return {
        route: "person",
        blocks: [
          { type: "text", text: `I've sent this to ${k.center.director}, the director, right now. If a child is in danger, call 911.` },
        ],
        sources: [],
        handoff: handoff("urgent"),
      };
    case "H3": {
      const sid = /\b(medication|medicine|meds|inhaler|tylenol|motrin|advil|ibuprofen|antibiotic)/.test(t) ? "4.4" : /\ballerg/.test(t) ? "4.3" : "4.2";
      const s = k.handbook.sections.find((x) => x.id === sid)!;
      return {
        route: "person",
        blocks: [
          { type: "text", text: `Here's the center's ${s.title.toLowerCase()} policy, word for word:` },
          { type: "quote", text: s.text, sourceId: `handbook:${s.id}` },
        ],
        sources: [src(`handbook:${s.id}`, k, now)],
        handoff: handoff("offer"),
      };
    }
    case "H4":
      return {
        route: "person",
        blocks: [
          { type: "text", text: "This needs the director's approval, so I've sent it to her.", strong: "Sent to a person." },
          { type: "text", text: "Changes to who can pick up a child are approved by the director. I can't approve them." },
          { type: "text", text: "At pickup, staff always check photo ID (Handbook 3.4)." },
        ],
        sources: [src("handbook:3.4", k, now)],
        handoff: handoff("sent"),
      };
    case "H5":
      return {
        route: "person",
        blocks: [{ type: "text", text: `Questions about a specific charge are handled by ${k.center.director}, the director, so I've sent this to her. I can't change charges or fees.` }],
        sources: [src("handbook:6.1", k, now)],
        handoff: handoff("sent"),
      };
    case "H6":
      return {
        route: "person",
        blocks: [{ type: "text", text: `I've sent this to ${k.center.director}, the director, who handles concerns personally.` }],
        sources: [],
        handoff: handoff("sent"),
      };
    default:
      return {
        route: "person",
        blocks: [{ type: "text", text: "I've sent this to staff." }],
        sources: [],
        handoff: handoff("sent", "Front desk staff"),
      };
  }
}

const RELATED: Record<string, string[]> = {
  open_on_date: ["Other closures this year", "Day after Thanksgiving?"],
  closures_list: ["Are you open on Christmas Eve?", "Holiday tuition?"],
  hours: ["Late pickup fee?", "Are you open on Veterans Day?"],
  tuition: ["Sibling discount?", "Book a tour"],
  menu: ["Tomorrow's lunch?", "Is the kitchen nut-free?"],
  tour_info: ["Infant tuition?", "Waitlist?"],
  policy: ["Who can pick up my child?", "Late pickup fee?"],
};

export async function answerQuestion(body: AskRequestBody): Promise<AskResult> {
  const t0 = Date.now();
  const k = body.knowledge;
  const now = body.now;
  const question = body.question.trim().slice(0, 600);
  const usage = { input: 0, output: 0 };
  const aiText: string[] = [];
  const failures: string[] = [];
  let fallback: string | undefined;

  const wanted = body.model ?? (process.env.CLAUDE_MODEL?.includes("sonnet") ? "sonnet" : "haiku");
  const useModel = wanted !== "rules" && hasApiKey();
  if (wanted !== "rules" && !useModel) fallback = "No API key configured; rule-based routing used";
  const modelId = wanted === "sonnet" ? MODELS.sonnet : wanted === "haiku" ? (process.env.CLAUDE_MODEL ?? MODELS.haiku) : "rules";

  // 1. Safety screen in code.
  const safety = safetyScreen(question);

  // 2. Route.
  let cls: Classification;
  let classifier = "rules";
  if (useModel) {
    try {
      const r = await classifyWithClaude(question, k, now, modelId);
      cls = r.cls;
      usage.input += r.usage.input;
      usage.output += r.usage.output;
      classifier = modelId;
    } catch (e) {
      fallback = `Model unavailable (${(e as Error).message.slice(0, 240)}); rule-based routing used`;
      cls = classifyWithRules(question, k);
    }
  } else {
    cls = classifyWithRules(question, k);
  }

  // Either net, or an action that is itself a person topic, sends the whole question to a person.
  let cat: PersonCategory | null = safety.category;
  let reason = safety.reason;
  if (!cat && cls.needs_person && cls.person_category !== "none") {
    cat = cls.person_category;
    reason = cls.person_reason || "Flagged by the assistant";
  }
  if (!cat && cls.parts.some((p) => p.intent === "action" && p.action === "child_unwell")) {
    cat = "H3";
    reason = "Child is unwell";
  }
  if (!cat && cls.parts.some((p) => p.intent === "action" && p.action === "someone_else_pickup")) {
    cat = "H4";
    reason = "Someone else picking up";
  }
  const intents = cls.parts.map((p) => (p.intent === "action" ? `action:${p.action}` : p.intent === "policy" ? `policy:${p.section_id}` : p.intent));

  if (cat) {
    const pr = personResult(cat, question, cls.staff_summary || question, now, k, reason);
    return finish({ ...pr, facts: [], intents, topic: undefined, related: [] });
  }

  // 3-5. Render each part.
  let partsToRender = cls.parts;
  if (partsToRender.some((p) => p.action === "forgot_lunch")) partsToRender = partsToRender.filter((p) => p.intent !== "menu");
  const rendered: Rendered[] = [];
  for (const p of partsToRender) {
    switch (p.intent) {
      case "open_on_date":
        rendered.push(renderOpenOnDate(p, now, k));
        break;
      case "hours":
        rendered.push(renderHours(p, now, k));
        break;
      case "closures_list":
        rendered.push(renderClosures(p, now, k));
        break;
      case "tuition":
        rendered.push(renderTuition(p, now, k));
        break;
      case "menu":
        rendered.push(renderMenu(p, now, k));
        break;
      case "tour_info":
        rendered.push(renderTours(now, k));
        break;
      case "center_answer":
        rendered.push(renderCenterAnswer(p, now, k));
        break;
      case "action":
        rendered.push(renderAction(p, now, k));
        break;
      case "policy": {
        const sid = String(p.section_id ?? "").match(/\d+\.\d+/)?.[0];
        const s = k.handbook.sections.find((x) => x.id === sid);
        if (!s) {
          rendered.push(renderUnknown(now, k, question));
          break;
        }
        const blocks: Block[] = [];
        let worded = false;
        let noAnswer = false;
        if (useModel && classifier !== "rules") {
          try {
            // Word once; if the only problem is a dropped condition, retry once with the missing phrases named.
            let w = await wordPolicyAnswer(question, s, k, modelId);
            usage.input += w.usage.input;
            usage.output += w.usage.output;
            const missing0 = s.required.filter((r) => !hasPhrase(w.text, r));
            if (w.text && w.text.trim() !== "NO_ANSWER" && missing0.length) {
              w = await wordPolicyAnswer(question, s, k, modelId, missing0);
              usage.input += w.usage.input;
              usage.output += w.usage.output;
            }
            if (w.text.trim() === "NO_ANSWER") {
              noAnswer = true;
            } else {
              aiText.push(w.text);
              const problems: string[] = [];
              const missing = s.required.filter((r) => !hasPhrase(w.text, r));
              if (!w.text) problems.push(`empty policy wording (model returned: ${w.blockTypes.join(", ") || "nothing"})`);
              else if (missing.length) problems.push(`policy wording dropped required condition: ${missing.join(", ")}`);
              if (commitmentHits(w.text).length) problems.push("policy wording used commitment language");
              if (!numbersOk(w.text, s.text)) problems.push("policy wording added a number not in the handbook");
              if (problems.length) {
                failures.push(...problems);
              } else {
                blocks.push({ type: "text", text: w.text });
                worded = true;
              }
            }
          } catch (e) {
            fallback = fallback ?? `Policy wording unavailable (${(e as Error).message.slice(0, 60)}); handbook text shown`;
          }
        }
        if (noAnswer) {
          // The model says the routed section doesn't answer the question: treat it as a gap, not a quote.
          rendered.push(renderUnknown(now, k, question));
          break;
        }
        if (!worded) blocks.push({ type: "text", text: `Here's what the handbook says (Handbook ${s.id}, ${s.title}):` });
        blocks.push({ type: "quote", text: s.text, sourceId: `handbook:${s.id}` });
        rendered.push({ route: "policy", topic: s.topic, blocks, facts: [], sources: [src(`handbook:${s.id}`, k, now)], sectionId: s.id });
        break;
      }
      case "family_record":
        rendered.push({
          route: "unknown",
          topic: "general",
          blocks: [{ type: "text", text: "I can't see your family's account or your child's day here yet. Staff can help with that." }],
          facts: [],
          sources: [],
        });
        break;
      case "greeting":
        rendered.push({
          route: "out_of_scope",
          blocks: [{ type: "text", text: `Hi! Ask me about ${k.center.name}'s hours, closures, meals, tuition or policies, or use the buttons to let the center know something.` }],
          facts: [],
          sources: [],
        });
        break;
      case "out_of_scope":
        rendered.push({
          route: "out_of_scope",
          blocks: [{ type: "text", text: `I can only help with ${k.center.name}: hours, closures, meals, tuition, policies, tours, or letting the center know something.` }],
          facts: [],
          sources: [],
        });
        break;
      default:
        rendered.push(renderUnknown(now, k, question));
    }
  }

  // 6. Operator topic settings: "AI drafts, staff send" and "Always a person".
  const topics = rendered.map((r) => r.topic).filter(Boolean) as TopicKey[];
  const personTopic = topics.find((tp) => k.topics[tp] === "person");
  if (personTopic) {
    const pr = personResult("H7", question, cls.staff_summary || question, now, k, `Center answers ${personTopic} questions personally`);
    return finish({
      ...pr,
      blocks: [{ type: "text", text: "Sunnyside's staff answer this kind of question personally, so I've sent it to them." }],
      facts: [],
      intents,
      topic: personTopic,
      related: [],
    });
  }
  const draftTopic = topics.find((tp) => k.topics[tp] === "draft");
  if (draftTopic && rendered.every((r) => r.route !== "request")) {
    const draftText = rendered
      .flatMap((r) => r.blocks)
      .map((b) => (b.type === "text" ? b.text : b.type === "quote" ? `"${b.text}"` : b.type === "list" ? b.items.join("; ") : ""))
      .filter(Boolean)
      .join(" ");
    const due = dueFor("H6", now, k);
    return finish({
      route: "draft",
      blocks: [{ type: "text", text: `Staff check answers about ${draftTopic === "billing" ? "billing" : "this topic"} before they're sent, so a staff member will review this and reply.` }],
      sources: rendered.flatMap((r) => r.sources),
      facts: rendered.flatMap((r) => r.facts),
      intents,
      topic: draftTopic,
      draftText,
      handoff: { category: "H7", mode: "sent", to: "Front desk staff", dueLabel: due.label, dueMinutes: due.minutes, reason: "AI drafts, staff send", summary: cls.staff_summary || question },
      related: [],
    });
  }

  const routes = rendered.map((r) => r.route);
  const route: Route = routes.includes("request")
    ? "request"
    : routes.every((r) => r === "out_of_scope")
      ? "out_of_scope"
      : routes.every((r) => r === "unknown")
        ? "unknown"
        : routes.includes("policy")
          ? "policy"
          : routes.includes("fact")
            ? "fact"
            : routes[0];

  const blocks = rendered.flatMap((r) => r.blocks);
  const sources = rendered.flatMap((r) => r.sources).filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i);
  const gap = rendered.find((r) => r.gap)?.gap ?? (route === "unknown" && rendered.every((r) => !r.gap) && rendered.some((r) => r.topic === "general") ? { key: `general:${normalize(question).slice(0, 80)}`, label: question.slice(0, 120), kind: "general" as const } : undefined);
  if ((route === "fact" || route === "policy") && !sources.length) failures.push("answer has no source");
  const firstIntent = cls.parts[0]?.intent ?? "unknown";
  return finish({
    route,
    blocks,
    sources,
    facts: rendered.flatMap((r) => r.facts),
    topic: rendered[0]?.topic,
    intents,
    gap,
    request: rendered.find((r) => r.request)?.request,
    related: (RELATED[firstIntent] ?? []).slice(0, 2),
    handoff:
      route === "unknown"
        ? { category: "H7", mode: "offer", to: "Front desk staff", dueLabel: dueFor("H7", now, k).label, dueMinutes: 24 * 60, reason: "No source covers this", summary: cls.staff_summary || question }
        : undefined,
  });

  function finish(r: Omit<AskResult, "classifier" | "fallback" | "aiText" | "checks" | "latencyMs" | "usage">): AskResult {
    return {
      ...r,
      classifier,
      fallback,
      aiText,
      checks: { passed: failures.length === 0, failures },
      latencyMs: Date.now() - t0,
      usage,
    };
  }
}

