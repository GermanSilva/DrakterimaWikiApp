-- pgTAP: G4a of the system-agnostic campaigns (S20, S30, S33).
--   Part 1: a player may write an `options` value (field, Capacidades cell, options column of a Libre table) only as one
--           of the option keys declared at THAT place; null still clears; everything else is judged as before.
--   Part 2: `jugador` is no longer free text (G4b extends this to the DM, see 27); the assignment of the character (pjs.owner_id) decides it: it
--           becomes the display name of the assigned member and is cleared when the character is released (S30, S33).
-- Self-contained fixture, rolled back at the end.
begin;

select plan(63);

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

-- back to a session without a request identity (like a migration or the service role): the claims are cleared too
create function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
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
-- Fixture: dm (..0101), player (..0102), outsider (..0103), second member of A (..0104), invitee (..0105, not a member)
--   A = custom sheet with options, B = no sheet, C = the default D&D preset
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('eeeeeeee-0000-4000-8000-000000000' || (100 + n))::uuid,
       'authenticated', 'authenticated', 'optjug-u' || n || '@example.test', json_build_object('full_name', 'Optjug ' || n)::jsonb
from generate_series(1, 5) as n;

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
insert into public.campaign_members (campaign_id, user_id, role) values
  ('ffffffff-0000-4000-8000-0000000001aa', 'eeeeeeee-0000-4000-8000-000000000104', 'player');
insert into public.pjs (id, campaign_id, owner_id, nombre, jugador) values
  (98004, 'ffffffff-0000-4000-8000-0000000001aa', null, 'Unowned', 'Legacy text'),
  (98005, 'ffffffff-0000-4000-8000-0000000001aa', null, 'Claimable', 'Old text');
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

------------------------------------------------------------------------------
-- Part 2 (S30, S33): jugador follows the assignment
------------------------------------------------------------------------------
select tests.as_postgres();
select is((select jugador from public.pjs where id = 98001), 'Optjug 2', 'baseline: a character inserted with an owner got that member display name');

-- the owner (a player) can no longer change it
select tests.as_user('eeeeeeee-0000-4000-8000-000000000102');
select is(tests.try($$ update public.pjs set jugador = 'Somebody else' where id = 98001 $$), '42501', 'owner: changing jugador is rejected');
select is(tests.try($$ update public.pjs set jugador = 'Optjug 2' where id = 98001 $$), 'ok', 'owner: writing the value already stored is not a change (a form save round-trips it)');
select is(tests.try($$ update public.pjs set nombre = 'Renamed', jugador = 'Hacked' where id = 98001 $$), '42501', 'owner: jugador cannot ride along with an allowed change');
select is((select nombre || '/' || jugador from public.pjs where id = 98001), 'Player in A/Optjug 2', 'owner: the rejected update changed nothing');
select is(tests.try($$ update public.pjs set owner_id = 'eeeeeeee-0000-4000-8000-000000000104' where id = 98001 $$), '42501', 'owner: handing the character over is still DM only');
select is((select jugador from public.pjs where id = 98001), 'Optjug 2', 'owner: a rejected hand-over leaves jugador alone');
select is(tests.try($$ update public.pjs set jugador = 'Nope' where id = 98002 $$), '42501', 'owner on a no-sheet campaign: jugador is rejected too');
select is(tests.try($$ update public.pjs set jugador = 'Nope' where id = 98003 $$), '42501', 'owner on the preset sheet: jugador is rejected too');

-- the DM assigns: jugador becomes the member's display name, whatever text is sent along
select tests.as_user('eeeeeeee-0000-4000-8000-000000000101');
select is(tests.try($$ update public.pjs set owner_id = 'eeeeeeee-0000-4000-8000-000000000104', jugador = 'Typed by hand' where id = 98004 $$), 'ok', 'DM: assigns a character to a member');
select is((select jugador from public.pjs where id = 98004), 'Optjug 4', 'DM assignment: jugador is the member display name, not the typed text');
select is(tests.try($$ update public.pjs set owner_id = 'eeeeeeee-0000-4000-8000-000000000102' where id = 98004 $$), 'ok', 'DM: reassigns it');
select is((select jugador from public.pjs where id = 98004), 'Optjug 2', 'DM reassignment: jugador follows the new member');
select is(tests.try($$ update public.pjs set owner_id = null where id = 98004 $$), 'ok', 'DM: releases it');
select is((select jugador from public.pjs where id = 98004), '', 'DM release: jugador is cleared');
select is(tests.try($$ update public.pjs set owner_id = 'eeeeeeee-0000-4000-8000-000000000103' where id = 98004 $$), '23514', 'DM: a non-member still cannot be assigned');
select is((select jugador from public.pjs where id = 98004), '', 'a refused assignment leaves jugador alone');

-- a character created for a member
select is(tests.try($$ insert into public.pjs (id, campaign_id, owner_id, nombre, jugador) values (98006, 'ffffffff-0000-4000-8000-0000000001aa', 'eeeeeeee-0000-4000-8000-000000000104', 'Born owned', 'free text') $$), 'ok', 'DM: creates a character for a member');
select is((select jugador from public.pjs where id = 98006), 'Optjug 4', 'creation for a member: jugador is the member display name');
select is(tests.try($$ insert into public.pjs (id, campaign_id, nombre, jugador) values (98007, 'ffffffff-0000-4000-8000-0000000001aa', 'Born free', 'Legacy name') $$), 'ok', 'DM: creates an unassigned character');
select is((select jugador from public.pjs where id = 98007), '', 'creation without a member: the typed text is discarded (G4b: only the assignment sets it)');

-- DM direct edits of the text are refused since G4b (27_jugador_assignment_only covers the whole DM rule)
select is(tests.try($$ update public.pjs set jugador = 'DM edit' where id = 98007 $$), '42501', 'DM: editing the text of an unassigned character is rejected (G4b)');
select is((select jugador from public.pjs where id = 98007), '', 'and nothing is stored');

-- the other assignment paths: invite redemption and member removal
select tests.as_postgres();
insert into public.campaign_invites (campaign_id, code, character_id, max_uses, created_by)
values ('ffffffff-0000-4000-8000-0000000001aa', 'optjug-claim-code', 98005, 1, 'eeeeeeee-0000-4000-8000-000000000101');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000105');
select lives_ok($$ select public.accept_invite('optjug-claim-code') $$, 'a new member redeems a character invite');
select tests.as_postgres();
select is((select jugador from public.pjs where id = 98005), 'Optjug 5', 'invite redemption: jugador is the display name of the claimer');
select is((select owner_id from public.pjs where id = 98005), 'eeeeeeee-0000-4000-8000-000000000105'::uuid, 'invite redemption: the claimer owns the character');
delete from public.campaign_members where campaign_id = 'ffffffff-0000-4000-8000-0000000001aa' and user_id = 'eeeeeeee-0000-4000-8000-000000000105';
select is((select owner_id from public.pjs where id = 98005), null, 'member removal releases the character');
select is((select jugador from public.pjs where id = 98005), '', 'member removal: jugador is cleared');

-- privileged roles can still set the text directly; an assignment change always wins
update public.pjs set jugador = 'Maintenance' where id = 98007;
select is((select jugador from public.pjs where id = 98007), 'Maintenance', 'postgres: a direct text write is not blocked');
update public.pjs set owner_id = 'eeeeeeee-0000-4000-8000-000000000104', jugador = 'ignored' where id = 98007;
select is((select jugador from public.pjs where id = 98007), 'Optjug 4', 'postgres: an owner change derives jugador as well');

-- the display name is a snapshot taken at assignment (a later rename does not rewrite characters)
update public.profiles set display_name = 'Renamed Four' where id = 'eeeeeeee-0000-4000-8000-000000000104';
select is((select jugador from public.pjs where id = 98007), 'Optjug 4', 'a profile rename does not touch assigned characters (snapshot)');

-- the trigger function is internal
select ok(
  not has_function_privilege('anon', 'public.pjs_enforce_jugador()', 'execute')
  and not has_function_privilege('authenticated', 'public.pjs_enforce_jugador()', 'execute'),
  'pjs_enforce_jugador is not callable through the API');
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.pjs_enforce_jugador()'::regprocedure),
  'and it is SECURITY DEFINER with an empty search_path');

select * from finish();
rollback;
