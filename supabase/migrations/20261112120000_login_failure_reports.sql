-- Login failure reports: anonymous visitors report that Google sign-in is disabled or failing.
-- Only the service role (the report-login-failure Edge Function) writes or reads this table.
-- RLS is enabled with NO policies and every API role is revoked, so anon/authenticated get 42501.
-- Not published to Realtime on purpose.

create table public.login_failure_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('google_disabled', 'google_error')),
  error_kind text check (char_length(error_kind) <= 64),
  message text check (char_length(message) <= 1000),
  contact text check (char_length(contact) <= 254),
  path text check (char_length(path) <= 200),
  user_agent text check (char_length(user_agent) <= 300),
  ip_hash text not null,
  emailed boolean not null default false
);

comment on table public.login_failure_reports is
  'Reports of failed/disabled Google sign-in. Written only by the report-login-failure Edge Function (service role); no API role can read or write it.';

alter table public.login_failure_reports enable row level security;

revoke all on public.login_failure_reports from public, anon, authenticated;

create index login_failure_reports_ip_created_idx on public.login_failure_reports (ip_hash, created_at);
create index login_failure_reports_created_idx on public.login_failure_reports (created_at);
