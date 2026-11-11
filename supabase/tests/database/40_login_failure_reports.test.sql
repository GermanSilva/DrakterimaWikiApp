-- pgTAP: login_failure_reports is service-role only (no API access, no Realtime).
begin;

select plan(11);

select ok((select relrowsecurity from pg_class where oid = 'public.login_failure_reports'::regclass),
  'RLS is enabled');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'login_failure_reports'),
  0, 'no policies exist');
select is((select count(*)::int from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'login_failure_reports'),
  0, 'table is not published to Realtime');

-- constraints (as table owner)
select lives_ok($$insert into public.login_failure_reports (kind, ip_hash) values ('google_error', 'h')$$,
  'a valid row inserts');
select throws_ok($$insert into public.login_failure_reports (kind, ip_hash) values ('other', 'h')$$,
  '23514', null, 'invalid kind is rejected');
select throws_ok($$insert into public.login_failure_reports (kind, message, ip_hash) values ('google_error', repeat('x', 1001), 'h')$$,
  '23514', null, 'oversized message is rejected');
select throws_ok($$insert into public.login_failure_reports (kind, ip_hash) values (null, 'h')$$,
  '23502', null, 'null kind is rejected');

set local role anon;
select throws_ok($$select 1 from public.login_failure_reports$$, '42501', null, 'anon cannot select');
select throws_ok($$insert into public.login_failure_reports (kind, ip_hash) values ('google_error', 'h')$$,
  '42501', null, 'anon cannot insert');
reset role;

set local role authenticated;
select throws_ok($$select 1 from public.login_failure_reports$$, '42501', null, 'authenticated cannot select');
select throws_ok($$insert into public.login_failure_reports (kind, ip_hash) values ('google_error', 'h')$$,
  '42501', null, 'authenticated cannot insert');
reset role;

select * from finish();
rollback;
