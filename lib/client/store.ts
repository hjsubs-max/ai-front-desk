"use client";

// Per-visitor demo sandbox kept in this browser. Each evaluator gets their own copy of the center,
// so one person's edits never change what the next person sees. The parent and operator views
// share it (same browser, any tab), which is how a question asked on the parent side shows up
// in the operator's inbox.

import { useSyncExternalStore } from "react";
import { addDays, centerNowFromDate, daysBetween, fmtTime, isWeekend } from "../dates.ts";
import { buildKnowledge, CALENDAR } from "../seed.ts";
import type { ActionKind, AskResult, CenterNow, Knowledge, PersonCategory } from "../types.ts";

export type ClockMode = "dropoff" | "pickup" | "real";

export interface ThreadEntry {
  id: string;
  stamp: number;
  kind: "qa" | "action" | "message";
  question: string;
  channel?: "text" | "voice" | "suggestion";
  result?: AskResult;
  inboxId?: string;
  feedback?: { value: "yes" | "no"; reason?: string };
  verified?: "correct" | "incorrect";
}

export type InboxKind = "request" | "handoff" | "draft" | "message";
export type InboxStatus = "open" | "acknowledged" | "confirmed" | "declined" | "replied" | "sent" | "cancelled" | "booked";

export interface InboxItem {
  id: string;
  kind: InboxKind;
  family: string;
  child: string;
  room: string;
  title: string;
  text: string;
  summary?: string;
  category?: PersonCategory;
  requestKind?: ActionKind;
  status: InboxStatus;
  createdStamp: number;
  dueMinutes: number | null;
  dueLabel: string;
  history: { stamp: number; text: string }[];
  reply?: string;
  draftText?: string;
  sample?: boolean;
  threadId?: string;
  couldHaveAnswered?: boolean;
}

export interface TrackEvent {
  name: string;
  props?: Record<string, string | number | boolean>;
  ts: number;
  view: string;
}

export interface Sandbox {
  v: 1;
  seededFor: string;
  sessionId: string;
  knowledge: Knowledge;
  clock: { mode: ClockMode; date: string; baseMinutes: number; setAt: number };
  thread: ThreadEntry[];
  inbox: InboxItem[];
  events: TrackEvent[];
  pins: { dropoff: ActionKind[]; pickup: ActionKind[] };
  fixedGaps: string[];
  sampleVerified: "correct" | "incorrect" | null;
}

const KEY = "afd-sandbox-v1";
const DROP_OFF_MIN = 7 * 60 + 45;
const PICKUP_MIN = 17 * 60 + 15;

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** The demo opens on today's date if the center is open, otherwise the next school day. */
export function defaultDemoDate(): string {
  let d = centerNowFromDate(new Date()).date;
  for (let i = 0; i < 14; i++) {
    if (!isWeekend(d) && !CALENDAR.some((c) => c.date === d && c.status === "closed")) return d;
    d = addDays(d, 1);
  }
  return d;
}

export function stampOf(now: CenterNow): number {
  return daysBetween("2026-01-01", now.date) * 1440 + now.minutes;
}

export function stampTime(stamp: number): string {
  return fmtTime(((stamp % 1440) + 1440) % 1440);
}

function sampleInbox(now: CenterNow): InboxItem[] {
  const s = stampOf(now);
  return [
    {
      id: "sample-okafor",
      kind: "handoff",
      family: "Okafor family",
      child: "Sam",
      room: "Preschool",
      title: "Health decision · always a person",
      text: "Sam threw up last night but seems fine now, is he ok to come?",
      summary: "Vomiting overnight. Handbook 4.2 asks for 24 hours without symptoms. The parent was shown the policy and told staff will decide.",
      category: "H3",
      status: "open",
      createdStamp: s - 3,
      dueMinutes: 15,
      dueLabel: "Within 15 minutes",
      history: [{ stamp: s - 3, text: "Sent by the assistant" }],
      sample: true,
    },
    {
      id: "sample-patel",
      kind: "request",
      family: "Patel family",
      child: "Leo",
      room: "Preschool",
      title: "Running late · acknowledge",
      text: "Arriving 9:30 AM instead of 8:30 AM",
      requestKind: "running_late",
      status: "open",
      createdStamp: s - 6,
      dueMinutes: 15,
      dueLabel: "Within 15 minutes",
      history: [{ stamp: s - 6, text: "Sent from Running late" }],
      sample: true,
    },
    {
      id: "sample-nguyen",
      kind: "message",
      family: "Nguyen family",
      child: "Ava",
      room: "Infants",
      title: "Message · from Talk to a person",
      text: "Can we talk about moving Ava to part time in January?",
      status: "open",
      createdStamp: s - 40,
      dueMinutes: Math.max(30, 18 * 60 - now.minutes + 40),
      dueLabel: "Today, by 6:00 PM",
      history: [{ stamp: s - 40, text: "Sent straight to staff" }],
      sample: true,
    },
  ];
}

export function newSandbox(): Sandbox {
  const date = defaultDemoDate();
  const clock = { mode: "dropoff" as ClockMode, date, baseMinutes: DROP_OFF_MIN, setAt: Date.now() };
  const now = { date, minutes: DROP_OFF_MIN };
  return {
    v: 1,
    seededFor: date,
    sessionId: uid() + uid(),
    knowledge: buildKnowledge(date),
    clock,
    thread: [],
    inbox: sampleInbox(now),
    events: [],
    pins: {
      dropoff: ["running_late", "absent_today", "forgot_lunch", "child_unwell"],
      pickup: ["late_for_pickup", "someone_else_pickup", "picking_up_early", "absent_tomorrow"],
    },
    fixedGaps: [],
    sampleVerified: null,
  };
}

// ---------- external store ----------

let state: Sandbox | null = null;
const listeners = new Set<() => void>();

function load(): Sandbox {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Sandbox;
      if (s?.v === 1 && s.seededFor === defaultDemoDate()) return s;
    }
  } catch {
    /* storage unavailable: fall through to a fresh sandbox */
  }
  return newSandbox();
}

function save(s: Sandbox) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or full storage: keep working in memory */
  }
}

function emit() {
  for (const l of listeners) l();
}

export function getSandbox(): Sandbox {
  if (!state) {
    state = load();
    save(state);
  }
  return state;
}

export function setSandbox(next: Sandbox) {
  state = next;
  save(next);
  emit();
}

export function update(fn: (s: Sandbox) => Sandbox | void) {
  const cur = structuredClone(getSandbox());
  const res = fn(cur);
  setSandbox(res ?? cur);
}

export function resetSandbox() {
  setSandbox(newSandbox());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = JSON.parse(e.newValue) as Sandbox;
        emit();
      } catch {
        /* ignore */
      }
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSandbox(): Sandbox | null {
  return useSyncExternalStore(subscribe, getSandbox, () => null);
}

// ---------- clock ----------

export function demoNow(s: Sandbox): CenterNow {
  if (s.clock.mode === "real") return centerNowFromDate(new Date());
  const minutes = Math.min(23 * 60 + 59, s.clock.baseMinutes + Math.floor((Date.now() - s.clock.setAt) / 60000));
  return { date: s.clock.date, minutes };
}

export function setClock(mode: ClockMode) {
  update((s) => {
    const date = mode === "real" ? centerNowFromDate(new Date()).date : s.clock.date;
    s.clock = { mode, date: mode === "real" ? s.clock.date : date, baseMinutes: mode === "pickup" ? PICKUP_MIN : DROP_OFF_MIN, setAt: Date.now() };
  });
}

/** Minutes until an inbox item's promised reply time (negative when overdue). */
export function minutesLeft(item: InboxItem, now: CenterNow): number | null {
  if (item.dueMinutes == null) return null;
  return item.createdStamp + item.dueMinutes - stampOf(now);
}
