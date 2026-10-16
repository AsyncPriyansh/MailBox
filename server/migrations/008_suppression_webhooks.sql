create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  raw_payload jsonb not null,
  signature_valid boolean not null default false,
  processed boolean not null default false,
  received_at timestamptz not null default now()
);

create index if not exists webhook_logs_workspace_provider_date_idx
  on public.webhook_logs(workspace_id, provider, received_at desc);
