/** Scoring maths. The AI rates each criterion; this file does the adding up. */

export interface CriterionScore {
  criterionId: string;
  name: string;
  weight: number; // percent
  sortOrder: number;
  maxScore: number;
  score: number;
}

/** sum(score / max_score × weight), rounded to one decimal. 0–100. */
export function weightedTotal(scores: Pick<CriterionScore, "score" | "maxScore" | "weight">[]): number {
  const raw = scores.reduce((sum, s) => sum + (s.score / s.maxScore) * s.weight, 0);
  return Math.round(raw * 10) / 10;
}

/**
 * Rubric rule: "To score 2 for SPM, the CV must pass the PM Strong test AND the SPM bar."
 * So if the PM score for the same criterion is below max, the SPM score is 0.
 * Applied in code so the model can't break the rule.
 */
export function applySpmCap(
  spmModelScore: number,
  pmScore: number | undefined,
  maxScore: number,
  enabled: boolean,
): { score: number; capped: boolean } {
  const clamped = Math.max(0, Math.min(maxScore, Math.round(spmModelScore)));
  if (!enabled || pmScore === undefined) return { score: clamped, capped: false };
  if (pmScore < maxScore && clamped > 0) return { score: 0, capped: true };
  return { score: clamped, capped: false };
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[‘’]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Is the evidence quote really in the CV? (Shown to Arjun as verified / not found.) */
export function evidenceInCv(evidence: string, cvContent: string): boolean {
  const e = normalise(evidence).replace(/^\.\.\.|\.\.\.$/g, "").trim();
  if (!e) return false;
  const cv = normalise(cvContent);
  if (cv.includes(e)) return true;
  // Allow quotes stitched with "..." if every piece is present.
  const parts = e.split(/\s*(?:\.\.\.|…)\s*/).map((p) => p.replace(/^[.,;:\s-]+|[.,;:\s-]+$/g, "")).filter((p) => p.length > 8);
  return parts.length > 1 && parts.every((p) => cv.includes(p));
}
