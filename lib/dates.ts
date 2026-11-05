// Date helpers. All center dates are local date strings (YYYY-MM-DD) in America/Los_Angeles,
// so the model never has to produce or do arithmetic on a date.

import type { CenterNow } from "./types.ts";

export const CENTER_TZ = "America/Los_Angeles";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function iso(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  return iso(y, m, d + n);
}

export function weekday(date: string): number {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const w = weekday(date);
  return w === 0 || w === 6;
}

export function dayName(date: string): string {
  return DAY_NAMES[weekday(date)];
}

/** "Wednesday, Nov 11" */
export function fmtLong(date: string): string {
  const { m, d } = parts(date);
  return `${DAY_NAMES[weekday(date)]}, ${MONTH_SHORT[m - 1]} ${d}`;
}

/** "Wed, Nov 11" */
export function fmtShort(date: string): string {
  const { m, d } = parts(date);
  return `${DAY_SHORT[weekday(date)]}, ${MONTH_SHORT[m - 1]} ${d}`;
}

/** "Nov 11" */
export function fmtMonthDay(date: string): string {
  const { m, d } = parts(date);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "07:00" or 420 -> "7:00 AM" */
export function fmtTime(t: string | number): string {
  const mins = typeof t === "number" ? t : toMinutes(t);
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function daysBetween(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** Center-local date and minutes for a real instant. */
export function centerNowFromDate(dt: Date): CenterNow {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: CENTER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(dt).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function weekStart(date: string): string {
  const w = weekday(date);
  return addDays(date, w === 0 ? -6 : 1 - w); // Monday
}

export const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Display label for a stored "YYYY-MM-DDTHH:MM" stamp relative to now. */
export function fmtStamp(stamp: string, now: CenterNow): string {
  const [date, time] = stamp.split("T");
  if (date === now.date) return `today ${fmtTime(time ?? "00:00")}`;
  if (date === addDays(now.date, -1)) return `yesterday ${fmtTime(time ?? "00:00")}`;
  return fmtMonthDay(date);
}
