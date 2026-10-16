-- Add reusable templates and schedule metadata to an existing Mailbpox database.
alter table public.campaigns add column if not exists subject text not null default '';
alter table public.campaigns add column if not exists html_source text not null default '';
alter table public.campaigns add column if not exists scheduled_at timestamptz;
alter table public.campaigns add column if not exists recipient_count integer not null default 0;
alter table public.campaigns add column if not exists sent_count integer not null default 0;
alter table public.email_jobs drop constraint if exists email_jobs_status_check;
alter table public.email_jobs add constraint email_jobs_status_check check(status in('scheduled','queued','sending','sent','delivered','bounced','failed','suppressed'));
create table if not exists public.email_templates(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,subject text not null,html_source text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists email_templates_workspace_idx on public.email_templates(workspace_id,updated_at desc);
create table if not exists public.integration_sync_state(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 integration text not null,
 last_synced_at timestamptz,
 last_imported integer not null default 0,
 last_error text,
 updated_at timestamptz not null default now(),
 primary key(workspace_id,integration)
);
