alter table public.email_templates
  add column if not exists preheader text not null default '',
  add column if not exists mjml_source text,
  add column if not exists project_json jsonb,
  add column if not exists version_number integer not null default 1,
  add column if not exists last_used_at timestamptz;

create table if not exists public.email_template_versions(
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
  unique(template_id,version_number)
);

create index if not exists email_template_versions_workspace_idx
  on public.email_template_versions(workspace_id,template_id,version_number desc);

insert into public.email_template_versions(
  template_id,workspace_id,version_number,name,subject,preheader,mjml_source,project_json,html_source,created_at
)
select id,workspace_id,version_number,name,subject,preheader,mjml_source,project_json,html_source,updated_at
from public.email_templates
on conflict(template_id,version_number) do nothing;

alter table public.campaigns
  add column if not exists template_id uuid references public.email_templates(id) on delete set null;
