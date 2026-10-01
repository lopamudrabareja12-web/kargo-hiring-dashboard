import { describe, expect, it } from "vitest";
import { MIN_SCORE, SHORTLIST_SIZE } from "@/lib/constants";
import { computeRankings, recommendedEmailKind, type RankInput } from "@/lib/ranking";

const NAMES = ["Fixed", "Spread", "Room", "PostMortem", "Pain"];
const PMW = [25, 20, 20, 10, 25];
const SPMW = [30, 20, 20, 15, 15];

function cand(id: string, applied: "PM" | "SPM", pm: number[], spm: number[] = [0, 0, 0, 0, 0]): RankInput {
  const crit = (s: number[], w: number[]) => s.map((score, i) => ({ name: NAMES[i], weight: w[i], sortOrder: i + 1, score }));
  const tot = (s: number[], w: number[]) => s.reduce((a, x, i) => a + (x / 2) * w[i], 0);
  return { id, appliedRole: applied, totals: { PM: tot(pm, PMW), SPM: tot(spm, SPMW) }, criteria: { PM: crit(pm, PMW), SPM: crit(spm, SPMW) } };
}
const get = (rs: ReturnType<typeof computeRankings>, id: string, role: "PM" | "SPM") => rs.find((r) => r.id === id && r.role === role)!;

describe("computeRankings", () => {
  it("ranks only among people who applied for the role", () => {
    const rs = computeRankings([cand("a", "PM", [2, 2, 2, 2, 2]), cand("b", "SPM", [1, 1, 1, 1, 1]), cand("c", "PM", [1, 1, 1, 1, 1])]);
    expect(get(rs, "a", "PM").rank).toBe(1);
    expect(get(rs, "c", "PM").rank).toBe(2);
    expect(get(rs, "b", "SPM").rank).toBe(1);
    expect(get(rs, "b", "SPM").isApplied).toBe(true);
    expect(get(rs, "b", "PM").isApplied).toBe(false);
  });

  it("draws the line at the top 5 AND the score bar", () => {
    const pool = [
      cand("s1", "PM", [2, 2, 2, 2, 2]), // 100
      cand("s2", "PM", [2, 2, 2, 0, 2]), // 90
      cand("s3", "PM", [2, 2, 1, 0, 1]), // 67.5
      cand("s4", "PM", [1, 1, 1, 1, 1]), // 50 -> exactly the bar: above
      cand("s5", "PM", [1, 2, 0, 0, 1]), // 45 -> top 5 but below bar
      cand("s6", "PM", [1, 0, 1, 1, 0]), // 27.5 -> below
    ];
    const rs = computeRankings(pool);
    expect(get(rs, "s4", "PM").total).toBe(MIN_SCORE);
    expect(get(rs, "s4", "PM").band).toBe("above");
    expect(get(rs, "s5", "PM").band).toBe("top5_below_bar");
    expect(get(rs, "s5", "PM").inTop5).toBe(true);
    expect(get(rs, "s5", "PM").aboveLine).toBe(false);
    expect(get(rs, "s6", "PM").band).toBe("below");
    expect(get(rs, "s6", "PM").rank).toBe(SHORTLIST_SIZE + 1);
  });

  it("with only 3 applicants, a weak one is top 5 but below the bar (B-1 scenario)", () => {
    const rs = computeRankings([cand("strong", "PM", [2, 2, 2, 0, 2]), cand("weak", "SPM", [0, 0, 1, 0, 0], [0, 0, 0, 0, 0]), cand("amb", "PM", [1, 2, 1, 0, 1])]);
    expect(get(rs, "strong", "PM").band).toBe("above");
    expect(get(rs, "weak", "SPM").band).toBe("top5_below_bar");
    expect(recommendedEmailKind(get(rs, "weak", "SPM"))).toBe("rejection");
  });

  it("breaks a tie on total by the highest-weighted criterion and explains it", () => {
    // Both 50: x has 2 on Fixed(25) + Pain(25); y has 2 on Spread(20), Room(20), PostMortem(10)
    const rs = computeRankings([cand("x", "PM", [2, 0, 0, 0, 2]), cand("y", "PM", [0, 2, 2, 2, 0])]);
    expect(get(rs, "x", "PM").total).toBe(50);
    expect(get(rs, "y", "PM").total).toBe(50);
    expect(get(rs, "x", "PM").rank).toBe(1);
    expect(get(rs, "y", "PM").rank).toBe(2);
    expect(get(rs, "x", "PM").tiebreakNote).toMatch(/"Fixed" \(25%\) put them ahead of 1/);
    expect(get(rs, "y", "PM").tiebreakNote).toMatch(/"Fixed" \(25%\) put them behind 1/);
    expect(get(rs, "x", "PM").tiedCount).toBe(0);
  });

  it("identical candidates share a rank, and ties at 5 put more than 5 above the line", () => {
    const top = [2, 2, 2, 2, 2];
    const tie = [2, 2, 1, 0, 1];
    const rs = computeRankings([
      cand("a", "PM", top), cand("b", "PM", top), cand("c", "PM", top), cand("d", "PM", top),
      cand("e", "PM", tie), cand("f", "PM", tie), cand("g", "PM", tie), cand("h", "PM", [0, 0, 0, 0, 0]),
    ]);
    expect(["e", "f", "g"].map((id) => get(rs, id, "PM").rank)).toEqual([5, 5, 5]);
    expect(get(rs, "e", "PM").tiedCount).toBe(2);
    expect(get(rs, "e", "PM").tiebreakNote).toMatch(/shared rank/);
    expect(get(rs, "h", "PM").rank).toBe(8);
    expect(rs.filter((r) => r.isApplied && r.aboveLine).length).toBe(7);
  });

  it("flags cross-role fit when the other-role score would make that role's line", () => {
    const rs = computeRankings([
      cand("pmApplicant", "PM", [1, 0, 0, 0, 0], [2, 2, 2, 2, 2]), // weak PM, would top SPM
      cand("spmApplicant", "SPM", [0, 0, 0, 0, 0], [1, 1, 1, 1, 1]),
    ]);
    const r = get(rs, "pmApplicant", "PM");
    expect(r.crossRoleFit).toBe(true);
    expect(get(rs, "pmApplicant", "SPM").rank).toBe(1);
    expect(recommendedEmailKind(r)).toBe(r.aboveLine ? "invite_plus_other" : "invite_other_role");
  });

  it("does not flag cross-role fit below the score bar", () => {
    const rs = computeRankings([cand("p", "PM", [2, 2, 2, 2, 2], [1, 0, 0, 0, 0])]);
    expect(get(rs, "p", "PM").crossRoleFit).toBe(false);
    expect(recommendedEmailKind(get(rs, "p", "PM"))).toBe("invite");
  });
});
