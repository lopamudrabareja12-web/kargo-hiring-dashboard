/**
 * npm run redraft
 * Regenerates briefs (top 5) and email drafts that are not edited and not sent, e.g. after
 * loading JDs. Never re-scores, never touches sent emails or Arjun's edits.
 */
import { db, must, type EmailRow, type RoleTotalRow } from "../src/lib/db";
import { draftFor } from "../src/lib/pipeline";

const emailsOnly = process.argv.includes("--emails-only");

async function main() {
  const totals = must(await db().from("role_totals").select("candidate_id, in_top5").eq("is_applied", true), "loading ranks") as Pick<RoleTotalRow, "candidate_id" | "in_top5">[];
  const emails = must(await db().from("emails").select("candidate_id, edited, sent_at"), "loading emails") as Pick<EmailRow, "candidate_id" | "edited" | "sent_at">[];
  let done = 0, skippedEdited = 0, failed = 0;
  const queue = [...totals];
  async function worker() {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const e = emails.find((x) => x.candidate_id === t.candidate_id);
      const redraftEmail = !e || (!e.edited && !e.sent_at);
      if (e?.edited && !e.sent_at) skippedEdited++;
      try {
        await draftFor(t.candidate_id, { forceBrief: t.in_top5 && !emailsOnly, forceEmail: redraftEmail && !!e });
        done++;
        process.stdout.write(".");
      } catch (err) {
        failed++;
        console.error(`\n✗ ${t.candidate_id}: ${(err as Error).message}`);
      }
    }
  }
  await Promise.all([worker(), worker()]);
  console.log(`\n✓ ${done} candidates refreshed · ${skippedEdited} edited drafts left as you wrote them · ${failed} failed`);
}

main().catch((e) => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
