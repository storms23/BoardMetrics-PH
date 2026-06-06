-- Pasa Rate PH — initial schema (PostgreSQL / Supabase)
-- Normalized, idempotent-ingest-friendly, extensible via the `programs` registry.

-- Needed for fast ILIKE search on school names.
create extension if not exists pg_trgm;

-- ─── Reference: programs (the extensibility backbone) ─────────────────────────
create table if not exists programs (
  id          bigint generated always as identity primary key,
  exam_code   text not null unique,
  name        text not null,
  level       text,                 -- e.g., 'Elementary' / 'Secondary' / null
  slug        text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── Reference: geography ─────────────────────────────────────────────────────
create table if not exists regions (
  id    bigint generated always as identity primary key,
  name  text not null unique,
  code  text
);

create table if not exists provinces (
  id         bigint generated always as identity primary key,
  region_id  bigint references regions(id) on delete set null,
  name       text not null,
  unique (region_id, name)
);

-- ─── Schools ──────────────────────────────────────────────────────────────────
create table if not exists schools (
  id           bigint generated always as identity primary key,
  name         text not null unique,
  slug         text unique,
  region_id    bigint references regions(id) on delete set null,
  province_id  bigint references provinces(id) on delete set null,
  school_type  text,                -- State / Private / Local
  created_at   timestamptz not null default now()
);

-- ─── Exam cycles (national level) ─────────────────────────────────────────────
create table if not exists exam_results (
  id             bigint generated always as identity primary key,
  program_id     bigint not null references programs(id) on delete cascade,
  month          text,
  year           integer not null,
  total_takers   integer,
  total_passers  integer,
  pass_rate      real,
  source_url     text,
  scraped_at     timestamptz not null default now(),
  unique (program_id, month, year)
);

-- ─── Per-school performance per cycle (core junction) ─────────────────────────
create table if not exists school_performance (
  id              bigint generated always as identity primary key,
  exam_result_id  bigint not null references exam_results(id) on delete cascade,
  school_id       bigint not null references schools(id) on delete cascade,
  takers          integer,
  passers         integer,
  pass_rate       real,
  rank            integer,
  scraped_at      timestamptz not null default now(),
  unique (exam_result_id, school_id)
);

-- ─── Topnotchers (Top 10 per cycle) ───────────────────────────────────────────
create table if not exists topnotchers (
  id              bigint generated always as identity primary key,
  exam_result_id  bigint not null references exam_results(id) on delete cascade,
  rank            integer not null,
  name            text,
  school          text,
  rating          real,
  scraped_at      timestamptz not null default now(),
  unique (exam_result_id, rank)
);

-- ─── Precomputed Consistency Score (per school × program) ─────────────────────
create table if not exists consistency_scores (
  id           bigint generated always as identity primary key,
  school_id    bigint not null references schools(id) on delete cascade,
  program_id   bigint not null references programs(id) on delete cascade,
  avg_rate     real,
  volatility   real,
  score        real,
  label        text,
  years        integer,
  computed_at  timestamptz not null default now(),
  unique (school_id, program_id)
);

-- ─── Admin: import jobs + audit logs ──────────────────────────────────────────
create table if not exists import_jobs (
  id             bigint generated always as identity primary key,
  program_id     bigint references programs(id) on delete set null,
  year           integer,
  status         text not null default 'pending', -- pending/running/success/failed
  rows_affected  integer default 0,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  notes          text
);

create table if not exists audit_logs (
  id          bigint generated always as identity primary key,
  actor       text,
  action      text not null,        -- import/update/delete
  entity      text not null,        -- table name
  entity_id   bigint,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_exam_results_program_year on exam_results (program_id, year);
create index if not exists idx_exam_results_year on exam_results (year);
create index if not exists idx_sp_exam on school_performance (exam_result_id);
create index if not exists idx_sp_school on school_performance (school_id);
create index if not exists idx_sp_rank on school_performance (rank);
create index if not exists idx_schools_region on schools (region_id);
create index if not exists idx_schools_name_trgm on schools using gin (name gin_trgm_ops);
create index if not exists idx_topnotchers_exam on topnotchers (exam_result_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Public (anon) role: read-only on public data. Writes go through the service
-- role (ETL/admin), which bypasses RLS.
alter table programs            enable row level security;
alter table regions             enable row level security;
alter table provinces           enable row level security;
alter table schools             enable row level security;
alter table exam_results        enable row level security;
alter table school_performance  enable row level security;
alter table topnotchers         enable row level security;
alter table consistency_scores  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'programs','regions','provinces','schools','exam_results',
    'school_performance','topnotchers','consistency_scores'
  ]
  loop
    execute format(
      'create policy %I on %I for select to anon using (true);',
      'anon_read_' || t, t
    );
  end loop;
end $$;

-- Admin tables (import_jobs, audit_logs) have RLS enabled but NO anon policies,
-- so they are not readable/writable by the public; only the service role.
alter table import_jobs enable row level security;
alter table audit_logs  enable row level security;
