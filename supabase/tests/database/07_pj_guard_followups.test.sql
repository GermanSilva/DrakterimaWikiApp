-- pgTAP: guard follow-ups (dm stamp frozen, object-only sections_updated, safe date parse, future stamps clamped).
begin;

select plan(12);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create function tests.affected(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000021', 'authenticated', 'authenticated', 'h8f-dm@example.test'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 'h8f-owner@example.test');

insert into public.campaigns (id, slug, name) values
  ('dddddddd-0000-4000-8000-0000000000b1', 'h8f-camp', 'H8 follow-ups');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('dddddddd-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000021', 'dm'),
  ('dddddddd-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000022', 'player');

insert into public.pjs (id, campaign_id, owner_id, nombre, sections_updated) values
  (92001, 'dddddddd-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000022', 'With dm stamp',
   '{"equipo": "2026-01-01T00:00:00Z", "dm": "2026-01-02T00:00:00Z"}'),
  (92002, 'dddddddd-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000022', 'Without dm stamp', '{}');

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000022');

select throws_ok($$update public.pjs set sections_updated = sections_updated || '{"dm": "2026-09-01T00:00:00Z"}' where id = 92001$$, '42501', null,
  'an owner cannot move an existing dm stamp forward');
select throws_ok($$update public.pjs set sections_updated = '{"dm": "2026-09-01T00:00:00Z"}' where id = 92002$$, '42501', null,
  'an owner cannot add a dm stamp');

select throws_ok($$update public.pjs set sections_updated = 'null'::jsonb where id = 92001$$, '42501', null, 'JSON null is rejected with 42501');
select throws_ok($$update public.pjs set sections_updated = '[]'::jsonb where id = 92001$$, '42501', null, 'an array is rejected with 42501');
select throws_ok($$update public.pjs set sections_updated = '"x"'::jsonb where id = 92001$$, '42501', null, 'a scalar is rejected with 42501');
select throws_ok($$update public.pjs set sections_updated = null where id = 92001$$, '42501', null, 'SQL NULL is rejected with 42501');

select throws_ok($$update public.pjs set sections_updated = sections_updated || '{"stats": "2026-13-01T00:00:00Z"}' where id = 92001$$, '42501', null,
  'month 13 is a clean 42501, not a datetime cast error');
select throws_ok($$update public.pjs set sections_updated = sections_updated || '{"stats": "2026-01-01T99:00:00Z"}' where id = 92001$$, '42501', null,
  'hour 99 is a clean 42501');

select is(
  tests.affected(format($$update public.pjs set sections_updated = sections_updated || '{"stats": "%s"}' where id = 92001$$,
    to_char((now() + interval '1 hour') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
  1::bigint, 'a stamp one hour in the future (device clock ahead) is accepted');
select ok(
  (select (sections_updated ->> 'stats')::timestamptz <= now() and (sections_updated ->> 'stats')::timestamptz > now() - interval '1 minute'
   from public.pjs where id = 92001),
  'and it is stored clamped to the server time');

select throws_ok($$update public.pjs set sections_updated = sections_updated || '{"equipo": "2025-01-01T00:00:00Z"}' where id = 92001$$, '42501', null,
  'regressions are still rejected');
select throws_ok($$update public.pjs set sections_updated = sections_updated || '{"stats": "tomorrow"}' where id = 92001$$, '42501', null,
  'non-ISO values are still rejected');

select * from finish();
rollback;
