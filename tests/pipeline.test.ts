/**
 * End-to-end pipeline test with an in-memory database and stubbed Gemini/Resend.
 * Uses the 8 (fictional) hire CVs as applicants. Checks the privacy guarantees,
 * the scoring/ranking flow, drafting, the send gate and deletion.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fake-supabase";

const fake = new FakeDb();
const prompts: string[] = [];
const sends: { to: string; subject: string; text: string }[] = [];

vi.mock("@/lib/db", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    db: () => fake,
    logEvent: async (candidate_id: string | null, action: string, detail: Record<string, unknown> = {}) => {
      fake.t("events").push({ id: fake.seq++, candidate_id, action, detail, at: new Date().toISOString() });
    },
  };
});

vi.mock("@/lib/extract", async (orig) => {
  const real = (await orig()) as typeof import("@/lib/extract");
  return {
    ...real,
    extractText: async (buf: Buffer, name: string) => (name.endsWith(".txt") ? buf.toString("utf8") : real.extractText(buf, name)),
  };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (m: { to: string; subject: string; text: string }) => {
        sends.push(m);
        return { data: { id: `re_${sends.length}` }, error: null };
      },
    };
  },
}));

// Deterministic "model": PM scores = the rubric's own calibration table.
const PM: Record<string, number[]> = {
  Portwise: [1, 2, 1, 1, 2], // Lavanya 72.5
  XLRI: [1, 2, 0, 0, 1], // Vikram 45
  "family CHA": [2, 2, 1, 0, 1], // Rohan 67.5
  SQLAlchemy: [1, 0, 1, 1, 0], // Preetham 27.5
  "IATA DGR": [2, 2, 2, 0, 2], // Sunita 90
  Fieldstack: [1, 2, 2, 1, 2], // Meghna 82.5
  Stacksync: [1, 2, 2, 2, 0], // Aditya 62.5
  Ventus: [1, 2, 0, 0, 0], // Rahul 32.5
};
// What the "model" says for SPM, before the code cap (SPM > 0 needs PM = 2).
const SPM: Record<string, number[]> = {
  Portwise: [1, 2, 1, 1, 1],
  XLRI: [0, 1, 0, 0, 0],
  "family CHA": [2, 2, 1, 0, 1],
  SQLAlchemy: [0, 0, 0, 0, 0],
  "IATA DGR": [2, 2, 1, 0, 1],
  Fieldstack: [2, 2, 2, 0, 1], // criterion 1 must be capped to 0 (PM is 1)
  Stacksync: [0, 1, 1, 1, 0],
  Ventus: [0, 1, 0, 0, 0],
};
const markerOf = (text: string) => Object.keys(PM).find((k) => text.includes(k))!;

vi.mock("@/lib/gemini", async (orig) => {
  const real = (await orig()) as typeof import("@/lib/gemini");
  const { assertNoPii } = await import("@/lib/pii");
  return {
    ...real,
    generateJson: async (call: { label: string; system: string; prompt: string; validate: (d: unknown) => unknown; guardName: string | null; trusted?: string[] }) => {
      assertNoPii(call.system, call.guardName, call.trusted);
      assertNoPii(call.prompt, call.guardName, call.trusted);
      let candidatePart = call.system + "\n" + call.prompt;
      for (const t of call.trusted ?? []) candidatePart = candidatePart.split(t).join(" ");
      prompts.push(candidatePart);
      const cv = call.prompt.split("=== CV (redacted) ===")[1] ?? "";
      if (call.label.endsWith("scoring")) {
        const m = markerOf(cv);
        const scores = call.label.startsWith("PM") ? PM[m] : SPM[m];
        const quote = cv.trim().split("\n").find((l) => l.length > 40)!.slice(0, 60);
        return call.validate({
          headline: `Headline for ${m}`,
          criteria: scores.map((score, i) => ({ criterion: i + 1, evidence: i === 0 ? quote : "invented quote not in cv", reason: `Reason ${i + 1}`, score })),
        });
      }
      if (call.label === "Interview brief") {
        return call.validate({ who: "They are an operations-first product person", why: "They rank here on adoption evidence", probe: "Probe the failure story" });
      }
      // Email
      const p = call.prompt;
      const invite = /INTERVIEW INVITE|INVITE them/.test(p);
      const body = invite
        ? "Hi [NAME],\n\nYour work on the tracker stood out. Book a time here: {{SCHEDULING_LINK}}\n\nArjun Mehta, Founder, Kargo"
        : "Hi [NAME],\n\nThank you for applying. We are not moving forward for this role. Your ops background is genuinely strong.\n\nArjun Mehta, Founder, Kargo";
      return call.validate({ subject: invite ? "Let's talk: Kargo" : "Your Kargo application", body });
    },
  };
});

const HIRES: [string, "PM" | "SPM"][] = [
  ["cv_07_lavanya_iyer.docx", "PM"], ["cv_03_vikram_nair.docx", "PM"], ["cv_01_rohan_desai.docx", "PM"], ["cv_05_preetham_rao.docx", "PM"],
  ["cv_02_sunita_krishnamurthy.docx", "SPM"], ["cv_06_meghna_tiwari.docx", "SPM"], ["cv_04_aditya_shetty.docx", "SPM"], ["cv_08_rahul_bose.docx", "SPM"],
];
const NAMES = ["Lavanya", "Iyer", "Vikram", "Nair", "Rohan", "Desai", "Preetham", "Sunita", "Krishnamurthy", "Meghna", "Tiwari", "Aditya", "Shetty", "Rahul", "Bose"];

let P: typeof import("@/lib/pipeline");
let S: typeof import("@/lib/send");
const ids: Record<string, string> = {};
const idOf = (first: string) => ids[first];
const rt = (id: string, role: string) => fake.t("role_totals").find((r) => r.candidate_id === id && r.role === role)!;
const email = (id: string) => fake.t("emails").find((r) => r.candidate_id === id)!;

beforeAll(async () => {
  Object.assign(process.env, {
    SCHEDULING_LINK: "https://cal.example/arjun", RESEND_API_KEY: "re_test", SENDER_NAME: "Arjun Mehta, Founder, Kargo", EMAIL_OVERRIDE_TO: "",
  });
  const { parseRubric } = await import("@/lib/rubric-parse");
  const r = parseRubric(readFileSync("rubric.txt", "utf8"), "rubric.txt");
  const vid = "v1";
  fake.t("rubric_versions").push({
    id: vid, label: r.label, source_file: "rubric.txt", content_hash: r.contentHash, max_score: r.maxScore, scoring_rules: r.scoringRules,
    role_notes: r.roleNotes, spm_requires_pm_strong: r.spmRequiresPmStrong, is_active: true, created_at: new Date().toISOString(),
  });
  r.criteria.forEach((c) =>
    fake.t("rubric_criteria").push({ id: `${c.role}-${c.sortOrder}`, version_id: vid, role: c.role, name: c.name, description: c.description, max_score: c.maxScore, weight: c.weight, sort_order: c.sortOrder }),
  );
  P = await import("@/lib/pipeline");
  S = await import("@/lib/send");

  for (const [file, role] of HIRES) {
    const res = await P.ingest(readFileSync(`context/hires/${file}`), file, role);
    expect(res.kind).toBe("created");
    const first = file.split("_")[2];
    ids[first[0].toUpperCase() + first.slice(1)] = res.id;
    for (let i = 0; i < 4; i++) if ((await P.runStep(res.id)).stage === "drafted") break;
  }
  for (let r2 = await P.syncDrafts(); r2.remaining > 0 && r2.processed > 0; r2 = await P.syncDrafts());
});

describe("privacy", () => {
  it("stores name, email and phone in candidate_pii", () => {
    const pii = fake.t("candidate_pii").find((p) => p.candidate_id === idOf("Lavanya"))!;
    expect(pii.name).toBe("Lavanya Iyer");
    expect(pii.email).toBe("lavanya.iyer.pm@gmail.com");
    expect(String(pii.phone).replace(/\D/g, "")).toBe("919887612340");
  });
  it("cv_content has no name, email or phone for any candidate", () => {
    for (const c of fake.t("candidates")) {
      const cv = String(c.cv_content);
      expect(cv).not.toMatch(/@/);
      expect(cv).not.toMatch(/\+91|\d{5}\s\d{5}/);
      for (const n of NAMES) expect(cv, n).not.toMatch(new RegExp(`\\b${n}\\b`));
    }
  });
  it("no prompt sent to the model contains any candidate's name, email or phone", () => {
    expect(prompts.length).toBeGreaterThan(20);
    for (const p of prompts) {
      expect(p).not.toMatch(/@gmail/);
      for (const n of NAMES) expect(p, n).not.toMatch(new RegExp(`\\b${n}\\b`));
    }
  });
  it("prompts contain the redacted CV and the rubric criteria", () => {
    expect(prompts.some((p) => p.includes("Fixed what they saw") && p.includes("[NAME]"))).toBe(true);
  });
});

describe("scoring and ranking", () => {
  it("scores everyone for both roles, totals computed in code", () => {
    for (const id of Object.values(ids)) {
      expect(fake.t("scores").filter((s) => s.candidate_id === id && s.role === "PM")).toHaveLength(5);
      expect(fake.t("scores").filter((s) => s.candidate_id === id && s.role === "SPM")).toHaveLength(5);
    }
    expect(Number(rt(idOf("Lavanya"), "PM").total)).toBe(72.5);
    expect(Number(rt(idOf("Sunita"), "PM").total)).toBe(90);
  });
  it("applies the SPM cap in code", () => {
    const s = fake.t("scores").find((x) => x.candidate_id === idOf("Meghna") && x.role === "SPM" && x.criterion_id === "SPM-1")!;
    expect(s.model_score).toBe(2);
    expect(s.score).toBe(0);
    expect(s.capped).toBe(true);
  });
  it("flags evidence quotes that are not in the CV", () => {
    const rows = fake.t("scores").filter((x) => x.candidate_id === idOf("Lavanya") && x.role === "PM");
    expect(rows.find((r) => r.criterion_id === "PM-1")!.evidence_verified).toBe(true);
    expect(rows.find((r) => r.criterion_id === "PM-2")!.evidence_verified).toBe(false);
  });
  it("ranks among applicants of each role, with the 50 bar", () => {
    expect(rt(idOf("Lavanya"), "PM")).toMatchObject({ rank: 1, band: "above", is_applied: true });
    expect(rt(idOf("Rohan"), "PM")).toMatchObject({ rank: 2, band: "above" });
    expect(rt(idOf("Vikram"), "PM")).toMatchObject({ rank: 3, band: "top5_below_bar", in_top5: true, above_line: false });
    expect(rt(idOf("Preetham"), "PM")).toMatchObject({ rank: 4, band: "top5_below_bar" });
    expect(rt(idOf("Lavanya"), "SPM").is_applied).toBe(false);
  });
  it("flags cross-role fit (Sunita applied SPM; her PM score would top the PM pool)", () => {
    expect(rt(idOf("Sunita"), "SPM").cross_role_fit).toBe(true);
    expect(rt(idOf("Sunita"), "PM").rank).toBe(1);
  });
});

describe("briefs and drafts", () => {
  it("top-5 candidates (including below-bar) get a 3-sentence brief", () => {
    for (const n of ["Lavanya", "Rohan", "Vikram", "Preetham"]) {
      const b = fake.t("briefs").find((x) => x.candidate_id === idOf(n));
      expect(b, n).toBeTruthy();
      expect(String(b!.text).split(/(?<=\.)\s+/)).toHaveLength(3);
    }
  });
  it("invite above the line, rejection for top-5-below-bar, cross-role invite mentions the other role", () => {
    expect(email(idOf("Lavanya")).type).toBe("invite");
    expect(email(idOf("Vikram"))).toMatchObject({ type: "rejection", kind: "rejection" });
    expect(email(idOf("Preetham")).kind).toBe("rejection");
    expect(email(idOf("Sunita")).kind).toBe("invite_plus_other");
    for (const e of fake.t("emails")) expect(String(e.body_template)).toContain("[NAME]");
  });
  it("every candidate has a draft and every stage is drafted", () => {
    expect(fake.t("emails")).toHaveLength(8);
    expect(fake.t("candidates").every((c) => c.stage === "drafted" && c.status === "scored")).toBe(true);
  });
});

describe("the send gate", () => {
  it("previews with the real first name and link, and sends once", async () => {
    const id = idOf("Lavanya");
    const p = await S.buildPreview(id);
    expect(p.to).toBe("lavanya.iyer.pm@gmail.com");
    expect(p.body).toContain("Hi Lavanya,");
    expect(p.body).toContain("https://cal.example/arjun");
    expect(p.body).not.toContain("[NAME]");
    await S.confirmAndSend(id, p.previewHash);
    expect(sends).toHaveLength(1);
    expect(sends[0].text).toContain("Hi Lavanya,");
    expect(email(id)).toMatchObject({ sent_to: "lavanya.iyer.pm@gmail.com", resend_id: "re_1" });
    expect(email(id).sent_at).toBeTruthy();
    await expect(S.confirmAndSend(id, p.previewHash)).rejects.toThrow(/already sent/);
    expect(sends).toHaveLength(1);
  });
  it("refuses to send if the draft changed after the preview", async () => {
    const id = idOf("Rohan");
    const p = await S.buildPreview(id);
    await P.saveEmailEdit(id, "New subject line", String(email(id).body_template) + "\nPS: edited.");
    await expect(S.confirmAndSend(id, p.previewHash)).rejects.toThrow(/changed since you previewed/);
    expect(email(id).edited).toBe(true);
  });
  it("EMAIL_OVERRIDE_TO redirects and tags the body", async () => {
    process.env.EMAIL_OVERRIDE_TO = "me@test.example";
    const p = await S.buildPreview(idOf("Vikram"));
    expect(p.to).toBe("me@test.example");
    expect(p.body).toContain("[TEST] original recipient: vikramnair.pm@gmail.com");
    process.env.EMAIL_OVERRIDE_TO = "";
  });
});

describe("Arjun's decisions", () => {
  it("an override needs a reason, rewrites the draft and is logged", async () => {
    const id = idOf("Vikram");
    await expect(P.setOverride(id, "invite", "")).rejects.toThrow(/reason/);
    await P.setOverride(id, "invite", "Strong discovery work; worth a call");
    expect(email(id)).toMatchObject({ kind: "invite", override_kind: "invite", type: "invite" });
    expect(fake.t("events").some((e) => e.candidate_id === id && e.action === "override")).toBe(true);
  });
  it("needs_name: nothing goes to AI until the name is typed, then it is redacted", async () => {
    const text = `Operations specialist\nworked at a freight forwarder with Kavya leading the desk\n${"Handled 200 bills of lading a month and fixed the exception queue. ".repeat(6)}`;
    const res = await P.ingest(Buffer.from(text), "scan-17.txt", "PM");
    expect(res.kind === "created" && res.needsName).toBe(true);
    const before = prompts.length;
    await expect(P.runStep(res.id)).rejects.toThrow(/name first/);
    expect(prompts.length).toBe(before);
    await P.setName(res.id, "Kavya Menon");
    const c = fake.t("candidates").find((x) => x.id === res.id)!;
    expect(String(c.cv_content)).not.toMatch(/Kavya/);
    expect(c.stage).toBe("extracted");
  });
  it("skips duplicates by content hash", async () => {
    const res = await P.ingest(readFileSync("context/hires/cv_07_lavanya_iyer.docx"), "copy.docx", "SPM");
    expect(res).toMatchObject({ kind: "duplicate", id: idOf("Lavanya") });
  });
  it("delete removes every row for that person", async () => {
    const id = idOf("Preetham");
    await P.deleteCandidate(id);
    for (const t of ["candidates", "candidate_pii", "scores", "role_totals", "briefs", "emails", "events"]) {
      expect(fake.t(t).filter((r) => r.candidate_id === id || r.id === id), t).toHaveLength(0);
    }
  });
});

describe("hardening", () => {
  it("a malformed or unknown candidate id is a plain 'not found', never a database message", async () => {
    await expect(P.deleteCandidate("not-a-uuid")).rejects.toThrow(/not found/i);
    await expect(P.runStep("../../etc/passwd")).rejects.toThrow(/not found/i);
    await expect(P.deleteCandidate("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(P.NotFoundError);
  });

  it("changing the email type or regenerating asks before replacing Arjun's edits", async () => {
    const id = idOf("Rohan"); // edited earlier in this file
    expect(email(id).edited).toBe(true);
    await expect(P.setOverride(id, "rejection", "Not a fit for the team")).rejects.toBeInstanceOf(P.NeedsConfirmation);
    await expect(P.draftFor(id, { forceEmail: true })).rejects.toBeInstanceOf(P.NeedsConfirmation);
    expect(email(id).override_kind ?? null).toBeNull(); // nothing was changed by the refused attempts
    expect(String(email(id).body_template)).toContain("PS: edited.");
    await P.setOverride(id, "rejection", "Not a fit for the team", true);
    expect(email(id)).toMatchObject({ kind: "rejection", edited: false });
    expect(fake.t("events").some((e) => e.candidate_id === id && e.action === "draft_replaced")).toBe(true);
  });

  it("re-files a candidate under the other role and recomputes the ranking", async () => {
    const id = idOf("Rahul"); // applied as SPM
    expect(rt(id, "SPM").is_applied).toBe(true);
    const r = await P.changeRole(id, "PM");
    expect(r).toEqual({ role: "PM", changed: true });
    expect(rt(id, "PM").is_applied).toBe(true);
    expect(rt(id, "SPM").is_applied).toBe(false);
    expect(fake.t("candidates").find((c) => c.id === id)!.applied_role).toBe("PM");
    expect(fake.t("events").some((e) => e.candidate_id === id && e.action === "role_changed")).toBe(true);
    expect(await P.changeRole(id, "PM")).toEqual({ role: "PM", changed: false });
    await expect(P.changeRole(id, "CEO" as never)).rejects.toThrow(/PM or SPM/);
  });

  it("won't re-file someone who was already emailed", async () => {
    await expect(P.changeRole(idOf("Lavanya"), "SPM")).rejects.toThrow(/already emailed/);
  });

  it("refuses to send an invite while the booking link is a placeholder", async () => {
    const id = idOf("Sunita"); // an unsent invite
    process.env.SCHEDULING_LINK = "https://cal.com/your-link";
    await expect(S.buildPreview(id)).rejects.toThrow(/placeholder/);
    process.env.SCHEDULING_LINK = "";
    await expect(S.buildPreview(id)).rejects.toThrow(/not set/);
    process.env.SCHEDULING_LINK = "https://cal.example/arjun";
    await expect(S.buildPreview(id)).resolves.toMatchObject({ type: "invite" });
  });
});
