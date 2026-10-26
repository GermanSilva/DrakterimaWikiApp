-- pgTAP: E1 of the system-agnostic campaigns. campaigns.system_profile (jsonb document), its D&D 5e default, the relaxed
-- `system` identifier and the fact that the API cannot write the document yet. Self-contained fixture, rolled back.
begin;

select plan(37);

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

create function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture: ho = hub owner, dm = DM of campaign A, pl = player of A
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-4444-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'sys-u' || n || '@example.test', json_build_object('full_name', 'Sys User ' || n)::jsonb
from generate_series(1, 3) as n;

insert into public.hub_owners (user_id) values ('aaaaaaaa-4444-4000-8000-000000000001');

insert into public.campaigns (id, slug, name, created_by) values
  ('bbbbbbbb-4444-4000-8000-00000000000a', 'sys-a', 'Sys A', 'aaaaaaaa-4444-4000-8000-000000000002');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('bbbbbbbb-4444-4000-8000-00000000000a', 'aaaaaaaa-4444-4000-8000-000000000002', 'dm'),
  ('bbbbbbbb-4444-4000-8000-00000000000a', 'aaaaaaaa-4444-4000-8000-000000000003', 'player');

------------------------------------------------------------------------------
-- The column and the D&D 5e default
------------------------------------------------------------------------------
select tests.as_postgres();
select col_type_is('public', 'campaigns', 'system_profile', 'jsonb', 'campaigns.system_profile is jsonb');
select col_not_null('public', 'campaigns', 'system_profile', 'campaigns.system_profile is NOT NULL');
select is(
  (select system_profile ->> 'version' from public.campaigns where id = 'bbbbbbbb-4444-4000-8000-00000000000a'),
  '1', 'a campaign created without a profile gets the version 1 document');
select is(
  (select count(*) from public.campaigns where system_profile ->> 'version' is distinct from '1'),
  0::bigint, 'every campaign in the database has a version 1 profile (existing ones were backfilled)');
select is(
  (select count(*) from public.campaigns where system_profile is distinct from $profile${
    "version": 1,
    "character": {"builtins": {
      "clase": {"enabled": true, "label": "Clase"},
      "raza": {"enabled": true, "label": "Raza"},
      "nivel": {"enabled": true, "label": "Nivel", "min": 1, "max": 20}},
      "sections": {"stats": true, "habilidades": true, "ataques": true, "hechizos": true, "recursos": true,
                   "equipo": true, "rasgos": true, "narrativa": true, "apariencia": true}},
    "currency": {"enabled": true, "denominations": [
      {"key": "pp", "label": "platino"}, {"key": "gp", "label": "oro"}, {"key": "ep", "label": "electrum"},
      {"key": "sp", "label": "plata"}, {"key": "cp", "label": "bronce"}]},
    "modules": {"juegos": true, "sesion_en_vivo": true, "mapas": true, "calendario": true}
  }$profile$::jsonb),
  0::bigint, 'every campaign in the database (seed rows and the fixture) carries the FULL D&D 5e document (E1 parts plus the E2a sections), not just a version');
select is(
  (select system_profile #> '{character,builtins}' from public.campaigns where id = 'bbbbbbbb-4444-4000-8000-00000000000a'),
  '{"clase": {"enabled": true, "label": "Clase"}, "raza": {"enabled": true, "label": "Raza"}, "nivel": {"enabled": true, "label": "Nivel", "min": 1, "max": 20}}'::jsonb,
  'D&D 5e preset: clase, raza and nivel are all enabled with their labels');
select is(
  (select system_profile #>> '{character,builtins,clase,label}' from public.campaigns where id = 'bbbbbbbb-4444-4000-8000-00000000000a'),
  'Clase', 'D&D 5e preset: clase is enabled with its label');
select is(
  (select (system_profile #> '{character,builtins,nivel}') from public.campaigns where id = 'bbbbbbbb-4444-4000-8000-00000000000a'),
  '{"min": 1, "max": 20, "label": "Nivel", "enabled": true}'::jsonb, 'D&D 5e preset: nivel 1..20 (the range the pjs table enforces today)');
select is(
  (select jsonb_array_length(system_profile #> '{currency,denominations}') from public.campaigns where id = 'bbbbbbbb-4444-4000-8000-00000000000a'),
  5, 'D&D 5e preset: five denominations');
select is(
  (select array_agg(d ->> 'key' order by ord) from public.campaigns c, jsonb_array_elements(c.system_profile #> '{currency,denominations}') with ordinality as t(d, ord) where c.id = 'bbbbbbbb-4444-4000-8000-00000000000a'),
  array['pp', 'gp', 'ep', 'sp', 'cp'], 'D&D 5e preset: denominations in display order, same keys as pjs.monedas');
select is(
  (select system_profile -> 'modules' from public.campaigns where id = 'bbbbbbbb-4444-4000-8000-00000000000a'),
  '{"mapas": true, "juegos": true, "calendario": true, "sesion_en_vivo": true}'::jsonb, 'D&D 5e preset: every module is on');

------------------------------------------------------------------------------
-- Shape checks (as postgres: the API cannot write the column at all, see below)
------------------------------------------------------------------------------
select lives_ok(
  $$update public.campaigns set system_profile = '{"version": 1}'::jsonb where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$,
  'a minimal version 1 document is accepted');
select throws_ok(
  $$update public.campaigns set system_profile = '{"version": 2}'::jsonb where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'an unknown version is rejected');
select throws_ok(
  $$update public.campaigns set system_profile = '{}'::jsonb where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'a document without a version is rejected');
select throws_ok(
  $$update public.campaigns set system_profile = '[]'::jsonb where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'an array is rejected');
select throws_ok(
  $$update public.campaigns set system_profile = '{"version": "1"}'::jsonb where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'a text version is rejected (it must be the number 1)');
select throws_ok(
  $$update public.campaigns set system_profile = null where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23502', null,
  'NULL is rejected');
select lives_ok(
  $$update public.campaigns set system_profile = ('{"version": 1, "pad": "' || repeat('x', 65500) || '"}')::jsonb where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$,
  'a document just under 64 KB is accepted');
select throws_ok(
  $$update public.campaigns set system_profile = ('{"version": 1, "pad": "' || repeat('x', 70000) || '"}')::jsonb where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'a document over 64 KB is rejected');

------------------------------------------------------------------------------
-- The API cannot write the document (no update grant until E2 adds the validated path)
------------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.campaigns', 'system_profile', 'update')
  and not has_column_privilege('authenticated', 'public.campaigns', 'system_profile', 'insert')
  and not has_column_privilege('anon', 'public.campaigns', 'system_profile', 'select'),
  'authenticated cannot update or insert system_profile; anon cannot read it');
select ok(has_column_privilege('authenticated', 'public.campaigns', 'system_profile', 'select'), 'authenticated can read it (RLS scopes the rows)');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000002');
select throws_ok(
  $$update public.campaigns set system_profile = '{"version": 1}'::jsonb where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '42501', null,
  'the DM of the campaign cannot write the document through the API');
select isnt((select system_profile from public.campaigns where id = 'bbbbbbbb-4444-4000-8000-00000000000a'), null, 'the DM reads it');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000003');
select isnt((select system_profile from public.campaigns where id = 'bbbbbbbb-4444-4000-8000-00000000000a'), null, 'a player reads it too');

------------------------------------------------------------------------------
-- A new campaign through the RPC gets the preset too
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-4444-4000-8000-000000000001');
select lives_ok($$select public.create_campaign('sys-new', 'Sys New')$$, 'a hub owner creates a campaign through the RPC');
select is(
  (select system_profile #>> '{character,builtins,nivel,max}' from public.campaigns where slug = 'sys-new'),
  '20', 'the new campaign carries the D&D 5e preset');
select is((select system from public.campaigns where slug = 'sys-new'), 'dnd5e', 'and system stays dnd5e (the "based on" identifier)');

------------------------------------------------------------------------------
-- `system` is now a free identifier ("based on"), still validated
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-4444-4000-8000-000000000002');
select lives_ok(
  $$update public.campaigns set system = 'pathfinder2e' where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$,
  'the DM can set another system identifier');
select lives_ok(
  $$update public.campaigns set system = 'mi-sistema_v2' where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$,
  'a homebrew identifier with dashes and underscores is accepted');
select throws_ok(
  $$update public.campaigns set system = 'Not Valid' where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'an identifier with capitals or spaces is rejected');
select throws_ok(
  $$update public.campaigns set system = '' where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'an empty identifier is rejected');
select throws_ok(
  $$update public.campaigns set system = repeat('a', 41) where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'an identifier over 40 characters is rejected');
select lives_ok(
  $$update public.campaigns set system = repeat('a', 40) where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$,
  'an identifier of exactly 40 characters is accepted');
select throws_ok(
  $$update public.campaigns set system = E'dnd5e\n' where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'a trailing newline is rejected');
select throws_ok(
  $$update public.campaigns set system = 'a-' where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'an identifier ending in a dash is rejected');
select throws_ok(
  $$update public.campaigns set system = '_a' where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'an identifier starting with an underscore is rejected');
select throws_ok(
  $$update public.campaigns set system = 'x; drop table campaigns' where id = 'bbbbbbbb-4444-4000-8000-00000000000a'$$, '23514', null,
  'an identifier with punctuation is rejected');

select * from finish();
rollback;
