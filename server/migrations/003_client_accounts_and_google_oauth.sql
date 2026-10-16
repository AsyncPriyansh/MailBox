create table if not exists public.google_sheet_connections(
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  google_email citext not null,
  encrypted_refresh_token text not null,
  spreadsheet_id text,
  spreadsheet_title text,
  sheet_range text not null default 'Leads!A1:Z5000',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
