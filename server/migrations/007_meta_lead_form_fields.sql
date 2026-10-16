-- Preserve only the additional Meta lead details used by the dashboard.
alter table public.contacts
  add column if not exists form_name text,
  add column if not exists source_lead_status text;
