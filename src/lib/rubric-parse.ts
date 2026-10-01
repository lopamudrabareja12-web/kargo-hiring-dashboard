import { createHash } from "node:crypto";
import type { Role } from "./constants";

export interface ParsedCriterion {
  role: Role;
  name: string;
  description: string;
  weight: number;
  sortOrder: number;
  maxScore: number;
}

export interface ParsedRubric {
  label: string;
  maxScore: number;
  scoringRules: string;
  roleNotes: Partial<Record<Role, string>>;
  spmRequiresPmStrong: boolean;
  criteria: ParsedCriterion[];
  contentHash: string;
}

export class RubricError extends Error {}

const RULE = /^\s*[=]{5,}\s*$/;
const DASHES = /^\s*-{5,}\s*$/;
const PM_HEADER = /^\s*PRODUCT MANAGER(\s*\(PM\))?\s*$/i;
const SPM_HEADER = /^\s*SENIOR PRODUCT MANAGER(\s*\(SPM\))?\s*$/i;
const CRITERION = /^\s*(?:\d+[.)]\s*)?Criterion name:\s*(.+?)\s*$/i;
const WEIGHT = /^\s*Weight:\s*([\d.]+)\s*%/i;

/** A section header is a line right after a ==== rule, closed by another rule within 2 lines. */
function sectionHeaders(lines: string[]): { index: number; title: string }[] {
  const out: { index: number; title: string }[] = [];
  for (let i = 1; i < lines.length - 1; i++) {
    const closes = RULE.test(lines[i + 1] ?? "") || (RULE.test(lines[i + 2] ?? "") && !!lines[i + 1]?.trim());
    if (RULE.test(lines[i - 1]) && closes && lines[i].trim() && !RULE.test(lines[i])) {
      out.push({ index: i, title: lines[i].trim() });
    }
  }
  return out;
}

function detectMaxScore(text: string): number {
  if (/\b0\s*,\s*1\s*(?:,|or)\s*2\b/i.test(text)) return 2;
  const range = text.match(/score each criterion\s*0\s*[-–to]+\s*(\d+)/i);
  if (range) return Number(range[1]);
  return 10;
}

function clean(block: string[]): string {
  return block
    .filter((l) => !DASHES.test(l) && !RULE.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseRoleSection(lines: string[], role: Role, maxScore: number) {
  const criteria: ParsedCriterion[] = [];
  let preamble: string[] = [];
  let current: { name: string; body: string[] } | null = null;
  let seenFirst = false;

  for (const line of lines) {
    const c = line.match(CRITERION);
    if (c) {
      if (current) throw new RubricError(`${role}: criterion "${current.name}" has no "Weight:" line`);
      current = { name: c[1].trim(), body: [] };
      seenFirst = true;
      continue;
    }
    const w = line.match(WEIGHT);
    if (w && current) {
      criteria.push({
        role,
        name: current.name,
        description: clean(current.body),
        weight: Number(w[1]),
        sortOrder: criteria.length + 1,
        maxScore,
      });
      current = null;
      continue;
    }
    if (current) current.body.push(line);
    else if (!seenFirst) preamble.push(line);
  }
  if (current) throw new RubricError(`${role}: criterion "${current.name}" has no "Weight:" line`);
  return { criteria, preamble: clean(preamble) };
}

export function parseRubric(text: string, sourceFile: string): ParsedRubric {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const headers = sectionHeaders(lines);
  const pm = headers.find((h) => PM_HEADER.test(h.title));
  const spm = headers.find((h) => SPM_HEADER.test(h.title));
  if (!pm || !spm) {
    throw new RubricError(
      `Could not find both a "PRODUCT MANAGER" and a "SENIOR PRODUCT MANAGER" section in ${sourceFile}`,
    );
  }
  const sectionEnd = (start: number) => {
    const next = headers.find((h) => h.index > start);
    return next ? next.index - 1 : lines.length; // -1 skips the ==== above the next header
  };

  const howTo = headers.find((h) => /HOW TO SCORE/i.test(h.title));
  const firstHeader = headers[0];
  const scoringRules = howTo
    ? clean(lines.slice(howTo.index + 1, sectionEnd(howTo.index)))
    : clean(lines.slice(0, firstHeader ? firstHeader.index - 1 : 0));

  const maxScore = detectMaxScore(text);
  const pmPart = parseRoleSection(lines.slice(pm.index + 1, sectionEnd(pm.index)), "PM", maxScore);
  const spmPart = parseRoleSection(lines.slice(spm.index + 1, sectionEnd(spm.index)), "SPM", maxScore);
  const criteria = [...pmPart.criteria, ...spmPart.criteria];

  for (const role of ["PM", "SPM"] as Role[]) {
    const rc = criteria.filter((c) => c.role === role);
    if (rc.length < 4 || rc.length > 6) {
      throw new RubricError(`${role} has ${rc.length} criteria; the rubric must have 4 to 6 per role.`);
    }
    const sum = rc.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(sum - 100) > 0.001) {
      throw new RubricError(
        `${role} weights add up to ${sum}%, not 100% (${rc.map((c) => `${c.name} ${c.weight}%`).join(", ")}).`,
      );
    }
    for (const c of rc) {
      if (!c.description) throw new RubricError(`${role}: "${c.name}" has an empty description.`);
    }
  }

  const spmPre = spmPart.preamble;
  const spmRequiresPmStrong =
    /PM\s*["“]?Strong["”]?\s*test/i.test(spmPre) ||
    criteria.filter((c) => c.role === "SPM").every((c) => /PM\s*["“]?Strong["”]?\s*test/i.test(c.description));

  const versionMatch = text.match(/^\s*Version:\s*([\w.-]+)/im);
  const label = versionMatch ? versionMatch[1] : /draft/i.test(sourceFile) ? "draft-1" : "class-1";

  return {
    label,
    maxScore,
    scoringRules,
    roleNotes: { PM: pmPart.preamble || undefined, SPM: spmPre || undefined },
    spmRequiresPmStrong,
    criteria,
    contentHash: createHash("sha256").update(text).digest("hex"),
  };
}
