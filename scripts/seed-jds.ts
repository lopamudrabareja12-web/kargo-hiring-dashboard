/**
 * npm run seed:jds
 * Loads the job descriptions from jds/ into role_context. They are used ONLY to describe the
 * role in briefs and emails, never for scoring. File names must say which role:
 * "senior" or "spm" → SPM; otherwise "pm" / "product" → PM.
 * Afterwards run `npm run redraft` to refresh briefs and unedited drafts (no re-scoring).
 */
import { readdirSync, readFileSync } from "node:fs";
import { db, must } from "../src/lib/db";
import { EMAIL_RE } from "../src/lib/pii";
const LINK_RE = /(?:https?:\/\/|www\.)\S+/gi;

async function toText(path: string, name: string): Promise<string> {
  if (/\.(txt|md)$/i.test(name)) return readFileSync(path, "utf8");
  const { extractText } = await import("../src/lib/extract");
  return extractText(readFileSync(path), name);
}

async function main() {
  const files = readdirSync("jds").filter((f) => /\.(pdf|docx|txt|md)$/i.test(f) && !/^readme/i.test(f));
  if (!files.length) {
    console.log("No JD files in jds/ (only README). Nothing to load; briefs and emails stay generic.");
    return;
  }
  const seen = new Set<string>();
  for (const f of files) {
    const role = /senior|spm/i.test(f) ? "SPM" : /pm|product/i.test(f) ? "PM" : null;
    if (!role) { console.warn(`Skipping ${f}: can't tell the role from the file name (include "PM" or "Senior"/"SPM").`); continue; }
    if (seen.has(role)) { console.warn(`Skipping ${f}: a ${role} JD was already loaded from another file.`); continue; }
    seen.add(role);
    // JDs can contain recruiter contact details; strip them so the AI guardrail never trips.
    const text = (await toText(`jds/${f}`, f))
      .replace(EMAIL_RE, "[EMAIL]")
      .replace(LINK_RE, "[LINK]")
      .replace(/(?:\+\s?)?\(?\d[\d\s().-]{7,}\d/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[PHONE]" : m))
      .trim();
    must(await db().from("role_context").upsert({ role, jd_text: text, source_file: f, updated_at: new Date().toISOString() }, { onConflict: "role" }), "saving JD");
    console.log(`✓ ${role} JD loaded from ${f} (${text.length} chars)`);
  }
  console.log("\nNext: npm run redraft   (refreshes briefs + unedited drafts; scores are not touched)");
}

main().catch((e) => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
