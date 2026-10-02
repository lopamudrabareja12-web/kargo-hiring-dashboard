import { describe, expect, it } from "vitest";
import { schedulingLinkProblem } from "@/lib/link";

describe("schedulingLinkProblem", () => {
  it("accepts a real booking link", () => {
    for (const l of ["https://cal.com/arjun-mehta/30min", "https://calendly.com/arjun/intro", "https://kargo.in/book"]) expect(schedulingLinkProblem(l), l).toBeNull();
  });
  it("rejects empty, malformed and placeholder links", () => {
    expect(schedulingLinkProblem("")).toMatch(/not set/);
    expect(schedulingLinkProblem(undefined)).toMatch(/not set/);
    expect(schedulingLinkProblem("cal.com/arjun")).toMatch(/full web address/);
    expect(schedulingLinkProblem("ftp://x.example.org/a")).toMatch(/https/);
    for (const l of ["https://cal.com/your-link", "https://calendly.com/yourname", "https://example.com/book", "https://cal.com/YOUR_LINK"]) {
      expect(schedulingLinkProblem(l), l).toMatch(/placeholder/);
    }
  });
});
