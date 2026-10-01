/**
 * Personal-detail extraction and redaction. Plain code, no AI.
 * Nothing in this file may log the values it handles.
 */

export interface ExtractedPii {
  name: string | null;
  nameConfident: boolean;
  email: string | null;
  phone: string | null;
  links: string[];
}

export interface RedactionResult {
  pii: ExtractedPii;
  cvContent: string;
}

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s|,;)>\]]+|\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com|twitter\.com|x\.com|kaggle\.com|wa\.me|t\.me)\/[^\s|,;)>\]]*/gi;
// A run of digits with common phone separators. Validated by digit count below.
const PHONE_CANDIDATE_RE = /(?:\+\s?)?\(?\d[\d\s().-]{7,}\d/g;

const SENSITIVE_LABELS = [
  "address", "permanent address", "current address", "residential address", "residence",
  "location", "current location", "dob", "d\\.o\\.b\\.?", "date of birth", "born", "age",
  "gender", "sex", "marital status", "nationality", "religion", "caste", "father'?s name",
  "mother'?s name", "spouse", "passport(?: no\\.?| number)?", "aadhaa?r(?: no\\.?| number)?",
  "pan(?: no\\.?| number)?", "languages known",
];
const SENSITIVE_RE = new RegExp(
  `^\\s*(?:${SENSITIVE_LABELS.join("|")})\\s*(?:[:\\-–—]|\\s{2,})`,
  "i",
);
const SENSITIVE_INLINE_RE = new RegExp(`\\b(?:${SENSITIVE_LABELS.join("|")})\\s*:`, "i");
const GENDER_WORD_RE = /^\s*(?:male|female|non-binary|man|woman)\s*$/i;

const NOT_A_NAME = new Set(
  [
    "curriculum", "vitae", "resume", "résumé", "cv", "profile", "summary", "professional",
    "product", "manager", "senior", "contact", "details", "personal", "experience", "education",
    "skills", "objective", "about", "me", "page", "of", "and", "the", "work", "history",
    "operations", "executive", "lead", "head", "engineer", "analyst", "consultant", "associate",
    "director", "founder", "mumbai", "bangalore", "bengaluru", "delhi", "pune", "chennai",
    "hyderabad", "india", "kolkata", "gurgaon", "gurugram", "noida", "ahmedabad",
  ].map((s) => s.toLowerCase()),
);

/** Count the digits in a candidate phone match; 10–13 digits counts as a phone number. */
function isPhone(match: string): boolean {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return false;
  // Year ranges like "2019 2020 2021" are not phones.
  if (/^(?:(?:19|20)\d{2}[\s.-]*){3,}$/.test(match.trim())) return false;
  return true;
}

export function findPhones(text: string): string[] {
  return (text.match(PHONE_CANDIDATE_RE) ?? []).filter(isPhone).map((m) => m.trim());
}

function looksLikeNameLine(line: string): boolean {
  const t = line.trim().replace(/\s+/g, " ");
  if (t.length < 3 || t.length > 50) return false;
  if (/[\d@:/|•,]/.test(t)) return false;
  const words = t.split(" ");
  if (words.length < 2 || words.length > 4) return false;
  for (const w of words) {
    if (!/^[A-Z][A-Za-z'’.-]*$/.test(w) && !/^[A-Z][A-Z'’.-]+$/.test(w)) return false;
    if (NOT_A_NAME.has(w.toLowerCase().replace(/[.]/g, ""))) return false;
  }
  return true;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Name guess from a filename like "cv_01_rohan_desai.docx" or "Priya Sharma - CV.pdf". */
export function nameFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  const words = base
    .split(/[\s_\-.()]+/)
    .filter((w) => /^[A-Za-z][A-Za-z']+$/.test(w))
    .filter((w) => !NOT_A_NAME.has(w.toLowerCase()) && !/^(?:pm|spm|final|updated|new|v\d*|copy)$/i.test(w));
  if (words.length < 2 || words.length > 4) return null;
  return titleCase(words.join(" "));
}

export function nameParts(name: string): string[] {
  return name
    .split(/\s+/)
    .map((p) => p.replace(/[.,]/g, ""))
    .filter((p) => p.length >= 2);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Patterns for a name. The full name is matched case-insensitively. Each part is matched
 * when capitalised (Rohan / ROHAN), so ordinary words that happen to be names ("will",
 * "grace") are not stripped from the CV text.
 */
function namePatterns(name: string): RegExp[] {
  const out: RegExp[] = [];
  const full = name.trim().split(/\s+/).map(escapeRe).join("\\s+");
  if (full) out.push(new RegExp(`\\b${full}\\b`, "gi"));
  for (const part of nameParts(name)) {
    const p = escapeRe(part);
    const cap = escapeRe(part[0].toUpperCase() + part.slice(1).toLowerCase());
    out.push(new RegExp(`\\b(?:${cap}|${p.toUpperCase()})\\b`, "g"));
  }
  return out;
}

function detectName(lines: string[], filename: string): { name: string | null; confident: boolean } {
  const fromFile = nameFromFilename(filename);
  const top = lines.map((l) => l.trim()).filter(Boolean).slice(0, 6);

  for (const line of top) {
    const labelled = line.match(/^name\s*[:\-–]\s*(.+)$/i);
    if (labelled && looksLikeNameLine(labelled[1])) {
      return { name: titleCaseIfUpper(labelled[1].trim()), confident: true };
    }
  }
  const idx = top.findIndex(looksLikeNameLine);
  if (idx >= 0) {
    const name = titleCaseIfUpper(top[idx].replace(/\s+/g, " "));
    const fileAgrees =
      !!fromFile && nameParts(fromFile).some((p) => nameParts(name).some((q) => q.toLowerCase() === p.toLowerCase()));
    // Confident if it is the very first line, or the filename agrees.
    return { name, confident: idx === 0 || fileAgrees };
  }
  if (fromFile) {
    const text = lines.join("\n");
    const appears = nameParts(fromFile).every((p) => new RegExp(`\\b${escapeRe(p)}\\b`, "i").test(text));
    return { name: fromFile, confident: appears };
  }
  return { name: null, confident: false };
}

function titleCaseIfUpper(s: string): string {
  return s === s.toUpperCase() ? titleCase(s) : s;
}

/** Remove a name (full + each part) from text. Used at ingestion and when Arjun types a name. */
export function redactName(text: string, name: string): string {
  let out = text;
  for (const re of namePatterns(name)) out = out.replace(re, "[NAME]");
  return out.replace(/\[NAME\](?:\s+\[NAME\])+/g, "[NAME]");
}

export function extractAndRedact(rawText: string, filename: string): RedactionResult {
  const text = rawText.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const lines = text.split("\n");

  const emails = [...new Set(text.match(EMAIL_RE) ?? [])];
  const links = [...new Set((text.match(URL_RE) ?? []).map((l) => l.replace(/[.]+$/, "")))];
  const phones = findPhones(text);
  const { name, confident } = detectName(lines, filename);

  const contactLines = new Set<number>();
  lines.forEach((l, i) => {
    if (i < 12 && (EMAIL_RE.test(l) || findPhones(l).length || URL_RE.test(l))) contactLines.add(i);
    EMAIL_RE.lastIndex = 0;
    URL_RE.lastIndex = 0;
  });

  let redactedLines = lines.map((line, i) => {
    if (SENSITIVE_RE.test(line) || GENDER_WORD_RE.test(line)) return "[REDACTED PERSONAL DETAIL]";
    let l = line;
    // Lines like "Mumbai | DOB: 01/01/1990 | Male": redact the sensitive segments.
    if (/[|•·]/.test(l)) {
      l = l
        .split(/([|•·])/)
        .map((seg) =>
          SENSITIVE_INLINE_RE.test(seg) || GENDER_WORD_RE.test(seg) ? " [REDACTED PERSONAL DETAIL] " : seg,
        )
        .join("");
    } else if (SENSITIVE_INLINE_RE.test(l) && l.length < 80) {
      return "[REDACTED PERSONAL DETAIL]";
    }
    // The contact header (email / phone / links, often with a home city). Keep only segments
    // that read like content (3+ words, e.g. a certification); everything else goes.
    if (contactLines.has(i)) {
      const kept = l
        .split(/\s*[|•·]\s*/)
        .filter((seg) => {
          EMAIL_RE.lastIndex = 0;
          URL_RE.lastIndex = 0;
          if (EMAIL_RE.test(seg) || URL_RE.test(seg) || findPhones(seg).length) return false;
          return (seg.match(/[A-Za-z]{2,}/g) ?? []).length >= 3;
        });
      EMAIL_RE.lastIndex = 0;
      URL_RE.lastIndex = 0;
      return kept.length ? `[CONTACT DETAILS] | ${kept.join(" | ")}` : "[CONTACT DETAILS]";
    }
    return l;
  });

  let cv = redactedLines.join("\n");
  cv = cv.replace(EMAIL_RE, "[EMAIL]");
  cv = cv.replace(URL_RE, "[LINK]");
  cv = cv.replace(PHONE_CANDIDATE_RE, (m) => (isPhone(m) ? "[PHONE]" : m));
  if (name) cv = redactName(cv, name);
  cv = cv
    .replace(/(?:\[CONTACT DETAILS\]\n?){2,}/g, "[CONTACT DETAILS]\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    pii: {
      name,
      nameConfident: confident,
      email: emails[0] ?? null,
      phone: phones[0] ?? null,
      links,
    },
    cvContent: cv,
  };
}

export class PiiLeakError extends Error {
  constructor(public kinds: string[]) {
    // Names the kind of leak only; never the value.
    super(`Blocked: personal details still present in the text sent to AI (${kinds.join(", ")}).`);
  }
}

/**
 * The guardrail. Runs on every string sent to Gemini.
 * Fails if it finds an email pattern, a 10-digit phone pattern or the candidate's name.
 * `trusted` = fixed rubric text that may mention past hires by first name.
 */
export function assertNoPii(text: string, name: string | null | undefined, trusted: string[] = []): void {
  const kinds: string[] = [];
  EMAIL_RE.lastIndex = 0;
  if (EMAIL_RE.test(text)) kinds.push("email");
  EMAIL_RE.lastIndex = 0;
  if (findPhones(text).length) kinds.push("phone");
  // The name check skips fixed text we wrote (the rubric quotes past hires like "Rohan" or
  // "Rahul"; an applicant sharing that first name must not be blocked). Everything that comes
  // from the candidate (CV text, model reasons, evidence) is still checked.
  let candidateText = text;
  for (const t of trusted) if (t) candidateText = candidateText.split(t).join(" ");
  if (name && namePatterns(name).some((re) => { re.lastIndex = 0; return re.test(candidateText); })) kinds.push("name");
  if (kinds.length) throw new PiiLeakError(kinds);
}

/** Swap the AI's placeholders for real values. Only ever done at preview/send time. */
export function fillTemplate(
  template: string,
  values: { name: string; schedulingLink?: string },
): string {
  const first = values.name.trim().split(/\s+/)[0] || values.name.trim();
  let out = template.replace(/\[NAME\]/g, first);
  if (values.schedulingLink) out = out.replace(/\{\{\s*SCHEDULING_LINK\s*\}\}/g, values.schedulingLink);
  return out;
}

export function unfilledPlaceholders(text: string): string[] {
  const found: string[] = [];
  if (/\[NAME\]/.test(text)) found.push("[NAME]");
  if (/\{\{\s*SCHEDULING_LINK\s*\}\}/.test(text)) found.push("{{SCHEDULING_LINK}}");
  if (/\[(?:EMAIL|PHONE|LINK|CONTACT DETAILS|REDACTED PERSONAL DETAIL)\]/.test(text)) found.push("redaction token");
  return found;
}
