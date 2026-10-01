/**
 * npm run seed:rubric
 * Parses rubric.txt (or rubric.draft.txt), validates it (4–6 criteria per role, weights = 100),
 * and loads it into rubric_versions + rubric_criteria as the active version. Fails loudly otherwise.
 */
import { db, must } from "../src/lib/db";
import { readRubricFile } from "./_rubric-local";

async function main() {
  const { file, parsed } = readRubricFile();
  console.log(`Parsed ${file}: version ${parsed.label}, scale 0-${parsed.maxScore}, SPM depends on PM Strong: ${parsed.spmRequiresPmStrong}`);
  for (const role of ["PM", "SPM"] as const) {
    const rc = parsed.criteria.filter((c) => c.role === role);
    console.log(`\n${role} (${rc.reduce((s, c) => s + c.weight, 0)}%)`);
    for (const c of rc) console.log(`  ${c.sortOrder}. ${c.name.padEnd(36)} ${String(c.weight).padStart(3)}%`);
  }

  const existing = must(await db().from("rubric_versions").select("id, label").eq("content_hash", parsed.contentHash).maybeSingle(), "checking versions") as { id: string; label: string } | null;
  let versionId: string;
  if (existing) {
    versionId = existing.id;
    console.log(`\nThis exact rubric is already loaded (${existing.label}); making it active.`);
  } else {
    const all = must(await db().from("rubric_versions").select("label"), "listing versions") as { label: string }[];
    let label = parsed.label;
    for (let n = 2; all.some((v) => v.label === label); n++) label = `${parsed.label}.${n}`;
    const v = must(
      await db().from("rubric_versions").insert({
        label, source_file: file, content_hash: parsed.contentHash, max_score: parsed.maxScore,
        scoring_rules: parsed.scoringRules, role_notes: parsed.roleNotes, spm_requires_pm_strong: parsed.spmRequiresPmStrong,
        is_active: false,
      }).select("id").single(),
      "saving the rubric version",
    ) as { id: string };
    versionId = v.id;
    must(
      await db().from("rubric_criteria").insert(parsed.criteria.map((c) => ({
        version_id: versionId, role: c.role, name: c.name, description: c.description, max_score: c.maxScore, weight: c.weight, sort_order: c.sortOrder,
      }))),
      "saving criteria",
    );
    console.log(`\nLoaded as version ${label}.`);
  }
  must(await db().from("rubric_versions").update({ is_active: false }).neq("id", versionId), "deactivating old versions");
  must(await db().from("rubric_versions").update({ is_active: true }).eq("id", versionId), "activating version");

  const rows = must(await db().from("rubric_criteria").select("role, weight").eq("version_id", versionId), "verifying") as { role: string; weight: number }[];
  for (const role of ["PM", "SPM"]) {
    const r = rows.filter((x) => x.role === role);
    const sum = r.reduce((s, x) => s + Number(x.weight), 0);
    if (Math.abs(sum - 100) > 0.001) throw new Error(`Verification failed: ${role} weights in the database sum to ${sum}.`);
    console.log(`✓ rubric_criteria has ${r.length} ${role} rows, weights sum to ${sum}`);
  }
  const old = must(await db().from("candidates").select("id", { count: "exact", head: false }).not("rubric_version_id", "is", null).neq("rubric_version_id", versionId), "checking candidates") as unknown[];
  if (old.length) console.log(`\n⚠ ${old.length} candidate(s) were scored with an older rubric. Run \`npm run rescore\` (or press Re-score on each).`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
