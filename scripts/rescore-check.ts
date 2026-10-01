/**
 * npm run rescore-check [-- <candidate-id> ...]
 * Re-scores candidates WITHOUT saving and compares every criterion with what is stored.
 * Same CV + same rubric should give the same scores. Defaults to 3 scored candidates.
 */
import { db, must, type PiiRow, type ScoreRow } from "../src/lib/db";
import { activeRubric } from "../src/lib/pipeline";
import { rateCv } from "../src/lib/scorer";

async function main() {
  const rubric = await activeRubric();
  let ids = process.argv.slice(2);
  if (!ids.length) {
    const rows = must(await db().from("candidates").select("id").in("stage", ["scored", "drafted"]).eq("rubric_version_id", rubric.version.id).limit(3), "loading candidates") as { id: string }[];
    ids = rows.map((r) => r.id);
  }
  if (!ids.length) return console.log("No scored candidates with the active rubric yet.");
  let same = 0, total = 0;
  for (const id of ids) {
    const c = must(await db().from("candidates").select("cv_content").eq("id", id).single(), "loading") as { cv_content: string };
    const pii = must(await db().from("candidate_pii").select("name").eq("candidate_id", id).maybeSingle(), "loading") as Pick<PiiRow, "name"> | null;
    const stored = must(await db().from("scores").select("*").eq("candidate_id", id), "loading scores") as ScoreRow[];
    const pm = await rateCv({ role: "PM", cv: c.cv_content, guardName: pii?.name ?? null, ...rubric });
    const spm = await rateCv({ role: "SPM", cv: c.cv_content, guardName: pii?.name ?? null, ...rubric, pmScores: new Map(pm.rows.map((r) => [r.criterion_id, r])) });
    console.log(`\nCandidate ${id.slice(0, 8)}`);
    for (const [role, res] of [["PM", pm], ["SPM", spm]] as const) {
      for (const r of res.rows) {
        const s = stored.find((x) => x.criterion_id === r.criterion_id);
        const name = rubric.criteria[role].find((x) => x.id === r.criterion_id)!.name;
        total++;
        if (s?.score === r.score) same++;
        else console.log(`  ✗ ${role} ${name}: stored ${s?.score ?? "-"} → now ${r.score}`);
      }
      const storedTotal = rubric.criteria[role].reduce((sum, cr) => sum + ((stored.find((x) => x.criterion_id === cr.id)?.score ?? 0) / cr.max_score) * Number(cr.weight), 0);
      console.log(`  ${role}: stored total ${Math.round(storedTotal * 10) / 10}, re-scored ${res.total}`);
    }
  }
  console.log(`\n${same}/${total} criterion scores identical on re-score.${same === total ? " ✓ Reproducible." : " ⚠ Not fully reproducible: see the lines above."}`);
}

main().catch((e) => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
