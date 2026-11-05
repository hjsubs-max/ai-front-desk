// Net 1 of 2 for "must go to a person": deterministic patterns, run before any model call.
// The model's own flag is net 2; either one sends the question to a person.

import type { PersonCategory } from "../types.ts";

export interface SafetyResult {
  category: PersonCategory | null;
  reason: string;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const H1 = [
  /\b911\b/,
  /\bambulance\b|\bparamedics?\b/,
  /\bemergency\b(?!\s+(contact|contacts|closure|closures|card|form|plan|info|information|number))/,
  /\b(not breathing|can'?t breathe|cannot breathe|trouble breathing|struggling to breathe)\b/,
  /\b(unconscious|unresponsive|passed out|fainted|seizure|convulsing)\b/,
  /\bchok(ing|ed)\b/,
  /\banaphyla/,
  /\ballergic reaction\b/,
  /\b(bleeding|hit (his|her|their) head|broke(n)? (his|her|their) (arm|leg|wrist)|fell (off|down) and)\b/,
  /\b(poison(ed|ing)?|swallowed (a|an|some)\b)/,
  /\b(went missing|is missing|can'?t find (my|our) (son|daughter|child|kid|baby))\b/,
  /\b(gun|knife|weapon|intruder|threaten(ed|ing)?)\b/,
];

const H2 = [
  /\babus(e|ed|ing|ive)\b/,
  /\bneglect(ed|ing)?\b/,
  /\bmolest/,
  /\b(inappropriate(ly)? touch|touched (him|her|them|my \w+) inappropriately)\b/,
  /\b(teacher|staff|someone) (hit|slapped|grabbed|shook|hurt) (him|her|them|my)\b/,
  /\bbruises?\b.*\b(teacher|staff)\b/,
  /\b(cps|child protective)\b/,
];

const H3_SYMPTOM =
  /\b(fever|temperature|temp|threw up|throw(ing)? up|vomit\w*|puk(e|ed|ing)|diarrh\w*|rash|pink ?eye|conjunctivitis|lice|strep|covid|flu|cough\w*|runny nose|sick|unwell|ill|not feeling well|ear infection|hand,? foot|antibiotics?|medicine|medication|meds|tylenol|motrin|advil|ibuprofen|acetaminophen|inhaler|nebulizer|epi-?pen|allergic|allerg(y|ies)|stomach (ache|bug)|headache|teething)\b/;

// Signals that the parent is asking about THEIR child, not about the policy in general.
const H3_SPECIFIC =
  /\b(my (son|daughter|kid|child|baby|toddler|little one)|maya|(she|he)('s| is| has| had| was| threw| vomited| seems| woke| feels| felt| got| needs)|(her|his) (fever|temperature|temp|cough|rash|medicine|medication|inhaler)|can (she|he|they|my \w+) (still )?(come|go|attend|stay|be dropped|return|bring)|ok(ay)? (for (her|him|them) )?to (come|attend|go|return|send)|send (her|him) (in|to)|bring (her|him) (in|today)|keep (her|him) home|(she|he) can'?t)\b/;

const H4 = [
  /\b(custody|court order|restraining order|protective order|parenting plan)\b/,
  /\b(not|isn'?t|aren'?t|no longer) (allowed|permitted) to (pick|see|take)\b/,
  /\bcan'?t pick (him|her|them) up anymore\b/,
  /\bmy ex\b|\bex-?(husband|wife|partner|boyfriend|girlfriend)\b/,
  /\b(grandma|grandpa|grandmother|grandfather|nana|papa|granny|aunt|auntie|uncle|nanny|neighbou?r|friend|babysitter|sitter|cousin|my (mom|mother|dad|father|brother|sister|mother-in-law|father-in-law))('s| is| will| can| could| 'll)? (be )?(picking|pick|getting|collecting|grabbing)\b/,
  /\bsomeone else (is |will be |'s |will |can )?(picking|pick)/,
  /\bnot on the (approved |pickup |pick-up )?list\b/,
  /\badd \w+( \w+)? (to|on) the (pickup|pick-up|approved) list\b/,
];

const H5 = [
  /\b(get|want|need|request|issue|give)( me| us)? (a |my |our )?refund|\brefund (me|us|my|our|the)\b|\bcan (i|we) (get|have) (a |my |our )?(money|refund)/,
  /\bdisput(e|ing)\b/,
  /\bovercharg/,
  /\b(charged|billed) (me |us )?twice\b|\bdouble[- ]?(charged|billed)\b/,
  /\bwaive|\bwaiver\b/,
  /\bwrong (charge|amount|bill|invoice)\b/,
  /\bwhy (was|am|were|did) (i|we|you) (charged|billed|charge)\b/,
  /\bchargeback\b|\bcredit (back|my account|our account)\b/,
  /\b(unfair|ridiculous) (fee|charge|bill)\b/,
  /\btake (that|the|this) (fee|charge) off\b/,
];

const H6 = [
  /\bcomplain(t|ts|ing)?\b/,
  /\bincident report\b/,
  /\b(was|got|been) bitten\b|\bbit (by|my)\b/,
  /\b(another|a) (child|kid|boy|girl) (hit|bit|pushed|scratched|kicked)\b/,
  /\b(teacher|staff)( member)? (yelled|was rude|screamed|ignored|was mean)\b/,
  /\b(rude|unprofessional|mean) (teacher|staff)\b/,
  /\b(unhappy|not happy|upset|frustrated) with (the )?(teacher|teachers|staff|center|care)\b/,
  /\breport (a|the) (teacher|staff)\b/,
];

const HYPOTHETICAL = /\b(what happens if|what if|in case|what do you do (if|when)|how do you handle)\b/;
const POLICY_PHRASING = /\b(what('s| is) (your|the)|do you have a|what are (your|the)|is there a|how does .* policy|when can (a child|children|kids|a kid))\b/;

export function safetyScreen(raw: string): SafetyResult {
  const t = normalize(raw);
  if (H1.some((r) => r.test(t))) return { category: "H1", reason: "Possible emergency or urgent safety issue" };
  if (H2.some((r) => r.test(t))) return { category: "H2", reason: "Possible safeguarding concern" };
  if (H4.some((r) => r.test(t))) return { category: "H4", reason: "Pickup authority or custody" };
  if (H3_SYMPTOM.test(t)) {
    const specific = H3_SPECIFIC.test(t);
    const generalPolicy = POLICY_PHRASING.test(t) && !/\b(my|maya|she|he)\b/.test(t);
    if (specific && !generalPolicy && !HYPOTHETICAL.test(t)) return { category: "H3", reason: "Health decision about a specific child" };
  }
  if (H5.some((r) => r.test(t))) return { category: "H5", reason: "Charge dispute or exception request" };
  if (H6.some((r) => r.test(t))) return { category: "H6", reason: "Complaint or incident" };
  return { category: null, reason: "" };
}

// Phrases that would commit the center. Checked on every sentence the model writes.
const COMMITMENT = [
  /\bi('ve| have) (booked|approved|confirmed|scheduled|reserved|arranged|processed|cancel+ed|waived|refunded|added)\b/,
  /\b(you're|you are) (all )?(set|booked|approved|confirmed|good to go)\b/,
  /\bwe('ll| will) (make|provide|give|hold|reserve|waive|refund|approve|book|keep|save|take care of|cover)\b/,
  /\b(is|has been|have been|are) (approved|confirmed|booked|processed|waived|refunded|reserved)\b/,
  /\bno problem\b/,
  /\bguarantee/,
  /\b(she|he|they|maya) (can|may|should) (come|attend|stay|return|go) (in|to|today|tomorrow)\b/,
  /\b(she|he|they|maya) (can'?t|cannot|should not|shouldn't) (come|attend|return)\b/,
];

export function commitmentHits(text: string): string[] {
  const t = normalize(text);
  return COMMITMENT.filter((r) => r.test(t)).map((r) => r.source);
}
