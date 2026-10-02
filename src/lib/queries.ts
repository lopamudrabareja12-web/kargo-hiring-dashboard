/** Read models for the pages. Server-only. */
import type { Role } from "./constants";
import {
  db, must,
  type BriefRow, type CandidateRow, type CriterionRow, type EmailRow, type EventRow, type PiiRow, type RoleTotalRow,
  type RubricVersionRow, type ScoreRow,
} from "./db";
import { env } from "./env";
import { schedulingLinkProblem } from "./link";
import { activeRubric, desiredKind, pendingDraftIds } from "./pipeline";
import type { EmailKind } from "./ranking";

export type EmailStatus = "None" | "Draft" | "Edited" | "Outdated" | "Sent" | "Send failed";

function emailStatus(e: Pick<EmailRow, "sent_at" | "outdated" | "edited" | "send_error"> | undefined): EmailStatus {
  if (!e) return "None";
  if (e.sent_at) return "Sent";
  if (e.send_error) return "Send failed";
  if (e.outdated) return "Outdated";
  if (e.edited) return "Edited";
  return "Draft";
}

export interface DashboardRow {
  id: string;
  name: string;
  headline: string | null;
  status: CandidateRow["status"];
  stage: CandidateRow["stage"];
  error: string | null;
  total: number | null;
  otherTotal: number | null;
  rank: number | null;
  band: RoleTotalRow["band"] | null;
  inTop5: boolean;
  tiedCount: number;
  tiebreakNote: string | null;
  crossRoleFit: boolean;
  criteria: { name: string; weight: number; score: number; max: number }[];
  emailStatus: EmailStatus;
  emailType: EmailRow["type"] | null;
  emailKind: EmailKind | null;
  recommendedKind: EmailKind | null;
  hasBrief: boolean;
  reviewed: boolean;
  staleRubric: boolean;
}

export interface Dashboard {
  role: Role;
  rubricLabel: string;
  criteria: CriterionRow[];
  rows: DashboardRow[];
  counts: { applicants: number; reviewed: number; sent: number; aboveLine: number; top5BelowBar: number; problems: number };
  pendingDrafts: number;
  /** Set when unsent invites exist but SCHEDULING_LINK is missing or a placeholder. */
  bookingLinkProblem: string | null;
}

export async function getDashboard(role: Role): Promise<Dashboard> {
  // Independent reads go out together: each round trip to the database costs a few hundred ms.
  const [rubric, candsRes, pendingIds] = await Promise.all([
    activeRubric({ cached: true }),
    db().from("candidates").select("id, headline, status, stage, error, reviewed_at, rubric_version_id, created_at").eq("applied_role", role).order("created_at"),
    pendingDraftIds(),
  ]);
  const cands = must(candsRes, "loading candidates") as CandidateRow[];
  const ids = cands.map((c) => c.id);
  const inIds = <T,>(table: string, cols: string) =>
    ids.length ? db().from(table).select(cols).in("candidate_id", ids) : Promise.resolve({ data: [] as T[], error: null });

  const [piiRes, totRes, scRes, emRes, brRes] = await Promise.all([
    inIds<PiiRow>("candidate_pii", "candidate_id, name"),
    inIds<RoleTotalRow>("role_totals", "*"),
    inIds<ScoreRow>("scores", "candidate_id, role, criterion_id, score"),
    inIds<EmailRow>("emails", "candidate_id, type, kind, override_kind, edited, outdated, sent_at, send_error"),
    inIds<BriefRow>("briefs", "candidate_id, role, hidden"),
  ]);
  const pii = must(piiRes as never, "loading names") as Pick<PiiRow, "candidate_id" | "name">[];
  const totals = must(totRes as never, "loading ranks") as RoleTotalRow[];
  const scores = must(scRes as never, "loading scores") as Pick<ScoreRow, "candidate_id" | "role" | "criterion_id" | "score">[];
  const emails = must(emRes as never, "loading emails") as EmailRow[];
  const briefs = must(brRes as never, "loading briefs") as BriefRow[];

  const crit = rubric.criteria[role];
  const rows: DashboardRow[] = cands.map((c) => {
    const t = totals.find((x) => x.candidate_id === c.id && x.role === role);
    const o = totals.find((x) => x.candidate_id === c.id && x.role !== role);
    const e = emails.find((x) => x.candidate_id === c.id);
    const b = briefs.find((x) => x.candidate_id === c.id && x.role === role);
    return {
      id: c.id,
      name: pii.find((p) => p.candidate_id === c.id)?.name ?? "(name needed)",
      headline: c.headline,
      status: c.status,
      stage: c.stage,
      error: c.error,
      total: t ? Number(t.total) : null,
      otherTotal: o ? Number(o.total) : null,
      rank: t?.rank ?? null,
      band: t?.band ?? null,
      inTop5: !!t?.in_top5,
      tiedCount: t?.tied_count ?? 0,
      tiebreakNote: t?.tiebreak_note ?? null,
      crossRoleFit: !!t?.cross_role_fit,
      criteria: crit.map((cr) => ({
        name: cr.name, weight: Number(cr.weight), max: cr.max_score,
        score: scores.find((s) => s.candidate_id === c.id && s.criterion_id === cr.id)?.score ?? 0,
      })),
      emailStatus: emailStatus(e),
      emailType: e?.type ?? null,
      emailKind: e?.kind ?? null,
      recommendedKind: t ? desiredKind(t, null) : null,
      hasBrief: !!b && !b.hidden,
      reviewed: !!c.reviewed_at,
      staleRubric: !!c.rubric_version_id && c.rubric_version_id !== rubric.version.id,
    };
  });

  rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || (b.total ?? -1) - (a.total ?? -1));
  const ranked = rows.filter((r) => r.rank !== null);
  return {
    role,
    rubricLabel: rubric.version.label,
    criteria: crit,
    rows,
    counts: {
      applicants: rows.length,
      reviewed: rows.filter((r) => r.reviewed).length,
      sent: rows.filter((r) => r.emailStatus === "Sent").length,
      aboveLine: ranked.filter((r) => r.band === "above").length,
      top5BelowBar: ranked.filter((r) => r.band === "top5_below_bar").length,
      problems: rows.filter((r) => r.status === "error" || r.status === "needs_name" || r.staleRubric).length,
    },
    pendingDrafts: pendingIds.length,
    bookingLinkProblem: rows.some((r) => r.emailType === "invite" && r.emailStatus !== "Sent") ? schedulingLinkProblem(env.schedulingLink()) : null,
  };
}

export interface CandidateDetail {
  candidate: CandidateRow;
  pii: PiiRow | null;
  rubric: { current: RubricVersionRow; scoredWith: RubricVersionRow | null };
  roles: Record<Role, {
    total: RoleTotalRow | null;
    poolSize: number;
    criteria: (CriterionRow & { result: ScoreRow | null })[];
  }>;
  brief: BriefRow | null;
  email: EmailRow | null;
  recommendedKind: EmailKind | null;
  events: EventRow[];
}

export async function getCandidate(id: string): Promise<CandidateDetail | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const candidate = must(await db().from("candidates").select("*").eq("id", id).maybeSingle(), "loading the candidate") as CandidateRow | null;
  if (!candidate) return null;
  const rubric = await activeRubric({ cached: true });
  const [pii, totals, scores, brief, email, events, scoredWith, poolPM, poolSPM] = await Promise.all([
    db().from("candidate_pii").select("*").eq("candidate_id", id).maybeSingle(),
    db().from("role_totals").select("*").eq("candidate_id", id),
    db().from("scores").select("*").eq("candidate_id", id),
    db().from("briefs").select("*").eq("candidate_id", id).eq("role", candidate.applied_role).maybeSingle(),
    db().from("emails").select("*").eq("candidate_id", id).maybeSingle(),
    db().from("events").select("*").eq("candidate_id", id).order("at", { ascending: false }).limit(100),
    candidate.rubric_version_id
      ? db().from("rubric_versions").select("*").eq("id", candidate.rubric_version_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db().from("role_totals").select("candidate_id", { count: "exact", head: true }).eq("role", "PM").eq("is_applied", true),
    db().from("role_totals").select("candidate_id", { count: "exact", head: true }).eq("role", "SPM").eq("is_applied", true),
  ]);
  const t = must(totals, "loading ranks") as RoleTotalRow[];
  const s = must(scores, "loading scores") as ScoreRow[];
  const roleBlock = (role: Role, pool: number) => ({
    total: t.find((x) => x.role === role) ?? null,
    poolSize: pool,
    criteria: rubric.criteria[role].map((cr) => ({ ...cr, result: s.find((x) => x.criterion_id === cr.id) ?? null })),
  });
  const applied = t.find((x) => x.role === candidate.applied_role);
  const emailRow = must(email, "loading the email") as EmailRow | null;
  return {
    candidate,
    pii: must(pii, "loading contact details") as PiiRow | null,
    rubric: { current: rubric.version, scoredWith: (scoredWith.data as RubricVersionRow | null) ?? null },
    roles: { PM: roleBlock("PM", poolPM.count ?? 0), SPM: roleBlock("SPM", poolSPM.count ?? 0) },
    brief: must(brief, "loading the brief") as BriefRow | null,
    email: emailRow,
    recommendedKind: applied ? desiredKind(applied, null) : null,
    events: must(events, "loading history") as EventRow[],
  };
}

export async function getRubricPage() {
  const versions = must(await db().from("rubric_versions").select("*").order("created_at", { ascending: false }), "loading rubric versions") as RubricVersionRow[];
  const active = versions.find((v) => v.is_active) ?? null;
  const criteria = active
    ? (must(await db().from("rubric_criteria").select("*").eq("version_id", active.id).order("sort_order"), "loading criteria") as CriterionRow[])
    : [];
  const cands = must(await db().from("candidates").select("rubric_version_id"), "loading candidates") as { rubric_version_id: string | null }[];
  const jds = must(await db().from("role_context").select("role, source_file, updated_at"), "loading JDs") as { role: Role; source_file: string | null; updated_at: string }[];
  const counts = new Map<string, number>();
  for (const c of cands) counts.set(c.rubric_version_id ?? "none", (counts.get(c.rubric_version_id ?? "none") ?? 0) + 1);
  return { versions, active, criteria, counts, jds };
}
