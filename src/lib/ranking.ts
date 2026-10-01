/** Ranking, the line, ties and cross-role fit. Pure functions, computed in code. */
import { MIN_SCORE, ROLES, SHORTLIST_SIZE, otherRole, type Role } from "./constants";

export interface RankCriterion {
  name: string;
  weight: number;
  sortOrder: number;
  score: number;
}

export interface RankInput {
  id: string;
  appliedRole: Role;
  totals: Record<Role, number>;
  criteria: Record<Role, RankCriterion[]>;
}

export type Band = "above" | "top5_below_bar" | "below";

export interface RankResult {
  id: string;
  role: Role;
  total: number;
  isApplied: boolean;
  rank: number;
  inTop5: boolean;
  aboveLine: boolean;
  band: Band;
  tiedCount: number;
  tiebreakNote: string | null;
  crossRoleFit: boolean;
}

export type EmailKind = "invite" | "invite_plus_other" | "invite_other_role" | "rejection";

/** Criteria in tie-break order: highest weight first, then rubric order. */
function tieOrder(criteria: RankCriterion[]): RankCriterion[] {
  return [...criteria].sort((a, b) => b.weight - a.weight || a.sortOrder - b.sortOrder);
}

/** Negative if a ranks ahead of b. Returns the deciding criterion too. */
export function compareCandidates(
  a: RankInput,
  b: RankInput,
  role: Role,
): { cmp: number; decidedBy: RankCriterion | null } {
  if (a.totals[role] !== b.totals[role]) return { cmp: b.totals[role] - a.totals[role], decidedBy: null };
  const bByName = new Map(b.criteria[role].map((c) => [c.name, c]));
  for (const ca of tieOrder(a.criteria[role])) {
    const cb = bByName.get(ca.name);
    if (cb && ca.score !== cb.score) return { cmp: cb.score - ca.score, decidedBy: ca };
  }
  return { cmp: 0, decidedBy: null };
}

/** Competition rank ("1, 2, 2, 4"): 1 + number of people strictly ahead. */
function rankWithin(target: RankInput, pool: RankInput[], role: Role): number {
  return 1 + pool.filter((p) => p.id !== target.id && compareCandidates(p, target, role).cmp < 0).length;
}

function tieInfo(c: RankInput, pool: RankInput[], role: Role): { tiedCount: number; note: string | null } {
  const sameTotal = pool.filter((p) => p.id !== c.id && p.totals[role] === c.totals[role]);
  if (!sameTotal.length) return { tiedCount: 0, note: null };
  const fullyTied = sameTotal.filter((p) => compareCandidates(c, p, role).cmp === 0);
  const deciders = new Map<string, { name: string; weight: number; ahead: number; behind: number }>();
  for (const p of sameTotal) {
    const { cmp, decidedBy } = compareCandidates(c, p, role);
    if (!decidedBy) continue;
    const d = deciders.get(decidedBy.name) ?? { name: decidedBy.name, weight: decidedBy.weight, ahead: 0, behind: 0 };
    if (cmp < 0) d.ahead++;
    else d.behind++;
    deciders.set(decidedBy.name, d);
  }
  const parts: string[] = [`Tied on total ${c.totals[role]} with ${sameTotal.length} other${sameTotal.length > 1 ? "s" : ""}.`];
  for (const d of [...deciders.values()].sort((x, y) => y.weight - x.weight)) {
    const bits = [];
    if (d.ahead) bits.push(`ahead of ${d.ahead}`);
    if (d.behind) bits.push(`behind ${d.behind}`);
    parts.push(`"${d.name}" (${d.weight}%) put them ${bits.join(" and ")}.`);
  }
  if (fullyTied.length) {
    parts.push(`Identical on every criterion with ${fullyTied.length}: shared rank.`);
  }
  return { tiedCount: fullyTied.length, note: parts.join(" ") };
}

/**
 * For each candidate and each role:
 *  - applied role: rank among people who applied for it, the line, the band and ties
 *  - other role: where they WOULD rank among that role's applicants (for cross-role fit)
 */
export function computeRankings(inputs: RankInput[]): RankResult[] {
  const results: RankResult[] = [];
  const pools: Record<Role, RankInput[]> = {
    PM: inputs.filter((c) => c.appliedRole === "PM"),
    SPM: inputs.filter((c) => c.appliedRole === "SPM"),
  };

  for (const c of inputs) {
    for (const role of ROLES) {
      const isApplied = c.appliedRole === role;
      const pool = pools[role];
      const rank = rankWithin(c, pool, role);
      const total = c.totals[role];
      const inTop5 = rank <= SHORTLIST_SIZE;
      const aboveLine = inTop5 && total >= MIN_SCORE;
      const tie = isApplied ? tieInfo(c, pool, role) : { tiedCount: 0, note: null };
      results.push({
        id: c.id,
        role,
        total,
        isApplied,
        rank,
        inTop5: isApplied && inTop5,
        aboveLine: isApplied && aboveLine,
        band: isApplied ? (aboveLine ? "above" : inTop5 ? "top5_below_bar" : "below") : "below",
        tiedCount: tie.tiedCount,
        tiebreakNote: tie.note,
        crossRoleFit: false,
      });
    }
  }

  // Cross-role fit: their score for the OTHER role would put them above that role's line.
  for (const r of results.filter((x) => x.isApplied)) {
    const other = results.find((x) => x.id === r.id && x.role === otherRole(r.role))!;
    r.crossRoleFit = other.rank <= SHORTLIST_SIZE && other.total >= MIN_SCORE;
  }
  return results;
}

/** Which email the system recommends. Arjun can override it (logged). */
export function recommendedEmailKind(applied: Pick<RankResult, "aboveLine" | "crossRoleFit">): EmailKind {
  if (applied.aboveLine) return applied.crossRoleFit ? "invite_plus_other" : "invite";
  if (applied.crossRoleFit) return "invite_other_role";
  return "rejection";
}

export function emailTypeOf(kind: EmailKind): "invite" | "rejection" {
  return kind === "rejection" ? "rejection" : "invite";
}

export const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  invite: "Interview invite",
  invite_plus_other: "Interview invite (mentions the other role too)",
  invite_other_role: "Invite for the other role",
  rejection: "Rejection",
};

export const BAND_LABEL: Record<Band, string> = {
  above: "Above the line",
  top5_below_bar: `Top 5, below bar (<${MIN_SCORE})`,
  below: "Below the line",
};
