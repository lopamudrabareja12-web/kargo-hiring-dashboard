import { describe, expect, it } from "vitest";
import {
  assertNoPii, extractAndRedact, fillTemplate, findPhones, nameFromFilename, PiiLeakError, redactName,
  unfilledPlaceholders,
} from "@/lib/pii";

const CV = `Priya Raghavan
priya.raghavan@example.com | +91 98765 43210 | Mumbai, Maharashtra | linkedin.com/in/priya-r
Date of Birth: 12/03/1994
Gender: Female
Marital Status: Single
Nationality: Indian

SUMMARY
Operations associate turned product manager. Priya's first job was at a CHA in Nhava Sheva.

EXPERIENCE
Product Manager | Freightly | 2021 - 2024
- Built an exceptions tracker after noticing the team had no view of held shipments; adopted by 12 people in 2 weeks.
- Reduced support tickets by 40% over 9 months. RAGHAVAN award for ops excellence.
- Call me on 022-2345-6789 or 9876543210.
Volume: 180 shipments per month across 2019 2020 2021.
`;

describe("extractAndRedact", () => {
  const r = extractAndRedact(CV, "cv_priya_raghavan.pdf");

  it("puts personal details in the PII record", () => {
    expect(r.pii.name).toBe("Priya Raghavan");
    expect(r.pii.nameConfident).toBe(true);
    expect(r.pii.email).toBe("priya.raghavan@example.com");
    expect(r.pii.phone?.replace(/\D/g, "")).toBe("919876543210");
    expect(r.pii.links).toContain("linkedin.com/in/priya-r");
  });

  it("removes name (full, parts, possessive, caps), email, phone and links from cv_content", () => {
    const c = r.cvContent;
    expect(c).not.toMatch(/priya/i);
    expect(c).not.toMatch(/raghavan/i);
    expect(c).not.toMatch(/@/);
    expect(c).not.toMatch(/9876543210|98765 43210|2345-6789/);
    expect(c).not.toMatch(/linkedin/i);
    expect(c).toContain("[NAME]'s first job");
  });

  it("removes protected-attribute lines", () => {
    expect(r.cvContent).not.toMatch(/1994|Female|Single|Indian|Mumbai, Maharashtra/);
    expect(r.cvContent).toContain("[REDACTED PERSONAL DETAIL]");
  });

  it("keeps the work content, including numbers that are not phones", () => {
    expect(r.cvContent).toContain("adopted by 12 people in 2 weeks");
    expect(r.cvContent).toContain("Reduced support tickets by 40% over 9 months");
    expect(r.cvContent).toContain("2019 2020 2021");
    expect(r.cvContent).toContain("2021 - 2024");
  });

  it("passes the guardrail after redaction", () => {
    expect(() => assertNoPii(r.cvContent, r.pii.name)).not.toThrow();
  });

  it("is not confident when the name is not on the first line and the filename disagrees", () => {
    const x = extractAndRedact(`CURRICULUM VITAE\nOperations Lead\nAnita Kulkarni\n${"Worked on stuff. ".repeat(20)}`, "upload-17.pdf");
    expect(x.pii.name).toBe("Anita Kulkarni");
    expect(x.pii.nameConfident).toBe(false);
  });

  it("falls back to the filename when no name line exists", () => {
    const x = extractAndRedact(`summary\nI am rohan desai and I ran CHA ops.\n${"x ".repeat(150)}`, "cv_01_rohan_desai.docx");
    expect(x.pii.name).toBe("Rohan Desai");
    expect(x.pii.nameConfident).toBe(true);
    expect(x.cvContent).not.toMatch(/rohan desai/i);
  });
});

describe("guardrail assertNoPii", () => {
  it("blocks an email", () => {
    expect(() => assertNoPii("reach me at a.b@c.io", null)).toThrow(PiiLeakError);
  });
  it("blocks a 10-digit phone in common formats", () => {
    for (const p of ["9876543210", "+91 98765 43210", "(022) 2345 6789", "98765-43210"]) {
      expect(() => assertNoPii(`call ${p}`, null), p).toThrow(/phone/);
    }
  });
  it("blocks the extracted name, in full or any part", () => {
    expect(() => assertNoPii("[NAME] worked with Raghavan", "Priya Raghavan")).toThrow(/name/);
    expect(() => assertNoPii("PRIYA led it", "Priya Raghavan")).toThrow(/name/);
  });
  it("does not leak the value in the error message", () => {
    try {
      assertNoPii("x priya.r@example.com 9876543210 Priya", "Priya Raghavan");
    } catch (e) {
      expect((e as Error).message).not.toMatch(/priya|9876/i);
      expect((e as PiiLeakError).kinds).toEqual(["email", "phone", "name"]);
    }
  });
  it("allows clean text with years, percentages and counts", () => {
    expect(() => assertNoPii("2019 - 2023: 180 shipments/month, -35% tickets, ₹4.2Cr", "Priya Raghavan")).not.toThrow();
  });
});

describe("helpers", () => {
  it("findPhones ignores year runs", () => {
    expect(findPhones("2019 2020 2021 2022")).toEqual([]);
  });
  it("nameFromFilename", () => {
    expect(nameFromFilename("cv_01_rohan_desai.docx")).toBe("Rohan Desai");
    expect(nameFromFilename("Priya Sharma - Resume (final).pdf")).toBe("Priya Sharma");
    expect(nameFromFilename("scan0001.pdf")).toBeNull();
  });
  it("redactName handles a typed-in name without stripping ordinary words", () => {
    expect(redactName("Will Grace will lead; WILL GRACE did it.", "Will Grace")).toBe("[NAME] will lead; [NAME] did it.");
  });
});

describe("[NAME] substitution", () => {
  it("fills the first name and the scheduling link", () => {
    const out = fillTemplate("Hi [NAME],\nBook here: {{SCHEDULING_LINK}}\nThanks [NAME].", {
      name: "Priya Raghavan", schedulingLink: "https://cal.com/arjun",
    });
    expect(out).toBe("Hi Priya,\nBook here: https://cal.com/arjun\nThanks Priya.");
    expect(unfilledPlaceholders(out)).toEqual([]);
  });
  it("reports anything left unfilled", () => {
    expect(unfilledPlaceholders("Hi [NAME], {{SCHEDULING_LINK}}")).toEqual(["[NAME]", "{{SCHEDULING_LINK}}"]);
  });
});

describe("guardrail and the rubric's own examples", () => {
  it("does not block an applicant who shares a first name with a past hire quoted in the rubric", () => {
    const rubricText = 'Examples: Rahul\'s "Launched Ventus\'s first customer case study programme".';
    const prompt = `${rubricText}\n=== CV ===\n[NAME] ran ops at a 3PL.`;
    expect(() => assertNoPii(prompt, "Rahul Sharma", [rubricText])).not.toThrow();
  });
  it("still blocks the name when it is in the candidate's own text", () => {
    const rubricText = "Examples: Rahul's case study.";
    expect(() => assertNoPii(`${rubricText}\nRahul ran ops.`, "Rahul Sharma", [rubricText])).toThrow(/name/);
  });
});

import { formatEmailBody } from "@/lib/prompts";

describe("formatEmailBody", () => {
  const raw = "Hi [NAME], I enjoyed your background. The tracker stood out. You cut exceptions by 28%. The dashboard spread to two teams. I would like to chat about the role. Please book a time that works for you here: {{SCHEDULING_LINK}}. Arjun Mehta, Founder, Kargo";
  const out = formatEmailBody(raw, "Arjun Mehta, Founder, Kargo");
  it("puts the greeting, link and sign-off on their own lines", () => {
    expect(out.startsWith("Hi [NAME],\n\n")).toBe(true);
    expect(out).toMatch(/\n\n\{\{SCHEDULING_LINK\}\}\n\n/);
    expect(out.endsWith("\n\nArjun Mehta, Founder, Kargo")).toBe(true);
  });
  it("never leaves a full stop attached to the link", () => {
    expect(out).not.toMatch(/\{\{SCHEDULING_LINK\}\}[.,;]/);
  });
  it("breaks a wall of text into paragraphs", () => {
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(5);
  });
  it("leaves an already well-formatted email alone", () => {
    const good = "Hi [NAME],\n\nThanks for applying.\n\nWe are not moving forward.\n\nArjun Mehta, Founder, Kargo";
    expect(formatEmailBody(good, "Arjun Mehta, Founder, Kargo")).toBe(good);
  });
});

describe("PDF-shaped contact blocks (glued, duplicated, headings first)", () => {
  // Real PDFs repeat the contact line and glue the pieces together; the first line is often a heading.
  const raw = [
    "Strategy & Operations Leader | Corporate Strategy | Executive Advisory",
    "",
    "priya.nair.ops@example.com+91 98202 1134598202 11345priya-nairlinkedin.com/in/priya-nair-7a2b",
    "arnav-senlinkedin.com/in/arnav-sen github.com/priyanair",
    "",
    "EXPERIENCE",
    `Operations Executive, Freightly, 2021 – 2024. Led a team of 12 and cut exceptions by 28%. ${"Built trackers and fixed intake. ".repeat(8)}`,
  ].join("\n");
  const r = extractAndRedact(raw, "07_priya_nair.pdf");

  it("takes the name from the file name when the first line is a heading and the email agrees", () => {
    expect(r.pii.name).toBe("Priya Nair");
    expect(r.pii.nameConfident).toBe(true);
  });
  it("finds the phone even when it is duplicated and glued", () => {
    expect(r.pii.phone?.replace(/\D/g, "")).toMatch(/^(91)?9820211345$/);
  });
  it("leaves no phone digits, web-address slugs, links or name in the redacted text", () => {
    expect(r.cvContent).not.toMatch(/98202|11345/);
    expect(r.cvContent).not.toMatch(/priya|nair|arnav|linkedin|github/i);
    expect(() => assertNoPii(r.cvContent, r.pii.name)).not.toThrow();
  });
  it("keeps real content and year ranges", () => {
    expect(r.cvContent).toContain("2021 – 2024");
    expect(r.cvContent).toContain("cut exceptions by 28%");
  });
  it("the guardrail now blocks glued phones, profile links and slug-style names", () => {
    expect(() => assertNoPii("call +91 98202 1134598202 11345", null)).toThrow(/phone/);
    expect(() => assertNoPii("see linkedin.com/in/someone", null)).toThrow(/link/);
    expect(() => assertNoPii("11345priya-nair", "Priya Nair")).toThrow(/name/);
  });
  it("a candidate who shares a word with our own fixed text can be checked without false alarms", () => {
    // The system prompt says "Arjun Mehta, Founder, Kargo"; callers check it without the candidate's name.
    expect(() => assertNoPii("Sign off with: Arjun Mehta, Founder, Kargo", null)).not.toThrow();
    expect(() => assertNoPii("The candidate led a team", "Rohan Mehta")).not.toThrow();
  });
});

import { cleanExtractedText } from "@/lib/extract";
describe("cleanExtractedText", () => {
  it("strips NUL and control characters that the database rejects, and keeps normal text", () => {
    const out = cleanExtractedText("Operations lead.\u0000 Built a tracker.\u0007\r\n\r\n\r\n\r\nTwo weeks \t\nlater.");
    expect(out).toBe("Operations lead. Built a tracker.\n\nTwo weeks\nlater.");
    expect(out).not.toMatch(/\u0000|\u0007/);
  });
});
