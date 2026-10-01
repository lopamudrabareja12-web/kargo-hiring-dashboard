# CLAUDE.md: Kargo Hiring Dashboard

This file is the full project context. Read it before every task. The build brief is in `PROMPT.md`.

## Who this is for

- **Student building it:** Lopa, MESA "AI and its Application", Founder's Office, Cohort C4. This is Case 2. The build runs across session L4 (Mon 28 Sep 2026) and session B (Tue 29 Sep 2026).
- **User of the tool (fictional):** Arjun Mehta, founder of **Kargo**, a Series A logistics SaaS company in Mumbai. Kargo automates shipment tracking, documentation and carrier coordination for mid-sized freight forwarders. It is scaling from 40 to 70 people by December. There is no HR function, so Arjun is the hiring manager for every role.
- Kargo, Arjun and all data are fictional (a teaching case). Candidate emails in the CVs are course test addresses.

## The problem

- Two roles open since July: **Product Manager (PM)** and **Senior Product Manager (SPM)**. Both report to Arjun; there is no Head of Product.
- 11 weeks: **60 applications, 19 opened, 0 offers.** Two strong candidates got a "let's chat" reply in August, and neither conversation happened.
- Every review starts from scratch, late at night, on instinct. No notes, no criteria, no record of why anyone was shortlisted or passed.
- The deeper issue: Arjun evaluates against the job spec, but the spec does not predict success. His best past hires share a pattern the spec never asked for. That pattern has never been named.
- Roles staying open costs sprint ownership, roadmap decisions and investor targets. Nineteen people who had their application opened heard nothing, which is hurting Kargo's reputation.

## What Arjun wants

- **Success = an offer to the right person before year-end.** Not a cleaner process.
- A shortlist he can trust: people who look like his **best** hires (still at Kargo and thriving), not people who match the JD.
- Per candidate: who they are, why they rank there, what to probe in the interview.
- After his decision, nothing for him to chase, draft or remember. Rejected candidates hear back too.
- **"The system recommends. Arjun decides. That decision is the last thing he touches."**
- Class goal: a ranked shortlist per role with enough reasoning that Arjun can make a call in **under 10 minutes**.

## The Nine Checks (from the lecture deck) and the Cut

| # | Check | Verdict |
|---|---|---|
| 01 | Problem real? | YES: 60 received, 19 opened, 0 offers in 11 weeks |
| 02 | Workflow repeated? | YES: applications arrive weekly; review-and-stall repeats each batch |
| 03 | Input available? | YES: 60 CVs, 8 hire profiles, 2 role specs |
| 04 | Output valuable? | YES: a ranked, explained shortlist replaces 60 unreviewed PDFs |
| 05 | Impact measurable? | YES: baseline 0 offers in 11 weeks; target first offer within 2 weeks |
| 06 | Failure risk OK? | YES for ranking and scoring. **NO for auto-rejection**: a wrongly rejected candidate never returns |
| 07 | Judgment protected? | YES: Arjun reviews every shortlist and confirms every send |
| 08 | ROI worth it? | YES: a PM hire = 6–12 months of product velocity |
| 09 | Owner clear? | YES for the shortlist. **NO for auto-rejection**: no named person accountable |

**The Cut:** Arjun asked for emails to rejected and selected candidates to go out without him managing them. That is killed by Checks 06 and 09.
- **Automated:** extraction, scoring, ranking, brief generation, email drafting.
- **Stays human:** shortlist review, the confirm-to-send on **each** email, the hiring call.
- Therefore: **no auto-send, no bulk send, no scheduled send.** One confirm per email.

## The rubric: where it must come from

- The rubric comes from the **8 past hire profiles** (`context/hires/`, ratings in `context/hires/hires-outcomes.md`). The JDs are used only to understand the roles. **Never score against the JDs.**
- The class process (checkpoint L4-1) builds `rubric.txt` in Claude Chat: 4 to 6 criteria per role, weights summing to 100% per role, the SPM bar higher on independent operation, each criterion traceable to a specific hire.
- `rubric.txt` is the source of truth. If only `rubric.draft.txt` exists, use it and label the rubric version `draft-1` in the database and UI.
- Patterns found in the hire CVs (detail in `rubric.draft.txt`):
  1. Hands-on work inside a messy operation. All 5 Exceeds hires had it. Preetham (Below) integrated with logistics only through APIs.
  2. Self-started fixes that others adopted: Rohan's Excel tracker, Sunita's weekend workflow redesign, Lavanya's dashboard, Meghna's checklist.
  3. Candour about failure: Aditya's lost-deal post-mortem; Lavanya killing features and writing the outage post-mortem.
  - Anti-signal: credentials. Vikram has the best credentials (XLRI MBA, certifications) and was rated Meets.
- Caveat: n = 8, only 2 PMs. Treat criteria as weighted signals, not knockouts.

## Architecture (see `context/components-map-detailed.html`)

Trigger → Input → Context → Processing → AI → Output:

1. **Trigger/Input:** Arjun uploads a CV (PDF/DOCX) and selects the applied role.
2. **Context (plain code, no AI):** parse the text; split name, email, phone and links into a private `candidate_pii` table; produce redacted `cv_content`. A guardrail blocks any AI call if PII patterns remain.
3. **Processing:** Gemini rates the redacted CV per criterion, on the scale the rubric defines (class rubric: 0 weak / 1 partial / 2 strong), plus a one-line reason and an evidence quote, for **both** PM and SPM. **Code** computes weighted totals, ranks per applied role, draws the line (top 5 per role), and flags cross-role fit.
4. **AI:** Gemini writes a 3-sentence brief for the top 5 per role, and a draft email for everyone (invite above the line, warm rejection below), with a `[NAME]` placeholder.
5. **Output:** a ranked dashboard. Arjun reviews and edits, then clicks **Confirm & send** per candidate. Code swaps in the real name, Resend sends it, and the record is marked sent and logged.

## Deliberate decisions (and why)

- **PII is extracted in code, not by Gemini.** The professor's "What to use when" table lists Gemini for PII extraction, but that would send the raw CV (with PII) to the AI, contradicting "personal details never sent to any AI step". We keep the stated principle.
- **The AI rates; code adds up.** This makes totals reproducible and explainable. Use `temperature: 0` with a response schema.
- **Both roles are scored for everyone**, because a PM applicant may be a strong SPM, and the other way round.
- **Password login** on the dashboard. It sits on a public Vercel URL with personal data.
- **Server-side Supabase only** (service-role key), with RLS on and no public policies. The browser never gets DB keys.
- **Data minimisation:** don't keep the original CV file after extraction. Provide a Delete candidate action.

## Stack (from the professor's execution plan)

| Tool | Role |
|---|---|
| Claude Chat | Rubric design, before any code |
| Claude Code | Where the project lives and gets built |
| Gemini Flash (`@google/genai`, default `gemini-2.5-flash`) | Scoring, brief, email draft |
| Supabase | Candidates, PII, scores, rubric criteria, emails, events |
| Vercel | Hosts the dashboard and routes (Next.js 15, App Router, TypeScript) |
| GitHub | Saves progress between sessions (private repo) |
| Resend | Sends email on confirm (`onboarding@resend.dev` on the free tier) |

## Checkpoints (grading follows these; see `context/professor-answer-key-execution-plan.pdf`)

- **L4-1:** `rubric.txt` built in Claude Chat.
- **L4-2 (done by minute 60 of L4):** project built, `.env.local` filled (leave `RESEND_API_KEY` blank), pushed to GitHub, deployed on Vercel. **Done when** the Vercel URL opens the upload page with no errors and `rubric_criteria` has one row per criterion per role.
- **B-1:** upload 3 CVs (strong PM, weak SPM, ambiguous) and verify: PII in its own field; `cv_content` has no name/email/phone; both PM and SPM scores; ranked dashboard with per-criterion breakdown; top candidate has a 3-sentence brief; everyone has a draft (invite for top, rejection for others). Then upload all 60. **Done when** all 60 are scored, the top 5 per role have a brief and invite, and everyone else has a rejection draft.
- **B-2:** add `RESEND_API_KEY` in Vercel and redeploy. Confirm sends to the stored (MESA test) address within 30 s, with the real name, not `[NAME]`, and the sent status updates.
- **B-3:** full loop with 2 new CVs (upload → scored → review → confirm → received) in under 5 minutes. Push the final code.
- **Data Privacy Block (must be able to answer):**
  1. On the Gemini AI Studio free tier, inputs may be used to improve Google's models; on the billed API they aren't.
  2. Separating personal details at ingestion, so every AI call gets content only (the identifier stays in Supabase), is what supports DPDP compliance: purpose limitation, data minimisation, deletion on request.

## Repo map

```
CLAUDE.md                  this file
PROMPT.md                  the build brief (first message)
START_HERE.md              human instructions for Lopa
rubric.txt                 FINAL rubric from class (add it; source of truth)
rubric.draft.txt           draft rubric from the hire CVs (fallback)
jds/                       the 2 JDs (to be added) - role understanding only
applications/              the 60 CVs (to be added; gitignored)
context/
  case-problem-statement.pdf
  professor-answer-key-execution-plan.pdf
  lecture-4-deck.pdf
  components-map-class-version.png
  components-map-detailed.html
  hires/  8 hire CVs (.docx), hires-text.md, hires-outcomes.md
```

## Working rules for Claude Code

- Plan first, then build after OK. Commit after each working milestone.
- Never commit `.env.local`, `applications/` or any real CV. Check `.gitignore` before the first push.
- Never log PII. Never send raw CV text, names, emails or phones to Gemini.
- Never add auto/bulk/scheduled sending, or any criterion not in the rubric.
- Keep the UI plain and fast: an internal tool for one person.
- When something fails, show a readable error in the UI with a Retry button, rather than failing silently.
- Missing input (JDs, rubric.txt, keys): say so plainly and continue with what's available. Don't invent content.
