-- Neon schema. Applied by `npm run db:migrate` (idempotent).
create table if not exists datasets (
  key        text primary key,          -- e.g. 'videos', 'news', 'leagues/isl'
  data       jsonb not null,
  hash       text not null,
  updated_at timestamptz not null default now()
);

create table if not exists ingest_runs (
  id          bigserial primary key,
  job         text not null,
  started_at  timestamptz not null,
  finished_at timestamptz not null default now(),
  status      text not null check (status in ('ok', 'error')),
  changed     boolean not null default false,
  error       text
);
create index if not exists ingest_runs_job_started on ingest_runs (job, started_at desc);
