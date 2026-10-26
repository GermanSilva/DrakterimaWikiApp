-- pgTAP: E2a of the system-agnostic campaigns. The sheet sections of the system document, the relaxed pjs.nivel check,
-- validate_system_profile() and the DM-only write RPC set_system_profile(). Self-contained fixture, rolled back at the end.
begin;

select plan(52);

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

create function tests.as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end;
$$;

create function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
end;
$$;

-- A complete, valid, CUSTOMISED document (every part the RPC checks)
create function tests.valid() returns jsonb language sql immutable as $$
  select $profile${
    "version": 1,
    "character": {
      "builtins": {
        "clase": {"enabled": false, "label": "Clase"},
        "raza": {"enabled": true, "label": "  Ocupación  "},
        "nivel": {"enabled": true, "label": "Rango", "min": 0, "max": 5, "unknown_nested": 1}
      },
      "sections": {"stats": true, "habilidades": false, "ataques": false, "hechizos": false, "recursos": true,
                   "equipo": true, "rasgos": true, "narrativa": true, "apariencia": false}
    },
    "currency": {"enabled": true, "denominations": [{"key": "gp", "label": "  créditos ", "unknown_nested": 2}, {"key": "cp", "label": "chatarra"}]},
    "modules": {"juegos": false, "sesion_en_vivo": true, "mapas": true, "calendario": true},
    "unknown_top_level": {"dropped": true}
  }$profile$::jsonb;
$$;

-- calls the RPC as the CURRENT role with the current stored version as base
create function tests.try(doc jsonb) returns void language plpgsql security invoker as $$
begin
  perform public.set_system_profile('bbbbbbbb-5555-4000-8000-00000000000a', doc,
    (select updated_at from public.campaigns where id = 'bbbbbbbb-5555-4000-8000-00000000000a'));
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture: ho = hub owner (member of nothing), dm = DM of A, pl = player of A, out = member of nothing
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-5555-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'sysw-u' || n || '@example.test', json_build_object('full_name', 'Sysw User ' || n)::jsonb
from generate_series(1, 5) as n;

insert into public.hub_owners (user_id) values ('aaaaaaaa-5555-4000-8000-000000000001');

insert into public.campaigns (id, slug, name, created_by) values
  ('bbbbbbbb-5555-4000-8000-00000000000a', 'sysw-a', 'Sysw A', 'aaaaaaaa-5555-4000-8000-000000000002');
insert into public.campaigns (id, slug, name, created_by) values
  ('bbbbbbbb-5555-4000-8000-00000000000b', 'sysw-b', 'Sysw B', 'aaaaaaaa-5555-4000-8000-000000000005');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('bbbbbbbb-5555-4000-8000-00000000000a', 'aaaaaaaa-5555-4000-8000-000000000002', 'dm'),
  ('bbbbbbbb-5555-4000-8000-00000000000a', 'aaaaaaaa-5555-4000-8000-000000000003', 'player'),
  ('bbbbbbbb-5555-4000-8000-00000000000b', 'aaaaaaaa-5555-4000-8000-000000000005', 'dm');
-- user 3 owns a character of campaign A
insert into public.pjs (id, campaign_id, owner_id, nombre) values (96001, 'bbbbbbbb-5555-4000-8000-00000000000a', 'aaaaaaaa-5555-4000-8000-000000000003', 'Pj del jugador');

------------------------------------------------------------------------------
-- Structure and privileges
------------------------------------------------------------------------------
select tests.as_postgres();
select ok(
  (select bool_and(p.prosecdef and p.proconfig = array['search_path=""'])
     from pg_proc p where p.oid = 'public.set_system_profile(uuid, jsonb, timestamptz)'::regprocedure),
  'set_system_profile is SECURITY DEFINER with an empty search_path');
select ok(
  (select p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.validate_system_profile(jsonb)'::regprocedure),
  'validate_system_profile has an empty search_path');
select ok(
  has_function_privilege('authenticated', 'public.set_system_profile(uuid, jsonb, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.set_system_profile(uuid, jsonb, timestamptz)', 'execute')
  and not has_function_privilege('public', 'public.set_system_profile(uuid, jsonb, timestamptz)', 'execute'),
  'set_system_profile is callable by authenticated only');
select ok(
  not has_function_privilege('authenticated', 'public.validate_system_profile(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.validate_system_profile(jsonb)', 'execute')
  and not has_function_privilege('public', 'public.validate_system_profile(jsonb)', 'execute'),
  'validate_system_profile is internal: nobody can call it through the API');
select ok(
  not has_column_privilege('authenticated', 'public.campaigns', 'system_profile', 'update'),
  'there is still no direct update grant on system_profile (the RPC is the only write path)');

------------------------------------------------------------------------------
-- Sheet sections: default and backfill
------------------------------------------------------------------------------
select is(
  (select count(*) from public.campaigns
    where system_profile #> '{character,sections}' is distinct from
      '{"stats": true, "habilidades": true, "ataques": true, "hechizos": true, "recursos": true, "equipo": true, "rasgos": true, "narrativa": true, "apariencia": true}'::jsonb),
  0::bigint, 'every campaign (seed rows and the fixture) has the nine sheet sections, all on');
select is(
  (select count(*) from public.campaigns where system_profile #> '{character,builtins,nivel}' is distinct from '{"min": 1, "max": 20, "label": "Nivel", "enabled": true}'::jsonb),
  0::bigint, 'the built-ins were not touched by the backfill');

select tests.as_user('aaaaaaaa-5555-4000-8000-000000000001');
select lives_ok($$select public.create_campaign('sysw-new', 'Sysw New')$$, 'a hub owner creates a campaign');
select is(
  (select system_profile #>> '{character,sections,hechizos}' from public.campaigns where slug = 'sysw-new'),
  'true', 'a new campaign has the sections in its default document');

------------------------------------------------------------------------------
-- pjs.nivel: 0..1000 now (the document decides the real range)
------------------------------------------------------------------------------
select tests.as_postgres();
select lives_ok($$insert into public.pjs (campaign_id, nombre, nivel) values ('bbbbbbbb-5555-4000-8000-00000000000a', 'Nivel 0', 0)$$, 'nivel 0 is accepted');
select lives_ok($$insert into public.pjs (campaign_id, nombre, nivel) values ('bbbbbbbb-5555-4000-8000-00000000000a', 'Nivel 1000', 1000)$$, 'nivel 1000 is accepted');
select lives_ok($$insert into public.pjs (campaign_id, nombre, nivel) values ('bbbbbbbb-5555-4000-8000-00000000000a', 'Nivel 25', 25)$$, 'a level above 20 is accepted');
select throws_ok($$insert into public.pjs (campaign_id, nombre, nivel) values ('bbbbbbbb-5555-4000-8000-00000000000a', 'Nivel 1001', 1001)$$, '23514', null, 'nivel 1001 is rejected');
select throws_ok($$insert into public.pjs (campaign_id, nombre, nivel) values ('bbbbbbbb-5555-4000-8000-00000000000a', 'Nivel -1', -1)$$, '23514', null, 'a negative nivel is rejected');

------------------------------------------------------------------------------
-- set_system_profile: who can call it
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-5555-4000-8000-000000000003');
select throws_ok(
  $$select public.set_system_profile('bbbbbbbb-5555-4000-8000-00000000000a', tests.valid(), (select updated_at from public.campaigns where id = 'bbbbbbbb-5555-4000-8000-00000000000a'))$$,
  '42501', 'dm_only', 'a player cannot set the document');

select tests.as_user('aaaaaaaa-5555-4000-8000-000000000004');
select throws_ok(
  $$select public.set_system_profile('bbbbbbbb-5555-4000-8000-00000000000a', tests.valid(), now())$$,
  '42501', 'dm_only', 'a user outside the campaign cannot set the document');

select tests.as_anon();
select throws_ok(
  $$select public.set_system_profile('bbbbbbbb-5555-4000-8000-00000000000a', tests.valid(), now())$$,
  '42501', null, 'anon cannot call it');

select tests.as_user('aaaaaaaa-5555-4000-8000-000000000005');
select throws_ok($$select tests.try(tests.valid())$$, '42501', 'dm_only', 'the DM of ANOTHER campaign cannot write this one');
select tests.as_user('aaaaaaaa-5555-4000-8000-000000000003');
select throws_ok($$select tests.try(tests.valid())$$, '42501', 'dm_only', 'the owner of a character of the campaign cannot write it');
select throws_ok(
  $$select public.set_system_profile('bbbbbbbb-5555-4000-8000-0000000000ff', tests.valid(), now())$$,
  '42501', 'dm_only', 'a non-DM learns nothing about whether a campaign id exists');

------------------------------------------------------------------------------
-- set_system_profile as the DM
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-5555-4000-8000-000000000002');
create temp table base as select updated_at from public.campaigns where id = 'bbbbbbbb-5555-4000-8000-00000000000a';
grant select on base to authenticated;

select lives_ok(
  $$select public.set_system_profile('bbbbbbbb-5555-4000-8000-00000000000a', tests.valid(), (select updated_at from base))$$,
  'the DM sets a customised document');
select is(
  (select system_profile from public.campaigns where id = 'bbbbbbbb-5555-4000-8000-00000000000a'),
  $profile${
    "version": 1,
    "character": {
      "builtins": {
        "clase": {"enabled": false, "label": "Clase"},
        "raza": {"enabled": true, "label": "Ocupación"},
        "nivel": {"enabled": true, "label": "Rango", "min": 0, "max": 5}
      },
      "sections": {"stats": true, "habilidades": false, "ataques": false, "hechizos": false, "recursos": true,
                   "equipo": true, "rasgos": true, "narrativa": true, "apariencia": false}
    },
    "currency": {"enabled": true, "denominations": [{"key": "gp", "label": "créditos"}, {"key": "cp", "label": "chatarra"}]},
    "modules": {"juegos": false, "sesion_en_vivo": true, "mapas": true, "calendario": true}
  }$profile$::jsonb,
  'the stored document is the NORMALISED one: labels trimmed, unknown keys dropped');
create temp table snap as select system_profile from public.campaigns where id = 'bbbbbbbb-5555-4000-8000-00000000000a';
grant select on snap to authenticated;
select throws_ok(
  $$select public.set_system_profile('bbbbbbbb-5555-4000-8000-00000000000a', jsonb_set(tests.valid(), '{modules,mapas}', 'false'), (select updated_at - interval '1 day' from base))$$,
  'P0001', 'campaign_conflict', 'a stale base is a conflict');
select throws_ok(
  $$select public.set_system_profile('bbbbbbbb-5555-4000-8000-00000000000a', jsonb_set(tests.valid(), '{modules,mapas}', 'false'), (select updated_at - interval '1 microsecond' from base))$$,
  'P0001', 'campaign_conflict', 'a base only one microsecond off is a conflict too');
select is((select system_profile from public.campaigns where id = 'bbbbbbbb-5555-4000-8000-00000000000a'), (select system_profile from snap), 'the conflicts wrote nothing');
select throws_ok(
  $$select public.set_system_profile('bbbbbbbb-5555-4000-8000-00000000000a', tests.valid(), null)$$,
  'P0001', 'campaign_conflict', 'the base version is required');
select is(
  (select (public.set_system_profile('bbbbbbbb-5555-4000-8000-00000000000a', tests.valid(), (select updated_at from public.campaigns where id = 'bbbbbbbb-5555-4000-8000-00000000000a'))).system_profile #>> '{character,builtins,raza,label}'),
  'Ocupación', 'it returns the updated campaign row, with the normalised document');

------------------------------------------------------------------------------
-- Validation: every one of these is rejected with invalid_system_profile and writes nothing
------------------------------------------------------------------------------
select throws_ok($$select tests.try('[]'::jsonb)$$, 'P0001', 'invalid_system_profile', 'an array is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{version}', '2'))$$, 'P0001', 'invalid_system_profile', 'version 2 is rejected');
select throws_ok($$select tests.try(tests.valid() #- '{character,builtins,nivel}')$$, 'P0001', 'invalid_system_profile', 'a missing nivel built-in is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,raza,label}', '"   "'))$$, 'P0001', 'invalid_system_profile', 'a blank label is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,raza,label}', to_jsonb(repeat('x', 61))))$$, 'P0001', 'invalid_system_profile', 'a 61-character label is rejected');
select lives_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,raza,label}', to_jsonb(repeat('x', 60))))$$, 'a 60-character label is accepted');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,raza,label}', to_jsonb(E'Oficio\nmalo'::text)))$$, 'P0001', 'invalid_system_profile', 'a label with a control character is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,raza,label}', to_jsonb(U&'ab\202Ecd'::text)))$$, 'P0001', 'invalid_system_profile', 'a bidi override in a label is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,raza,label}', to_jsonb(U&'\200B'::text)))$$, 'P0001', 'invalid_system_profile', 'a zero-width-only label is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,raza,label}', to_jsonb(U&'\3000\00A0'::text)))$$, 'P0001', 'invalid_system_profile', 'a label made only of ideographic and non-breaking spaces is rejected');
select lives_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,raza,label}', to_jsonb(repeat(U&'\00E9', 60))))$$, 'a label of 60 multi-byte characters is accepted (the limit counts characters)');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,nivel,max}', '1e400'))$$, 'P0001', 'invalid_system_profile', 'a huge nivel max is a clean rejection');
select throws_ok($$select tests.try(jsonb_set(jsonb_set(tests.valid(), '{character,builtins,nivel,min}', '9'), '{character,builtins,nivel,max}', '3'))$$, 'P0001', 'invalid_system_profile', 'a nivel range with min > max is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,nivel,max}', '1001'))$$, 'P0001', 'invalid_system_profile', 'a nivel max above 1000 is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,nivel,min}', '-1'))$$, 'P0001', 'invalid_system_profile', 'a negative nivel min is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,builtins,nivel,max}', '2.5'))$$, 'P0001', 'invalid_system_profile', 'a fractional nivel max is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{character,sections,stats}', '"yes"'))$$, 'P0001', 'invalid_system_profile', 'a non-boolean section is rejected');
select throws_ok($$select tests.try(tests.valid() #- '{character,sections,hechizos}')$$, 'P0001', 'invalid_system_profile', 'a missing section is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{currency,denominations}', '[]'))$$, 'P0001', 'invalid_system_profile', 'a currency that is on with no denominations is rejected');
select lives_ok($$select tests.try(jsonb_set(jsonb_set(tests.valid(), '{currency,enabled}', 'false'), '{currency,denominations}', '[]'))$$, 'a currency that is off may have none');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{currency,denominations}', '[{"key": "zz", "label": "x"}]'))$$, 'P0001', 'invalid_system_profile', 'an unknown coin key is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{currency,denominations}', '[{"key": "gp", "label": "a"}, {"key": "gp", "label": "b"}]'))$$, 'P0001', 'invalid_system_profile', 'a duplicated coin key is rejected');
select throws_ok($$select tests.try(jsonb_set(tests.valid(), '{modules,juegos}', '"no"'))$$, 'P0001', 'invalid_system_profile', 'a non-boolean module is rejected');

------------------------------------------------------------------------------
-- The hub owner, who is not a member, can also write it
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-5555-4000-8000-000000000001');
select lives_ok(
  $$select tests.try(tests.valid())$$,
  'the hub owner sets the document of a campaign they are not in');
select throws_ok(
  $$select public.set_system_profile('bbbbbbbb-5555-4000-8000-0000000000ff', tests.valid(), now())$$,
  'P0001', 'campaign_not_found', 'an unknown campaign is reported as such to the hub owner');

select * from finish();
rollback;
