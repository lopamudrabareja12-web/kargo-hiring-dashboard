import { existsSync, readFileSync } from "node:fs";
import type { CriterionRow, RubricVersionRow } from "../src/lib/db";
import { parseRubric, type ParsedRubric } from "../src/lib/rubric-parse";
import type { Role } from "../src/lib/constants";

/** rubric.txt is the source of truth; rubric.draft.txt is the fallback (labelled draft-1). */
export function readRubricFile(): { file: string; text: string; parsed: ParsedRubric } {
  const file = existsSync("rubric.txt") ? "rubric.txt" : "rubric.draft.txt";
  if (!existsSync(file)) throw new Error("Neither rubric.txt nor rubric.draft.txt exists in the project folder.");
  if (file !== "rubric.txt") console.warn("⚠ rubric.txt not found: using rubric.draft.txt (labelled draft-1).");
  const text = readFileSync(file, "utf8");
  return { file, text, parsed: parseRubric(text, file) };
}

/** In-memory rubric rows (no database), for calibration. */
export function localRubric(): { version: RubricVersionRow; criteria: Record<Role, CriterionRow[]>; text: string } {
  const { file, text, parsed } = readRubricFile();
  const version: RubricVersionRow = {
    id: "local", label: parsed.label, source_file: file, content_hash: parsed.contentHash, max_score: parsed.maxScore,
    scoring_rules: parsed.scoringRules, role_notes: parsed.roleNotes, spm_requires_pm_strong: parsed.spmRequiresPmStrong,
    is_active: true, created_at: new Date().toISOString(),
  };
  const rows: CriterionRow[] = parsed.criteria.map((c) => ({
    id: `${c.role}-${c.sortOrder}`, version_id: "local", role: c.role, name: c.name, description: c.description,
    max_score: c.maxScore, weight: c.weight, sort_order: c.sortOrder,
  }));
  return { version, criteria: { PM: rows.filter((r) => r.role === "PM"), SPM: rows.filter((r) => r.role === "SPM") }, text };
}
