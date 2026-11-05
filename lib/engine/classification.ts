// The routing decision the model (or the rule-based fallback) returns. It never contains an answer.

import type { ActionKind, PersonCategory, Room } from "../types.ts";

export type Intent =
  | "hours"
  | "open_on_date"
  | "closures_list"
  | "tuition"
  | "menu"
  | "tour_info"
  | "policy"
  | "center_answer"
  | "action"
  | "family_record"
  | "unknown"
  | "out_of_scope"
  | "greeting";

export const INTENTS: Intent[] = [
  "hours",
  "open_on_date",
  "closures_list",
  "tuition",
  "menu",
  "tour_info",
  "policy",
  "center_answer",
  "action",
  "family_record",
  "unknown",
  "out_of_scope",
  "greeting",
];

export const ACTIONS: ActionKind[] = [
  "running_late",
  "absent_today",
  "absent_tomorrow",
  "forgot_lunch",
  "child_unwell",
  "someone_else_pickup",
  "picking_up_early",
  "late_for_pickup",
  "book_tour",
];

export type DateRef =
  | { kind: "none" }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "weekday"; weekday: string; which?: "this" | "next" | "plain" }
  | { kind: "event"; event_id: string; offset_days?: number }
  | { kind: "explicit"; month?: number; day: number; year?: number; weekday?: string };

export interface Part {
  intent: Intent;
  section_id?: string;
  answer_id?: string;
  action?: ActionKind;
  date?: DateRef;
  room?: Room;
  query?: string;
  detail?: string;
}

export interface Classification {
  parts: Part[];
  needs_person: boolean;
  person_category: PersonCategory | "none";
  person_reason: string;
  staff_summary: string;
}
