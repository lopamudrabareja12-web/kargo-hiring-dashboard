/**
 * Every prompt sent to Gemini is built here. Inputs are only: redacted cv_content,
 * rubric text, scores/reasons, role labels and (optionally) JD text. Never PII.
 */
import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import { INVITE_MAX_WORDS, REJECTION_MAX_WORDS, ROLE_LABEL, MIN_SCORE, otherRole, type Role } from "./constants";
import type { CriterionRow, RubricVersionRow } from "./db";
import { OutputInvalid } from "./gemini";
import { EMAIL_RE, findPhones } from "./pii";
import type { Band, EmailKind } from "./ranking";

const REDACTION_NOTE =
  "Tokens like [NAME], [EMAIL], [PHONE], [LINK], [CONTACT DETAILS] and [REDACTED PERSONAL DETAIL] mark personal details that were removed on purpose. Ignore them.";

/* ----------------------------- Scoring ----------------------------- */

export interface ScoreItem {
  criterion: number;
  evidence: string;
  reason: string;
  score: number;
}
export interface ScoreOutput {
  headline: string;
  criteria: ScoreItem[];
}

export const scoreSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: {
      type: Type.STRING,
      description: "Current or most recent job title and type of company, max 12 words. e.g. 'Operations Executive at a mid-sized freight forwarder'.",
    },
    criteria: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          criterion: { type: Type.INTEGER, description: "The criterion number, as given." },
          evidence: { type: Type.STRING, description: "Short verbatim quote copied from the CV, or empty string." },
          reason: { type: Type.STRING, description: "One line naming the specific thing in the CV that decided the score." },
          score: { type: Type.INTEGER },
        },
        required: ["criterion", "evidence", "reason", "score"],
        propertyOrdering: ["criterion", "evidence", "reason", "score"],
      },
    },
  },
  required: ["headline", "criteria"],
  propertyOrdering: ["headline", "criteria"],
};

export function scoringSystem(version: RubricVersionRow): string {
  return `You are an evidence-based CV assessor for Kargo, a logistics SaaS company in Mumbai. You rate ONE redacted CV against a fixed hiring rubric. A separate program adds up the scores; your only job is to rate each criterion.

Rules for every criterion:
1. Score only what is written in the CV. Do not give credit for what the candidate "probably" did.
2. Absence of evidence scores 0.
3. Never reward college names, employer brands, degrees, certifications or years of experience by themselves.
4. Never infer anything from gender, age, name, nationality or location. ${REDACTION_NOTE}
5. Apply each criterion's own Strong / Partial / Weak tests literally. The examples in the rubric quote past Kargo hires; they show the bar and are not about this candidate.
6. Scores are integers from 0 to ${version.max_score}.
7. "reason": one line (under 30 words) naming the specific CV content that decided the score, or what is missing.
8. "evidence": a short quote copied word-for-word from the CV (under 30 words) supporting the score. Use "" if there is no relevant evidence. Never paraphrase inside the quote.
9. Return exactly one entry per criterion number.
10. Never mention the past hires named in the rubric's examples in your reason or evidence; describe this CV only.

The rubric's shared scoring rules (follow them exactly, including the rules about not counting one CV line twice):
${version.scoring_rules}`;
}

function criteriaBlock(criteria: CriterionRow[]): string {
  return criteria
    .map((c) => `### Criterion ${c.sort_order}: ${c.name} (weight ${c.weight}%)\n${c.description}`)
    .join("\n\n");
}

export function pmScoringPrompt(criteria: CriterionRow[], cv: string, version: RubricVersionRow): string {
  const notes = version.role_notes?.PM ? `\nRole notes:\n${version.role_notes.PM}\n` : "";
  return `Role: ${ROLE_LABEL.PM} (PM).${notes}
Score the CV below on each of these ${criteria.length} criteria.

${criteriaBlock(criteria)}

=== CV (redacted) ===
${cv}
=== END CV ===`;
}

export function spmScoringPrompt(
  spm: CriterionRow[],
  pm: CriterionRow[],
  pmScores: Map<string, { score: number; reason: string }>,
  cv: string,
  version: RubricVersionRow,
): string {
  const notes = version.role_notes?.SPM ? `\nRole notes:\n${version.role_notes.SPM}\n` : "";
  const blocks = spm
    .map((c) => {
      const pmC = pm.find((p) => p.name === c.name) ?? pm.find((p) => p.sort_order === c.sort_order);
      const pmRes = pmC ? pmScores.get(pmC.id) : undefined;
      let block = `### Criterion ${c.sort_order}: ${c.name} (weight ${c.weight}%)\n${c.description}`;
      if (version.spm_requires_pm_strong && pmC) {
        block += `\n\n[Reference: the PM test this SPM criterion builds on]\n${pmC.description}`;
        if (pmRes) {
          block += `\n\n[This CV's PM result for "${pmC.name}": ${pmRes.score}/${version.max_score}. ${pmRes.reason}]`;
          if (pmRes.score < version.max_score) block += `\nThe PM result is below Strong, so the SPM score here must be 0.`;
        }
      }
      return block;
    })
    .join("\n\n");
  return `Role: ${ROLE_LABEL.SPM} (SPM).${notes}
Score the CV below on each of these ${spm.length} criteria, using the SPM bar.

${blocks}

=== CV (redacted) ===
${cv}
=== END CV ===`;
}

export function makeScoreValidator(criteria: CriterionRow[], maxScore: number) {
  const shape = z.object({
    headline: z.string(),
    criteria: z.array(
      z.object({ criterion: z.number().int(), evidence: z.string(), reason: z.string().min(3), score: z.number().int() }),
    ),
  });
  return (data: unknown): ScoreOutput => {
    const parsed = shape.safeParse(data);
    if (!parsed.success) throw new OutputInvalid(`the JSON did not match the schema (${parsed.error.issues[0]?.message})`);
    const out = parsed.data;
    const wanted = new Set(criteria.map((c) => c.sort_order));
    const got = out.criteria.map((c) => c.criterion);
    if (got.length !== wanted.size || !got.every((n) => wanted.has(n)) || new Set(got).size !== got.length) {
      throw new OutputInvalid(`it must contain exactly one entry for each criterion number ${[...wanted].join(", ")}`);
    }
    const bad = out.criteria.find((c) => c.score < 0 || c.score > maxScore);
    if (bad) throw new OutputInvalid(`criterion ${bad.criterion} has score ${bad.score}, outside 0-${maxScore}`);
    return { headline: out.headline.trim().slice(0, 120), criteria: out.criteria };
  };
}

/* ------------------------------ Brief ------------------------------ */

export interface BriefInput {
  role: Role;
  rank: number;
  poolSize: number;
  band: Band;
  total: number;
  maxScore: number;
  criteria: { name: string; weight: number; score: number; reason: string; evidence: string }[];
  cv: string;
  jd: string | null;
}

export const briefSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    who: { type: Type.STRING, description: "Sentence 1: who they are professionally." },
    why: { type: Type.STRING, description: "Sentence 2: why they rank here, naming the top-weighted criteria and evidence." },
    probe: { type: Type.STRING, description: "Sentence 3: what to probe in the interview (weakest criterion or an unverified claim)." },
  },
  required: ["who", "why", "probe"],
  propertyOrdering: ["who", "why", "probe"],
};

export const BRIEF_SYSTEM = `You write interview briefs for Arjun, Kargo's founder, who has 10 minutes to decide on a candidate.
Write exactly three sentences, one per field, each under 40 words:
1. who: who the candidate is professionally (current/recent role and domain).
2. why: why they rank where they do: name the highest-weighted criteria and cite the specific evidence.
3. probe: what Arjun should probe in the interview: the weakest criterion, or a claim the CV makes without proof.
Rules: use only the CV and the scores given. Do not invent facts. Refer to the candidate as "they" or "the candidate", never by name. Do not judge them against any job description; the rubric scores are the judgement. ${REDACTION_NOTE}`;

export function briefPrompt(b: BriefInput): string {
  const crit = [...b.criteria]
    .sort((x, y) => y.weight - x.weight)
    .map((c) => `- ${c.name} (weight ${c.weight}%): ${c.score}/${b.maxScore}. ${c.reason}${c.evidence ? ` Evidence: "${c.evidence}"` : ""}`)
    .join("\n");
  const position =
    b.band === "top5_below_bar"
      ? `They are rank ${b.rank} of ${b.poolSize} ${b.role} applicants, which is inside the top 5, but their total of ${b.total}/100 is below the ${MIN_SCORE} bar, so the default is a rejection unless Arjun decides otherwise. Make the "why" sentence say clearly what keeps them below the bar.`
      : `They are rank ${b.rank} of ${b.poolSize} ${b.role} applicants with ${b.total}/100.`;
  return `Role applied for: ${ROLE_LABEL[b.role]} (${b.role}).
${position}

Rubric scores (computed from the rubric, highest weight first):
${crit}
${b.jd ? `\nRole context from the job description (for describing the role only, not for judging):\n${b.jd.slice(0, 3000)}\n` : ""}
=== CV (redacted) ===
${b.cv}
=== END CV ===`;
}

export function validateBrief(data: unknown): string {
  const p = z.object({ who: z.string().min(10), why: z.string().min(10), probe: z.string().min(10) }).safeParse(data);
  if (!p.success) throw new OutputInvalid("the brief must have three non-empty sentences: who, why, probe");
  const sentences = [p.data.who, p.data.why, p.data.probe].map((s) => {
    const t = s.trim().replace(/\s+/g, " ");
    return /[.!?]$/.test(t) ? t : `${t}.`;
  });
  for (const s of sentences) {
    // A field holding two sentences ("X. Y.") breaks the three-sentence rule.
    const noAbbrev = s.replace(/\b(?:e\.g|i\.e|etc|vs|approx|Pvt|Ltd|Inc|Co|No|Sr|Jr|St|Mr|Ms|Dr)\./g, "_");
    if (/[.!?]\s+[A-Z]/.test(noAbbrev)) throw new OutputInvalid("each field must be exactly one sentence");
  }
  const text = sentences.join(" ");
  checkNoContactPatterns(text);
  return text;
}

/* ------------------------------ Email ------------------------------ */

export interface EmailInput {
  kind: EmailKind;
  appliedRole: Role;
  cv: string;
  strengths: { name: string; reason: string; evidence: string }[];
  senderName: string;
  jd: string | null;
}

export const emailSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING },
    body: { type: Type.STRING },
  },
  required: ["subject", "body"],
  propertyOrdering: ["subject", "body"],
};

export function emailSystem(senderName: string): string {
  return `You draft candidate emails for Arjun Mehta, founder of Kargo (logistics SaaS, Mumbai). Arjun reads and approves every email before it is sent.
Rules:
- Write [NAME] (exactly, with the square brackets) wherever the candidate's name goes, starting with "Hi [NAME],". You do not know their name; never invent one.
- Plain text, no markdown, no emojis. Warm, direct, human. No HR boilerplate ("we regret to inform", "after careful consideration", "we received a high volume").
- Refer to one or two concrete things from their CV, in plain words.
- No false promises: never say you will keep their CV on file, be in touch about future roles, or that the decision was close unless told so.
- Sign off with: "${senderName}".
- ${REDACTION_NOTE} Never mention them.`;
}

function kindInstruction(kind: EmailKind, applied: Role): string {
  const a = ROLE_LABEL[applied];
  const o = ROLE_LABEL[otherRole(applied)];
  switch (kind) {
    case "invite":
      return `Write an INTERVIEW INVITE for the ${a} role. Mention one or two concrete things from their background that made Arjun want to talk. Ask them to book a time at {{SCHEDULING_LINK}} (write exactly that placeholder once). Under ${INVITE_MAX_WORDS} words.`;
    case "invite_plus_other":
      return `Write an INTERVIEW INVITE for the ${a} role. Mention one or two concrete things from their background. Also say their background looks like a fit for the ${o} role, and that Arjun is happy to discuss both in the conversation. Ask them to book a time at {{SCHEDULING_LINK}} (exactly that placeholder, once). Under ${INVITE_MAX_WORDS} words.`;
    case "invite_other_role":
      return `They applied for the ${a} role and are not moving forward for that role: say so clearly and kindly. But their background is a strong fit for the ${o} role, so INVITE them to interview for the ${o} role instead, naming one or two concrete things from their CV. Ask them to book a time at {{SCHEDULING_LINK}} (exactly that placeholder, once). Under ${INVITE_MAX_WORDS} words.`;
    case "rejection":
      return `Write a warm, human REJECTION for the ${a} role. Thank them for applying. Say clearly that they are not moving forward for this role. Mention one genuine positive from their CV. Do not invite them to anything and do not include any link. Under ${REJECTION_MAX_WORDS} words.`;
  }
}

export function emailPrompt(e: EmailInput): string {
  const strengths = e.strengths
    .map((s) => `- ${s.name}: ${s.reason}${s.evidence ? ` ("${s.evidence}")` : ""}`)
    .join("\n");
  return `${kindInstruction(e.kind, e.appliedRole)}

What stood out in their CV (from the rubric scoring):
${strengths || "- (nothing scored strongly; find one genuine positive in the CV)"}
${e.jd ? `\nRole context from the job description (for describing the role only):\n${e.jd.slice(0, 2000)}\n` : ""}
=== CV (redacted) ===
${e.cv}
=== END CV ===`;
}

const FALSE_PROMISES =
  /keep (?:your|you)[^.]{0,30}on file|(?:be|get) in touch (?:about|regarding|for|if) (?:future|other)|future (?:openings|opportunities|roles)|we regret to inform|after careful consideration|high volume of applications/i;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function checkNoContactPatterns(text: string) {
  EMAIL_RE.lastIndex = 0;
  if (EMAIL_RE.test(text) || findPhones(text).length) {
    EMAIL_RE.lastIndex = 0;
    throw new OutputInvalid("it contained an email address or phone number; never include contact details");
  }
  EMAIL_RE.lastIndex = 0;
}

export function makeEmailValidator(kind: EmailKind) {
  return (data: unknown): { subject: string; body: string } => {
    const p = z.object({ subject: z.string().min(3), body: z.string().min(40) }).safeParse(data);
    if (!p.success) throw new OutputInvalid("it must have a subject and a body");
    const subject = p.data.subject.trim().replace(/\[NAME\]/g, "").replace(/\s{2,}/g, " ").trim();
    const body = p.data.body.trim();
    if (!body.includes("[NAME]")) throw new OutputInvalid('the body must use the placeholder [NAME] for the name');
    const limit = kind === "rejection" ? REJECTION_MAX_WORDS : INVITE_MAX_WORDS;
    const words = wordCount(body);
    if (words > limit) throw new OutputInvalid(`the body has ${words} words; the limit is ${limit}`);
    const hasLink = /\{\{\s*SCHEDULING_LINK\s*\}\}/.test(body);
    if (kind !== "rejection" && !hasLink) throw new OutputInvalid("an invite must include {{SCHEDULING_LINK}} exactly");
    if (kind === "rejection" && hasLink) throw new OutputInvalid("a rejection must not include the scheduling link");
    if (FALSE_PROMISES.test(body)) throw new OutputInvalid("it used a false promise or HR boilerplate phrase");
    checkNoContactPatterns(subject + "\n" + body);
    return { subject, body };
  };
}
