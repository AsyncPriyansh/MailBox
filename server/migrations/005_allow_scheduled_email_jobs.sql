-- Keep recipient jobs in the scheduled state until their delayed queue job runs.
alter table public.email_jobs
  drop constraint if exists email_jobs_status_check;

alter table public.email_jobs
  add constraint email_jobs_status_check
  check (status in (
    'scheduled',
    'queued',
    'sending',
    'sent',
    'delivered',
    'bounced',
    'failed',
    'suppressed'
  ));
