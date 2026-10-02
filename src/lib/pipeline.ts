/**
 * The pipeline: ingest → score PM → score SPM (+ rank) → brief + draft.
 * Each step is a separate request so every route stays well under Vercel's 60 s.
 */
import { otherRole, type Role } from "./constants";
import {
  db, logEvent, must,
  type BriefRow, type CandidateRow, type CriterionRow, type EmailRow, type PiiRow, type RoleTotalRow,
  type RubricVersionRow, type ScoreRow,
} from "./db";
import { env } from "./env";
import { contentHash, extractText } from "./extract";
import { generateJson } from "./gemini";
import { assertNoPii, extractAndRedact, PiiLeakError, redactName } from "./pii";
import {
  BRIEF_SYSTEM, briefPrompt, briefSchema, emailPrompt, emailSchema, emailSystem, makeEmailValidator, validateBrief,
} from "./prompts";
import { rateCv } from "./scorer";
import { computeRankings, emailTypeOf, recommendedEmailKind, type EmailKind, type RankInput } from "./ranking";
import { weightedTotal } from "./scoring";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PipelineError extends Error {}

/** The action would throw away something Arjun wrote; the caller must confirm explicitly. */
export class NeedsConfirmation extends PipelineError {}

/** The candidate (or id) does not exist. Becomes a 404, never a database message. */
export class NotFoundError extends PipelineError {
  constructor(message = "Candidate not found (it may have been deleted).") {
    super(message);
  }
}

/* ----------------------------- Loaders ----------------------------- */

export interface ActiveRubric {
  version: RubricVersionRow;
  criteria: Record<Role, CriterionRow[]>;
}

// The rubric changes only when someone re-seeds it, so page views may reuse it for a minute.
// Anything that scores or writes always reads it fresh.
let rubricCache: { at: number; value: ActiveRubric } | null = null;
const RUBRIC_CACHE_MS = 60_000;

export async function activeRubric(opts: { cached?: boolean } = {}): Promise<ActiveRubric> {
  if (opts.cached && rubricCache && Date.now() - rubricCache.at < RUBRIC_CACHE_MS) return rubricCache.value;
  const value = await loadActiveRubric();
  rubricCache = { at: Date.now(), value };
  return value;
}

async function loadActiveRubric(): Promise<ActiveRubric> {
  const version = must(
    await db().from("rubric_versions").select("*").eq("is_active", true).maybeSingle(),
    "loading the rubric",
  ) as RubricVersionRow | null;
  if (!version) throw new PipelineError("No rubric is loaded. Run `npm run seed:rubric` first.");
  const rows = must(
    await db().from("rubric_criteria").select("*").eq("version_id", version.id).order("sort_order"),
    "loading rubric criteria",
  ) as CriterionRow[];
  const criteria = { PM: rows.filter((r) => r.role === "PM"), SPM: rows.filter((r) => r.role === "SPM") };
  for (const c of rows) c.weight = Number(c.weight);
  return { version, criteria };
}

async function loadCandidate(id: string): Promise<CandidateRow> {
  if (!UUID_RE.test(id)) throw new NotFoundError();
  const c = must(await db().from("candidates").select("*").eq("id", id).maybeSingle(), "loading the candidate");
  if (!c) throw new NotFoundError();
  return c as CandidateRow;
}

async function loadPii(id: string): Promise<PiiRow | null> {
  return must(await db().from("candidate_pii").select("*").eq("candidate_id", id).maybeSingle(), "loading contact details") as PiiRow | null;
}

async function jdFor(role: Role): Promise<string | null> {
  const r = await db().from("role_context").select("jd_text").eq("role", role).maybeSingle();
  return (r.data as { jd_text: string } | null)?.jd_text ?? null;
}

/* ----------------------------- Ingest ------------------------------ */

export type IngestResult =
  | { kind: "created"; id: string; stage: CandidateRow["stage"]; needsName: boolean }
  | { kind: "duplicate"; id: string; role: Role };

export async function ingest(buffer: Buffer, filename: string, role: Role): Promise<IngestResult> {
  const text = await extractText(buffer, filename); // throws ExtractError with a readable reason
  const hash = contentHash(text);

  const existing = must(await db().from("candidates").select("id, applied_role").eq("content_hash", hash).maybeSingle(), "checking duplicates") as { id: string; applied_role: Role } | null;
  if (existing) return { kind: "duplicate", id: existing.id, role: existing.applied_role };

  const { pii, cvContent } = extractAndRedact(text, filename);
  const needsName = !pii.name || !pii.nameConfident;

  let blocked: string | null = null;
  try {
    assertNoPii(cvContent, pii.name);
  } catch (e) {
    if (!(e instanceof PiiLeakError)) throw e;
    blocked = `${e.message} Redaction did not catch everything; this CV will not be sent to AI. Delete it and fix the file, or contact the developer.`;
  }

  const ins = await db()
    .from("candidates")
    .insert({
      applied_role: role,
      cv_content: cvContent,
      content_hash: hash,
      status: blocked ? "error" : needsName ? "needs_name" : "processing",
      stage: needsName ? "needs_name" : "extracted",
      error: blocked,
    })
    .select("id, stage")
    .single();
  if (ins.error?.code === "23505") {
    const dup = must(await db().from("candidates").select("id, applied_role").eq("content_hash", hash).single(), "checking duplicates") as { id: string; applied_role: Role };
    return { kind: "duplicate", id: dup.id, role: dup.applied_role };
  }
  const cand = must(ins, "saving the candidate") as { id: string; stage: CandidateRow["stage"] };

  const piiIns = await db().from("candidate_pii").insert({
    candidate_id: cand.id,
    name: pii.name,
    name_confident: pii.nameConfident,
    email: pii.email,
    phone: pii.phone,
    links: pii.links,
    source_filename: filename,
  });
  if (piiIns.error) {
    await db().from("candidates").delete().eq("id", cand.id);
    must(piiIns, "saving contact details");
  }

  await logEvent(cand.id, "uploaded", {
    role,
    text_chars: text.length,
    name_found: !!pii.name,
    needs_name: needsName,
    email_found: !!pii.email,
    phone_found: !!pii.phone,
    original_file_kept: false,
  });
  if (blocked) await logEvent(cand.id, "guardrail_blocked", { at: "ingest" });
  return { kind: "created", id: cand.id, stage: cand.stage, needsName };
}

/** Arjun types (or corrects) the name. Re-redacts cv_content with it. */
export async function setName(id: string, name: string): Promise<CandidateRow["stage"]> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 80) throw new PipelineError("Enter the candidate's full name.");
  const c = await loadCandidate(id);
  const wasVisible = new RegExp(`\\b${clean.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(c.cv_content);
  const cv = redactName(c.cv_content, clean);
  assertNoPii(cv, clean);
  must(await db().from("candidate_pii").update({ name: clean, name_confident: true }).eq("candidate_id", id), "saving the name");
  const stage = c.stage === "needs_name" ? "extracted" : c.stage;
  must(
    await db().from("candidates").update({
      cv_content: cv, stage, status: c.stage === "needs_name" ? "processing" : c.status, error: null, updated_at: new Date().toISOString(),
    }).eq("id", id),
    "saving the redacted CV",
  );
  await logEvent(id, c.stage === "needs_name" ? "name_entered" : "name_corrected", {
    name_was_in_ai_text: c.stage !== "needs_name" && wasVisible,
  });
  return stage;
}

/* ----------------------------- Scoring ----------------------------- */

async function scoreRole(c: CandidateRow, role: Role, rubric: ActiveRubric): Promise<number> {
  const pii = await loadPii(c.id);
  const { version, criteria } = rubric;

  let pmScores = new Map<string, { score: number; reason: string }>();
  if (role === "SPM") {
    const rows = must(
      await db().from("scores").select("criterion_id, score, reason").eq("candidate_id", c.id).eq("role", "PM"),
      "loading PM scores",
    ) as Pick<ScoreRow, "criterion_id" | "score" | "reason">[];
    pmScores = new Map(rows.map((r) => [r.criterion_id, { score: r.score, reason: r.reason }]));
    if (version.spm_requires_pm_strong && criteria.PM.some((p) => !pmScores.has(p.id))) {
      throw new PipelineError("PM scores are missing, and the SPM score depends on them. Press Re-score.");
    }
  }

  const { headline, rows, total, cappedCount } = await rateCv({
    role, cv: c.cv_content, guardName: pii?.name ?? null, version, criteria, pmScores,
  });

  must(await db().from("scores").delete().eq("candidate_id", c.id).eq("role", role), "clearing old scores");
  must(await db().from("scores").insert(rows.map((r) => ({ ...r, candidate_id: c.id, role }))), "saving scores");
  if (role === "PM" && headline) {
    must(await db().from("candidates").update({ headline: headline.trim().slice(0, 120) }).eq("id", c.id), "saving the headline");
  }
  await logEvent(c.id, "scored", {
    role, total, rubric: version.label, spm_capped_by_pm: role === "SPM" ? cappedCount : undefined,
    unverified_quotes: rows.filter((r) => r.evidence && !r.evidence_verified).length,
  });
  return total;
}

/* ----------------------------- Ranking ----------------------------- */

const RANKED_STAGES = ["scored", "drafted"];

/** Recompute totals, ranks, the line, ties and cross-role fit for everyone. Code only. */
export async function recomputeRankings(): Promise<void> {
  const rubric = await activeRubric();
  const { version, criteria } = rubric;
  const cands = must(
    await db().from("candidates").select("id, applied_role").in("stage", RANKED_STAGES).eq("rubric_version_id", version.id),
    "loading candidates for ranking",
  ) as { id: string; applied_role: Role }[];
  const ids = cands.map((c) => c.id);

  const scoreRows: Pick<ScoreRow, "candidate_id" | "role" | "criterion_id" | "score">[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    scoreRows.push(
      ...(must(
        await db().from("scores").select("candidate_id, role, criterion_id, score").in("candidate_id", chunk),
        "loading scores for ranking",
      ) as typeof scoreRows),
    );
  }
  const byCand = new Map<string, Map<string, number>>();
  for (const s of scoreRows) {
    if (!byCand.has(s.candidate_id)) byCand.set(s.candidate_id, new Map());
    byCand.get(s.candidate_id)!.set(s.criterion_id, s.score);
  }

  const inputs: RankInput[] = cands.map((c) => {
    const sc = byCand.get(c.id) ?? new Map();
    const crit = (role: Role) =>
      criteria[role].map((cr) => ({ name: cr.name, weight: Number(cr.weight), sortOrder: cr.sort_order, score: sc.get(cr.id) ?? 0, maxScore: cr.max_score }));
    return {
      id: c.id,
      appliedRole: c.applied_role,
      totals: { PM: weightedTotal(crit("PM")), SPM: weightedTotal(crit("SPM")) },
      criteria: { PM: crit("PM"), SPM: crit("SPM") },
    };
  });
  const results = computeRankings(inputs);

  const old = must(await db().from("role_totals").select("candidate_id, role, band, is_applied"), "loading previous ranks") as Pick<RoleTotalRow, "candidate_id" | "role" | "band" | "is_applied">[];
  const oldBand = new Map(old.filter((o) => o.is_applied).map((o) => [o.candidate_id, o.band]));

  if (results.length) {
    must(
      await db().from("role_totals").upsert(
        results.map((r) => ({
          candidate_id: r.id, role: r.role, total: r.total, is_applied: r.isApplied, rank: r.rank, in_top5: r.inTop5,
          above_line: r.aboveLine, band: r.band, tied_count: r.tiedCount, tiebreak_note: r.tiebreakNote,
          cross_role_fit: r.crossRoleFit, rubric_version_id: version.id, computed_at: new Date().toISOString(),
        })),
        { onConflict: "candidate_id,role" },
      ),
      "saving ranks",
    );
  }
  // Rows for candidates no longer ranked (deleted, or scored with an older rubric).
  const stale = [...new Set(old.map((o) => o.candidate_id))].filter((id) => !ids.includes(id));
  if (stale.length) must(await db().from("role_totals").delete().in("candidate_id", stale), "clearing stale ranks");

  const applied = results.filter((r) => r.isApplied);
  for (const r of applied) {
    const was = oldBand.get(r.id);
    if (was && was !== r.band) await logEvent(r.id, "line_changed", { role: r.role, from: was, to: r.band, rank: r.rank, total: r.total });
  }

  // Briefs: hide when out of the top 5, show again when back in.
  const briefs = must(await db().from("briefs").select("candidate_id, role, hidden"), "loading briefs") as Pick<BriefRow, "candidate_id" | "role" | "hidden">[];
  for (const b of briefs) {
    const r = applied.find((x) => x.id === b.candidate_id && x.role === b.role);
    const shouldHide = !r || !r.inTop5;
    if (shouldHide !== b.hidden) {
      await db().from("briefs").update({ hidden: shouldHide }).eq("candidate_id", b.candidate_id).eq("role", b.role);
      await logEvent(b.candidate_id, shouldHide ? "brief_hidden" : "brief_shown", { role: b.role });
    }
  }

  // Emails: an edited draft whose recommended type changed is flagged, never overwritten.
  const emails = must(await db().from("emails").select("candidate_id, kind, override_kind, edited, outdated, sent_at"), "loading emails") as Pick<EmailRow, "candidate_id" | "kind" | "override_kind" | "edited" | "outdated" | "sent_at">[];
  for (const e of emails) {
    const r = applied.find((x) => x.id === e.candidate_id);
    if (!r || e.sent_at) continue;
    const desired = e.override_kind ?? recommendedEmailKind(r);
    const outdated = e.kind !== desired && e.edited;
    if (outdated !== e.outdated) {
      await db().from("emails").update({ outdated }).eq("candidate_id", e.candidate_id);
      if (outdated) await logEvent(e.candidate_id, "draft_outdated", { now_recommended: desired, draft_is: e.kind });
    }
  }
}

/* --------------------------- Step runner --------------------------- */

export async function runStep(id: string): Promise<{ stage: CandidateRow["stage"]; status: CandidateRow["status"] }> {
  const c = await loadCandidate(id);
  if (c.stage === "needs_name") throw new PipelineError("Enter the candidate's name first, so it can be removed before AI sees the CV.");
  if (c.stage === "drafted") return { stage: c.stage, status: c.status };
  const set = async (patch: Partial<CandidateRow>) =>
    must(await db().from("candidates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id), "updating the candidate");

  try {
    if (c.status === "error") await set({ status: RANKED_STAGES.includes(c.stage) ? "scored" : "processing", error: null });
    const rubric = await activeRubric();
    if (c.stage === "extracted") {
      await scoreRole(c, "PM", rubric);
      await set({ stage: "scored_pm" });
      return { stage: "scored_pm", status: "processing" };
    }
    if (c.stage === "scored_pm") {
      await scoreRole(c, "SPM", rubric);
      await set({ stage: "scored", status: "scored", rubric_version_id: rubric.version.id });
      await recomputeRankings();
      return { stage: "scored", status: "scored" };
    }
    // stage === "scored"
    await draftFor(id);
    await set({ stage: "drafted" });
    return { stage: "drafted", status: "scored" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await set({ status: "error", error: message.slice(0, 500) });
    await logEvent(id, "error", { stage: c.stage, message: message.slice(0, 300) });
    throw err;
  }
}

/** Clear scores so the step runner scores again (e.g. after a rubric change). */
export async function resetForRescore(id: string): Promise<void> {
  const c = await loadCandidate(id);
  if (c.stage === "needs_name") throw new PipelineError("Enter the candidate's name first.");
  must(await db().from("scores").delete().eq("candidate_id", id), "clearing scores");
  must(await db().from("briefs").delete().eq("candidate_id", id), "clearing the brief");
  must(await db().from("role_totals").delete().eq("candidate_id", id), "clearing ranks");
  must(await db().from("candidates").update({ stage: "extracted", status: "processing", error: null }).eq("id", id), "resetting");
  await logEvent(id, "rescore_requested", {});
}

/* ----------------------------- Drafting ---------------------------- */

interface DraftContext {
  c: CandidateRow;
  rubric: ActiveRubric;
  applied: RoleTotalRow;
  other: RoleTotalRow | undefined;
  brief: BriefRow | null;
  email: EmailRow | null;
}

async function draftContext(id: string): Promise<DraftContext> {
  const c = await loadCandidate(id);
  const rubric = await activeRubric();
  const totals = must(await db().from("role_totals").select("*").eq("candidate_id", id), "loading ranks") as RoleTotalRow[];
  const applied = totals.find((t) => t.role === c.applied_role);
  if (!applied) throw new PipelineError("This candidate has not been ranked yet. Press Retry.");
  const brief = must(await db().from("briefs").select("*").eq("candidate_id", id).eq("role", c.applied_role).maybeSingle(), "loading the brief") as BriefRow | null;
  const email = must(await db().from("emails").select("*").eq("candidate_id", id).maybeSingle(), "loading the email") as EmailRow | null;
  return { c, rubric, applied, other: totals.find((t) => t.role !== c.applied_role), brief, email };
}

export function desiredKind(applied: Pick<RoleTotalRow, "above_line" | "cross_role_fit">, email: Pick<EmailRow, "override_kind"> | null): EmailKind {
  return email?.override_kind ?? recommendedEmailKind({ aboveLine: applied.above_line, crossRoleFit: applied.cross_role_fit });
}

/** What still needs generating for this candidate (no AI calls). */
export function draftWork(
  applied: Pick<RoleTotalRow, "in_top5" | "above_line" | "cross_role_fit">,
  brief: Pick<BriefRow, "hidden"> | null,
  email: Pick<EmailRow, "kind" | "override_kind" | "edited" | "sent_at"> | null,
): { brief: boolean; email: boolean } {
  const wantKind = desiredKind(applied as RoleTotalRow, email);
  return {
    brief: applied.in_top5 && !brief,
    email: !email || (!email.sent_at && !email.edited && email.kind !== wantKind),
  };
}

async function scoresWithCriteria(id: string, role: Role, rubric: ActiveRubric) {
  const rows = must(await db().from("scores").select("*").eq("candidate_id", id).eq("role", role), "loading scores") as ScoreRow[];
  return rubric.criteria[role].map((cr) => {
    const s = rows.find((r) => r.criterion_id === cr.id);
    return { name: cr.name, weight: Number(cr.weight), score: s?.score ?? 0, reason: s?.reason ?? "", evidence: s?.evidence ?? "" };
  });
}

async function generateBrief(ctx: DraftContext, guardName: string | null) {
  const { c, rubric, applied } = ctx;
  const crit = await scoresWithCriteria(c.id, c.applied_role, rubric);
  const { count } = await db().from("role_totals").select("candidate_id", { count: "exact", head: true }).eq("role", c.applied_role).eq("is_applied", true);
  const jd = await jdFor(c.applied_role);
  const text = await generateJson({
    label: "Interview brief",
    system: BRIEF_SYSTEM,
    prompt: briefPrompt({
      role: c.applied_role, rank: applied.rank ?? 0, poolSize: count ?? 0, band: applied.band, total: Number(applied.total),
      maxScore: rubric.version.max_score, criteria: crit, cv: c.cv_content, jd,
    }),
    schema: briefSchema,
    validate: validateBrief,
    guardName,
  });
  must(
    await db().from("briefs").upsert(
      { candidate_id: c.id, role: c.applied_role, text, hidden: !applied.in_top5, used_jd: !!jd, generated_at: new Date().toISOString() },
      { onConflict: "candidate_id,role" },
    ),
    "saving the brief",
  );
  await logEvent(c.id, "brief_generated", { role: c.applied_role, band: applied.band, used_jd: !!jd });
}

async function generateEmail(ctx: DraftContext, kind: EmailKind, guardName: string | null) {
  const { c, rubric } = ctx;
  const strengthRole = kind === "invite_other_role" ? otherRole(c.applied_role) : c.applied_role;
  const crit = await scoresWithCriteria(c.id, strengthRole, rubric);
  const strengths = crit
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.weight - a.weight)
    .slice(0, 3);
  const jdRole = kind === "invite_other_role" ? otherRole(c.applied_role) : c.applied_role;
  const jd = await jdFor(jdRole);
  const out = await generateJson({
    label: "Email draft",
    system: emailSystem(env.senderName()),
    prompt: emailPrompt({ kind, appliedRole: c.applied_role, cv: c.cv_content, strengths, senderName: env.senderName(), jd }),
    schema: emailSchema,
    validate: makeEmailValidator(kind, env.senderName()),
    guardName,
  });
  must(
    await db().from("emails").upsert(
      {
        candidate_id: c.id, type: emailTypeOf(kind), kind, subject: out.subject, body_template: out.body,
        edited: false, outdated: false, used_jd: !!jd, generated_at: new Date().toISOString(), send_error: null,
        override_kind: ctx.email?.override_kind ?? null,
      },
      { onConflict: "candidate_id" },
    ),
    "saving the email draft",
  );
  await logEvent(c.id, "draft_generated", { kind, used_jd: !!jd, replaced_previous: !!ctx.email });
}

/**
 * Make sure this candidate has what they need: a brief if top 5, and a draft that
 * matches the recommended (or overridden) email type. Never touches sent emails,
 * and never overwrites Arjun's edits unless `forceEmail` (he pressed Regenerate).
 */
export async function draftFor(id: string, opts: { forceEmail?: boolean; forceBrief?: boolean; replaceEdits?: boolean } = {}): Promise<number> {
  const ctx = await draftContext(id);
  if (opts.forceEmail && ctx.email?.edited && !ctx.email.sent_at && !opts.replaceEdits) {
    throw new NeedsConfirmation("This would replace the edits you made to the draft. Confirm to replace them.");
  }
  const pii = await loadPii(id);
  const guardName = pii?.name ?? null;
  let calls = 0;

  if (ctx.applied.in_top5 && (!ctx.brief || opts.forceBrief)) {
    await generateBrief(ctx, guardName);
    calls++;
  }
  const kind = desiredKind(ctx.applied, ctx.email);
  const work = draftWork(ctx.applied, ctx.brief, ctx.email);
  if (ctx.email?.sent_at) {
    if (opts.forceEmail) throw new PipelineError("This email was already sent; it can't be redrafted.");
  } else if (work.email || opts.forceEmail) {
    const hadEdits = !!ctx.email?.edited;
    await generateEmail(ctx, kind, guardName);
    if (hadEdits) await logEvent(id, "draft_replaced", { reason: "Arjun confirmed replacing his edits" });
    calls++;
  }
  return calls;
}

/** Fill in briefs/drafts for anyone whose rank changed. Bounded by time; call again until remaining = 0. */
export async function syncDrafts(budgetMs = 20_000): Promise<{ processed: number; remaining: number; failed: number }> {
  const start = Date.now();
  const todo = await pendingDraftIds();
  let processed = 0;
  let failed = 0;
  for (const id of todo) {
    if (Date.now() - start > budgetMs) break;
    try {
      await draftFor(id);
      await db().from("candidates").update({ stage: "drafted", status: "scored", error: null }).eq("id", id).in("stage", RANKED_STAGES);
      processed++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      await db().from("candidates").update({ status: "error", error: message.slice(0, 500) }).eq("id", id);
    }
  }
  const remaining = (await pendingDraftIds()).length;
  return { processed, remaining, failed };
}

/** Ranked candidates who are missing a brief or whose draft no longer matches. Above-line first. */
export async function pendingDraftIds(): Promise<string[]> {
  const [totalsRes, candsRes, briefsRes, emailsRes] = await Promise.all([
    db().from("role_totals").select("candidate_id, in_top5, above_line, cross_role_fit, rank").eq("is_applied", true),
    db().from("candidates").select("id, status").in("stage", RANKED_STAGES),
    db().from("briefs").select("candidate_id, role, hidden"),
    db().from("emails").select("candidate_id, kind, override_kind, edited, sent_at"),
  ]);
  const totals = must(totalsRes, "loading ranks") as Pick<RoleTotalRow, "candidate_id" | "in_top5" | "above_line" | "cross_role_fit" | "rank">[];
  const cands = must(candsRes, "loading candidates") as { id: string; status: string }[];
  const okIds = new Set(cands.filter((c) => c.status !== "error").map((c) => c.id));
  const briefs = must(briefsRes, "loading briefs") as Pick<BriefRow, "candidate_id" | "hidden">[];
  const emails = must(emailsRes, "loading emails") as Pick<EmailRow, "candidate_id" | "kind" | "override_kind" | "edited" | "sent_at">[];
  const bMap = new Map(briefs.map((b) => [b.candidate_id, b]));
  const eMap = new Map(emails.map((e) => [e.candidate_id, e]));
  return totals
    .filter((t) => okIds.has(t.candidate_id))
    .filter((t) => {
      const w = draftWork(t, bMap.get(t.candidate_id) ?? null, eMap.get(t.candidate_id) ?? null);
      return w.brief || w.email;
    })
    .sort((a, b) => Number(b.in_top5) - Number(a.in_top5) || (a.rank ?? 99) - (b.rank ?? 99))
    .map((t) => t.candidate_id);
}

/* --------------------------- Arjun's edits -------------------------- */

export async function saveEmailEdit(id: string, subject: string, body: string) {
  const e = must(await db().from("emails").select("sent_at, subject, body_template").eq("candidate_id", id).maybeSingle(), "loading the email") as Pick<EmailRow, "sent_at" | "subject" | "body_template"> | null;
  if (!e) throw new PipelineError("There is no draft to edit yet.");
  if (e.sent_at) throw new PipelineError("This email was already sent; it can't be edited.");
  if (subject.trim().length < 3 || body.trim().length < 20) throw new PipelineError("Subject and body can't be empty.");
  if (e.subject === subject.trim() && e.body_template === body.trim()) return;
  must(
    await db().from("emails").update({ subject: subject.trim(), body_template: body.trim(), edited: true }).eq("candidate_id", id),
    "saving your edits",
  );
  await logEvent(id, "draft_edited", { words: body.trim().split(/\s+/).length });
}

export async function setOverride(id: string, kind: EmailKind | null, reason: string, replaceEdits = false) {
  if (kind && reason.trim().length < 5) throw new PipelineError("Write a short reason for the override (it goes in the decision log).");
  const c = await loadCandidate(id);
  const rt = must(await db().from("role_totals").select("*").eq("candidate_id", id).eq("role", c.applied_role).maybeSingle(), "loading ranks") as RoleTotalRow | null;
  if (!rt) throw new PipelineError("Score this candidate before overriding.");
  const e = must(await db().from("emails").select("sent_at, kind, edited").eq("candidate_id", id).maybeSingle(), "loading the email") as Pick<EmailRow, "sent_at" | "kind" | "edited"> | null;
  if (e?.sent_at) throw new PipelineError("This email was already sent.");
  if (e?.edited && !replaceEdits) throw new NeedsConfirmation("Changing the email type rewrites the draft and replaces the edits you made. Confirm to replace them.");
  const recommended = recommendedEmailKind({ aboveLine: rt.above_line, crossRoleFit: rt.cross_role_fit });
  if (e) must(await db().from("emails").update({ override_kind: kind }).eq("candidate_id", id), "saving the override");
  await logEvent(id, kind ? "override" : "override_cleared", { recommended, chosen: kind ?? recommended, reason: reason.trim().slice(0, 500) });
  if (!e) return;
  // Redraft to match the decision (forced: the decision is explicit).
  await draftFor(id, { forceEmail: true, replaceEdits });
}

/**
 * Re-file a candidate under the other role (e.g. uploaded as PM by mistake). Ranks, the line and
 * everyone's drafts are recomputed; a candidate who was already emailed can't be moved.
 */
export async function changeRole(id: string, role: Role) {
  if (role !== "PM" && role !== "SPM") throw new PipelineError("Pick PM or SPM.");
  const c = await loadCandidate(id);
  if (c.applied_role === role) return { role, changed: false };
  const e = must(await db().from("emails").select("sent_at").eq("candidate_id", id).maybeSingle(), "loading the email") as Pick<EmailRow, "sent_at"> | null;
  if (e?.sent_at) throw new PipelineError(`They were already emailed as a ${c.applied_role} applicant, so their role can't be changed.`);
  must(await db().from("candidates").update({ applied_role: role, updated_at: new Date().toISOString() }).eq("id", id), "changing the role");
  // The override (if any) was chosen for the old role; the system recommendation applies again.
  if (e) must(await db().from("emails").update({ override_kind: null }).eq("candidate_id", id), "clearing the override");
  await logEvent(id, "role_changed", { from: c.applied_role, to: role });
  if (c.stage === "scored" || c.stage === "drafted") await recomputeRankings();
  return { role, changed: true };
}

export async function deleteCandidate(id: string) {
  await loadCandidate(id);
  must(await db().from("candidates").delete().eq("id", id), "deleting the candidate"); // cascades to every table
  await logEvent(null, "candidate_deleted", {});
  await recomputeRankings();
}

export async function markReviewed(id: string) {
  const r = await db().from("candidates").update({ reviewed_at: new Date().toISOString() }).eq("id", id).is("reviewed_at", null).select("id");
  if (r.data?.length) await logEvent(id, "reviewed", {});
}

