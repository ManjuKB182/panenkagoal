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

-- Write tab: fan and analyst posts. Nothing is public until an editor sets status = 'published'.
-- body is a JSON array of blocks: [{"t":"p","txt":"..."} | {"t":"img","key":"...","cap":"...","credit":"..."}]
create table if not exists posts (
  id           bigserial primary key,
  slug         text not null unique,
  title        text not null,
  kind         text not null check (kind in ('fan', 'analyst')),
  author_name  text not null,
  author_email text not null,                -- never shown publicly; used to tell the writer it is live
  cover_key    text,                         -- R2 object key
  body         jsonb not null,
  photo_rights text not null default 'mine' check (photo_rights in ('mine', 'credit')),
  photo_credit text not null default '',
  status       text not null default 'pending' check (status in ('pending', 'published', 'sent_back')),
  editor_note  text,
  created_at   timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists posts_status_published on posts (status, published_at desc);

-- Per-IP submission log for the rate limit (IP is stored hashed).
create table if not exists write_submissions (
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index if not exists write_submissions_ip_at on write_submissions (ip_hash, at desc);
