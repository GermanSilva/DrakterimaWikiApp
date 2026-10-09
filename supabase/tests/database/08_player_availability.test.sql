-- pgTAP: per-player availability (player_availability), session-only disponibilidad and the
-- anonymised cross-campaign busy RPC. Self-contained fixture, rolled back at the end.
-- The data move of the migration (personal / no_disponible rows -> player_availability) cannot run
-- inside a test (migrations are applied before tests); it was verified by resetting to the previous
-- migration version, seeding legacy rows and applying 20261008120000 (see the H9b1 report).
begin;

select plan(45);

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
--   campaigns  A, B, C, D
--   u1 : DM of A
--   u2 : player in A and B            (the "multi-campaign" player)
--   u3 : player in A and C
--   u4 : DM of B
--   u5 : player in B only             (shares B with u2/u4, nothing with u1/u3)
--   u6 : DM of C
--   u7 : member of nothing
--   u8 : player in A and D            (D has no session slot)
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('ffffffff-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'avail-u' || n || '@example.test'
from generate_series(1, 8) as n;

insert into public.campaigns (id, slug, name) values
  ('eeeeeeee-0000-4000-8000-00000000000a', 'avail-a', 'Avail A'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'avail-b', 'Avail B'),
  ('eeeeeeee-0000-4000-8000-00000000000c', 'avail-c', 'Avail C'),
  ('eeeeeeee-0000-4000-8000-00000000000d', 'avail-d', 'Avail D');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('eeeeeeee-0000-4000-8000-00000000000a', 'ffffffff-0000-4000-8000-000000000001', 'dm'),
  ('eeeeeeee-0000-4000-8000-00000000000a', 'ffffffff-0000-4000-8000-000000000002', 'player'),
  ('eeeeeeee-0000-4000-8000-00000000000a', 'ffffffff-0000-4000-8000-000000000003', 'player'),
  ('eeeeeeee-0000-4000-8000-00000000000a', 'ffffffff-0000-4000-8000-000000000008', 'player'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'ffffffff-0000-4000-8000-000000000004', 'dm'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'ffffffff-0000-4000-8000-000000000002', 'player'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'ffffffff-0000-4000-8000-000000000005', 'player'),
  ('eeeeeeee-0000-4000-8000-00000000000c', 'ffffffff-0000-4000-8000-000000000006', 'dm'),
  ('eeeeeeee-0000-4000-8000-00000000000c', 'ffffffff-0000-4000-8000-000000000003', 'player'),
  ('eeeeeeee-0000-4000-8000-00000000000d', 'ffffffff-0000-4000-8000-000000000008', 'dm');

-- Session slots: A, B and C have one each (distinct times); D has none.
insert into public.disponibilidad (campaign_id, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin) values
  ('eeeeeeee-0000-4000-8000-00000000000a', 'sesion', '2030-01-01', '2030-01-01', '10:00', '12:00'),
  ('eeeeeeee-0000-4000-8000-00000000000b', 'sesion', '2030-01-02', '2030-01-02', '14:00', '16:00'),
  ('eeeeeeee-0000-4000-8000-00000000000c', 'sesion', '2030-01-03', '2030-01-03', '18:00', '20:00');

-- Player availability rows (ids pinned so assertions can name them)
insert into public.player_availability (id, user_id, campaign_id, tipo, fecha, fecha_inicio, fecha_fin, hora_inicio, hora_fin) overriding system value values
  (9001, 'ffffffff-0000-4000-8000-000000000002', null,                                   'no_disponible', '2030-02-01', null, null, null, null),
  (9002, 'ffffffff-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-00000000000a', 'personal', null, '2030-02-02', '2030-02-02', '18:00', '22:00'),
  (9003, 'ffffffff-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-00000000000b', 'personal', null, '2030-02-03', '2030-02-03', '18:00', '22:00'),
  (9004, 'ffffffff-0000-4000-8000-000000000005', null,                                   'no_disponible', '2030-02-04', null, null, null, null),
  (9005, 'ffffffff-0000-4000-8000-000000000001', null,                                   'no_disponible', '2030-02-05', null, null, null, null),
  -- stale pin: u5 is NOT a member of A
  (9006, 'ffffffff-0000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-00000000000a', 'no_disponible', '2030-02-06', null, null, null, null);

------------------------------------------------------------------------------
-- Structure
------------------------------------------------------------------------------
select hasnt_column('public', 'disponibilidad', 'character_id', 'disponibilidad no longer references characters');
select hasnt_column('public', 'disponibilidad', 'fecha', 'disponibilidad has no whole-day column any more');
select ok(
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_availability'),
  'player_availability is part of the supabase_realtime publication');
select is(
  pg_get_function_result('public.campaign_busy_slots(uuid)'::regprocedure),
  'TABLE(user_id uuid, fecha_inicio date, fecha_fin date, hora_inicio time without time zone, hora_fin time without time zone)',
  'the busy RPC returns only user_id and the slot dates / times (no campaign identifier)');
select ok(
  not has_function_privilege('anon', 'public.campaign_busy_slots(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.campaign_busy_slots(uuid)', 'execute'),
  'the busy RPC is callable by authenticated only');
select ok(not has_table_privilege('anon', 'public.player_availability', 'select'), 'anon has no access to player_availability');

------------------------------------------------------------------------------
-- SELECT visibility
------------------------------------------------------------------------------
-- u2 (A + B): everything of their own
select tests.as_user('ffffffff-0000-4000-8000-000000000002');
select is(
  (select array_agg(id order by id) from public.player_availability where user_id = 'ffffffff-0000-4000-8000-000000000002'),
  array[9001, 9002, 9003]::bigint[],
  'a user sees all their own rows: general and pinned to either campaign');
select is(
  (select array_agg(id order by id) from public.player_availability where user_id <> 'ffffffff-0000-4000-8000-000000000002'),
  array[9004, 9005]::bigint[],
  'u2 also sees the general rows of campaign mates (u5 via B, u1 via A) but not the stale pin of u5 in A');

-- u1 (DM of A): sees u2 general + u2 pinned to A; not u2 pinned to B, not u5 (shares nothing)
select tests.as_user('ffffffff-0000-4000-8000-000000000001');
select is(
  (select array_agg(id order by id) from public.player_availability),
  array[9001, 9002, 9005]::bigint[],
  'a DM sees their own row, a campaign mate''s general row and rows pinned to their campaign only');

-- u3 (A + C)
select tests.as_user('ffffffff-0000-4000-8000-000000000003');
select is(
  (select array_agg(id order by id) from public.player_availability),
  array[9001, 9002, 9005]::bigint[],
  'u3 sees u2 general / pinned-to-A and u1 general; not u2 pinned to B, not u5');

-- u5 (B only)
select tests.as_user('ffffffff-0000-4000-8000-000000000005');
select is(
  (select array_agg(id order by id) from public.player_availability),
  array[9001, 9003, 9004, 9006]::bigint[],
  'u5 sees u2 general + u2 pinned to B and their own rows (including their stale pin); nothing from A-only users');

-- u4 (DM of B)
select tests.as_user('ffffffff-0000-4000-8000-000000000004');
select is(
  (select array_agg(id order by id) from public.player_availability),
  array[9001, 9003, 9004]::bigint[],
  'the DM of B sees general rows of B mates and rows pinned to B; not rows pinned to A, not the stale pin');

-- u7 (nobody)
select tests.as_user('ffffffff-0000-4000-8000-000000000007');
select is((select count(*) from public.player_availability), 0::bigint, 'a non-member sees no availability at all');

------------------------------------------------------------------------------
-- Writes
------------------------------------------------------------------------------
select tests.as_user('ffffffff-0000-4000-8000-000000000002');

select lives_ok(
  $$insert into public.player_availability (tipo, fecha) values ('no_disponible', '2030-03-01')$$,
  'a player can add a general whole-day mark (user_id defaults to the caller)');
select is(
  (select user_id from public.player_availability where fecha = '2030-03-01'),
  'ffffffff-0000-4000-8000-000000000002'::uuid,
  'the new row belongs to the caller');
select lives_ok(
  $$insert into public.player_availability (campaign_id, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('eeeeeeee-0000-4000-8000-00000000000b', 'personal', '2030-03-02', '2030-03-02', '18:00', '21:00')$$,
  'a player can pin a window to a campaign they belong to');
select throws_ok(
  $$insert into public.player_availability (campaign_id, tipo, fecha) values ('eeeeeeee-0000-4000-8000-00000000000c', 'no_disponible', '2030-03-03')$$,
  '42501', null,
  'a player cannot pin a row to a campaign they are not in');
select throws_ok(
  $$insert into public.player_availability (user_id, tipo, fecha) values ('ffffffff-0000-4000-8000-000000000003', 'no_disponible', '2030-03-04')$$,
  '42501', null,
  'a player cannot create a row for another user');
select is(
  tests.affected($$update public.player_availability set fecha = '2030-02-09' where id = 9001$$),
  1::bigint,
  'a player can edit their own row');
select throws_ok(
  $$update public.player_availability set campaign_id = 'eeeeeeee-0000-4000-8000-00000000000c' where id = 9001$$,
  '42501', null,
  'a player cannot re-pin a row to a campaign they are not in');
select lives_ok(
  $$update public.player_availability set campaign_id = 'eeeeeeee-0000-4000-8000-00000000000a' where id = 9001$$,
  'a player can pin a general row to one of their campaigns');
select lives_ok(
  $$update public.player_availability set campaign_id = null where id = 9001$$,
  'a player can turn a pinned row back into a general one');
select throws_ok(
  $$update public.player_availability set user_id = 'ffffffff-0000-4000-8000-000000000003' where id = 9001$$,
  '42501', null,
  'user_id is not updatable (rows cannot be handed to someone else)');
select is(
  tests.affected($$update public.player_availability set fecha = '2031-01-01' where id in (9004, 9005)$$),
  0::bigint,
  'a player cannot edit other users'' rows');
select is(
  tests.affected($$delete from public.player_availability where id in (9004, 9005)$$),
  0::bigint,
  'a player cannot delete other users'' rows');
select is(
  tests.affected($$delete from public.player_availability where id = 9003$$),
  1::bigint,
  'a player can delete their own row');

select throws_ok(
  $$insert into public.player_availability (tipo, fecha_inicio, fecha_fin) values ('personal', '2030-04-01', '2030-04-01')$$,
  '23514', null,
  'a personal window needs both times');
select throws_ok(
  $$insert into public.player_availability (tipo) values ('no_disponible')$$,
  '23514', null,
  'a whole-day mark needs a date');
select throws_ok(
  $$insert into public.player_availability (tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('personal', '2030-04-02', '2030-04-01', '10:00', '11:00')$$,
  '23514', null,
  'a window cannot end before it starts');
select throws_ok(
  $$insert into public.player_availability (tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('sesion', '2030-04-01', '2030-04-01', '10:00', '11:00')$$,
  '23514', null,
  'session slots do not belong in player_availability');

-- DM writes their own rows (no character needed)
select tests.as_user('ffffffff-0000-4000-8000-000000000001');
select lives_ok(
  $$insert into public.player_availability (campaign_id, tipo, fecha) values ('eeeeeeee-0000-4000-8000-00000000000a', 'no_disponible', '2030-05-01')$$,
  'a DM can mark their own unavailability');
select is(
  tests.affected($$update public.player_availability set fecha = '2031-01-01' where id = 9002$$),
  0::bigint,
  'being DM of the campaign gives no power over a player''s availability');

-- outsider
select tests.as_user('ffffffff-0000-4000-8000-000000000007');
select lives_ok(
  $$insert into public.player_availability (tipo, fecha) values ('no_disponible', '2030-05-02')$$,
  'a user without campaigns can keep a (general) calendar');
select throws_ok(
  $$insert into public.player_availability (campaign_id, tipo, fecha) values ('eeeeeeee-0000-4000-8000-00000000000a', 'no_disponible', '2030-05-03')$$,
  '42501', null,
  'a non-member cannot pin a row to a campaign');

------------------------------------------------------------------------------
-- disponibilidad: sessions only, DM writes, members read
------------------------------------------------------------------------------
select tests.as_user('ffffffff-0000-4000-8000-000000000002');
select is((select count(*) from public.disponibilidad where campaign_id = 'eeeeeeee-0000-4000-8000-00000000000a'), 1::bigint,
  'a member reads their campaign''s session slots');
select is((select count(*) from public.disponibilidad where campaign_id = 'eeeeeeee-0000-4000-8000-00000000000c'), 0::bigint,
  'a member does not read the session slots of a campaign they are not in');
select throws_ok(
  $$insert into public.disponibilidad (campaign_id, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('eeeeeeee-0000-4000-8000-00000000000a', 'sesion', '2030-06-01', '2030-06-01', '10:00', '11:00')$$,
  '42501', null,
  'a player cannot create session slots');

select tests.as_user('ffffffff-0000-4000-8000-000000000001');
select lives_ok(
  $$insert into public.disponibilidad (campaign_id, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('eeeeeeee-0000-4000-8000-00000000000a', 'sesion', '2030-06-01', '2030-06-01', '10:00', '11:00')$$,
  'the DM can create session slots');
select throws_ok(
  $$insert into public.disponibilidad (campaign_id, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin)
    values ('eeeeeeee-0000-4000-8000-00000000000a', 'personal', '2030-06-02', '2030-06-02', '10:00', '11:00')$$,
  '23514', null,
  'even the DM cannot store personal availability in disponibilidad');

------------------------------------------------------------------------------
-- campaign_busy_slots
------------------------------------------------------------------------------
-- A's members: u1, u2 (also in B), u3 (also in C), u8 (also in D, no slot). A's own slots are never returned.
select tests.as_user('ffffffff-0000-4000-8000-000000000001');
select results_eq(
  $$select user_id, fecha_inicio, hora_inicio from public.campaign_busy_slots('eeeeeeee-0000-4000-8000-00000000000a')$$,
  $$values ('ffffffff-0000-4000-8000-000000000002'::uuid, '2030-01-02'::date, '14:00'::time),
           ('ffffffff-0000-4000-8000-000000000003'::uuid, '2030-01-03'::date, '18:00'::time)$$,
  'the DM of A gets the B slot for u2 and the C slot for u3: nothing for u1, u8 or A''s own slots');

select tests.as_user('ffffffff-0000-4000-8000-000000000002');
select is(
  (select count(*) from public.campaign_busy_slots('eeeeeeee-0000-4000-8000-00000000000a')), 2::bigint,
  'a player gets the same busy slots as the DM');

-- B's members: u4, u2 (also in A), u5. u2 is busy through A's session only; u3's C slot is not B's business.
select tests.as_user('ffffffff-0000-4000-8000-000000000004');
select results_eq(
  $$select user_id, fecha_inicio, hora_inicio from public.campaign_busy_slots('eeeeeeee-0000-4000-8000-00000000000b')$$,
  $$values ('ffffffff-0000-4000-8000-000000000002'::uuid, '2030-01-01'::date, '10:00'::time),
           ('ffffffff-0000-4000-8000-000000000002'::uuid, '2030-06-01'::date, '10:00'::time)$$,
  'B sees u2 busy for A''s two session slots and no one else (rows carry no campaign identifier)');

-- non-members are refused
select tests.as_user('ffffffff-0000-4000-8000-000000000005');
select throws_ok(
  $$select * from public.campaign_busy_slots('eeeeeeee-0000-4000-8000-00000000000a')$$,
  '42501', 'not_a_member',
  'a member of another campaign cannot call the RPC for a campaign they are not in');
select tests.as_user('ffffffff-0000-4000-8000-000000000007');
select throws_ok(
  $$select * from public.campaign_busy_slots('eeeeeeee-0000-4000-8000-00000000000b')$$,
  '42501', 'not_a_member',
  'a user without campaigns cannot call the RPC');

-- D has no sessions of its own and its only other participant (u8) is in A: A's slots show up, nothing else
select tests.as_user('ffffffff-0000-4000-8000-000000000008');
select is(
  (select count(*) from public.campaign_busy_slots('eeeeeeee-0000-4000-8000-00000000000d')), 2::bigint,
  'u8 (in A and D) sees A''s session slots as busy when looking at D');

select * from finish();
rollback;
