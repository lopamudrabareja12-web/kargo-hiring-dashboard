import { describe, expect, it } from "vitest";
import { assertNoPii } from "@/lib/pii";
import { briefPrompt, emailPrompt } from "@/lib/prompts";
import type { EmailKind } from "@/lib/ranking";

// Candidates can share a first name with the founder ("Arjun") or a word in our own wording.
// The text that sits next to a candidate's CV must never trip the name check on its own.
const CV = "[NAME] ran exception handling at a freight forwarder. [CONTACT DETAILS]\nBuilt a tracker adopted by 12 people in two weeks.";
const NAMES = ["Arjun Verma", "Arjun Mehta", "Rohan Mehta", "Kargo Singh", "Priya Sharma"];

describe("prompt text is safe next to any candidate name", () => {
  const kinds: EmailKind[] = ["invite", "invite_plus_other", "invite_other_role", "rejection"];
  for (const name of NAMES) {
    it(`email prompts for ${name}`, () => {
      for (const kind of kinds) {
        const p = emailPrompt({ kind, appliedRole: "PM", cv: CV, senderName: "Arjun Mehta, Founder, Kargo", jd: null, strengths: [{ name: "Fixed what they saw", reason: "Built a tracker", evidence: "Built a tracker" }] });
        expect(() => assertNoPii(p, name), kind).not.toThrow();
      }
    });
    it(`brief prompts for ${name}`, () => {
      for (const band of ["above", "top5_below_bar", "below"] as const) {
        const p = briefPrompt({ role: "PM", rank: 3, poolSize: 20, band, total: 45, maxScore: 2, cv: CV, jd: null, criteria: [{ name: "Fixed what they saw", weight: 25, score: 1, reason: "Built a tracker", evidence: "Built a tracker" }] });
        expect(() => assertNoPii(p, name), band).not.toThrow();
      }
    });
  }
});
