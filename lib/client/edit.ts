"use client";

import { addDays, fmtTime } from "../dates.ts";
import type { AskResult, CenterAnswer, Knowledge, TopicKey, TopicSetting } from "../types.ts";
import { demoNow, getSandbox, update } from "./store.ts";
import { track } from "./track.ts";

function stamp(): string {
  const now = demoNow(getSandbox());
  const h = Math.floor(now.minutes / 60);
  const m = now.minutes % 60;
  return `${now.date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function touch<K extends keyof Knowledge>(k: Knowledge, key: K) {
  const meta = k[key] as unknown as { updatedAt?: string; updatedBy?: string };
  if (meta && typeof meta === "object" && "updatedAt" in meta) {
    meta.updatedAt = stamp();
    meta.updatedBy = getSandbox().knowledge.center.director;
  }
}

export function editKnowledge<K extends keyof Knowledge>(key: K, fn: (k: Knowledge) => void, item?: string) {
  update((s) => {
    fn(s.knowledge);
    touch(s.knowledge, key);
  });
  track("source_updated", { item: item ?? String(key) });
}

export function fixCalendarDate(date: string, status: "closed" | "open" | "shortened", name: string, open?: string, close?: string) {
  editKnowledge("calendar", (k) => {
    k.calendar.entries = k.calendar.entries.filter((e) => e.date !== date);
    k.calendar.entries.push({ id: `added-${date}`, date, name: name || (status === "closed" ? "Closed" : "Open"), status, ...(status !== "closed" ? { open: open ?? k.hours.open, close: close ?? k.hours.close } : {}) });
    k.calendar.entries.sort((a, b) => a.date.localeCompare(b.date));
  }, "calendar");
}

export function addMenuWeek(monday: string, lunches: string[]) {
  editKnowledge("menu", (k) => {
    lunches.forEach((l, i) => {
      const d = addDays(monday, i);
      if (!l.trim()) return;
      k.menu.days = k.menu.days.filter((x) => x.date !== d);
      k.menu.days.push({ date: d, lunch: l.trim() });
    });
    k.menu.days.sort((a, b) => a.date.localeCompare(b.date));
  }, "menu");
}

export function addCenterAnswer(question: string, answer: string, topic: TopicKey = "general") {
  const a: CenterAnswer = { id: `a-${Date.now().toString(36)}`, question, answer, topic, createdAt: stamp() };
  editKnowledge("answers", (k) => {
    k.answers.items.push(a);
  }, "center_answer");
  return a;
}

export function setTopic(topic: TopicKey, setting: TopicSetting) {
  update((s) => {
    s.knowledge.topics[topic] = setting;
  });
  track("topic_setting_changed", { topic, setting });
}

export function markGapFixed(key: string) {
  update((s) => {
    if (!s.fixedGaps.includes(key)) s.fixedGaps.push(key);
  });
}

export async function preview(question: string): Promise<AskResult | null> {
  const s = getSandbox();
  track("preview_run");
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, now: demoNow(s), knowledge: s.knowledge, channel: "preview" }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AskResult;
  } catch {
    return null;
  }
}

export { fmtTime };
