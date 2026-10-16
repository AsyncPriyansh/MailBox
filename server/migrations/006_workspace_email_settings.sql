-- Existing projects may have the base lead/campaign tables without ever
-- applying the templates migration. Make this migration safe for that state.
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  subject text not null,
  html_source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_templates_workspace_idx
  on public.email_templates(workspace_id, updated_at desc);

alter table public.email_templates
  add column if not exists preheader text not null default '',
  add column if not exists mjml_source text,
  add column if not exists project_json jsonb,
  add column if not exists version_number integer not null default 1,
  add column if not exists last_used_at timestamptz;

create table if not exists public.email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.email_templates(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_number integer not null,
  name text not null,
  subject text not null,
  preheader text not null default '',
  mjml_source text,
  project_json jsonb,
  html_source text not null,
  created_at timestamptz not null default now(),
  unique(template_id, version_number)
);

create index if not exists email_template_versions_workspace_idx
  on public.email_template_versions(workspace_id, template_id, version_number desc);

alter table public.campaigns
  add column if not exists template_id uuid references public.email_templates(id) on delete set null;

create table if not exists public.integration_sync_state (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  integration text not null,
  last_synced_at timestamptz,
  last_imported integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, integration)
);

create table if not exists public.google_sheet_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  google_email citext not null,
  encrypted_refresh_token text not null,
  spreadsheet_id text,
  spreadsheet_title text,
  sheet_range text not null default 'Leads!A1:Z5000',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_email_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  welcome_template_id uuid references public.email_templates(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Preserve the old name-based selection for workspaces that already have a
-- welcome-named template.
do $$
begin
  insert into public.workspace_email_settings (workspace_id, welcome_template_id)
  select distinct on (workspace_id) workspace_id, id
  from public.email_templates
  where name ilike '%welcome%'
  order by workspace_id, updated_at desc
  on conflict (workspace_id) do nothing;
end $$;
