import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./constants";
import type { Band, EmailKind } from "./ranking";
import { env } from "./env";

// Server-only: uses the service-role key. Never import this from a client component.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export class DbError extends Error {}

/** Unwrap a Supabase response, turning errors into readable messages. */
export function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) {
    const hint =
      res.error.code === "42P01" || /relation .* does not exist|schema cache/i.test(res.error.message)
        ? " The tables are missing: run supabase/schema.sql in the Supabase SQL editor."
        : "";
    throw new DbError(`Database error while ${what}: ${res.error.message}.${hint}`);
  }
  return res.data as T;
}

export interface RubricVersionRow {
  id: string;
  label: string;
  source_file: string;
  content_hash: string;
  max_score: number;
  scoring_rules: string;
  role_notes: Partial<Record<Role, string>>;
  spm_requires_pm_strong: boolean;
  is_active: boolean;
  created_at: string;
}

export interface CriterionRow {
  id: string;
  version_id: string;
  role: Role;
  name: string;
  description: string;
  max_score: number;
  weight: number;
  sort_order: number;
}

export interface CandidateRow {
  id: string;
  applied_role: Role;
  cv_content: string;
  headline: string | null;
  content_hash: string;
  status: "processing" | "scored" | "needs_name" | "error";
  stage: "needs_name" | "extracted" | "scored_pm" | "scored" | "drafted";
  error: string | null;
  rubric_version_id: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface PiiRow {
  candidate_id: string;
  name: string | null;
  name_confident: boolean;
  email: string | null;
  phone: string | null;
  links: string[];
  source_filename: string | null;
}

export interface ScoreRow {
  id: string;
  candidate_id: string;
  role: Role;
  criterion_id: string;
  score: number;
  model_score: number;
  capped: boolean;
  reason: string;
  evidence: string;
  evidence_verified: boolean;
}

export interface RoleTotalRow {
  candidate_id: string;
  role: Role;
  total: number;
  is_applied: boolean;
  rank: number | null;
  in_top5: boolean;
  above_line: boolean;
  band: Band;
  tied_count: number;
  tiebreak_note: string | null;
  cross_role_fit: boolean;
  rubric_version_id: string | null;
}

export interface BriefRow {
  candidate_id: string;
  role: Role;
  text: string;
  hidden: boolean;
  used_jd: boolean;
  generated_at: string;
}

export interface EmailRow {
  candidate_id: string;
  type: "invite" | "rejection";
  kind: EmailKind;
  override_kind: EmailKind | null;
  subject: string;
  body_template: string;
  edited: boolean;
  outdated: boolean;
  used_jd: boolean;
  generated_at: string;
  confirmed_at: string | null;
  sent_at: string | null;
  sent_to: string | null;
  resend_id: string | null;
  final_subject: string | null;
  final_body: string | null;
  send_error: string | null;
}

export interface EventRow {
  id: number;
  candidate_id: string | null;
  at: string;
  action: string;
  detail: Record<string, unknown>;
}

/** Decision log. `detail` must never contain names, emails or phone numbers. */
export async function logEvent(candidateId: string | null, action: string, detail: Record<string, unknown> = {}) {
  const res = await db().from("events").insert({ candidate_id: candidateId, action, detail });
  if (res.error) console.error(`[events] could not log ${action}: ${res.error.message}`);
}
