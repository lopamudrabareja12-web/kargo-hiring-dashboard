import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRubric, RubricError } from "@/lib/rubric-parse";

describe("parseRubric(rubric.txt)", () => {
  const r = parseRubric(readFileSync("rubric.txt", "utf8"), "rubric.txt");
  it("finds 5 criteria per role with weights summing to 100", () => {
    for (const role of ["PM", "SPM"] as const) {
      const c = r.criteria.filter((x) => x.role === role);
      expect(c).toHaveLength(5);
      expect(c.reduce((s, x) => s + x.weight, 0)).toBe(100);
    }
    expect(r.criteria.filter((c) => c.role === "PM").map((c) => c.weight)).toEqual([25, 20, 20, 10, 25]);
    expect(r.criteria.filter((c) => c.role === "SPM").map((c) => c.weight)).toEqual([30, 20, 20, 15, 15]);
  });
  it("detects the 0/1/2 scale, the SPM dependency and the label", () => {
    expect(r.maxScore).toBe(2);
    expect(r.spmRequiresPmStrong).toBe(true);
    expect(r.label).toBe("class-1");
    expect(r.scoringRules).toMatch(/User-side results/);
  });
  it("keeps the full strong / partial / weak text", () => {
    const fixed = r.criteria.find((c) => c.role === "PM" && c.name === "Fixed what they saw")!;
    expect(fixed.description).toMatch(/Partial \(1\)/);
    expect(fixed.description).toMatch(/Weak \(0\)/);
    expect(fixed.description).toMatch(/Rohan/);
    expect(fixed.description).not.toMatch(/Weight:/);
  });
});

describe("parseRubric(rubric.draft.txt)", () => {
  const r = parseRubric(readFileSync("rubric.draft.txt", "utf8"), "rubric.draft.txt");
  it("labels draft-1, 0-10 scale, no PM dependency", () => {
    expect(r.label).toBe("draft-1");
    expect(r.maxScore).toBe(10);
    expect(r.spmRequiresPmStrong).toBe(false);
    expect(r.criteria).toHaveLength(10);
  });
});

describe("validation", () => {
  it("fails loudly when weights do not add to 100", () => {
    const bad = readFileSync("rubric.txt", "utf8").replace("Weight: 25%", "Weight: 35%");
    expect(() => parseRubric(bad, "rubric.txt")).toThrow(RubricError);
    expect(() => parseRubric(bad, "rubric.txt")).toThrow(/PM weights add up to 110%/);
  });
});
