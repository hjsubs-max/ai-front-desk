"use client";

// Clickstream: every interaction becomes an event with an anonymous session ID and no personal data.
// Events are kept in the sandbox (for the operator's Usage page) and sent in batches to /api/events.

import { getSandbox, update } from "./store.ts";

let queue: { name: string; props?: Record<string, string | number | boolean>; ts: number }[] = [];
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
  if (!queue.length) return;
  const body = JSON.stringify({ sessionId: getSandbox().sessionId, view, sentAt: new Date().toISOString(), events: queue });
  queue = [];
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    else void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
  } catch {
    /* analytics must never break the page */
  }
}
