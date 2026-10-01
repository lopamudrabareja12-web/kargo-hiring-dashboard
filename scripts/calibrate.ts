/**
 * npm run calibrate
 * Runs the 8 past-hire CVs (context/hires/) through the SAME redact → guardrail → score path
 * as the app, without the database, and compares against the rubric's calibration table.
 * Needs only GEMINI_API_KEY. Nothing is saved.
 */
import { readdirSync, readFileSync } from "node:fs";
import { extractText } from "../src/lib/extract";
import { assertNoPii, extractAndRedact } from "../src/lib/pii";
import { rateCv } from "../src/lib/scorer";
import { localRubric } from "./_rubric-local";

function expectedFromRubric(text: string) {
  const out = new Map<string, { rating: string; scores: number[]; total: number }>();
  const re = /^([A-Z][a-z]+(?: [A-Z][a-z]+)+)\s+(Exceeds|Meets|Below)\s+((?:\d\s+){4,6})([\d.]+)\s*$/gm;
  for (const m of text.matchAll(re)) out.set(m[1].toLowerCase(), { rating: m[2], scores: m[3].trim().split(/\s+/).map(Number), total: Number(m[4]) });
  return out;
}

async function main() {
  const { version, criteria, text } = localRubric();
  const expected = expectedFromRubric(text);
  const files = readdirSync("context/hires").filter((f) => f.endsWith(".docx")).sort();
  console.log(`Rubric ${version.label}. Scoring ${files.length} hire CVs for PM and SPM…\n`);
  const results: { name: string; rating: string; pm: number[]; pmTotal: number; spmTotal: number; exp?: number[]; expTotal?: number }[] = [];

  const queue = [...files];
  async function worker() {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const raw = await extractText(readFileSync(`context/hires/${f}`), f);
      const { pii, cvContent } = extractAndRedact(raw, f);
      assertNoPii(cvContent, pii.name);
      const pm = await rateCv({ role: "PM", cv: cvContent, guardName: pii.name, version, criteria });
      const pmScores = new Map(pm.rows.map((r) => [r.criterion_id, { score: r.score, reason: r.reason }]));
      const spm = await rateCv({ role: "SPM", cv: cvContent, guardName: pii.name, version, criteria, pmScores });
      const exp = expected.get((pii.name ?? "").toLowerCase());
      results.push({ name: pii.name ?? f, rating: exp?.rating ?? "?", pm: pm.rows.map((r) => r.score), pmTotal: pm.total, spmTotal: spm.total, exp: exp?.scores, expTotal: exp?.total });
      process.stdout.write(".");
    }
  }
  await Promise.all([worker(), worker()]);
  results.sort((a, b) => b.pmTotal - a.pmTotal);

  console.log("\n\nName                    Rating    PM scores    PM total | expected       | SPM total");
  let exact = 0, within1 = 0, n = 0;
  for (const r of results) {
    const diff = r.exp ? r.pm.map((s, i) => s - r.exp![i]) : [];
    if (r.exp) { n += r.pm.length; exact += diff.filter((d) => d === 0).length; within1 += diff.filter((d) => Math.abs(d) <= 1).length; }
    console.log(
      `${r.name.padEnd(23)} ${r.rating.padEnd(9)} ${r.pm.join(" ").padEnd(12)} ${String(r.pmTotal).padStart(5)}    | ${(r.exp?.join(" ") ?? "-").padEnd(9)} ${String(r.expTotal ?? "-").padStart(5)} | ${String(r.spmTotal).padStart(5)}`,
    );
  }
  const minExceeds = Math.min(...results.filter((r) => r.rating === "Exceeds").map((r) => r.pmTotal));
  const maxMeets = Math.max(...results.filter((r) => r.rating === "Meets").map((r) => r.pmTotal));
  const below = results.filter((r) => r.rating === "Below").map((r) => r.pmTotal);
  console.log(`\nCriterion agreement with the rubric's own calibration: ${exact}/${n} exact, ${within1}/${n} within 1.`);
  console.log(`Every Exceeds above every Meets: ${minExceeds > maxMeets ? "YES" : "NO"} (lowest Exceeds ${minExceeds}, highest Meets ${maxMeets})`);
  console.log(`Every Meets above Below: ${below.every((b) => b < Math.min(...results.filter((r) => r.rating === "Meets").map((r) => r.pmTotal))) ? "YES" : "NO"}`);
}

main().catch((e) => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
