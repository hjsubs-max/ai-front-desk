// Labeled sample numbers for a typical week at Sunnyside, so operator pages aren't empty.
// Everything the visitor does in this browser is added on top and shown separately.

export const SAMPLE_WEEK = {
  questions: 142,
  answered: 82,
  toPerson: 44,
  unanswered: 16,
  straightToPersonPct: 6,
  wrongFacts: 0,
  checked: 25,
};

export const SAMPLE_STRUGGLES = [
  { cause: "Missing from your information", example: "Is there care the day after Thanksgiving?", count: 9 },
  { cause: "Out of date", example: "Next week's menu not posted yet", count: 3 },
  { cause: "Sent to a person, could have answered", example: "What's the sibling discount?", count: 4 },
  { cause: "Misread the question", example: '"next Monday" read as this Monday', count: 2 },
  { cause: "Answered when a person should have", example: "Must stay at zero", count: 0 },
];

export const SAMPLE_FLAGGED = {
  question: "Is snack included for the half-day program?",
  answer: "Yes, morning snack is included.",
  source: "Tuition and fees, version of Jul 1",
  at: "Tue 7:31 AM",
};

export const SAMPLE_FUNNEL: [string, string, number][] = [
  ["desk_opened", "Opened the desk", 100],
  ["today_card_viewed", "Saw today's card", 96],
  ["action_tapped", "Tapped an action", 41],
  ["question_submitted", "Asked a question", 42],
  ["answer_shown", "Got an answer or a status", 79],
  ["ask_person_tapped", "Asked a person after an answer", 7],
  ["talk_to_person_opened", "Opened Talk to a person", 8],
  ["feedback_given", "Gave feedback on an answer", 34],
];

export const SAMPLE_WAITS = { aiMedianS: 2.1, staffMedianMin: 11, onTimePct: 92 };
