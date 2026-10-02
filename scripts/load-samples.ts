/**
 * npm run load:samples
 * Loads the 8 fictional past-hire CVs (context/hires/) through the real pipeline as demo
 * applicants: 4 as PM, 4 as SPM. Safe to re-run: duplicates are skipped. Sends no email.
 */
import { readFileSync } from "node:fs";
import { ingest, runStep, syncDrafts } from "../src/lib/pipeline";

const SAMPLES: [string, "PM" | "SPM"][] = [
  ["cv_07_lavanya_iyer.docx", "PM"], ["cv_03_vikram_nair.docx", "PM"], ["cv_01_rohan_desai.docx", "PM"], ["cv_05_preetham_rao.docx", "PM"],
  ["cv_02_sunita_krishnamurthy.docx", "SPM"], ["cv_06_meghna_tiwari.docx", "SPM"], ["cv_04_aditya_shetty.docx", "SPM"], ["cv_08_rahul_bose.docx", "SPM"],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function step(id: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await runStep(id)).stage;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.log(`   busy (${(e as Error).message.slice(0, 70)}), waiting 20 s…`);
      await sleep(20_000);
    }
  }
}

async function main() {
  for (const [file, role] of SAMPLES) {
    const label = `${file.replace(/^cv_\d+_|\.docx$/g, "").replace(/_/g, " ")} (${role})`;
    try {
      const r = await ingest(readFileSync(`context/hires/${file}`), file, role);
      if (r.kind === "duplicate") { console.log(`• ${label}: already loaded`); continue; }
      if (r.needsName) { console.log(`• ${label}: needs a name, skipped`); continue; }
      let stage = "extracted";
      for (let i = 0; i < 5 && stage !== "drafted"; i++) stage = await step(r.id);
      console.log(`✓ ${label}: ${stage}`);
    } catch (e) {
      console.log(`✗ ${label}: ${(e as Error).message}`);
    }
  }
  console.log("Refreshing briefs and drafts for everyone whose rank moved…");
  for (let r = await syncDrafts(); ; r = await syncDrafts()) {
    console.log(`   ${r.processed} updated, ${r.remaining} left, ${r.failed} failed`);
    if (r.remaining === 0 || r.processed === 0) break;
  }
  console.log("Done.");
}

main().catch((e) => { console.error(`✗ ${(e as Error).message}`); process.exit(1); });
