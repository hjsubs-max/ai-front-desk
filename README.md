# AI Front Desk (take-home prototype)

A prototype AI front desk for a fictional child care center, Sunnyside Daycare. Parents get today's answers and can tell the center about changes in one tap; staff see every answer, fix gaps once, and decide what the assistant may say. Every name, policy and price is invented.

## How answers are made

1. **Safety screen (code).** Patterns catch emergencies, safeguarding, health decisions about a child, pickup authority, billing disputes and complaints. Net 1 of 2.
2. **Routing (Claude).** The model returns a structured route: intent, a *described* date ("the day after Thanksgiving"), handbook section, and its own must-go-to-a-person flag (net 2). It never writes the answer.
3. **Facts (code).** Dates are resolved in code and fact sentences are written from the center's records by templates, so "open" versus "closed" can't be misstated by the model.
4. **Policy wording (Claude, checked in code).** For policy questions only, the model words a short answer from one quoted handbook passage. Code checks that required conditions are kept, no numbers were added and nothing commits the center; on any failure the handbook text is shown word for word.
5. **Operator controls (code).** Per-topic settings (AI answers / AI drafts, staff send / always a person), requests that staff confirm, and handoffs with reply-by times.

If the model is unavailable, a rule-based router takes over, and the same router is the baseline in the quality checks.

## Quality checks

`lib/evals/cases.ts` holds four sets: development, sealed (written before tuning and never used for fixes), over-escalation (harmless questions with alarming words) and manipulation. All checks are code. Run them from `/team`, or locally with `node --experimental-strip-types scripts/run-evals.ts [rules|haiku|sonnet]`.

## Running it

- `npm install`, then `npm run dev`.
- Environment variables (set in Vercel, never committed): `ANTHROPIC_API_KEY`, optional `CLAUDE_MODEL` (default `claude-haiku-5-5`), optional `TEAM_CODE` to gate Sonnet runs, and `BLOB_READ_WRITE_TOKEN` plus `BLOB_ACCESS` when a Vercel Blob store is connected (for the clickstream and stored quality-check runs).

Each visitor gets their own copy of the center in their browser, so one person's edits never change what the next person sees.
