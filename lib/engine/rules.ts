// Rule-based fallback router. Used when the model is unavailable, and as the baseline the
// model is compared against in the quality checks. Keyword rules are brittle by design:
// the gap between this and the model on paraphrased questions is the model's value.

import type { ActionKind, Knowledge, Room } from "../types.ts";
import type { Classification, DateRef, Part } from "./classification.ts";
import { normalize } from "./safety.ts";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};

const EVENT_ALIASES: [RegExp, string][] = [
  [/veteran'?s'? day/, "veterans-day"],
  [/thanksgiving/, "thanksgiving"],
  [/christmas eve/, "christmas-eve"],
  [/christmas( day)?|xmas/, "christmas"],
  [/new year'?s( day)?/, "new-years-day"],
  [/\bmlk\b|martin luther king/, "mlk-day"],
  [/president'?s'? day/, "presidents-day"],
  [/memorial day/, "memorial-day"],
  [/juneteenth/, "juneteenth"],
  [/fourth of july|july 4(th)?|independence day/, "independence-day"],
  [/labor day/, "labor-day"],
];

export function extractDate(t: string, k: Knowledge): DateRef {
  const after = /\b(day after|after) /.test(t);
  const before = /\b(day before) /.test(t);
  for (const [re, id] of EVENT_ALIASES) {
    if (re.test(t)) {
      // "christmas eve" must win over "christmas"
      if (id === "christmas" && /christmas eve/.test(t)) continue;
      if (k.calendar.entries.some((e) => e.id === id)) {
        return { kind: "event", event_id: id, offset_days: after ? 1 : before ? -1 : 0 };
      }
    }
  }
  if (/\btoday\b|\btonight\b|this morning|this afternoon/.test(t)) return { kind: "today" };
  if (/\btomorrow\b/.test(t)) return { kind: "tomorrow" };
  const md = t.match(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.? (\d{1,2})(st|nd|rd|th)?\b/);
  if (md) return { kind: "explicit", month: MONTHS[md[1]], day: Number(md[2]) };
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slash) return { kind: "explicit", month: Number(slash[1]), day: Number(slash[2]) };
  const wd = t.match(/\b(this|next)? ?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  const dom = t.match(/\bthe (\d{1,2})(st|nd|rd|th)\b/);
  if (dom) return { kind: "explicit", day: Number(dom[1]), weekday: wd?.[2] };
  if (wd) return { kind: "weekday", weekday: wd[2], which: (wd[1] as "this" | "next") ?? "plain" };
  return { kind: "none" };
}

function roomFrom(t: string): Room | undefined {
  if (/\binfants?\b|\bbab(y|ies)\b|newborn|\bmonths? old\b/.test(t)) return "Infants";
  if (/\btoddlers?\b|\b(1|2|one|two)[- ]year[- ]old\b/.test(t)) return "Toddlers";
  if (/\bpre-?school(er)?s?\b|\bpre-?k\b|\b(3|4|5|three|four|five)[- ]year[- ]old\b/.test(t)) return "Preschool";
  return undefined;
}

const ACTION_RULES: [RegExp, ActionKind][] = [
  [/\b(forgot|forgotten|didn'?t pack|no) (to pack )?(her |his |their |a |the )?lunch\b|\bforgot lunch\b/, "forgot_lunch"],
  [/\b(late for pickup|late to pick|late picking|stuck in traffic.*pick|won'?t make (it by )?6|after 6 for pickup)\b/, "late_for_pickup"],
  [/\b(running late|be late|arriving late|we'?re late|i'?m late|late (this|today)|late drop)/, "running_late"],
  [/\b(pick(ing)? (her|him|them|maya)? ?up early|early pick ?up|leaving early)\b/, "picking_up_early"],
  [/\b(absent|won'?t be (in|coming)|not coming|staying home|keep(ing)? (her|him|them) home|out) tomorrow\b/, "absent_tomorrow"],
  [/\b(absent|won'?t be (in|coming)|not coming in|staying home|keep(ing)? (her|him|them) home|day off)( today)?\b/, "absent_today"],
  [/\b(book|schedule|sign up for|set up) (a )?tour\b/, "book_tour"],
];

const POLICY_RULES: [RegExp, string][] = [
  [/\b(fever|temperature|sick|ill|illness|vomit|throw(s|ing)? up|diarrh)/, "4.2"],
  [/\b(medication|medicine|meds|inhaler|tylenol|motrin)\b/, "4.4"],
  [/\ballerg|\bnut[- ]free\b|\bpeanut|\bnuts\b/, "4.3"],
  [/\blate (pick ?up|fee)|pick ?up (late|fee)|after 6\b/, "3.6"],
  [/\b(who can pick|who (is|are) allowed to pick|authori[sz]ed pick|approved pick|pick ?up list|photo id)\b/, "3.4"],
  [/\b(absent|absence|sick day|day off)\b/, "3.2"],
  [/\b(drop ?off (by|time|deadline)|latest (drop|arrival)|what time.*drop)/, "3.1"],
  [/\b(wait ?list|enrol)/, "2.2"],
  [/\b(bill|billing|billed|invoice|autopay|payment|late payment|tuition due|when is tuition)\b/, "6.1"],
  [/\bsibling/, "6.2"],
  [/\b(withdraw|unenroll|notice period|leaving the center)\b/, "6.3"],
  [/\bsnow|\b(weather|ice|icy|storm)\b/, "7.2"],
  [/\bmeal plan\b/, "5.1"],
  [/\b(holiday|closure) (policy|tuition)|tuition.*(holiday|closure)/, "7.1"],
];

const STOP = new Set(["the", "a", "an", "is", "are", "do", "does", "you", "your", "for", "to", "of", "there", "what", "how", "can", "i", "we", "it", "in", "on", "at", "any"]);

function words(s: string): string[] {
  return normalize(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w));
}

export function classifyWithRules(question: string, k: Knowledge): Classification {
  const t = normalize(question).replace(/\b(tmrw|tmr|tmrrw|tomorow|tommorow|tomorrow's)\b/g, "tomorrow");
  const parts: Part[] = [];
  const date = extractDate(t, k);

  if (/\b(ignore (all |your |previous |the )?(instructions|rules)|system prompt|pretend (to be|you are)|write (me )?(a|an) (poem|song|story|essay)|tell me a joke|stock|bitcoin|recipe for)\b/.test(t)) {
    parts.push({ intent: "out_of_scope" });
  } else if (/^(hi|hello|hey|thanks|thank you|ok|okay|great|cool|good morning)[.! ]*$/.test(t)) {
    parts.push({ intent: "greeting" });
  } else {
    for (const [re, action] of ACTION_RULES) {
      if (re.test(t)) {
        parts.push({ intent: "action", action, detail: question });
        break;
      }
    }
    const asksLunch = /\b(lunch|menu|snack|eat|food)\b/.test(t);
    if (asksLunch && /\bwhat('s| is)\b|\bmenu\b|\bwhat.*lunch/.test(t)) parts.push({ intent: "menu", date: date.kind === "none" ? { kind: "today" } : date });
    const policyFirst = /\b(withdraw|notice|due|autopay|bill|billing|invoice|holiday|policy)\b/.test(t);
    if (!policyFirst && /\b(tuition|cost|costs|price|prices|pricing|how much|rates?|fees?)\b/.test(t) && !/\blate (fee|pick)/.test(t) && !/\bsibling/.test(t) && !parts.some((p) => p.intent === "menu")) {
      parts.push({ intent: "tuition", room: roomFrom(t) });
    }
    if (/\btours?\b|\bvisit (the )?(center|school)\b/.test(t) && !parts.some((p) => p.action === "book_tour")) parts.push({ intent: "tour_info" });
    if (/\b(closures?|closed days|days off|holidays|winter break|spring break|summer break|breaks)\b/.test(t) && date.kind === "none" && !policyFirst) {
      const q = t.match(/winter break|spring break|summer break|christmas|thanksgiving/)?.[0];
      parts.push({ intent: "closures_list", query: q });
    } else if (/\b(open|closed|close|care|school|daycare|operating)\b/.test(t) && date.kind !== "none" && !parts.some((p) => p.intent === "menu")) {
      parts.push({ intent: "open_on_date", date });
    } else if (/\b(hours|what time (do|does) (you|the center|sunnyside) (open|close)|when do you (open|close)|opening time|closing time)\b/.test(t)) {
      parts.push({ intent: "hours" });
    }
    if (/\b(my |our )(balance|bill|invoice|account|statement)\b|\bhow was (her|his|maya)|did (she|he|maya) (nap|eat|sleep)/.test(t)) {
      parts.push({ intent: "family_record" });
    }
    if (!parts.length) {
      for (const [re, id] of POLICY_RULES) {
        if (re.test(t)) {
          parts.push({ intent: "policy", section_id: id });
          break;
        }
      }
    }
    if (!parts.length) {
      const qw = new Set(words(question));
      const hit = k.answers.items.find((a) => words(a.question).filter((w) => qw.has(w)).length >= 2);
      if (hit) parts.push({ intent: "center_answer", answer_id: hit.id });
    }
    if (!parts.length) parts.push({ intent: "unknown" });
  }

  return {
    parts,
    needs_person: false,
    person_category: "none",
    person_reason: "",
    staff_summary: question.trim().slice(0, 240),
  };
}
