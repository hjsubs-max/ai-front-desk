// Shared types for the AI Front Desk prototype. Everything here is fictional demo data.

export type Room = "Infants" | "Toddlers" | "Preschool";

export type TopicKey =
  | "hours"
  | "tuition"
  | "meals"
  | "illness"
  | "medication"
  | "allergies"
  | "pickup"
  | "absence"
  | "tours"
  | "enrollment"
  | "billing"
  | "weather"
  | "general";

export type TopicSetting = "ai" | "draft" | "person";

export interface Meta {
  updatedAt: string; // center-local "YYYY-MM-DDTHH:MM"
  updatedBy: string;
}

export interface CalendarEntry {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  status: "closed" | "shortened" | "open";
  open?: string; // "07:00" for shortened or open entries
  close?: string;
  note?: string;
}

export interface TuitionRow {
  room: Room;
  ages: string;
  fullTime: number;
  partTime: number;
}

export interface MenuDay {
  date: string;
  lunch: string;
}

export interface HandbookSection {
  id: string; // "4.2"
  title: string;
  topic: TopicKey;
  text: string;
  required: string[]; // phrases every AI summary of this section must keep
}

export interface CenterAnswer {
  id: string;
  question: string;
  answer: string;
  topic: TopicKey;
  createdAt: string;
}

export interface TourSlot {
  id: string;
  date: string;
  time: string; // "10:00"
}

export interface Knowledge {
  center: { name: string; phone: string; director: string; frontDesk: string };
  hours: Meta & { open: string; close: string; days: number[]; lateFeeAfter: string };
  calendar: Meta & { entries: CalendarEntry[]; through: string };
  tuition: Meta & { rows: TuitionRow[]; registrationFee: number; siblingDiscountPct: number };
  menu: Meta & { days: MenuDay[]; snack: string };
  handbook: Meta & { sections: HandbookSection[] };
  answers: Meta & { items: CenterAnswer[] };
  tours: Meta & { slots: TourSlot[] };
  topics: Record<TopicKey, TopicSetting>;
  family: { parent: string; children: { name: string; room: Room }[] };
}

export interface CenterNow {
  date: string; // YYYY-MM-DD, center local
  minutes: number; // minutes after local midnight
}

export type ActionKind =
  | "running_late"
  | "absent_today"
  | "forgot_lunch"
  | "child_unwell"
  | "someone_else_pickup"
  | "picking_up_early"
  | "late_for_pickup"
  | "absent_tomorrow"
  | "book_tour";

export type PersonCategory = "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "H7";

export type Route =
  | "fact"
  | "policy"
  | "request"
  | "person"
  | "emergency"
  | "unknown"
  | "out_of_scope"
  | "draft";

export interface SourceRef {
  id: string; // "calendar", "menu", "tuition", "hours", "handbook:4.2", "answer:<id>", "tours"
  label: string;
  updated: string; // display label
}

export type Block =
  | { type: "text"; text: string; strong?: string }
  | { type: "quote"; text: string; sourceId: string }
  | { type: "list"; items: string[] }
  | { type: "slots"; slots: TourSlot[] };

export type FactAssertion =
  | { kind: "open_status"; date: string; value: "open" | "closed" | "shortened" | "weekend" | "unknown"; name?: string }
  | { kind: "hours"; open: string; close: string }
  | { kind: "tuition"; room: Room; fullTime: number; partTime: number }
  | { kind: "menu"; date: string; lunch: string | null }
  | { kind: "closures"; dates: string[] }
  | { kind: "tour_slots"; count: number };

export interface Handoff {
  category: PersonCategory;
  mode: "sent" | "offer" | "urgent";
  to: string;
  dueLabel: string;
  dueMinutes: number | null;
  reason: string;
  summary: string;
}

export interface RequestProposal {
  kind: ActionKind;
  autoCreate: boolean;
  details: string;
}

export interface Gap {
  key: string;
  label: string;
  kind: "calendar" | "menu" | "general";
  date?: string;
}

export interface AskResult {
  route: Route;
  blocks: Block[];
  sources: SourceRef[];
  facts: FactAssertion[];
  topic?: TopicKey;
  intents: string[];
  handoff?: Handoff;
  request?: RequestProposal;
  gap?: Gap;
  draftText?: string;
  classifier: string; // model id or "rules"
  fallback?: string;
  aiText: string[]; // every sentence the model wrote, for the code checks
  checks: { passed: boolean; failures: string[] };
  latencyMs: number;
  usage: { input: number; output: number };
  related: string[];
}

export interface AskRequestBody {
  question: string;
  now: CenterNow;
  knowledge: Knowledge;
  model?: "haiku" | "sonnet" | "rules";
  channel?: "text" | "voice" | "suggestion" | "preview" | "eval";
}
