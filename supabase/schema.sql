-- Kargo hiring dashboard: full schema.
-- Paste into Supabase -> SQL Editor -> Run. Safe to re-run (creates only what is missing).
-- All access is server-side with the service-role key. RLS is ON with NO policies,
-- so the anon/public key can read or write nothing.

create extension if not exists pgcrypto;

-- One row per rubric file that has been seeded. Exactly one is active.
create table if not exists rubric_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null,                       -- e.g. "class-1" or "draft-1"
  source_file text not null,                 -- rubric.txt | rubric.draft.txt
  content_hash text not null unique,
  max_score int not null,                    -- 2 for the class rubric (0/1/2)
  scoring_rules text not null default '',    -- the shared "HOW TO SCORE" rules
  role_notes jsonb not null default '{}',    -- per-role preamble (e.g. the SPM bar)
  spm_requires_pm_strong boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references rubric_versions(id) on delete cascade,
  role text not null check (role in ('PM','SPM')),
  name text not null,
  description text not null,                 -- full strong / partial / weak text + examples
  max_score int not null,
  weight numeric(5,2) not null check (weight > 0),
  sort_order int not null,
  unique (version_id, role, sort_order)
);

-- Role context from the JDs (used ONLY for briefs and emails, never scoring).
create table if not exists role_context (
  role text primary key check (role in ('PM','SPM')),
  jd_text text not null,
  source_file text,
  updated_at timestamptz not null default now()
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  applied_role text not null check (applied_role in ('PM','SPM')),
  cv_content text not null,                  -- REDACTED text: the only thing AI ever sees
  headline text,
  content_hash text not null unique,         -- duplicate detection
  status text not null default 'processing'
    check (status in ('processing','scored','needs_name','error')),
  stage text not null default 'extracted'
    check (stage in ('needs_name','extracted','scored_pm','scored','drafted')),
  error text,
  rubric_version_id uuid references rubric_versions(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PRIVATE. Read only by the send step and the UI name display. Never sent to AI.
create table if not exists candidate_pii (
  candidate_id uuid primary key references candidates(id) on delete cascade,
  name text,
  name_confident boolean not null default false,
  email text,
  phone text,
  links text[] not null default '{}',
  source_filename text
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  role text not null check (role in ('PM','SPM')),
  criterion_id uuid not null references rubric_criteria(id) on delete cascade,
  score int not null,                        -- after code rules (e.g. SPM cap)
  model_score int not null,                  -- what the model returned
  capped boolean not null default false,
  reason text not null,
  evidence text not null default '',
  evidence_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (candidate_id, role, criterion_id)
);

-- Computed in code after every scoring run.
create table if not exists role_totals (
  candidate_id uuid not null references candidates(id) on delete cascade,
  role text not null check (role in ('PM','SPM')),
  total numeric(5,1) not null,
  is_applied boolean not null,               -- true = the role they applied for
  rank int,                                  -- applied: real rank; other: where they WOULD rank
  in_top5 boolean not null default false,
  above_line boolean not null default false,
  band text not null default 'below' check (band in ('above','top5_below_bar','below')),
  tied_count int not null default 0,
  tiebreak_note text,
  cross_role_fit boolean not null default false,
  rubric_version_id uuid references rubric_versions(id),
  computed_at timestamptz not null default now(),
  primary key (candidate_id, role)
);

create table if not exists briefs (
  candidate_id uuid not null references candidates(id) on delete cascade,
  role text not null check (role in ('PM','SPM')),
  text text not null,
  hidden boolean not null default false,     -- kept but hidden when they drop out of the top 5
  used_jd boolean not null default false,
  generated_at timestamptz not null default now(),
  primary key (candidate_id, role)
);

create table if not exists emails (
  candidate_id uuid primary key references candidates(id) on delete cascade,
  type text not null check (type in ('invite','rejection')),
  kind text not null check (kind in ('invite','invite_plus_other','invite_other_role','rejection')),
  override_kind text check (override_kind in ('invite','invite_plus_other','invite_other_role','rejection')),
  subject text not null,
  body_template text not null,               -- contains [NAME] and {{SCHEDULING_LINK}}
  edited boolean not null default false,
  outdated boolean not null default false,
  used_jd boolean not null default false,
  generated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  sent_at timestamptz,
  sent_to text,
  resend_id text,
  final_subject text,
  final_body text,
  send_error text
);

-- Decision log. Details never contain names, emails or phones.
create table if not exists events (
  id bigserial primary key,
  candidate_id uuid references candidates(id) on delete cascade,
  at timestamptz not null default now(),
  action text not null,
  detail jsonb not null default '{}'
);

create index if not exists events_candidate_idx on events(candidate_id, at desc);
create index if not exists scores_candidate_idx on scores(candidate_id, role);

alter table rubric_versions enable row level security;
alter table rubric_criteria enable row level security;
alter table role_context    enable row level security;
alter table candidates      enable row level security;
alter table candidate_pii   enable row level security;
alter table scores          enable row level security;
alter table role_totals     enable row level security;
alter table briefs          enable row level security;
alter table emails          enable row level security;
alter table events          enable row level security;
-- No policies on purpose.
