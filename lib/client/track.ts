"use client";

// Clickstream: every interaction becomes an event with an anonymous session ID and no personal data.
// Events are kept in the sandbox (for the operator's Usage page) and sent in batches to /api/events.
// Question traces (the parent's words, redacted, plus how the desk routed them) ride in the same
// batches so live traffic can be error-analyzed.

import { getSandbox, update } from "./store.ts";

let queue: { name: string; props?: Record<string, string | number | boolean>; ts: number }[] = [];
export interface Trace {
  id: string;
  ts: number;
  q: string;
  channel: string;
  route: string;
  intents: string[];
  model: string;
  category?: string;
  latencyMs: number;
  gap?: string;
  fallback: boolean;
  answer: string;
}
let traces: Trace[] = [];

/** Removes emails, phone numbers and long digit runs before a question leaves the browser. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]")
    .slice(0, 300);
}

export function trace(t: Trace) {
  traces.push(t);
  if (traces.length >= 10) flush();
  else if (!timer) timer = setTimeout(flush, 20_000);
}
let view = "parent";
let timer: ReturnType<typeof setTimeout> | null = null;
let bound = false;

export function setView(v: string) {
  view = v;
  if (!bound && typeof window !== "undefined") {
    bound = true;
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }
}

export function track(name: string, props?: Record<string, string | number | boolean>) {
  const ts = Date.now();
  update((s) => {
    s.events.push({ name, props, ts, view });
    if (s.events.length > 600) s.events = s.events.slice(-600);
  });
  queue.push({ name, props, ts });
  if (queue.length >= 25) flush();
  else if (!timer) timer = setTimeout(flush, 20_000);
}

export function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length && !traces.length) return;
  const body = JSON.stringify({ sessionId: getSandbox().sessionId, view, sentAt: new Date().toISOString(), events: queue, traces });
  queue = [];
  traces = [];
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    else void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
  } catch {
    /* analytics must never break the page */
  }
}
