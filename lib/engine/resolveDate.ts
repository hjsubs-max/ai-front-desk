// Turns a described date ("next Monday", "the day after Thanksgiving") into a calendar date, in code.

import { addDays, iso, parts, weekday, WEEKDAY_INDEX, weekStart } from "../dates.ts";
import type { CenterNow, Knowledge } from "../types.ts";
import type { DateRef } from "./classification.ts";

export interface ResolvedDate {
  date: string;
  context?: string; // e.g. "the day after Thanksgiving"
}

export function resolveDate(ref: DateRef | undefined, now: CenterNow, k: Knowledge): ResolvedDate | null {
  if (!ref || ref.kind === "none") return null;
  const today = now.date;
  switch (ref.kind) {
    case "today":
      return { date: today };
    case "tomorrow":
      return { date: addDays(today, 1) };
    case "weekday": {
      const target = WEEKDAY_INDEX[ref.weekday.toLowerCase()];
      if (target === undefined) return null;
      const w = weekday(today);
      let delta = (target - w + 7) % 7;
      if (ref.which === "this" && delta === 0) return { date: today };
      if (delta === 0) delta = 7;
      const upcoming = addDays(today, delta);
      if (ref.which === "next") {
        // "next Monday" on a Wednesday is the coming Monday; "next Friday" on a Wednesday is Friday of next week.
        const sameWeek = weekStart(upcoming) === weekStart(today);
        return { date: sameWeek ? addDays(upcoming, 7) : upcoming };
      }
      return { date: upcoming };
    }
    case "event": {
      const entry = k.calendar.entries.find((e) => e.id === ref.event_id);
      if (!entry) return null;
      const off = ref.offset_days ?? 0;
      const context =
        off === 1 ? `the day after ${entry.name}` : off === -1 ? `the day before ${entry.name}` : off ? undefined : entry.name;
      return { date: addDays(entry.date, off), context };
    }
    case "explicit": {
      const { y } = parts(today);
      if (ref.month && ref.day) {
        const year = ref.year ?? y;
        let d = iso(year, ref.month, ref.day);
        // A date more than a week in the past without a year means next year.
        if (!ref.year && d < addDays(today, -7)) d = iso(year + 1, ref.month, ref.day);
        return { date: d };
      }
      // Day of month only ("Monday the 30th"): the next date with that day (and weekday, if given).
      const wantWeekday = ref.weekday ? WEEKDAY_INDEX[ref.weekday.toLowerCase()] : undefined;
      for (let i = 0; i < 400; i++) {
        const d = addDays(today, i);
        if (parts(d).d === ref.day && (wantWeekday === undefined || weekday(d) === wantWeekday)) return { date: d };
      }
      return null;
    }
  }
}
