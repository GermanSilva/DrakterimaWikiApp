-- pgTAP: F3 of the system-agnostic campaigns. guard_pj_player_update() derives what a player may write from the campaign
-- sheet (system_profile.sheet): data keys by editableBy (S11), values by type/range/size, unread-dot sections by the sheet's
-- sections. A campaign WITHOUT a sheet keeps the legacy fixed lists. Self-contained fixture, rolled back at the end.
begin;

select plan(45);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
end;
$$;

-- runs one statement as the CURRENT role: 'ok' when it changed exactly one row, 'norows' when RLS hid it, else the SQLSTATE
create function tests.try(p_sql text) returns text language plpgsql security invoker as $$
declare
  n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'norows' end;
exception when others then
  return sqlstate;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture: dm, player (owns a character in A and in B), outsider
--   A = custom sheet (set by the DM through the RPC), B = the default D&D preset
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('eeeeeeee-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'sheetacc-u' || n || '@example.test', json_build_object('full_name', 'Sheet Acc ' || n)::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, slug, name, created_by) values
  ('ffffffff-0000-4000-8000-00000000000a', 'sheetacc-a', 'Sheet A', 'eeeeeeee-0000-4000-8000-000000000001'),
  ('ffffffff-0000-4000-8000-00000000000b', 'sheetacc-b', 'Sheet B', 'eeeeeeee-0000-4000-8000-000000000001');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('ffffffff-0000-4000-8000-00000000000a', 'eeeeeeee-0000-4000-8000-000000000001', 'dm'),
  ('ffffffff-0000-4000-8000-00000000000a', 'eeeeeeee-0000-4000-8000-000000000002', 'player'),
  ('ffffffff-0000-4000-8000-00000000000b', 'eeeeeeee-0000-4000-8000-000000000001', 'dm'),
  ('ffffffff-0000-4000-8000-00000000000b', 'eeeeeeee-0000-4000-8000-000000000002', 'player');
insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (97001, 'ffffffff-0000-4000-8000-00000000000a', 'eeeeeeee-0000-4000-8000-000000000002', 'Player in A'),
  (97002, 'ffffffff-0000-4000-8000-00000000000b', 'eeeeeeee-0000-4000-8000-000000000002', 'Player in B');

-- the custom sheet: every access rule once
create function tests.custom_profile() returns jsonb language sql stable as $$
  select (select system_profile - 'sheet' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000000b') || jsonb_build_object('sheet', $sheet${
    "categories": [{"key": "c", "label": "C", "sections": [
      {"key": "alpha", "label": "Alpha", "items": [
        {"kind": "field", "key": "motto", "label": "Motto", "type": "short", "editableBy": "player"},
        {"kind": "field", "key": "luck", "label": "Luck", "type": "number", "min": 0, "max": 10, "editableBy": "player"},
        {"kind": "field", "key": "flag", "label": "Flag", "type": "boolean", "editableBy": "player"},
        {"kind": "field", "key": "secret", "label": "Secret", "type": "short", "editableBy": "dm"},
        {"kind": "table", "type": "stat", "key": "attrs", "label": "Attrs", "rows": [
          {"key": "str", "label": "STR", "modifier": "floor(({valor} - 10) / 2)", "editableBy": "player"},
          {"key": "dex", "label": "DEX", "modifier": "floor(({valor} - 10) / 2)", "editableBy": "dm"}]},
        {"kind": "table", "type": "capacidades", "key": "skills", "label": "Skills", "columns": [
          {"key": "rank", "label": "Rank", "type": "number", "editableBy": "player"},
          {"key": "note", "label": "Note", "type": "short", "editableBy": "player"},
          {"key": "locked", "label": "Locked", "type": "number", "editableBy": "dm"}],
         "rows": [
          {"key": "sk_a", "label": "A", "stat": "str", "use": "modificador", "editableBy": "player"},
          {"key": "sk_b", "label": "B", "stat": "str", "use": "modificador", "editableBy": "dm"}]},
        {"kind": "table", "type": "libre", "key": "inv", "label": "Inv", "columns": [
          {"key": "nombre", "label": "N", "type": "short", "editableBy": "player"},
          {"key": "qty", "label": "Q", "type": "number", "editableBy": "player"},
          {"key": "total", "label": "T", "type": "number", "formula": "1", "editableBy": "player"}], "editableBy": "player"}
      ], "blocks": []},
      {"key": "beta", "label": "Beta", "items": [], "blocks": []}]}],
    "roles": {}
  }$sheet$::jsonb);
$$;
grant execute on function tests.custom_profile() to authenticated;

select tests.as_user('eeeeeeee-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.set_system_profile('ffffffff-0000-4000-8000-00000000000a', tests.custom_profile(),
       (select updated_at from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000000a')) $$,
  'the DM stores the custom sheet through the RPC (the validator accepts it)');

------------------------------------------------------------------------------
-- Custom sheet: what the player may write
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000002');
select is(tests.try($$ update public.pjs set data = data || '{"motto": "hello"}' where id = 97001 $$), 'ok', 'a player field is writable');
select is(tests.try($$ update public.pjs set data = data || '{"luck": 5}' where id = 97001 $$), 'ok', 'a number field inside its range is writable');
select is(tests.try($$ update public.pjs set data = data || '{"flag": true}' where id = 97001 $$), 'ok', 'a boolean field is writable');
select is(tests.try($$ update public.pjs set data = data || '{"str": 15}' where id = 97001 $$), 'ok', 'a stat row value the DM opened to the player is writable');
select is(tests.try($$ update public.pjs set data = data || '{"sk_a": 2}' where id = 97001 $$), 'ok', 'a capacidad value (first column) of an open row is writable');
select is(tests.try($$ update public.pjs set data = data || '{"sk_a__note": "x"}' where id = 97001 $$), 'ok', 'an extra column of an open row is writable');
select is(tests.try($$ update public.pjs set data = data || '{"inv": [{"id": 1, "nombre": "rope", "qty": 2}]}' where id = 97001 $$), 'ok', 'a free table the DM opened is writable');
select is(tests.try($$ update public.pjs set data = data || '{"custom_fields": {"a": "b"}}' where id = 97001 $$), 'ok', 'the legacy custom_fields stay writable');

select is(tests.try($$ update public.pjs set data = data || '{"secret": "x"}' where id = 97001 $$), '42501', 'a DM field is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"dex": 12}' where id = 97001 $$), '42501', 'a stat row the DM kept is rejected (S11)');
select is(tests.try($$ update public.pjs set data = data || '{"sk_b": 1}' where id = 97001 $$), '42501', 'a capacidad row the DM kept is rejected (S11)');
select is(tests.try($$ update public.pjs set data = data || '{"sk_a__locked": 1}' where id = 97001 $$), '42501', 'a DM column of an open row is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"ghost": 1}' where id = 97001 $$), '42501', 'a key the sheet does not define is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"edad": "30"}' where id = 97001 $$), '42501', 'a legacy identity key that this sheet does not define is rejected');
select is(tests.try($$ update public.pjs set monedas = '{"gp": 999}' where id = 97001 $$), '42501', 'coins stay DM and server only');

------------------------------------------------------------------------------
-- Values are checked by type, range and size
------------------------------------------------------------------------------
select is(tests.try($$ update public.pjs set data = data || jsonb_build_object('motto', repeat('x', 501)) where id = 97001 $$), '42501', 'a short text over 500 characters is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"luck": 11}' where id = 97001 $$), '42501', 'a number above the field max is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"luck": "5"}' where id = 97001 $$), '42501', 'a number sent as text is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"flag": "yes"}' where id = 97001 $$), '42501', 'a boolean sent as text is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"str": 10000000000000}' where id = 97001 $$), '42501', 'an absurdly large number is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"inv": [{"id": 1, "nombre": "x", "evil": 1}]}' where id = 97001 $$), '42501', 'a table row with a column the sheet does not define is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"inv": [{"id": 1, "nombre": "x", "total": 5}]}' where id = 97001 $$), '42501', 'a formula column value is never writable, even inside an open table');
select is(tests.try($$ update public.pjs set data = data || '{"inv": {"a": 1}}' where id = 97001 $$), '42501', 'a table value that is not an array is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"inv": [1]}' where id = 97001 $$), '42501', 'a table row that is not an object is rejected');
select is(tests.try($$ update public.pjs set data = data || jsonb_build_object('inv', (select jsonb_agg(jsonb_build_object('nombre', 'x')) from generate_series(1, 501))) where id = 97001 $$), '42501', 'a table with more than 500 rows is rejected');
select is(tests.try($$ update public.pjs set data = data || jsonb_build_object('inv', (select jsonb_agg(jsonb_build_object('nombre', repeat('y', 500))) from generate_series(1, 400))) where id = 97001 $$), '42501', 'a table over 200 KB is rejected');

-- a value already stored that no longer fits is not re-judged unless the player touches that key
select tests.as_postgres();
update public.pjs set data = data || '{"motto": 123}' where id = 97001;
select tests.as_user('eeeeeeee-0000-4000-8000-000000000002');
select is(tests.try($$ update public.pjs set data = data || '{"luck": 6}' where id = 97001 $$), 'ok', 'an untouched stored value is never re-judged');

------------------------------------------------------------------------------
-- Unread dots follow the sheet's sections
------------------------------------------------------------------------------
select is(tests.try($$ update public.pjs set sections_updated = sections_updated || jsonb_build_object('alpha', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where id = 97001 $$), 'ok', 'a section of the sheet can be stamped');
select is(tests.try($$ update public.pjs set sections_updated = sections_updated || jsonb_build_object('dm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where id = 97001 $$), '42501', 'the dm stamp stays frozen');
select is(tests.try($$ update public.pjs set sections_updated = sections_updated || jsonb_build_object('stats', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where id = 97001 $$), '42501', 'a legacy section that this sheet does not define cannot be stamped');
select is(tests.try($$ update public.pjs set sections_updated = sections_updated || jsonb_build_object('zzz', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where id = 97001 $$), '42501', 'an unknown section cannot be stamped');

------------------------------------------------------------------------------
-- The DM is never restricted by the sheet
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000001');
select is(tests.try($$ update public.pjs set data = data || '{"secret": "dm only", "dex": 12, "sk_b": 1}' where id = 97001 $$), 'ok', 'the DM writes DM fields, DM rows and DM columns');

------------------------------------------------------------------------------
-- The default D&D preset reproduces today's permissions (campaign B)
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000002');
select is(tests.try($$ update public.pjs set data = data || '{"edad": "30"}' where id = 97002 $$), 'ok', 'preset: an identity key is writable');
select is(tests.try($$ update public.pjs set data = data || '{"ataques": [{"nombre": "sword"}]}' where id = 97002 $$), '42501', 'preset: attacks stay DM only');
select is(tests.try($$ update public.pjs set data = data || '{"stat_hp": 99}' where id = 97002 $$), '42501', 'preset: hit points stay DM only');
select is(tests.try($$ update public.pjs set sections_updated = sections_updated || jsonb_build_object('equipo', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where id = 97002 $$), 'ok', 'preset: the stampable sections are the legacy ones');

------------------------------------------------------------------------------
-- A campaign without a sheet keeps the legacy fixed lists
------------------------------------------------------------------------------
select tests.as_postgres();
update public.campaigns set system_profile = system_profile - 'sheet' where id = 'ffffffff-0000-4000-8000-00000000000b';
select tests.as_user('eeeeeeee-0000-4000-8000-000000000002');
select is(tests.try($$ update public.pjs set data = data || '{"alineamiento": "LB"}' where id = 97002 $$), 'ok', 'no sheet: the legacy identity keys are writable');
select is(tests.try($$ update public.pjs set data = data || '{"ataques": [{"nombre": "sword"}]}' where id = 97002 $$), '42501', 'no sheet: the legacy restrictions still hold');

------------------------------------------------------------------------------
-- Stamps already stored never block the sections of the sheet (S13)
------------------------------------------------------------------------------
select tests.as_postgres();
update public.pjs set sections_updated = (select jsonb_object_agg(k, '2020-01-01T00:00:00Z') from unnest(array['stats', 'habilidades', 'ataques', 'hechizos', 'recursos', 'equipo', 'rasgos', 'narrativa', 'apariencia', 'general', 'dm']) k) where id = 97002;
update public.campaigns set system_profile = system_profile || jsonb_build_object('sheet', jsonb_build_object('categories', jsonb_build_array(jsonb_build_object('key', 'c', 'label', 'C', 'sections', (select jsonb_agg(jsonb_build_object('key', 'n' || s, 'label', 'S', 'items', '[]'::jsonb, 'blocks', '[]'::jsonb)) from generate_series(1, 8) s))), 'roles', '{}'::jsonb)) where id = 'ffffffff-0000-4000-8000-00000000000b';
select tests.as_user('eeeeeeee-0000-4000-8000-000000000002');
select is(tests.try($$ update public.pjs set sections_updated = sections_updated || (select jsonb_object_agg('n' || s, to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) from generate_series(1, 8) s) where id = 97002 $$), 'ok', 'all eight sheet sections are stampable although eleven legacy stamps are already stored');
select is(tests.try($$ update public.pjs set sections_updated = sections_updated || jsonb_build_object('n9', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where id = 97002 $$), '42501', 'but a section the sheet does not define is still refused');

------------------------------------------------------------------------------
-- The helper that exposes the rule
------------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.sheet_guard_access(uuid, jsonb, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.sheet_guard_access(uuid, jsonb, jsonb)', 'execute')
  and not has_function_privilege('public', 'public.sheet_guard_access(uuid, jsonb, jsonb)', 'execute'),
  'sheet_guard_access is callable by authenticated only');
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.sheet_guard_access(uuid, jsonb, jsonb)'::regprocedure),
  'and it is SECURITY DEFINER with an empty search_path');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000003');
select is(public.sheet_guard_access('ffffffff-0000-4000-8000-00000000000a', '{}', '{}'), null, 'a non-member gets nothing about a campaign sheet');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000002');
select ok(public.sheet_guard_access('ffffffff-0000-4000-8000-00000000000a', '{}', '{}') -> 'keys' ? 'motto', 'a member gets the keys the player may write');

select * from finish();
rollback;
