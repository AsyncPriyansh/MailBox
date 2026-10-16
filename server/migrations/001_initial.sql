create extension if not exists pgcrypto;
create extension if not exists citext;
create table if not exists public.workspaces(
 id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now()
);
create table if not exists public.contacts(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 primary_email citext not null, full_name text not null default '', primary_phone text, company text, source text not null default 'Meta Lead Ads', campaign text,
 status text not null default 'new' check(status in('new','contacted','qualified','unsubscribed')),
 source_updated_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,primary_email)
);
create index if not exists contacts_workspace_date_idx on public.contacts(workspace_id,created_at desc);
create table if not exists public.campaigns(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,subject text not null,html_source text not null,
 status text not null default 'draft' check(status in('draft','scheduled','sending','completed','failed','paused')),recipient_count integer not null default 0,sent_count integer not null default 0,scheduled_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.suppression_list(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,email citext not null,reason text not null check(reason in('bounce','complaint','manual','unsubscribe')),created_at timestamptz not null default now(),unique(workspace_id,email)
);
create table if not exists public.email_jobs(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,campaign_id uuid references public.campaigns(id) on delete cascade,contact_id uuid references public.contacts(id) on delete set null,
 idempotency_key text not null unique,status text not null default 'queued' check(status in('scheduled','queued','sending','sent','delivered','bounced','failed','suppressed')),provider text,provider_message_id text,last_error text,attempts integer not null default 0,created_at timestamptz not null default now()
);
create table if not exists public.email_events(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,campaign_id uuid references public.campaigns(id) on delete cascade,email citext not null,event_type text not null,event_data jsonb,occurred_at timestamptz not null default now()
);
create table if not exists public.email_templates(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,subject text not null,html_source text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists email_templates_workspace_idx on public.email_templates(workspace_id,updated_at desc);
create table if not exists public.integration_sync_state(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,integration text not null,last_synced_at timestamptz,last_imported integer not null default 0,last_error text,updated_at timestamptz not null default now(),primary key(workspace_id,integration)
);
