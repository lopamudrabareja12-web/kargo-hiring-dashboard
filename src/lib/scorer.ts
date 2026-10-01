/** Rate one redacted CV for one role. Shared by the app pipeline and the calibration script. */
import type { Role } from "./constants";
import type { CriterionRow, RubricVersionRow } from "./db";
import { generateJson } from "./gemini";
import { makeScoreValidator, pmScoringPrompt, scoreSchema, scoringSystem, spmScoringPrompt } from "./prompts";
import { applySpmCap, evidenceInCv, weightedTotal } from "./scoring";

export interface RatedCriterion {
  criterion_id: string;
  score: number;
  model_score: number;
  capped: boolean;
  reason: string;
  evidence: string;
  evidence_verified: boolean;
}

export async function rateCv(args: {
  role: Role;
  cv: string;
  guardName: string | null;
  version: RubricVersionRow;
  criteria: Record<Role, CriterionRow[]>;
  /** Required for SPM when the rubric makes SPM depend on PM. Keyed by PM criterion id. */
  pmScores?: Map<string, { score: number; reason: string }>;
}): Promise<{ headline: string; rows: RatedCriterion[]; total: number; cappedCount: number }> {
  const { role, cv, version, criteria } = args;
  const crit = criteria[role];
  const pmScores = args.pmScores ?? new Map();
  const prompt = role === "PM" ? pmScoringPrompt(crit, cv, version) : spmScoringPrompt(crit, criteria.PM, pmScores, cv, version);

  const out = await generateJson({
    label: `${role} scoring`,
    system: scoringSystem(version),
    prompt,
    schema: scoreSchema,
    validate: makeScoreValidator(crit, version.max_score),
    guardName: args.guardName,
    trusted: [
      version.scoring_rules,
      ...Object.values(version.role_notes ?? {}).filter((x): x is string => !!x),
      ...criteria.PM.map((c) => c.description),
      ...criteria.SPM.map((c) => c.description),
    ],
  });

  let cappedCount = 0;
  const rows = crit.map((cr) => {
    const item = out.criteria.find((i) => i.criterion === cr.sort_order)!;
    let score = Math.max(0, Math.min(cr.max_score, item.score));
    let capped = false;
    if (role === "SPM") {
      const pmC = criteria.PM.find((p) => p.name === cr.name) ?? criteria.PM.find((p) => p.sort_order === cr.sort_order);
      const r = applySpmCap(item.score, pmC ? pmScores.get(pmC.id)?.score : undefined, cr.max_score, version.spm_requires_pm_strong);
      score = r.score;
      capped = r.capped;
      if (capped) cappedCount++;
    }
    return {
      criterion_id: cr.id,
      score,
      model_score: item.score,
      capped,
      reason: item.reason.trim(),
      evidence: item.evidence.trim(),
      evidence_verified: evidenceInCv(item.evidence, cv),
    };
  });
  const total = weightedTotal(
    rows.map((r) => ({ score: r.score, maxScore: version.max_score, weight: Number(crit.find((x) => x.id === r.criterion_id)!.weight) })),
  );
  return { headline: out.headline, rows, total, cappedCount };
}
