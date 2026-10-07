-- pgTAP: what an owner may write into custom_fields and sections_updated (H8a hardening).
-- Self-contained fixture, rolled back at the end.
begin;

select plan(17);

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
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'h8-dm@example.test'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'h8-owner@example.test');

insert into public.campaigns (id, slug, name) values
  ('dddddddd-0000-4000-8000-0000000000a1', 'h8-camp', 'H8 campaign');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('dddddddd-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-000000000011', 'dm'),
  ('dddddddd-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-000000000012', 'player');

insert into public.pjs (id, campaign_id, owner_id, nombre, sections_updated, data) values
  (91001, 'dddddddd-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-000000000012', 'Owned',
   '{"equipo": "2026-01-01T00:00:00Z", "dm": "2026-01-02T00:00:00Z"}',
   '{"custom_fields": {"lema": "viejo"}}'),
  (91002, 'dddddddd-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-000000000012', 'Owned without dm stamp', '{}', '{}');

------------------------------------------------------------------------------
-- Owner: custom_fields
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000012');

select is(
  tests.affected($$update public.pjs set data = jsonb_set(data, '{custom_fields}', '{"lema": "nuevo", "otro": "x"}') where id = 91001$$),
  1::bigint, 'owner can write custom_fields as an object of strings');

select throws_ok($$update public.pjs set data = jsonb_set(data, '{custom_fields}', '"texto"') where id = 91001$$, '42501', null,
  'custom_fields as a string is rejected');
select throws_ok($$update public.pjs set data = jsonb_set(data, '{custom_fields}', '[1,2]') where id = 91001$$, '42501', null,
  'custom_fields as an array is rejected');
select throws_ok($$update public.pjs set data = jsonb_set(data, '{custom_fields}', '{"a": {"b": 1}}') where id = 91001$$, '42501', null,
  'custom_fields with a nested value is rejected');
select throws_ok($$update public.pjs set data = jsonb_set(data, '{custom_fields}', '{"a": 5}') where id = 91001$$, '42501', null,
  'custom_fields with a non-string value is rejected');
select throws_ok(
  $$update public.pjs set data = jsonb_set(data, '{custom_fields}', jsonb_build_object('a', repeat('x', 9000))) where id = 91001$$, '42501', null,
  'custom_fields over 8 KB is rejected');

------------------------------------------------------------------------------
-- Owner: sections_updated
------------------------------------------------------------------------------
select is(
  tests.affected($$update public.pjs
    set sections_updated = sections_updated || '{"narrativa": "2026-02-01T10:00:00.000Z", "general": "2026-02-01T10:00:00Z"}' where id = 91001$$),
  1::bigint, 'owner can stamp known sections with ISO timestamps (existing keys kept)');

select is(
  tests.affected($$update public.pjs set sections_updated = sections_updated || '{"equipo": "2026-03-01T00:00:00Z"}' where id = 91001$$),
  1::bigint, 'owner can move an existing stamp forward');

select throws_ok($$update public.pjs set sections_updated = sections_updated || '{"inventado": "2026-02-01T10:00:00Z"}' where id = 91001$$, '42501', null,
  'an unknown section key is rejected');
select throws_ok($$update public.pjs set sections_updated = '{"dm": "2026-05-01T00:00:00Z"}' where id = 91002$$, '42501', null,
  'an owner cannot create a dm stamp (it is derived from the DM notes)');
select throws_ok(
  format($$update public.pjs set sections_updated = sections_updated || '{"stats": "%s"}' where id = 91001$$, to_char((now() + interval '1 day') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), '42501', null,
  'a future timestamp is rejected');
select throws_ok($$update public.pjs set sections_updated = sections_updated || '{"stats": 12345}' where id = 91001$$, '42501', null,
  'a non-string value is rejected');
select throws_ok($$update public.pjs set sections_updated = sections_updated || '{"stats": "tomorrow"}' where id = 91001$$, '42501', null,
  'a non-ISO string (tomorrow, infinity, ...) is rejected');
select throws_ok(
  $$update public.pjs set sections_updated = sections_updated || jsonb_build_object('stats', repeat('9', 5000)) where id = 91001$$, '42501', null,
  'a huge value is rejected');
select throws_ok($$update public.pjs set sections_updated = sections_updated || '{"equipo": "2025-01-01T00:00:00Z"}' where id = 91001$$, '42501', null,
  'a stamp cannot go back in time');
select throws_ok($$update public.pjs set sections_updated = '{"equipo": "2026-03-01T00:00:00Z"}' where id = 91001$$, '42501', null,
  'replacing the object (dropping existing keys) is rejected');

------------------------------------------------------------------------------
-- DM: unaffected by the owner rules
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000011');

select is(
  tests.affected($$update public.pjs set sections_updated = '{"loquesea": "2099-01-01T00:00:00Z"}',
    data = jsonb_set(data, '{custom_fields}', '{"a": 5}') where id = 91001$$),
  1::bigint, 'the DM is not restricted by the owner-only checks');

select * from finish();
rollback;
