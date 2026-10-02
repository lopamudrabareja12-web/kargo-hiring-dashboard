import { describe, expect, it } from "vitest";
import { applySpmCap, evidenceInCv, weightedTotal } from "@/lib/scoring";

const PM_WEIGHTS = [25, 20, 20, 10, 25];
const total = (scores: number[], weights = PM_WEIGHTS, max = 2) =>
  weightedTotal(scores.map((score, i) => ({ score, maxScore: max, weight: weights[i] })));

describe("weightedTotal", () => {
  it("reproduces the rubric's calibration table", () => {
    expect(total([2, 2, 2, 0, 2])).toBe(90); // Sunita
    expect(total([1, 2, 2, 1, 2])).toBe(82.5); // Meghna
    expect(total([1, 2, 1, 1, 2])).toBe(72.5); // Lavanya
    expect(total([2, 2, 1, 0, 1])).toBe(67.5); // Rohan
    expect(total([1, 2, 2, 2, 0])).toBe(62.5); // Aditya
    expect(total([1, 2, 0, 0, 1])).toBe(45); // Vikram
    expect(total([1, 2, 0, 0, 0])).toBe(32.5); // Rahul
    expect(total([1, 0, 1, 1, 0])).toBe(27.5); // Preetham
  });
  it("is 0 for all-zero and 100 for all-max", () => {
    expect(total([0, 0, 0, 0, 0])).toBe(0);
    expect(total([2, 2, 2, 2, 2])).toBe(100);
  });
  it("works on a 0-10 scale too", () => {
    expect(total([10, 5, 0, 0, 0], [30, 25, 15, 15, 15], 10)).toBe(42.5);
  });
});

describe("applySpmCap", () => {
  it("SPM can only be 2 if PM is 2", () => {
    expect(applySpmCap(2, 1, 2, true)).toEqual({ score: 0, capped: true });
    expect(applySpmCap(1, 0, 2, true)).toEqual({ score: 0, capped: true });
    expect(applySpmCap(2, 2, 2, true)).toEqual({ score: 2, capped: false });
    expect(applySpmCap(1, 2, 2, true)).toEqual({ score: 1, capped: false });
  });
  it("does nothing when the rubric has no PM dependency", () => {
    expect(applySpmCap(7, 3, 10, false)).toEqual({ score: 7, capped: false });
  });
  it("clamps out-of-range scores", () => {
    expect(applySpmCap(5, 2, 2, true)).toEqual({ score: 2, capped: false });
  });
});

describe("evidenceInCv", () => {
  const cv = "Built an Excel tracker “after finding that the team had no reliable way” — adopted in two weeks.";
  it("matches verbatim quotes ignoring quote marks and spacing", () => {
    expect(evidenceInCv('after finding that the team had  no reliable way', cv)).toBe(true);
  });
  it("rejects invented quotes", () => {
    expect(evidenceInCv("adopted by 40 teams", cv)).toBe(false);
    expect(evidenceInCv("", cv)).toBe(false);
  });
});

describe("evidenceInCv with elisions", () => {
  it("accepts a quote shortened with an ellipsis and trailing full stop", () => {
    const cv = "Built a daily visibility dashboard for the operations team — adopted by 2 other regional teams";
    expect(evidenceInCv("Built a daily visibility dashboard for the operations team... adopted by 2 other regional teams.", cv)).toBe(true);
  });
});
