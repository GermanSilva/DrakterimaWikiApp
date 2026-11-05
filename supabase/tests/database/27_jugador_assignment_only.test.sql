-- pgTAP: G4b of the system-agnostic campaigns (S30, S33). `jugador` is set ONLY by the assignment of the character
-- (pjs.owner_id), never typed: not by a player and not by a DM either. Callers without a request identity (postgres,
-- migrations, service_role) keep writing it so the data migration (G10) can. Also pins the G4a verifier's missing cases
-- for the player sheet guard (malformed options values, unknown table columns, a self-assigned owner with a typed jugador).
-- Self-contained fixture, rolled back at the end.
begin;

select plan(33);

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
-- Fixture: dm (..0201), player (..0202), second player (..0203); one campaign with a custom sheet
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('eeeeeeee-0000-4000-8000-000000000' || (200 + n))::uuid,
       'authenticated', 'authenticated', 'jugasg-u' || n || '@example.test', json_build_object('full_name', 'Jugasg ' || n)::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, slug, name, created_by) values
  ('ffffffff-0000-4000-8000-0000000002aa', 'jugasg-a', 'Jug A', 'eeeeeeee-0000-4000-8000-000000000201');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('ffffffff-0000-4000-8000-0000000002aa', 'eeeeeeee-0000-4000-8000-000000000201', 'dm'),
  ('ffffffff-0000-4000-8000-0000000002aa', 'eeeeeeee-0000-4000-8000-000000000202', 'player'),
  ('ffffffff-0000-4000-8000-0000000002aa', 'eeeeeeee-0000-4000-8000-000000000203', 'player');
insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (97001, 'ffffffff-0000-4000-8000-0000000002aa', 'eeeeeeee-0000-4000-8000-000000000202', 'Owned'),
  (97002, 'ffffffff-0000-4000-8000-0000000002aa', null, 'Unowned'),
  (97003, 'ffffffff-0000-4000-8000-0000000002aa', 'eeeeeeee-0000-4000-8000-000000000203', 'Doomed');

create function tests.custom_profile() returns jsonb language sql stable as $$
  select (select system_profile - 'sheet' from public.campaigns where id = 'ffffffff-0000-4000-8000-0000000002aa') || jsonb_build_object('sheet', $sheet${
    "categories": [{"key": "c", "label": "C", "sections": [
      {"key": "alpha", "label": "Alpha", "items": [
        {"kind": "field", "key": "grado", "label": "Grado", "type": "options", "display": "select", "editableBy": "player",
         "options": [{"key": "no", "label": "No"}, {"key": "comp", "label": "Competente", "formula": "1"}]},
        {"kind": "table", "type": "libre", "key": "inv", "label": "Inv", "columns": [
          {"key": "nombre", "label": "N", "type": "short", "editableBy": "player"},
          {"key": "tier", "label": "Tier", "type": "options", "display": "select", "editableBy": "player",
           "options": [{"key": "bajo", "label": "Bajo"}, {"key": "alto", "label": "Alto"}]}], "editableBy": "player"}
      ], "blocks": []}]}],
    "roles": {}
  }$sheet$::jsonb);
$$;
grant execute on function tests.custom_profile() to authenticated;

select tests.as_user('eeeeeeee-0000-4000-8000-000000000201');
select lives_ok(
  $$ select public.set_system_profile('ffffffff-0000-4000-8000-0000000002aa', tests.custom_profile(),
       (select updated_at from public.campaigns where id = 'ffffffff-0000-4000-8000-0000000002aa')) $$,
  'the DM stores the sheet through the RPC');

------------------------------------------------------------------------------
-- The DM cannot type jugador either (S30): only the assignment sets it
------------------------------------------------------------------------------
select is((select jugador from public.pjs where id = 97001), 'Jugasg 2', 'baseline: the owned character holds its owner display name');
select is(tests.try($$ update public.pjs set jugador = 'Typed by the DM' where id = 97001 $$), '42501', 'DM: changing jugador of an owned character is rejected');
select is(tests.try($$ update public.pjs set jugador = 'Typed by the DM' where id = 97002 $$), '42501', 'DM: changing jugador of an unowned character is rejected');
select is(tests.try($$ update public.pjs set nombre = 'Renamed', jugador = 'Ride along' where id = 97001 $$), '42501', 'DM: jugador cannot ride along with another change');
select is((select nombre || '/' || jugador from public.pjs where id = 97001), 'Owned/Jugasg 2', 'the rejected updates changed nothing');
select is(tests.try($$ update public.pjs set jugador = '' where id = 97001 $$), '42501', 'DM: clearing jugador by hand is rejected too');
select is(tests.try($$ update public.pjs set nombre = 'Renamed', jugador = 'Jugasg 2' where id = 97001 $$), 'ok', 'DM: a form save that sends the stored jugador back is accepted');
select is(tests.try($$ update public.pjs set nombre = 'Renamed again', jugador = '' where id = 97002 $$), 'ok', 'DM: same-value save on an unowned character (empty) is accepted');
select is((select nombre || '/' || jugador from public.pjs where id = 97001), 'Renamed/Jugasg 2', 'and the other columns were saved');

-- creation: whatever the DM sends, jugador comes from the owner
select is(tests.try($$ insert into public.pjs (id, campaign_id, nombre, jugador) values (97010, 'ffffffff-0000-4000-8000-0000000002aa', 'Born free', 'Free text') $$), 'ok', 'DM: creates a character without an owner and with a typed jugador');
select is((select jugador from public.pjs where id = 97010), '', 'creation without an owner: jugador is empty, the typed text is discarded');
select is(tests.try($$ insert into public.pjs (id, campaign_id, nombre) values (97011, 'ffffffff-0000-4000-8000-0000000002aa', 'Born bare') $$), 'ok', 'DM: creates a character without sending jugador');
select is((select jugador from public.pjs where id = 97011), '', 'creation without jugador: empty');
select is(tests.try($$ insert into public.pjs (id, campaign_id, owner_id, nombre, jugador) values (97012, 'ffffffff-0000-4000-8000-0000000002aa', 'eeeeeeee-0000-4000-8000-000000000203', 'Born owned', 'Free text') $$), 'ok', 'DM: creates a character for a member with a typed jugador');
select is((select jugador from public.pjs where id = 97012), 'Jugasg 3', 'creation for a member: jugador is the member display name');

-- the assignment still works and derives the value
select is(tests.try($$ update public.pjs set owner_id = 'eeeeeeee-0000-4000-8000-000000000203', jugador = 'Typed' where id = 97002 $$), 'ok', 'DM: assigns a character and sends a typed jugador');
select is((select jugador from public.pjs where id = 97002), 'Jugasg 3', 'assignment: the typed text is ignored, the display name wins');

------------------------------------------------------------------------------
-- Without a request identity (postgres, migrations, service_role) the value can still be written
------------------------------------------------------------------------------
select tests.as_postgres();
update public.pjs set jugador = 'Maintenance' where id = 97010;
select is((select jugador from public.pjs where id = 97010), 'Maintenance', 'no identity: a direct update is not blocked');
insert into public.pjs (id, campaign_id, nombre, jugador) values (97013, 'ffffffff-0000-4000-8000-0000000002aa', 'Migrated', 'Legacy text');
select is((select jugador from public.pjs where id = 97013), 'Legacy text', 'no identity: an insert without an owner keeps the text (data migrations)');
insert into public.pjs (id, campaign_id, owner_id, nombre, jugador) values (97014, 'ffffffff-0000-4000-8000-0000000002aa', 'eeeeeeee-0000-4000-8000-000000000203', 'Migrated owned', 'ignored');
select is((select jugador from public.pjs where id = 97014), 'Jugasg 3', 'no identity: an insert with an owner still derives the display name');

------------------------------------------------------------------------------
-- The player: self-assigning with a typed jugador, and the G4a verifier's malformed values
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000202');
select is(tests.try($$ update public.pjs set owner_id = 'eeeeeeee-0000-4000-8000-000000000202', jugador = 'X' where id = 97001 $$), '42501', 'player: setting owner_id to themselves with a typed jugador is rejected');
select is((select owner_id::text || '/' || jugador from public.pjs where id = 97001), 'eeeeeeee-0000-4000-8000-000000000202/Jugasg 2', 'and nothing changed');
select is(tests.try($$ update public.pjs set jugador = 'X' where id = 97001 $$), '42501', 'player: typing jugador on their own character is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"grado": "comp"}' where id = 97001 $$), 'ok', 'player: a declared option key is accepted (control)');
select is(tests.try($$ update public.pjs set data = data || '{"grado": {"comp": 1}}' where id = 97001 $$), '42501', 'player: an object holding a key is not a key');
select is(tests.try($$ update public.pjs set data = data || '{"grado": "comp "}' where id = 97001 $$), '42501', 'player: a key with a trailing space is rejected');
select is(tests.try($$ update public.pjs set data = data || '{"inv": [{"id": 1, "tier": "alto", "nombre": "rope"}]}' where id = 97001 $$), 'ok', 'player: a Libre row with declared columns is accepted (control)');
select is(tests.try($$ update public.pjs set data = data || '{"inv": [{"id": 1, "tier": "alto", "x": "1"}]}' where id = 97001 $$), '42501', 'player: a Libre row with an unknown column is rejected');
select is((select data -> 'inv' from public.pjs where id = 97001), '[{"id": 1, "tier": "alto", "nombre": "rope"}]'::jsonb, 'rejected writes left the stored table untouched');

------------------------------------------------------------------------------
-- Deleting the player's account releases the character and clears jugador
------------------------------------------------------------------------------
select tests.as_postgres();
select is((select jugador from public.pjs where id = 97003), 'Jugasg 3', 'baseline: the character holds the display name of its owner');
delete from auth.users where id = 'eeeeeeee-0000-4000-8000-000000000203';
select is((select owner_id from public.pjs where id = 97003), null, 'deleting the owner account releases the character');
select is((select jugador from public.pjs where id = 97003) || '|' || (select jugador from public.pjs where id = 97012), '|', 'and jugador is empty on every character that account owned');

select * from finish();
rollback;
