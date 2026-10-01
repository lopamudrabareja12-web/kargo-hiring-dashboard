/**
 * npm run rescore [-- --all]
 * Re-scores candidates scored with an older rubric (or everyone with --all), then refreshes
 * ranks, briefs and drafts. Sent emails and Arjun's edits are never overwritten.
 */
import { db, must } from "../src/lib/db";
import { activeRubric, resetForRescore, runStep, syncDrafts } from "../src/lib/pipeline";

async function main() {
  const rubric = await activeRubric();
  const all = process.argv.includes("--all");
  const rows = must(await db().from("candidates").select("id, rubric_version_id, stage"), "loading candidates") as { id: string; rubric_version_id: string | null; stage: string }[];
  const todo = rows.filter((r) => r.stage !== "needs_name" && (all || r.rubric_version_id !== rubric.version.id));
  console.log(`Re-scoring ${todo.length} candidate(s) with rubric ${rubric.version.label}…`);
  const queue = [...todo];
  let failed = 0;
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        await resetForRescore(c.id);
        for (let i = 0; i < 4; i++) if ((await runStep(c.id)).stage === "drafted") break;
        process.stdout.write(".");
      } catch (e) {
        failed++;
        console.error(`\n✗ ${c.id.slice(0, 8)}: ${(e as Error).message}`);
      }
    }
  }
  await Promise.all([worker(), worker()]);
  for (let r = await syncDrafts(); r.remaining > 0 && r.processed > 0; r = await syncDrafts()) process.stdout.write("+");
  console.log(`\n✓ done · ${failed} failed`);
}

main().catch((e) => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
