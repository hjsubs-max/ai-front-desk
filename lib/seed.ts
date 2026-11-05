// Fictional center data for Sunnyside Daycare. Every name, policy and price is invented.
// The structure follows a public family handbook (Albuquerque, 2019); none of its content is copied.

import { addDays, isWeekend, weekStart, weekday } from "./dates.ts";
import type { CalendarEntry, HandbookSection, Knowledge, TourSlot } from "./types.ts";

export const CENTER_NAME = "Sunnyside Daycare";

// Closures for the 2026-27 school year. The day after Thanksgiving (Fri, Nov 27) is deliberately
// missing: it is the gap the operator demo fixes.
export const CALENDAR: CalendarEntry[] = [
  { id: "labor-day", date: "2026-09-07", name: "Labor Day", status: "closed" },
  { id: "staff-training-oct", date: "2026-10-09", name: "Staff training day", status: "closed" },
  { id: "veterans-day", date: "2026-11-11", name: "Veterans Day", status: "closed" },
  { id: "thanksgiving", date: "2026-11-26", name: "Thanksgiving", status: "closed" },
  { id: "christmas-eve", date: "2026-12-24", name: "Christmas Eve", status: "shortened", open: "07:00", close: "15:00" },
  { id: "christmas", date: "2026-12-25", name: "Christmas Day", status: "closed" },
  { id: "winter-break-1", date: "2026-12-28", name: "Winter break", status: "closed" },
  { id: "winter-break-2", date: "2026-12-29", name: "Winter break", status: "closed" },
  { id: "winter-break-3", date: "2026-12-30", name: "Winter break", status: "closed" },
  { id: "winter-break-4", date: "2026-12-31", name: "Winter break", status: "closed" },
  { id: "new-years-day", date: "2027-01-01", name: "New Year's Day", status: "closed" },
  { id: "mlk-day", date: "2027-01-18", name: "Martin Luther King Jr. Day", status: "closed" },
  { id: "presidents-day", date: "2027-02-15", name: "Presidents' Day", status: "closed" },
  { id: "staff-training-mar", date: "2027-03-12", name: "Staff training day", status: "closed" },
  { id: "memorial-day", date: "2027-05-31", name: "Memorial Day", status: "closed" },
  { id: "juneteenth", date: "2027-06-18", name: "Juneteenth (observed)", status: "closed" },
  { id: "independence-day", date: "2027-07-05", name: "Independence Day (observed)", status: "closed" },
];

export const HANDBOOK: HandbookSection[] = [
  {
    id: "2.1",
    title: "Tours",
    topic: "tours",
    text: "Families can tour Sunnyside on Tuesdays and Thursdays at 10:00 AM or 3:30 PM. Tours take about 30 minutes and are led by the director. Book one of the published tour times in the front desk. To reschedule, message the front desk.",
    required: ["Tuesdays", "Thursdays"],
  },
  {
    id: "2.2",
    title: "Enrollment and the waitlist",
    topic: "enrollment",
    text: "Siblings of currently enrolled children get priority on the waitlist. Joining the waitlist is free. When a spot opens, a family has 3 business days to accept it and pay the $150 registration fee.",
    required: ["priority"],
  },
  {
    id: "3.1",
    title: "Drop-off",
    topic: "absence",
    text: "Please drop off by 9:30 AM so your child can join morning activities. If you will arrive after 9:30 AM, let the center know before 9:00 AM.",
    required: ["9:30 AM"],
  },
  {
    id: "3.2",
    title: "Absences",
    topic: "absence",
    text: "If your child will be absent, let the center know by 9:00 AM. Tuition is not reduced for absences.",
    required: ["9:00 AM"],
  },
  {
    id: "3.4",
    title: "Authorized pickup",
    topic: "pickup",
    text: "Children are released only to parents and approved pickups listed in the child's brightwheel profile. A one-time pickup by someone who is not on the list needs the director's approval before pickup. Everyone picking up a child must show photo ID.",
    required: ["director", "photo ID"],
  },
  {
    id: "3.6",
    title: "Late pickup",
    topic: "pickup",
    text: "The center closes at 6:00 PM. Pickups after 6:10 PM are charged $1 per minute, added to your next invoice. If you are running late, let the center know as early as you can. If no one has arrived or called by 6:30 PM, staff call the child's emergency contacts.",
    required: ["6:10 PM", "$1 per minute"],
  },
  {
    id: "4.2",
    title: "Illness",
    topic: "illness",
    text: "Children stay home with a temperature of 100.4°F or higher together with a change in behavior or other symptoms. They may return after 24 hours without a fever and without fever-reducing medicine. Children who vomit or have diarrhea twice or more in 24 hours stay home until 24 hours after the last episode. Staff make the final decision at drop-off and will call you if your child becomes ill during the day.",
    required: ["100.4", "behavior", "24 hours"],
  },
  {
    id: "4.3",
    title: "Allergies",
    topic: "allergies",
    text: "Sunnyside is a nut-free center. A child with a food allergy needs an allergy action plan signed by their doctor on file before their first day. Tell staff right away about any new allergy.",
    required: ["nut-free", "allergy action plan"],
  },
  {
    id: "4.4",
    title: "Medication",
    topic: "medication",
    text: "Staff give medication only with a signed medication authorization form and the medicine in its original container, labeled with your child's name. Staff do not give fever-reducing medicine so that a child can stay at the center.",
    required: ["authorization form", "original container"],
  },
  {
    id: "5.1",
    title: "Meals and forgotten lunches",
    topic: "meals",
    text: "Families pack lunch each day unless they are on the meal plan ($95 a month). Morning and afternoon snacks are included for every child. If a lunch is forgotten, the kitchen can provide that day's menu lunch for $6, added to your next invoice; staff confirm by 10:30 AM. Infant food and formula come from home.",
    required: ["$6", "next invoice", "confirm"],
  },
  {
    id: "6.1",
    title: "Tuition and billing",
    topic: "billing",
    text: "Tuition is billed monthly on the 1st and is due by the 5th. Autopay through brightwheel is recommended. A $25 late fee applies to payments received after the 5th. Questions about a specific charge go to the director.",
    required: ["5th", "$25"],
  },
  {
    id: "6.2",
    title: "Sibling discount",
    topic: "tuition",
    text: "Families with more than one child enrolled get 10% off the tuition of each additional child. The discount applies to the lower tuition.",
    required: ["10%"],
  },
  {
    id: "6.3",
    title: "Withdrawal",
    topic: "billing",
    text: "To withdraw, give 30 days' written notice. Tuition is due through the end of the notice period. The registration fee is not refunded.",
    required: ["30 days", "written notice"],
  },
  {
    id: "7.1",
    title: "Holidays and closures",
    topic: "hours",
    text: "Sunnyside closes on the holidays listed in the center calendar. Tuition is not reduced for holiday closures. Closures are posted in brightwheel at least two weeks ahead.",
    required: ["not reduced"],
  },
  {
    id: "7.2",
    title: "Weather closures",
    topic: "weather",
    text: "If snow or ice makes travel unsafe, Sunnyside follows the local school district's closure decision and posts any closure or late opening in brightwheel by 6:00 AM.",
    required: ["6:00 AM"],
  },
];

const LUNCH_BY_WEEKDAY: Record<number, string> = {
  1: "Bean and cheese quesadilla, corn, orange slices",
  2: "Baked fish sticks, rice, green beans, pears",
  3: "Turkey and cheese wrap, cucumber, apple slices",
  4: "Chicken pasta with peas, banana",
  5: "Cheese pizza on whole wheat crust, carrot sticks, melon",
};

function tourSlots(today: string): TourSlot[] {
  const slots: TourSlot[] = [];
  for (let i = 1; i <= 21 && slots.length < 8; i++) {
    const d = addDays(today, i);
    const w = weekday(d);
    if ((w === 2 || w === 4) && !CALENDAR.some((c) => c.date === d && c.status === "closed")) {
      slots.push({ id: `${d}-10`, date: d, time: "10:00" });
      slots.push({ id: `${d}-1530`, date: d, time: "15:30" });
    }
  }
  return slots;
}

/** First school day on or after a date: skips weekends and closures. */
export function nextSchoolDay(date: string): string {
  let d = date;
  for (let i = 0; i < 14; i++) {
    if (!isWeekend(d) && !CALENDAR.some((c) => c.date === d && c.status === "closed")) return d;
    d = addDays(d, 1);
  }
  return date;
}

/** Builds the center's information as of a given local date. Menus are posted for that week only. */
export function buildKnowledge(today: string): Knowledge {
  const monday = weekStart(today);
  const days = [0, 1, 2, 3, 4]
    .map((i) => addDays(monday, i))
    .filter((d) => !CALENDAR.some((c) => c.date === d && c.status === "closed"))
    .map((d) => ({ date: d, lunch: LUNCH_BY_WEEKDAY[weekday(d)] }));

  return {
    center: {
      name: CENTER_NAME,
      phone: "(206) 555-0142",
      director: "Ana Rivera",
      frontDesk: "the front desk",
    },
    hours: { open: "07:00", close: "18:00", days: [1, 2, 3, 4, 5], lateFeeAfter: "18:10", updatedAt: "2026-08-18T09:15", updatedBy: "Ana Rivera" },
    calendar: { entries: CALENDAR.map((c) => ({ ...c })), through: "2027-08-31", updatedAt: "2026-09-02T14:05", updatedBy: "Ana Rivera" },
    tuition: {
      rows: [
        { room: "Infants", ages: "6 weeks to 12 months", fullTime: 2150, partTime: 1450 },
        { room: "Toddlers", ages: "12 to 30 months", fullTime: 1925, partTime: 1295 },
        { room: "Preschool", ages: "2½ to 5 years", fullTime: 1650, partTime: 1095 },
      ],
      registrationFee: 150,
      siblingDiscountPct: 10,
      updatedAt: "2026-07-01T10:00",
      updatedBy: "Ana Rivera",
    },
    menu: { days, snack: "Morning and afternoon snacks are included for every child.", updatedAt: `${today}T06:42`, updatedBy: "Kitchen" },
    handbook: { sections: HANDBOOK.map((s) => ({ ...s, required: [...s.required] })), updatedAt: "2026-08-18T09:30", updatedBy: "Ana Rivera" },
    answers: {
      items: [
        {
          id: "parking",
          question: "Is there parking for drop-off?",
          answer: "Yes. There are five short-term spots by the front door for drop-off and pickup, limited to 15 minutes.",
          topic: "general",
          createdAt: "2026-08-18T09:30",
        },
      ],
      updatedAt: "2026-08-18T09:30",
      updatedBy: "Ana Rivera",
    },
    tours: { slots: tourSlots(today), updatedAt: "2026-10-28T16:20", updatedBy: "Ana Rivera" },
    topics: {
      hours: "ai",
      tuition: "ai",
      meals: "ai",
      illness: "ai",
      medication: "ai",
      allergies: "ai",
      pickup: "ai",
      absence: "ai",
      tours: "ai",
      enrollment: "ai",
      billing: "draft",
      weather: "ai",
      general: "ai",
    },
    family: { parent: "Jen Chen", children: [{ name: "Maya", room: "Toddlers" }] },
  };
}

export const TOPIC_LABELS: Record<string, string> = {
  hours: "Hours and closures",
  tuition: "Tuition and discounts",
  meals: "Meals and menu",
  illness: "Illness policy (quoting the rule)",
  medication: "Medication policy",
  allergies: "Allergy policy",
  pickup: "Pickup rules and late fees",
  absence: "Drop-off and absences",
  tours: "Tours",
  enrollment: "Enrollment and waitlist",
  billing: "Billing questions",
  weather: "Weather closures",
  general: "Other center answers",
};
