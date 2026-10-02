/**
 * npm run load:applications
 * Loads every PDF/DOCX in applications/ through the real pipeline, one at a time.
 * Role comes from the file name: spm_… = SPM, pm_… = PM, anything else = PM (UNLABELLED_ROLE).
 * Safe to re-run: duplicates are skipped and half-finished candidates are resumed. Sends no email.
 * Logs only the file's number, never a name.
 */
import { readFileSync, readdirSync } from "node:fs";
import { ingest, runStep, syncDrafts } from "../src/lib/pipeline";

const UNLABELLED_ROLE = "PM" as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tag = (f: string) => f.match(/^(s?pm_)?\d+/)?.[0] ?? f.slice(0, 4);
const roleOf = (f: string): "PM" | "SPM" => (f.startsWith("spm_") ? "SPM" : f.startsWith("pm_") ? "PM" : UNLABELLED_ROLE);

async function step(id: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await runStep(id)).stage;
    } catch (e) {
      const msg = (e as Error).message;
      if (attempt >= 4 || /Enter the candidate's name/.test(msg)) throw e;
      console.log(`   busy (${msg.slice(0, 60)}), waiting 25 s…`);
      await sleep(25_000);
    }
  }
}

async function main() {
  const files = readdirSync("applications").filter((f) => /\.(pdf|docx)$/i.test(f)).sort();
  console.log(`${files.length} files: ${files.filter((f) => roleOf(f) === "PM").length} as PM, ${files.filter((f) => roleOf(f) === "SPM").length} as SPM`);
  let ok = 0, failed = 0, skipped = 0;
  for (const f of files) {
    const label = `${tag(f)} (${roleOf(f)})`;
    try {
      const r = await ingest(readFileSync(`applications/${f}`), f, roleOf(f));
      const id = r.id;
      if (r.kind === "created" && r.needsName) { console.log(`• ${label}: needs a name, skipped`); skipped++; continue; }
      let stage = "extracted";
      for (let i = 0; i < 5 && stage !== "drafted"; i++) stage = await step(id);
      console.log(`✓ ${label}: ${r.kind === "duplicate" ? "resumed" : "new"} → ${stage}`);
      ok++;
    } catch (e) {
      console.log(`✗ ${label}: ${(e as Error).message.slice(0, 140)}`);
      failed++;
    }
  }
  console.log("Refreshing briefs and drafts for everyone whose rank moved…");
  for (let r = await syncDrafts(); ; r = await syncDrafts()) {
    console.log(`   ${r.processed} updated, ${r.remaining} left, ${r.failed} failed`);
    if (r.remaining === 0 || r.processed === 0) break;
  }
  console.log(`Done. ${ok} loaded, ${failed} failed, ${skipped} skipped.`);
}

main().catch((e) => { console.error(`✗ ${(e as Error).message}`); process.exit(1); });
