-- pgTAP: G4a of the system-agnostic campaigns (S20, S30, S33).
--   Part 1: a player may write an `options` value (field, Capacidades cell, options column of a Libre table) only as one
--           of the option keys declared at THAT place; null still clears; everything else is judged as before.
-- Self-contained fixture, rolled back at the end.
begin;

select plan(30);

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
-- Fixture: dm (..0101), player (..0102), outsider (..0103)
--   A = custom sheet with options, B = no sheet, C = the default D&D preset
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('eeeeeeee-0000-4000-8000-000000000' || (100 + n))::uuid,
       'authenticated', 'authenticated', 'optjug-u' || n || '@example.test', json_build_object('full_name', 'Optjug ' || n)::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, slug, name, created_by) values
  ('ffffffff-0000-4000-8000-0000000001aa', 'optjug-a', 'Opt A', 'eeeeeeee-0000-4000-8000-000000000101'),
  ('ffffffff-0000-4000-8000-0000000001bb', 'optjug-b', 'Opt B', 'eeeeeeee-0000-4000-8000-000000000101'),
  ('ffffffff-0000-4000-8000-0000000001cc', 'optjug-c', 'Opt C', 'eeeeeeee-0000-4000-8000-000000000101');
insert into public.campaign_members (campaign_id, user_id, role)
select c, u, r
from (values ('ffffffff-0000-4000-8000-0000000001aa'::uuid), ('ffffffff-0000-4000-8000-0000000001bb'), ('ffffffff-0000-4000-8000-0000000001cc')) as cs(c),
     (values ('eeeeeeee-0000-4000-8000-000000000101'::uuid, 'dm'), ('eeeeeeee-0000-4000-8000-000000000102', 'player')) as us(u, r);
insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (98001, 'ffffffff-0000-4000-8000-0000000001aa', 'eeeeeeee-0000-4000-8000-000000000102', 'Player in A'),
  (98002, 'ffffffff-0000-4000-8000-0000000001bb', 'eeeeeeee-0000-4000-8000-000000000102', 'Player in B'),
  (98003, 'ffffffff-0000-4000-8000-0000000001cc', 'eeeeeeee-0000-4000-8000-000000000102', 'Player in C');
update public.campaigns set system_profile = system_profile - 'sheet' where id = 'ffffffff-0000-4000-8000-0000000001bb';

create function tests.custom_profile() returns jsonb language sql stable as $$
  select (select system_profile - 'sheet' from public.campaigns where id = 'ffffffff-0000-4000-8000-0000000001cc') || jsonb_build_object('sheet', $sheet${
    "categories": [{"key": "c", "label": "C", "sections": [
      {"key": "alpha", "label": "Alpha", "items": [
        {"kind": "field", "key": "grado", "label": "Grado", "type": "options", "display": "select", "editableBy": "player",
         "options": [{"key": "no", "label": "No"}, {"key": "comp", "label": "Competente", "formula": "1"}, {"key": "exp", "label": "Experto", "formula": "2"}]},
        {"kind": "field", "key": "marca", "label": "Marca", "type": "options", "display": "checkbox", "editableBy": "player",
         "options": [{"key": "off", "label": "Off"}, {"key": "on", "label": "On"}]},
        {"kind": "field", "key": "cerrado", "label": "Cerrado", "type": "options", "display": "select", "editableBy": "dm",
         "options": [{"key": "a", "label": "A"}, {"key": "b", "label": "B"}]},
        {"kind": "field", "key": "motto", "label": "Motto", "type": "short", "editableBy": "player"},
        {"kind": "table", "type": "stat", "key": "attrs", "label": "Attrs", "rows": [
          {"key": "str", "label": "STR", "modifier": "floor(({valor} - 10) / 2)", "editableBy": "dm"}]},
        {"kind": "table", "type": "capacidades", "key": "skills", "label": "Skills", "columns": [
          {"key": "prof", "label": "Prof", "type": "options", "display": "select", "editableBy": "player",
           "options": [{"key": "n", "label": "N"}, {"key": "c", "label": "C"}, {"key": "e", "label": "E"}]},
          {"key": "tipo", "label": "Tipo", "type": "options", "display": "select", "editableBy": "player",
           "options": [{"key": "fisica", "label": "Fisica"}, {"key": "mental", "label": "Mental"}]},
          {"key": "bloq", "label": "Bloq", "type": "options", "display": "select", "editableBy": "dm",
           "options": [{"key": "x", "label": "X"}, {"key": "y", "label": "Y"}]}],
         "rows": [
          {"key": "sk_a", "label": "A", "stat": "str", "use": "modificador", "editableBy": "player"},
          {"key": "sk_b", "label": "B", "stat": "str", "use": "modificador", "editableBy": "dm"}]},
        {"kind": "table", "type": "libre", "key": "inv", "label": "Inv", "columns": [
          {"key": "nombre", "label": "N", "type": "short", "editableBy": "player"},
          {"key": "tier", "label": "Tier", "type": "options", "display": "select", "editableBy": "player",
           "options": [{"key": "bajo", "label": "Bajo"}, {"key": "alto", "label": "Alto"}]}], "editableBy": "player"},
        {"kind": "table", "type": "libre", "key": "dmtab", "label": "DM tab", "columns": [
          {"key": "tier", "label": "Tier", "type": "options", "display": "select", "editableBy": "dm",
           "options": [{"key": "bajo", "label": "Bajo"}, {"key": "alto", "label": "Alto"}]}], "editableBy": "dm"}
      ], "blocks": []}]}],
    "roles": {}
  }$sheet$::jsonb);
$$;
grant execute on function tests.custom_profile() to authenticated;

select tests.as_user('eeeeeeee-0000-4000-8000-000000000101');
select lives_ok(
  $$ select public.set_system_profile('ffffffff-0000-4000-8000-0000000001aa', tests.custom_profile(),
       (select updated_at from public.campaigns where id = 'ffffffff-0000-4000-8000-0000000001aa')) $$,
  'the DM stores the options sheet through the RPC (the validator accepts it)');

------------------------------------------------------------------------------
-- Part 1: an options FIELD the player may edit
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000102');
select is(tests.try($$ update public.pjs set data = data || '{"grado": "comp"}' where id = 98001 $$), 'ok', 'a declared option key is writable in an options field');
select is(tests.try($$ update public.pjs set data = data || '{"marca": "on"}' where id = 98001 $$), 'ok', 'a checkbox options field takes one of its two keys');
select is(tests.try($$ update public.pjs set data = data || '{"grado": null}' where id = 98001 $$), 'ok', 'null still clears an options field');
select is(tests.try($$ update public.pjs set data = data || '{"grado": "master"}' where id = 98001 $$), '42501', 'a string that is not a declared key is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"grado": "Competente"}' where id = 98001 $$), '42501', 'the label is not the key: rejected');
select is(tests.try($$ update public.pjs set data = data || '{"grado": "COMP"}' where id = 98001 $$), '42501', 'keys are case sensitive');
select is(tests.try($$ update public.pjs set data = data || '{"grado": ""}' where id = 98001 $$), '42501', 'the empty string is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"grado": 1}' where id = 98001 $$), '42501', 'a number is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"grado": true}' where id = 98001 $$), '42501', 'a boolean is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"grado": ["comp"]}' where id = 98001 $$), '42501', 'an array holding a key is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"marca": "comp"}' where id = 98001 $$), '42501', 'a key declared by ANOTHER place is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"cerrado": "a"}' where id = 98001 $$), '42501', 'a DM-only options field stays closed, even with a valid key');
select is((select data ->> 'grado' from public.pjs where id = 98001), null, 'rejected writes left the stored data untouched');

------------------------------------------------------------------------------
-- Part 1: Capacidades cells (row AND column open; first column at data[row], the others at data[row__col])
------------------------------------------------------------------------------
select is(tests.try($$ update public.pjs set data = data || '{"sk_a": "c"}' where id = 98001 $$), 'ok', 'first options column of an open row: declared key');
select is(tests.try($$ update public.pjs set data = data || '{"sk_a": "mental"}' where id = 98001 $$), '42501', 'first options column: the key of the second column is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"sk_a__tipo": "mental"}' where id = 98001 $$), 'ok', 'later options column of an open row: declared key');
select is(tests.try($$ update public.pjs set data = data || '{"sk_a__tipo": "c"}' where id = 98001 $$), '42501', 'later options column: a key of another column is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"sk_a__tipo": 2}' where id = 98001 $$), '42501', 'later options column: a number is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"sk_a__bloq": "x"}' where id = 98001 $$), '42501', 'a DM column of an open row stays closed');
select is(tests.try($$ update public.pjs set data = data || '{"sk_b": "c"}' where id = 98001 $$), '42501', 'a DM row stays closed');

------------------------------------------------------------------------------
-- Part 1: options column inside a player-open Libre table
------------------------------------------------------------------------------
select is(tests.try($$ update public.pjs set data = data || '{"inv": [{"id": 1, "nombre": "rope", "tier": "alto"}, {"id": 2, "tier": null}]}' where id = 98001 $$), 'ok', 'a table row with a declared key (and a cleared cell) is writable');
select is(tests.try($$ update public.pjs set data = data || '{"inv": [{"id": 1, "tier": "medio"}]}' where id = 98001 $$), '42501', 'a table cell with an undeclared key is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"inv": [{"id": 1, "tier": 1}]}' where id = 98001 $$), '42501', 'a table cell with a number in an options column is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"dmtab": [{"id": 1, "tier": "alto"}]}' where id = 98001 $$), '42501', 'a DM-only table stays closed');

------------------------------------------------------------------------------
-- DM writes are never restricted by the sheet; legacy paths are unchanged
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000101');
select is(tests.try($$ update public.pjs set data = data || '{"cerrado": "zzz", "grado": "zzz", "sk_b": "zzz", "dmtab": [{"tier": "zzz"}]}' where id = 98001 $$), 'ok', 'the DM writes any value anywhere');

select tests.as_user('eeeeeeee-0000-4000-8000-000000000102');
select is(tests.try($$ update public.pjs set data = data || '{"grado": "comp"}' where id = 98002 $$), '42501', 'no sheet: an options key is not a legacy key, rejected as before');
select is(tests.try($$ update public.pjs set data = data || '{"edad": "30"}' where id = 98002 $$), 'ok', 'no sheet: legacy identity keys still writable');
select is(tests.try($$ update public.pjs set data = data || '{"grado": "comp"}' where id = 98003 $$), '42501', 'preset sheet: a key it does not define stays rejected');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000103');
select is(public.sheet_guard_access('ffffffff-0000-4000-8000-0000000001aa', '{}', '{}'), null, 'a non-member still gets the legacy answer (null)');

select * from finish();
rollback;
