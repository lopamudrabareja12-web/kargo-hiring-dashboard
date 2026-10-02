# Kargo Hiring Dashboard

An internal tool for one person: Arjun Mehta, founder of Kargo. He uploads CVs and gets a ranked shortlist per role (PM and SPM), the reasoning behind every score, a 3-sentence interview brief for the top 5, and a draft email for everyone. **Nothing is sent without his click, one email at a time.**

Kargo, Arjun and all candidates are fictional (MESA case study). Context and decisions are in [`CLAUDE.md`](CLAUDE.md).

## How it works

```
Upload CV + role ──► Parse text (pdf-parse / mammoth). The file itself is discarded.
                 ──► Code (no AI) splits name / email / phone / links into candidate_pii
                     and writes a redacted cv_content. A guardrail blocks any AI call that
                     still contains an email, a 10-digit phone or the name.
                 ──► Gemini rates cv_content on every PM criterion (0/1/2 + reason + quote)
                 ──► Gemini rates the SPM criteria (SPM > 0 needs PM = Strong: enforced in code)
                 ──► Code: weighted totals, ranks per applied role, the line, ties, cross-role fit
                 ──► Gemini: 3-sentence brief (top 5) and an email draft for everyone, with [NAME]
                 ──► Arjun reviews, edits, previews the exact email ──► Confirm & send (Resend)
```

- **The line** = top `SHORTLIST_SIZE` (5) by total among people who applied for that role **and** a total of at least `MIN_SCORE` (50). Both are in `src/lib/constants.ts`.
  - Someone in the top 5 but under 50 is shown as **"Top 5, below bar"**. They get a brief (so Arjun can make the call) and a rejection draft by default.
- **Ties:** equal totals are ordered by the highest-weighted criterion, then the next. The dashboard shows which criterion decided each tie. Candidates identical on every criterion share a rank, so more than 5 can be above the line; the header count says so.
- **Cross-role fit:** the candidate's score for the *other* role would put them above that role's line. Their invite mentions the other role. If they're below the line in their own role, they get an invite for the other role instead.
- **Email types:** the system recommends one. Arjun can override it with a reason, which goes in the decision log. When a candidate crosses the line after re-ranking, their draft is rewritten, unless Arjun edited it. In that case it's flagged **Draft outdated** and his text is kept.
- **Scores** come from `rubric.txt`, the class rubric built from the 8 past hires. If it's missing, `rubric.draft.txt` is used and labelled `draft-1`. The job descriptions are **never** used for scoring.

## Setup

Requirements: Node 20+, a Supabase project, a Gemini API key (from a project with billing enabled, see *Data privacy*), and later a Resend account.

```bash
npm install
cp .env.example .env.local      # then fill in the values
```

### Environment variables

| Variable | Required | What it is |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | The **service-role / secret** key. Server-side only, never in the browser. |
| `GEMINI_API_KEY` | yes | Google AI Studio / Gemini API key (billing enabled) |
| `GEMINI_MODEL` | no | Default `gemini-3.1-flash-lite`: it works on the **free** tier (15 requests/min). Full Flash models allow only 20 requests/day free, too few for 60 CVs (about 240 calls). `gemini-2.5-flash` is closed to new API users. |
| `GEMINI_THINKING_BUDGET` | no | Thinking tokens per call. Default `1024`; `0` = off, `-1` = automatic |
| `DASHBOARD_PASSWORD` | yes | The login password. Make it long. |
| `SCHEDULING_LINK` | for invites | Arjun's booking link; replaces `{{SCHEDULING_LINK}}` at send time |
| `SENDER_NAME` | no | Default `Arjun Mehta, Founder, Kargo` |
| `RESEND_API_KEY` | at B-2 | Leave blank until checkpoint B-2. Sending shows a clear error until it's set. |
| `RESEND_FROM` | no | Default `Kargo Hiring <onboarding@resend.dev>` |
| `EMAIL_OVERRIDE_TO` | no | If set, **every** send goes to this address, with `[TEST] original recipient: …` added to the body |

> **Resend free tier:** the `onboarding@resend.dev` sender only delivers to the email address of your own Resend account. To receive test emails, either set `EMAIL_OVERRIDE_TO` to that address, or verify a domain in Resend.

### Database (one-time)

1. In Supabase, open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), and run it. It creates every table with RLS on and no public policies.
2. Load the rubric:

```bash
npm run seed:rubric
```

The seed step parses `rubric.txt` and checks there are 4 to 6 criteria per role with weights summing to 100. It fails loudly if not. Then it writes one `rubric_criteria` row per criterion per role and prints them. Re-run it whenever `rubric.txt` changes; a changed file becomes a new version.

### Run locally

```bash
npm run dev          # http://localhost:3000
npm test             # unit + pipeline tests (no keys needed)
npm run calibrate    # scores the 8 past-hire CVs with Gemini and compares to the rubric's calibration table
```

Run `calibrate` once you have a Gemini key.

**Calibration result (gemini-3.1-flash-lite, free tier, class-1 rubric):** all 5 Exceeds hires scored 65–100 and every other hire scored under 50, so the 50 bar separates Exceeds from the rest. 27/40 criterion scores matched the rubric's hand scores exactly, and 39/40 were within one point. One miss: Preetham (Below) scored 47.5, above both Meets hires (35 and 20), though all three stay below the bar. Same CV, same rubric gave identical scores across repeated runs.

 It goes through the same redact → guardrail → score code as the app, and prints each hire's scores next to the rubric's own calibration (e.g. Sunita 90.0, Vikram 45.0). That is the best check that the prompts apply the rubric as intended.

### Other scripts

| Command | What it does |
|---|---|
| `npm run seed:jds` | Loads JDs from `jds/` (PDF/DOCX/TXT). The file name must contain `PM`, or `Senior`/`SPM`. They're used only for role context in briefs and emails. |
| `npm run redraft` | Regenerates briefs and unedited, unsent drafts (e.g. after adding JDs). **Doesn't re-score.** |
| `npm run rescore-check` | Re-scores 3 candidates without saving and reports any criterion that changed (reproducibility check) |
| `npm run rescore` | Re-scores candidates scored with an older rubric (`-- --all` for everyone) |
| `npm run check` | Checks the Supabase and Gemini keys in `.env.local` work (prints no secrets) |
| `npm run load:applications` | Loads every PDF/DOCX in `applications/` through the real pipeline, one at a time (free-tier friendly), skipping duplicates and resuming half-finished ones. The role comes from the file name: `spm_…` is SPM, `pm_…` is PM, anything else is PM. Logs only the file number, never a name. Sends no email. |
| `npm run load:samples` | Loads the 8 fictional past-hire CVs from `context/hires/` as demo applicants (for demos only; delete them before loading real applicants) |
| `npm run redraft -- --emails-only` | Rewrites unedited, unsent email drafts without touching briefs or scores |

## Deploy to Vercel

1. Confirm `.env.local` and `applications/` are ignored: `git check-ignore .env.local applications/x.pdf` should print both.
2. Push to a **private** GitHub repo.
3. In Vercel: **Add New → Project →** import the repo (the framework is detected as Next.js).
4. Under **Settings → Environment Variables**, add the same variables as `.env.local`.
5. Deploy. Open the URL, log in, and check the Upload page and `/rubric`.
6. **Checkpoint B-2:** add `RESEND_API_KEY` in Vercel and **redeploy**.

Each API route has `maxDuration = 60`. The pipeline runs one step per request (score PM, score SPM and rank, draft), so no single request does more than one or two Gemini calls.

## Using it

1. **Upload:** pick the role, drop files. Two are processed at a time, each with a live status (extracting → scoring → drafting → done), errors show a reason and a Retry button, and duplicates are skipped.
   - If a name can't be found confidently, the candidate waits as **needs name**. Nothing is sent to AI until Arjun types the name, which is then removed from the text too.
2. **Dashboard:** PM/SPM tabs, ranked, with the line drawn after the last above-the-line row. Filters, and `j`/`k`/`Enter` to move and open.
3. **Candidate:**
   - Both role scores side by side. Per criterion: weight, score, reason and the evidence quote. A quote not found word-for-word in the CV is flagged.
   - The brief and the email editor.
   - **Confirm & send…** shows the exact final email with the real name and recipient. **Send** sends that email only, once.
   - **Show what the AI saw** reveals the redacted text.
   - **Delete candidate** removes every row for that person.
4. **Rubric:** a read-only view of the criteria, weights and versions, and which version scored how many candidates.

## Day to day (after the first batch)

1. Arjun saves a new CV as a PDF or Word file.
2. **Upload CVs** → pick PM or SPM → drop the file in. About a minute later it is scored for both roles, ranked against everyone already there, and has an email draft.
3. If it lands in the top 5, it gets a brief; anyone it pushes out keeps their brief (hidden). A draft Arjun already edited is never overwritten: it is flagged **Draft outdated** instead.
4. Arjun reviews and clicks **Confirm & send** per person.

The tool does not watch an inbox: a CV only enters when it is uploaded. The same CV uploaded twice is skipped.

## Email: test mode and going live

- Resend's free sender (`onboarding@resend.dev`) only delivers to the address of the Resend account owner. Set `EMAIL_OVERRIDE_TO` to that address: every email then goes there, with `[TEST] original recipient: …` appended, and **never to a candidate**.
- To go live: verify a domain in Resend, set `RESEND_FROM` to an address on it, remove `EMAIL_OVERRIDE_TO`, and set `SCHEDULING_LINK` to Arjun's real booking link.
- Every email still needs its own **Confirm & send**. There is no bulk, automatic or scheduled sending.

## Notes from running it on real CVs

- **PDF text is messy.** Contact lines are often repeated and glued together (`+91 98202 1134598202 11345`), profile links sit against the previous word, and names appear inside web-address slugs. Redaction therefore matches Indian mobiles on their own shape, removes names with any separator or inside slugs, and the guardrail blocks any AI call that still contains a phone number, email, profile link or the candidate's name. Regression tests cover these shapes.
- **Unreadable files** (scanned images, under 200 characters of text) are rejected with a readable reason; ask for a text PDF or DOCX.
- **Null characters** in PDF text are stripped before saving (Postgres rejects them).
- **The free Gemini tier** is enough for this: use `gemini-3.1-flash-lite` (15 requests per minute). Expect roughly 45 to 50 minutes for 50 CVs.

## Data privacy

**Personal details are separated at ingestion, in code.** Name, email, phone and profile links are pulled out with regex and heuristics, never by an LLM, and stored in a separate `candidate_pii` table. The CV text that's kept (`cv_content`) has them replaced with tokens like `[NAME]` and `[EMAIL]`. Lines for address, date of birth, age, gender, marital status, nationality and similar are replaced too.

**Gemini only ever receives redacted content.** Every Gemini call goes through one function (`src/lib/gemini.ts`). It runs the guardrail first, and the call fails if the text still contains an email pattern, a 10-digit phone pattern or the candidate's name. Name substitution happens only at send time, in code (`src/lib/send.ts`), so the AI writes `[NAME]` and never sees the real one.
- The rubric itself quotes past hires by first name. Those fixed rubric passages are skipped by the *name* check only, so an applicant who happens to be called Rahul isn't blocked. Everything from the candidate is still checked.

**Use the billed Gemini API.** On the free Google AI Studio tier, Google may use the inputs you send to improve its models. With billing enabled (the paid API), inputs aren't used that way. Even with redaction, CV content is personal career data, so use a key from a project with billing on.

**Raw files aren't kept.** The uploaded PDF/DOCX is parsed in memory and discarded. Only `cv_content` (redacted) and the `candidate_pii` row are stored.

**Access control.**
- All database access is server-side with the service-role key.
- RLS is on for every table, with no policies, so the public/anon key can read nothing.
- The browser never receives database keys.
- Every page and API route needs the dashboard password (httpOnly cookie, checked in middleware).

**Logs** never contain CV text, names, emails or phones. Error messages name the kind of problem only, and the decision log (`events`) stores actions and numbers, not contact details.

**How this maps to India's DPDP Act, 2023:**

| DPDP principle | How the system supports it |
|---|---|
| **Purpose limitation** | Contact details are used for one purpose: contacting the candidate about their application. They're read only to display the name and to send the email Arjun confirms. They never go to the AI, which only sees the content needed to assess the application. |
| **Data minimisation** | Raw files are discarded. Protected attributes (age, gender, marital status, nationality, photo) are stripped before storage and never used. The AI gets content only, never identifiers. |
| **Deletion on request** | **Delete candidate** removes every row for that person across all tables (cascade), including scores, drafts and history. Only an anonymous "a candidate was deleted" event remains. |
| **Accountability** | Every send needs an individual confirm by a named person (Arjun), and the `events` table records uploads, scores, line changes, overrides (with his reason), edits and sends. |

In a real deployment you'd also add a privacy notice to candidates, a retention period (e.g. delete unsuccessful candidates after N months), and a data processing agreement with each provider (Supabase, Google, Resend, Vercel).

## What's deliberately not here

No auto-rejection, no bulk send, no scheduled send: each email needs its own confirm ("the Cut", Checks 06 and 09). No scoring against the JDs. No AI "overall fit" number: totals are computed in code. No multi-user roles, ATS integrations or analytics.
