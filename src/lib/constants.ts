export const ROLES = ["PM", "SPM"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  PM: "Product Manager",
  SPM: "Senior Product Manager",
};

export function otherRole(role: Role): Role {
  return role === "PM" ? "SPM" : "PM";
}

/** How many people per role sit above the line (before the score bar). */
export const SHORTLIST_SIZE = 5;

/**
 * The bar. A top-5 candidate below this total is shown as "Top 5, below bar":
 * they get a brief (so Arjun can make the call) but a rejection draft by default.
 * Calibration on the 8 hires: every Exceeds >= 62.5, every Meets <= 45.
 */
export const MIN_SCORE = 50;

/** Files with less extracted text than this are rejected (likely a scanned image). */
export const MIN_TEXT_CHARS = 200;

export const INVITE_MAX_WORDS = 150;
export const REJECTION_MAX_WORDS = 120;

/** Vercel rejects request bodies over 4.5 MB, so uploads are limited a little below that. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
