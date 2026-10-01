# PROMPT.md: first message to Claude Code

> Paste everything below the line as your first message in Claude Code, from inside this folder.

---

I'm building an internal hiring dashboard for one person: Arjun Mehta, founder of Kargo, a Series A logistics SaaS startup in Mumbai. He has two open roles, Product Manager (PM) and Senior Product Manager (SPM). After 11 weeks he has 60 CVs, has opened 19, and has made zero offers. He reviews late at night, on gut feel, with no record of why. This tool gives him a ranked shortlist he can trust, the reasoning behind every rank, and a draft email for every candidate. **Arjun makes every decision. Nothing goes out without his click.**

The full context is in this folder. **Read `CLAUDE.md` first**; it holds the case, the Nine Checks and the Cut, the hire pattern analysis, the architecture decisions and the class checkpoints. Then read:
- `rubric.txt`: the scoring standard, with 4 to 6 criteria each for PM and SPM, a description and a weight per criterion, and weights adding to 100% per role. It was derived from Kargo's 8 past hires, **not** from the job descriptions. **If `rubric.txt` is missing, use `rubric.draft.txt`** and label the rubric version `draft-1` in the database and UI.
- `jds/`: the 2 job descriptions, if present. Use them only to understand the roles for the brief and emails. **Never score against them.** If they're missing, carry on without them.
- `context/hires/`: the 8 hire CVs and their ratings, for background.
- `context/components-map-detailed.html` and `context/professor-answer-key-execution-plan.pdf`: the target architecture and the checkpoints I'm graded on.

Before writing code, give me a short plan: the schema, the pipeline, the pages, and anything in the rubric that's ambiguous. Wait for my OK, then build it all.

## Stack (fixed; don't substitute)

- **Next.js 15** (App Router, TypeScript, server actions / route handlers). Plain Tailwind; no component library needed.
- **Supabase** (Postgres) for all data. Server-side access only, with the service-role key. The browser never talks to Supabase directly.
- **Gemini Flash** for every AI step, through the official `@google/genai` SDK. Model name comes from `GEMINI_MODEL` (default `gemini-2.5-flash`).
- **Resend** for email.
- **Vercel** for hosting. **GitHub** for version control.
- Env vars in `.env.local` (placeholders only; I'll add the real keys): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `RESEND_API_KEY` (leave blank for now), `RESEND_FROM` (default `Kargo Hiring <onboarding@resend.dev>`), `DASHBOARD_PASSWORD`, `SCHEDULING_LINK`, `SENDER_NAME` (default `Arjun Mehta, Founder, Kargo`). Also create `.env.example`, and confirm `.env.local` and `applications/` are in `.gitignore` **before** the first commit.

## Design philosophy

An internal tool for one busy person. Fast, clear, fully functional, with no decorative design. Success means Arjun can go from opening the dashboard to a confident decision on a candidate **in under 10 minutes**, with every number explained.

## The pipeline, one CV at a time

Trigger: Arjun uploads one or more CVs (PDF or DOCX) and selects the role they applied for.

### 1. Extract and separate personal details (Context step, plain code, no AI)
- Parse the text (`pdf-parse` for PDF, `mammoth` for DOCX). Reject files with fewer than ~200 characters of text and tell Arjun why (likely a scanned image).
- **In code, not with an LLM**, pull out name, email, phone, and profile links (LinkedIn, GitHub, etc.) with regex and heuristics. The name is usually the first short line of capitalised words; fall back to the filename. Store them in a private `candidate_pii` table.
- Produce `cv_content`: the CV text with the name (full and each part), email, phone, links, and lines for address, DOB, age, gender, marital status or nationality replaced by tokens like `[NAME]` or `[EMAIL]`.
- **Guardrail:** before *any* Gemini call, run a check that fails the job if `cv_content` still contains an email pattern, a 10-digit phone pattern, or the extracted name. Write unit tests for this.
- If the name can't be found confidently, mark the candidate `needs_name` so Arjun can type it in. Never fall back to sending the raw CV to Gemini.
- Don't keep the original file after extraction (data minimisation). Store only `cv_content` and the PII row.

### 2. Score against BOTH rubrics (Processing step; AI rates, code calculates)
- One Gemini call per role (PM and SPM) for **every** candidate, whatever role they applied for. Send only `cv_content` plus that role's criteria (name + description) from the database.
- Use structured output (`responseSchema`) and `temperature: 0`. For each criterion return `score` (an integer on **the scale defined in the rubric file**; the class rubric uses 0 = weak, 1 = partial, 2 = strong, scored against that criterion's strong/partial/weak descriptions and examples; use 0–10 only if the rubric defines no scale), `reason` (one line, citing something specific from the CV), and `evidence` (a short quote from the CV, or empty if there's no evidence).
- System prompt rules: score only on what is written. Absence of evidence scores low. Never reward college name, employer brand, certifications or years of experience by themselves. Never infer from gender, age, name or location.
- **The weighted total is computed in code**, not by the model: `sum(score / max_score × weight)` → 0–100. Store per-criterion results and totals for both roles.
- Ranking per role is among candidates who **applied** for that role. The **line** is the top 5 per role (make `SHORTLIST_SIZE` a constant). Flag `cross_role_fit` when a candidate would make the other role's top 5 (for example, a strong PM applicant who scores into the SPM top 5).
- Ranks and the line recompute whenever a new candidate is scored.

### 3. Interview brief (AI step, top 5 per role only)
- Exactly **three sentences**: who they are professionally; why they rank where they do (naming the top-weighted criteria and evidence); what Arjun should probe in the interview (the weakest criterion or an unverified claim).
- Input: the scores, reasons and evidence plus `cv_content`. Never PII.
- If a candidate moves into the top 5 after a new upload, generate their brief then. If they drop out, keep the brief but hide it.

### 4. Draft email (AI step, every candidate)
- Top 5 in their applied role: a warm, specific **interview invite**. It references one or two concrete things from their background and asks them to book at `{{SCHEDULING_LINK}}`. Under 150 words.
- Everyone else: a **warm, human rejection**. It thanks them, says clearly they aren't moving forward for this role, mentions one genuine positive from their CV, makes no false promises, and avoids HR boilerplate. Under 120 words.
- Candidates flagged `cross_role_fit` get an invite that mentions the other role.
- The model writes `[NAME]` wherever the name goes. **Real-name substitution happens in code at send time** from `candidate_pii`, so the AI never sees the name.
- If a candidate crosses the line after re-ranking, redraft their email (unless Arjun already edited or sent it). Show "draft outdated" rather than silently overwriting his edits.

### 5. Review and send (Output step, human gate)
- Arjun reads the brief and draft, can edit subject and body inline, and clicks **Confirm & send**. An in-page confirm step shows the exact final email with the real name filled in and the recipient address. No browser `confirm()` dialogs.
- Only then: substitute the real name, call Resend, and store `resend_id`, `sent_at`, `sent_to`, the final text, and whether it was edited. The candidate is marked **Sent**; a second send is impossible.
- **No bulk send, no auto-send, no scheduled send.** Each email needs its own confirm. This is a deliberate product decision (it's "the Cut" from my case analysis): a wrong rejection can't be undone, and every sent rejection must have a named person accountable for it.
- Recipient is the email stored in `candidate_pii`. In this project those are course test addresses. Add an optional `EMAIL_OVERRIDE_TO` env var that, when set, redirects every send to that address and appends "[TEST] original recipient: …" to the body.

## Data model (Supabase)

Please propose the final version, but roughly:
- `rubric_criteria`: id, role (`PM` | `SPM`), name, description (store the full strong / partial / weak text, examples and the SPM bar), max_score, weight (numeric %), sort_order. **Seed it by parsing `rubric.txt` (or `rubric.draft.txt`)** with a script (`npm run seed:rubric`). Validate that weights add to 100 per role, and fail loudly if they don't.
- `candidates`: id, applied_role, cv_content, status (`processing` | `scored` | `needs_name` | `error`), error, created_at.
- `candidate_pii`: candidate_id, name, email, phone, links. **Separate table**, read only by the send step and the UI name display.
- `scores`: candidate_id, role, criterion_id, score, reason, evidence; plus `role_totals` (candidate_id, role, total, rank, above_line, cross_role_fit), or a view that computes them.
- `briefs`: candidate_id, role, text, generated_at.
- `emails`: candidate_id, type (`invite` | `rejection`), subject, body_template (with `[NAME]`), edited, outdated, confirmed_at, sent_at, sent_to, resend_id, final_body.
- `events`: candidate_id, at, action, detail. Log uploads, scoring, overrides, edits and sends, so there's finally a record of why every decision was made.
- Enable RLS on every table with **no** public policies (all access is server-side with the service role).

## Pages

1. **Login**: a single password (`DASHBOARD_PASSWORD`), stored in an httpOnly cookie and checked by middleware on every page and API route. The app holds personal data on a public URL, so this is not optional.
2. **Upload** (`/upload`): role selector (PM / SPM) plus a multi-file drop zone. Upload files one request per CV with concurrency 2 and show live per-file status (extracting → scoring → drafting → done / error + retry). Skip duplicates by content hash. Each route handler sets `maxDuration = 60`.
3. **Dashboard** (`/`): tabs for PM and SPM. A table ranked by score: rank, name, headline (current role, from cv_content), total, a mini per-criterion bar, above/below the line, cross-role flag, email status (Draft / Edited / Sent). A clear visual line after rank 5. Filters: above the line, below the line, not yet sent, sent. Header counts: applicants, reviewed, sent. Keyboard: `j`/`k` to move, `Enter` to open.
4. **Candidate** (`/candidates/[id]`): name and contact (from PII); the score for both roles side by side; the per-criterion table (score, weight, reason, evidence quote); the 3-sentence brief (top 5); the draft email editor; **Confirm & send**; the event history. Also a "Show what the AI saw" toggle revealing `cv_content`, so Arjun can confirm no personal details went out.
5. **Rubric** (`/rubric`): read-only view of the criteria and weights per role, and which version scored each candidate.

## Quality bar

- Every score is explainable: a reason plus evidence per criterion, and totals computed in code. Same CV, same rubric → same score. Re-scoring a candidate must give the same criterion scores (and so the same total); if it doesn't, tell me.
- Gemini calls retry with backoff on 429/5xx, time out cleanly, and validate the JSON against the schema. Invalid output → one retry → `error` status with a readable message and a Retry button.
- No PII in logs, Gemini prompts, or client bundles. Grep the codebase for any place that could leak it and tell me what you checked.
- Unit tests (Vitest) for: redaction and the guardrail, weighted-total maths, rank and line calculation, `[NAME]` substitution.
- A `README.md` with setup, env vars, the seed step, deploying to Vercel, and a "Data privacy" section. That section should cover: separating personal details at ingestion; Gemini only ever receiving redacted content; using the **billed** Gemini API (on the free AI Studio tier Google may use inputs to improve its models); not keeping raw files; and how this maps to India's DPDP Act (purpose limitation, data minimisation, deletion on request). Add a **Delete candidate** action that removes every row for that person.

## Don't build

- Auto-rejection, bulk send, or any send without an individual confirm.
- Scoring against the job descriptions, or criteria not in `rubric.txt`.
- An AI "overall fit" number that code didn't compute from the criteria.
- Any AI call that receives the raw CV, the name, email or phone.
- Photos, age or other protected attributes anywhere in the pipeline.
- Anything beyond what one founder needs: no multi-user roles, no ATS integrations, no analytics.

## Done when (I'll test in this order)

1. The Vercel URL opens the login, then the upload page, with no errors. `rubric_criteria` has one row per criterion per role, weights summing to 100 each.
2. I upload 3 CVs (a clear strong PM, a clear weak SPM, an ambiguous one). Each gets: a PII row with name/email/phone; `cv_content` with no name, email or phone anywhere; scores for **both** PM and SPM with a reason per criterion; the dashboard ranking them; a 3-sentence brief for those above the line; and a draft invite or rejection for everyone.
3. I upload all 60. Every one is scored, the top 5 per role have briefs and invite drafts, everyone else has a rejection draft, and nothing errors without a visible reason.
4. Once `RESEND_API_KEY` is set, **Confirm & send** on one candidate delivers to the test inbox within 30 seconds. The body has the real name (never `[NAME]`), the card shows Sent, and a second send is blocked.
5. The full loop (upload a new CV → scored → review → confirm → email received) runs in under 5 minutes.

Commit to GitHub after each working milestone with clear messages.
