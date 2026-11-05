"use client";

import { fmtShort, fmtTime } from "../dates.ts";
import { safetyScreen } from "../engine/safety.ts";
import type { ActionKind, AskResult, PersonCategory, TourSlot } from "../types.ts";
import { demoNow, getSandbox, stampOf, uid, update, type InboxItem, type Sandbox, type ThreadEntry } from "./store.ts";
import { track } from "./track.ts";

export const ACTION_META: Record<ActionKind, { label: string; tag: string; needs: "acknowledge" | "confirm" | "person" | "none" }> = {
  running_late: { label: "Running late", tag: "Running late · acknowledge", needs: "acknowledge" },
  absent_today: { label: "Absent today", tag: "Absence · acknowledge", needs: "acknowledge" },
  forgot_lunch: { label: "Forgot lunch", tag: "Request · needs confirming", needs: "confirm" },
  child_unwell: { label: "My child is unwell", tag: "Health decision · always a person", needs: "person" },
  someone_else_pickup: { label: "Someone else picking up", tag: "Pickup change · always a person", needs: "person" },
  picking_up_early: { label: "Picking up early", tag: "Early pickup · acknowledge", needs: "acknowledge" },
  late_for_pickup: { label: "Late for pickup", tag: "Late pickup · acknowledge", needs: "acknowledge" },
  absent_tomorrow: { label: "Absent tomorrow", tag: "Absence · acknowledge", needs: "acknowledge" },
  book_tour: { label: "Book a tour", tag: "Tour booked · no action needed", needs: "none" },
};

export const CATEGORY_TAG: Record<PersonCategory, string> = {
  H1: "Emergency · call now",
  H2: "Safeguarding · director now",
  H3: "Health decision · always a person",
  H4: "Pickup change · always a person",
  H5: "Billing question · always a person",
  H6: "Concern · director",
  H7: "Question · staff to answer",
};

function family(s: Sandbox) {
  const c = s.knowledge.family.children[0];
  return { family: `${s.knowledge.family.parent.split(" ").slice(-1)[0]} family`, child: c.name, room: c.room };
}

function ackDue(s: Sandbox): { dueMinutes: number | null; dueLabel: string } {
  const now = demoNow(s);
  const open = now.minutes >= 7 * 60 && now.minutes < 18 * 60;
  return open ? { dueMinutes: 15, dueLabel: "Within 15 minutes" } : { dueMinutes: null, dueLabel: "When the center opens" };
}

export async function ask(question: string, channel: "text" | "voice" | "suggestion"): Promise<ThreadEntry> {
  const s = getSandbox();
  const now = demoNow(s);
  track("question_submitted", { channel });
  const id = uid();
  const t0 = Date.now();
  // Show the question right away; the answer fills in when it arrives.
  update((st) => {
    st.thread.push({ id, stamp: stampOf(now), kind: "qa", question, channel });
  });
  let result: AskResult;
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, now, knowledge: s.knowledge, channel }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    result = (await res.json()) as AskResult;
  } catch (e) {
    result = {
      route: "unknown",
      blocks: [{ type: "text", text: `I couldn't reach the assistant just now (${(e as Error).message}). You can send your question to staff.` }],
      sources: [],
      facts: [],
      intents: [],
      classifier: "none",
      aiText: [],
      checks: { passed: true, failures: [] },
      latencyMs: Date.now() - t0,
      usage: { input: 0, output: 0 },
      related: [],
      handoff: { category: "H7", mode: "offer", to: "Front desk staff", dueLabel: "Within 1 business day", dueMinutes: 24 * 60, reason: "Assistant unavailable", summary: question },
    };
  }
  track("answer_shown", { route: result.route, latencyMs: Date.now() - t0, model: result.classifier, sources: result.sources.length });

  let entry: ThreadEntry = { id, stamp: stampOf(now), kind: "qa", question, channel, result };
  update((st) => {
    const existing = st.thread.find((x) => x.id === id);
    if (existing) {
      existing.result = result;
      entry = existing;
    } else {
      st.thread.push(entry);
    }
    const fam = family(st);
    // Same-topic re-ask: a crude but useful signal that the first answer didn't land.
    const lastQa = [...st.thread].reverse().find((x) => x.kind === "qa" && x.id !== id && x.result);
    if (lastQa?.result?.intents[0] && lastQa.result.intents[0] === result.intents[0] && stampOf(now) - lastQa.stamp < 10) {
      st.events.push({ name: "same_topic_reasked", ts: Date.now(), view: "parent" });
    }
    const h = result.handoff;
    if (h && (h.mode === "sent" || h.mode === "urgent")) {
      const item: InboxItem = {
        id: uid(),
        kind: result.route === "draft" ? "draft" : "handoff",
        ...fam,
        title: result.route === "draft" ? "AI draft · review and send" : CATEGORY_TAG[h.category],
        text: question,
        summary: h.summary,
        category: h.category,
        status: "open",
        createdStamp: stampOf(now),
        dueMinutes: h.dueMinutes,
        dueLabel: h.dueLabel,
        history: [{ stamp: stampOf(now), text: "Sent by the assistant" }],
        draftText: result.draftText,
        threadId: id,
      };
      st.inbox.unshift(item);
      entry.inboxId = item.id;
    }
    if (result.request?.autoCreate) {
      const kind = result.request.kind;
      const meta = ACTION_META[kind];
      const item: InboxItem = {
        id: uid(),
        kind: "request",
        ...fam,
        title: meta.tag,
        text: result.request.details || question,
        requestKind: kind,
        status: "open",
        createdStamp: stampOf(now),
        ...ackDue(st),
        history: [{ stamp: stampOf(now), text: "Sent by the assistant from a typed request" }],
        threadId: id,
      };
      st.inbox.unshift(item);
      entry.inboxId = item.id;
    }
  });
  if (result.request?.autoCreate) track("request_created", { kind: result.request.kind, from: "typed" });
  if (result.handoff && result.handoff.mode !== "offer") track("handoff_created", { category: result.handoff.category });
  return entry;
}

/** "Send to staff" on an answer that offered a handoff (health question, or nothing on file). */
export function sendOfferedHandoff(threadId: string, note?: string) {
  update((st) => {
    const e = st.thread.find((x) => x.id === threadId);
    if (!e?.result?.handoff || e.inboxId) return;
    const h = e.result.handoff;
    const now = demoNow(st);
    const item: InboxItem = {
      id: uid(),
      kind: "handoff",
      ...family(st),
      title: CATEGORY_TAG[h.category],
      text: note ? `${e.question}\n\nAdded: ${note}` : e.question,
      summary: h.summary,
      category: h.category,
      status: "open",
      createdStamp: stampOf(now),
      dueMinutes: h.dueMinutes,
      dueLabel: h.dueLabel,
      history: [{ stamp: stampOf(now), text: "Sent by the parent from the assistant's answer" }],
      threadId,
    };
    st.inbox.unshift(item);
    e.inboxId = item.id;
  });
  track("handoff_created", { category: "offer" });
}

export function createAction(kind: ActionKind, text: string, extra?: { category?: PersonCategory; summary?: string }) {
  let id = "";
  update((st) => {
    const now = demoNow(st);
    const meta = ACTION_META[kind];
    const isPerson = meta.needs === "person";
    const due = isPerson ? (st.clock && now.minutes >= 7 * 60 && now.minutes < 18 * 60 ? { dueMinutes: 15, dueLabel: "Within 15 minutes" } : { dueMinutes: null, dueLabel: "When the center opens" }) : ackDue(st);
    const item: InboxItem = {
      id: uid(),
      kind: isPerson ? "handoff" : "request",
      ...family(st),
      title: meta.tag,
      text,
      summary: extra?.summary,
      category: extra?.category ?? (kind === "child_unwell" ? "H3" : kind === "someone_else_pickup" ? "H4" : undefined),
      requestKind: kind,
      status: kind === "book_tour" ? "booked" : "open",
      createdStamp: stampOf(now),
      ...due,
      history: [{ stamp: stampOf(now), text: `Sent from ${meta.label}` }],
    };
    id = uid();
    item.threadId = id;
    st.inbox.unshift(item);
    st.thread.push({ id, stamp: stampOf(now), kind: "action", question: `${meta.label}: ${text}`, inboxId: item.id });
  });
  track("request_created", { kind, from: "button" });
  return id;
}

export function bookTour(slot: TourSlot) {
  return createAction("book_tour", `Tour on ${fmtShort(slot.date)} at ${fmtTime(slot.time)} (for a sibling)`);
}

export function sendDirectMessage(text: string, about: string): { category: PersonCategory | null; threadId: string } {
  const safety = safetyScreen(text);
  let threadId = "";
  update((st) => {
    const now = demoNow(st);
    const open = now.minutes >= 7 * 60 && now.minutes < 18 * 60;
    const urgent = safety.category === "H1" || safety.category === "H2";
    const fast = safety.category === "H3" || safety.category === "H4";
    const item: InboxItem = {
      id: uid(),
      kind: "message",
      ...family(st),
      title: safety.category ? `${CATEGORY_TAG[safety.category]} · from Talk to a person` : "Message · from Talk to a person",
      text: about ? `About ${about}: ${text}` : text,
      category: safety.category ?? undefined,
      status: "open",
      createdStamp: stampOf(now),
      dueMinutes: urgent ? 0 : fast ? 15 : open ? Math.max(30, 18 * 60 - now.minutes) : null,
      dueLabel: urgent ? "Now" : fast ? "Within 15 minutes" : open ? "Today, by 6:00 PM" : "The next open day",
      history: [{ stamp: stampOf(now), text: "Sent straight to staff; no AI answer" }],
    };
    threadId = uid();
    item.threadId = threadId;
    st.inbox.unshift(item);
    st.thread.push({ id: threadId, stamp: stampOf(now), kind: "message", question: text, inboxId: item.id });
  });
  track("direct_message_sent", { flagged: Boolean(safety.category) });
  return { category: safety.category, threadId };
}

export function cancelRequest(inboxId: string) {
  update((st) => {
    const it = st.inbox.find((x) => x.id === inboxId);
    if (!it) return;
    it.status = "cancelled";
    it.history.push({ stamp: stampOf(demoNow(st)), text: "Cancelled by the parent" });
  });
  track("request_cancelled");
}

export function giveFeedback(threadId: string, value: "yes" | "no", reason?: string) {
  update((st) => {
    const e = st.thread.find((x) => x.id === threadId);
    if (e) e.feedback = { value, reason };
  });
  track("feedback_given", { value, reason: reason ?? "" });
}

// ---------- operator actions ----------

export function operatorAct(inboxId: string, action: "acknowledge" | "confirm" | "decline" | "reply" | "approve" | "send" | "could_have_answered", text?: string) {
  let responseMin = 0;
  update((st) => {
    const it = st.inbox.find((x) => x.id === inboxId);
    if (!it) return;
    const now = demoNow(st);
    const stamp = stampOf(now);
    responseMin = stamp - it.createdStamp;
    const who = st.knowledge.center.director;
    switch (action) {
      case "acknowledge":
        it.status = "acknowledged";
        it.history.push({ stamp, text: `Seen by ${who}` });
        break;
      case "confirm":
        it.status = "confirmed";
        it.history.push({ stamp, text: `Confirmed by ${who}` });
        break;
      case "decline":
        it.status = "declined";
        it.reply = text;
        it.history.push({ stamp, text: `Declined by ${who}${text ? `: ${text}` : ""}` });
        break;
      case "approve":
        it.status = "replied";
        it.reply = text ?? `Approved. The ${it.room} teacher and the front desk have been told; photo ID will be checked at pickup.`;
        it.history.push({ stamp, text: `Approved by ${who}` });
        break;
      case "send":
        it.status = "sent";
        it.reply = text ?? it.draftText;
        it.history.push({ stamp, text: `Answer checked and sent by ${who}` });
        break;
      case "reply":
        it.status = "replied";
        it.reply = text;
        it.history.push({ stamp, text: `Reply from ${who}` });
        break;
      case "could_have_answered":
        it.couldHaveAnswered = true;
        break;
    }
  });
  if (action === "could_have_answered") track("could_have_answered_marked");
  else if (action === "confirm" || action === "acknowledge") track("request_confirmed", { action, responseMin });
  else track("handoff_resolved", { action, responseMin });
}
