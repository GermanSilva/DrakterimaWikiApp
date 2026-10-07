-- pgTAP: character ownership and the player-editable subset, calendar, notes, read state, games,
-- multi-campaign role crossing, realtime publication.
-- Self-contained fixture, rolled back at the end.
begin;

select plan(58);

------------------------------------------------------------------------------
-- Inline helpers (no external dependencies)
------------------------------------------------------------------------------
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

create function tests.affected(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture (as postgres)
--   dm : DM of A, PLAYER in B (owns 90003)
--   p1 : player in A (owns 90001), DM of B
--   p2 : player in A (owns 90002)
--   outsider : member of nothing
-- Campaign A loteria config makes every roll a win (3 cp), so the credit path is deterministic.
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'test-dm@example.test'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'test-player1@example.test'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'test-player2@example.test'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'test-outsider@example.test');

insert into public.campaigns (id, slug, name) values
  ('dddddddd-0000-4000-8000-00000000000a', 'test-camp-a', 'Test Campaign A'),
  ('dddddddd-0000-4000-8000-00000000000b', 'test-camp-b', 'Test Campaign B');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000001', 'dm'),
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000002', 'player'),
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000003', 'player'),
  ('dddddddd-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000002', 'dm'),
  ('dddddddd-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000001', 'player');

insert into public.pjs (id, campaign_id, owner_id, nombre, clase, nivel, monedas, data) values
  (90001, 'dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000002', 'P1 character', 'Druid', 1, '{"cp": 0, "sp": 0, "ep": 0, "gp": 0, "pp": 0}',
   '{"stat_hp": 8, "trasfondo": "old", "custom_fields": {"magralita": "old"}}'),
  (90002, 'dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000003', 'P2 character', 'Paladin', 1, '{"cp": 0, "sp": 0, "ep": 0, "gp": 1, "pp": 0}',
   '{"stat_hp": 12}'),
  (90003, 'dddddddd-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000001', 'DM-as-player character', 'Fighter', 1, default,
   '{"stat_hp": 20}');

insert into public.game_pot (campaign_id, gp) values
  ('dddddddd-0000-4000-8000-00000000000a', 5),
  ('dddddddd-0000-4000-8000-00000000000b', 0);

insert into public.campaign_config (campaign_id, key, value, visibility) values
  ('dddddddd-0000-4000-8000-00000000000a', 'loteria',
   '{"commonMinRoll": 1, "commonPrize": {"cp": 3}, "specialPrize": {"cp": 3}}', 'members'),
  ('dddddddd-0000-4000-8000-00000000000a', 'session_screen', '{"cards": []}', 'dm');

------------------------------------------------------------------------------
-- Player p1: edits own character (identity only), limited everywhere else in A
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000002');

select is(
  tests.affected($$update public.pjs
    set nombre = 'Maisie II', clase = 'Mage', data = data || '{"trasfondo": "new"}'
    where id = 90001$$),
  1::bigint,
  'owner can edit identity columns and identity data keys of their own character');

select is(
  tests.affected($$update public.pjs
    set data = jsonb_set(data, '{custom_fields,magralita}', '"new"') where id = 90001$$),
  1::bigint,
  'owner can edit custom character fields');

select throws_ok(
  $$update public.pjs set nivel = 5 where id = 90001$$, '42501', null,
  'owner cannot change their own level');

select throws_ok(
  $$update public.pjs set estado = 'borrador' where id = 90001$$, '42501', null,
  'owner cannot change estado');

select throws_ok(
  $$update public.pjs set visible_to = '{90002}' where id = 90001$$, '42501', null,
  'owner cannot change visible_to');

select throws_ok(
  $$update public.pjs set owner_id = 'bbbbbbbb-0000-4000-8000-000000000003' where id = 90001$$, '42501', null,
  'owner cannot hand the character to someone else');

select throws_ok(
  $$update public.pjs set data = data || '{"stat_hp": 99}' where id = 90001$$, '42501', null,
  'owner cannot change mechanics stored in data');

select throws_ok(
  $$update public.pjs set monedas = jsonb_set(monedas, '{gp}', '1000') where id = 90001$$, '42501', null,
  'owner cannot edit their own coins directly');

select is(
  tests.affected($$update public.pjs set nombre = 'stolen' where id = 90002$$),
  0::bigint,
  'a player cannot edit another player''s character');

select throws_ok(
  $$insert into public.pjs (campaign_id, nombre) values ('dddddddd-0000-4000-8000-00000000000a', 'extra')$$,
  '42501', null,
  'a player cannot create characters');

select is(
  tests.affected($$delete from public.pjs where id = 90001$$),
  0::bigint,
  'a player cannot delete their character');

-- p1 is DM of B: full power over characters there
select is(
  tests.affected($$update public.pjs set nivel = 2 where id = 90003$$),
  1::bigint,
  'the same user, as DM of B, can change a character level in B');

-- calendar
select lives_ok(
  $$insert into public.disponibilidad (campaign_id, tipo, character_id, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('dddddddd-0000-4000-8000-00000000000a', 'personal', 90001, current_date, current_date, '18:00', '22:00')$$,
  'a player can add availability for their own character');

select throws_ok(
  $$insert into public.disponibilidad (campaign_id, tipo, character_id, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('dddddddd-0000-4000-8000-00000000000a', 'personal', 90002, current_date, current_date, '18:00', '22:00')$$,
  '42501', null,
  'a player cannot add availability for another character');

select throws_ok(
  $$insert into public.disponibilidad (campaign_id, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('dddddddd-0000-4000-8000-00000000000a', 'sesion', current_date, current_date, '19:00', '23:00')$$,
  '42501', null,
  'a player cannot create session slots');

-- notes and read state
select lives_ok(
  $$insert into public.player_notes (campaign_id, entity_type, entity_id, character_id, text)
    values ('dddddddd-0000-4000-8000-00000000000a', 'lugares', 1, 90001, 'my private note')$$,
  'a player can write their own note');

select throws_ok(
  $$insert into public.player_notes (campaign_id, user_id, entity_type, entity_id, text)
    values ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000003', 'lugares', 2, 'forged')$$,
  '42501', null,
  'a player cannot write a note as someone else');

select throws_ok(
  $$insert into public.player_notes (campaign_id, entity_type, entity_id, character_id, text)
    values ('dddddddd-0000-4000-8000-00000000000a', 'lugares', 3, 90002, 'as someone else''s character')$$,
  '42501', null,
  'a player cannot attach a note to a character they do not own');

select lives_ok(
  $$insert into public.read_state (campaign_id, entity_type, entity_id)
    values ('dddddddd-0000-4000-8000-00000000000a', 'lugares', 1)$$,
  'a user can mark an entity as read for themselves');

select throws_ok(
  $$insert into public.read_state (campaign_id, user_id, entity_type, entity_id)
    values ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000003', 'lugares', 1)$$,
  '42501', null,
  'a user cannot write read state for someone else');

-- lottery
select is(
  (public.play_loteria('dddddddd-0000-4000-8000-00000000000a', 90001) ->> 'prize_target'),
  'player',
  'a player can play the lottery with their own character');

select throws_ok(
  $$select public.play_loteria('dddddddd-0000-4000-8000-00000000000a', 90001)$$,
  'P0001', 'already_played_today',
  'the lottery allows one play per character per day');

select throws_ok(
  $$select public.play_loteria('dddddddd-0000-4000-8000-00000000000a', 90002)$$,
  '42501', 'not_your_character',
  'a player cannot play for a character they do not own');

select throws_ok(
  $$select public.play_loteria('dddddddd-0000-4000-8000-00000000000a', null)$$,
  'P0001', 'character_required',
  'a player must name a character');

select throws_ok(
  $$insert into public.game_logs (campaign_id, actor_type, character_id, roll, prize, prize_target)
    values ('dddddddd-0000-4000-8000-00000000000a', 'player', 90001, 20, '{"gp": 100}', 'player')$$,
  '42501', null,
  'game logs cannot be forged with a direct insert');

select is(
  (select count(*) from public.game_logs where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  1::bigint,
  'a player sees the logs of their own characters');

select throws_ok(
  $$select public.assign_pot_to_character('dddddddd-0000-4000-8000-00000000000a', 90001, '{"gp": 1}')$$,
  '42501', 'dm_only',
  'a player cannot take coins from the pot');

select is(
  tests.affected($$update public.game_pot set gp = 1000 where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'$$),
  0::bigint,
  'a player cannot edit the pot directly');

select is(
  (select count(*) from public.campaign_config
    where campaign_id = 'dddddddd-0000-4000-8000-00000000000a' and key = 'session_screen'),
  0::bigint,
  'DM-only config (session screen) is hidden from players');

select is(
  (select count(*) from public.campaign_config
    where campaign_id = 'dddddddd-0000-4000-8000-00000000000a' and key = 'loteria'),
  1::bigint,
  'members-visible config (lottery) is readable by players');

------------------------------------------------------------------------------
-- Player p2: isolation from p1's private rows
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000003');

select is(
  (select count(*) from public.player_notes where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  0::bigint,
  'a player cannot read another player''s notes');

select is(
  tests.affected($$update public.player_notes set text = 'overwritten by p2'
    where campaign_id = 'dddddddd-0000-4000-8000-00000000000a' and user_id = 'bbbbbbbb-0000-4000-8000-000000000002'$$),
  0::bigint,
  'a player cannot update another player''s note (the UPDATE path, as the hub uses it)');

select is(
  (select count(*) from public.read_state where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  0::bigint,
  'a player cannot read another user''s read state');

select is(
  (select count(*) from public.game_logs where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  0::bigint,
  'a player cannot read another player''s game logs');

select is(
  (select count(*) from public.disponibilidad where campaign_id = 'dddddddd-0000-4000-8000-00000000000a' and tipo = 'personal'),
  1::bigint,
  'every member sees the calendar');

select is(
  tests.affected($$update public.disponibilidad set hora_fin = '23:59' where character_id = 90001$$),
  0::bigint,
  'a player cannot edit another player''s availability');

------------------------------------------------------------------------------
-- Outsider
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000004');

select throws_ok(
  $$select public.play_loteria('dddddddd-0000-4000-8000-00000000000a', null)$$,
  '42501', 'not_a_member',
  'a non-member cannot play the lottery');

select is(
  (select (select count(*) from public.disponibilidad) + (select count(*) from public.player_notes)
        + (select count(*) from public.game_logs) + (select count(*) from public.game_pot)),
  0::bigint,
  'a non-member sees no calendar, notes, logs or pot');

------------------------------------------------------------------------------
-- dm@: DM of A, only a player in B
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000001');

select is(
  (select count(*) from public.player_notes where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  1::bigint,
  'the DM reads the notes players wrote in their campaign');

select is(
  tests.affected($$update public.player_notes set text = 'corrected by the DM'
    where campaign_id = 'dddddddd-0000-4000-8000-00000000000a' and user_id = 'bbbbbbbb-0000-4000-8000-000000000002'$$),
  1::bigint,
  'the DM can correct a player''s note with UPDATE');

select is(
  (select text from public.player_notes
    where campaign_id = 'dddddddd-0000-4000-8000-00000000000a' and user_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  'corrected by the DM',
  'the DM correction is stored and the player''s overwrite attempt was not');

select is(
  (select count(*) from public.read_state where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  0::bigint,
  'read state is private even from the DM');

select is(
  tests.affected($$update public.pjs set nivel = 3 where id = 90001$$),
  1::bigint,
  'as DM of A, the user can change any character level');

select is(
  tests.affected($$update public.pjs set monedas = jsonb_set(monedas, '{gp}', '50') where id = 90001$$),
  1::bigint,
  'as DM of A, the user can edit any character''s coins');

select is(
  tests.affected($$update public.pjs set nombre = 'Brann the Bold' where id = 90003$$),
  1::bigint,
  'as a player in B, the same user can edit identity of their own character');

select throws_ok(
  $$update public.pjs set nivel = 20 where id = 90003$$, '42501', null,
  'as a player in B, the same user cannot change their own level');

select lives_ok(
  $$insert into public.disponibilidad (campaign_id, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('dddddddd-0000-4000-8000-00000000000a', 'sesion', current_date, current_date, '19:00', '23:00')$$,
  'the DM can create session slots');

select is(
  (public.play_loteria('dddddddd-0000-4000-8000-00000000000a', null) ->> 'prize_target'),
  'pot',
  'a DM lottery roll goes to the pot');

select throws_ok(
  $$select public.assign_pot_to_character('dddddddd-0000-4000-8000-00000000000a', 90002, '{"gp": 999}')$$,
  'P0001', 'insufficient_pot',
  'the DM cannot assign more coins than the pot holds');

select is(
  ((public.assign_pot_to_character('dddddddd-0000-4000-8000-00000000000a', 90002, '{"gp": 2}')) ->> 'gp'),
  '3',
  'assigning coins from the pot decreases the pot (5 - 2)');

------------------------------------------------------------------------------
-- Back to postgres: verify what the RPCs wrote, and the remaining constraints
------------------------------------------------------------------------------
select tests.as_postgres();

select is(
  (select monedas ->> 'cp' from public.pjs where id = 90001),
  '3',
  'the lottery prize was credited to the player''s character');

select ok(
  (select sections_updated ? 'equipo' from public.pjs where id = 90001),
  'a prize marks the equipment section as updated');

select is(
  (select count(*) from public.read_state
    where user_id = 'bbbbbbbb-0000-4000-8000-000000000002' and entity_type = 'pjs'
      and entity_id = 90001 and section = 'equipo'),
  1::bigint,
  'the winner does not get an unread dot for their own prize');

select is(
  (select monedas ->> 'gp' from public.pjs where id = 90002),
  '3',
  'coins assigned from the pot were credited to the character (1 + 2)');

select throws_ok(
  $$update public.pjs set owner_id = 'bbbbbbbb-0000-4000-8000-000000000004' where id = 90001$$,
  '23514', null,
  'a character cannot be owned by someone outside the campaign');

select ok(
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lugares'),
  'entity tables are part of the supabase_realtime publication');

-- an owner always sees their own character, even as borrador
update public.pjs set estado = 'borrador' where id = 90001;

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select is(
  (select count(*) from public.pjs where id = 90001), 1::bigint,
  'an owner still sees their own borrador character');

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000003');
select is(
  (select count(*) from public.pjs where id = 90001), 0::bigint,
  'other players do not see a borrador character');

select * from finish();
rollback;
