-- pgTAP: entity visibility (estado / visible_to), DM-only writes, DM-private notes,
-- cross-campaign isolation. Self-contained fixture, rolled back at the end.
-- Not executed yet (no Docker available when written).
begin;

select plan(35);

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
--   dm  : DM of A, player in B       p1 : player in A (owns 90001), DM of B
--   p2  : player in A (owns 90002)   outsider : member of nothing
-- Campaign A lugares: 91001 publicado | 91002 borrador | 91003 secreto{90001}
--                     91004 secreto{} | 91005 secreto{90002}
-- Campaign B lugares: 91011 publicado | 91012 borrador
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'test-dm@example.test'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'test-player1@example.test'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'test-player2@example.test'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'test-outsider@example.test'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'test-dual@example.test');

insert into public.campaigns (id, slug, name) values
  ('dddddddd-0000-4000-8000-00000000000a', 'test-camp-a', 'Test Campaign A'),
  ('dddddddd-0000-4000-8000-00000000000b', 'test-camp-b', 'Test Campaign B');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000001', 'dm'),
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000002', 'player'),
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000003', 'player'),
  ('dddddddd-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000002', 'dm'),
  ('dddddddd-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000001', 'player'),
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000005', 'dm'),
  ('dddddddd-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000005', 'dm');

insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (90001, 'dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000002', 'P1 character'),
  (90002, 'dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000003', 'P2 character');

insert into public.lugares (id, campaign_id, nombre, estado, visible_to) values
  (91001, 'dddddddd-0000-4000-8000-00000000000a', 'A publicado', 'publicado', '{}'),
  (91002, 'dddddddd-0000-4000-8000-00000000000a', 'A borrador',  'borrador',  '{}'),
  (91003, 'dddddddd-0000-4000-8000-00000000000a', 'A secreto for 90001', 'secreto', '{90001}'),
  (91004, 'dddddddd-0000-4000-8000-00000000000a', 'A secreto nobody',   'secreto', '{}'),
  (91005, 'dddddddd-0000-4000-8000-00000000000a', 'A secreto for 90002', 'secreto', '{90002}'),
  (91011, 'dddddddd-0000-4000-8000-00000000000b', 'B publicado', 'publicado', '{}'),
  (91012, 'dddddddd-0000-4000-8000-00000000000b', 'B borrador',  'borrador',  '{}');

insert into public.pnjs (id, campaign_id, nombre, estado, visible_to) values
  (93001, 'dddddddd-0000-4000-8000-00000000000a', 'A pnj publicado', 'publicado', '{}'),
  (93002, 'dddddddd-0000-4000-8000-00000000000a', 'A pnj secreto for 90002', 'secreto', '{90002}');

insert into public.entity_dm_notes (campaign_id, entity_type, entity_id, notas, secreto) values
  ('dddddddd-0000-4000-8000-00000000000a', 'lugares', 91001, 'dm note A', 'dm secret A'),
  ('dddddddd-0000-4000-8000-00000000000b', 'lugares', 91012, 'dm note B', '');

insert into public.mapas (id, campaign_id, nombre, estado) values
  (92001, 'dddddddd-0000-4000-8000-00000000000a', 'Map A', 'publicado'),
  (92002, 'dddddddd-0000-4000-8000-00000000000a', 'Map A (draft)', 'borrador');

insert into public.map_points (id, campaign_id, map_id, nombre, estado) values
  (92101, 'dddddddd-0000-4000-8000-00000000000a', 92002, 'point on draft map', 'publicado'),
  (92102, 'dddddddd-0000-4000-8000-00000000000a', 92001, 'point on public map', 'publicado');

------------------------------------------------------------------------------
-- Outsider: sees nothing at all
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000004');

select is(
  (select count(*) from public.lugares), 0::bigint,
  'outsider sees no lugares');

select is(
  (select (select count(*) from public.pjs) + (select count(*) from public.pnjs)
        + (select count(*) from public.mapas) + (select count(*) from public.entity_dm_notes)),
  0::bigint,
  'outsider sees no pjs, pnjs, mapas or DM notes');

------------------------------------------------------------------------------
-- Player p1 (player in A, DM in B)
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000002');

select is(
  (select array_agg(id order by id) from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array[91001, 91003]::bigint[],
  'player sees publicado and the secreto whose visible_to contains their character, not borrador');

select is(
  (select count(*) from public.lugares where id = 91002),
  0::bigint,
  'player does not see borrador');

select is(
  (select count(*) from public.lugares where id in (91004, 91005)),
  0::bigint,
  'player does not see secreto aimed at nobody or at another player''s character');

select is(
  (select array_agg(id order by id) from public.pnjs where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array[93001]::bigint[],
  'the same rule applies to other entity tables (pnjs)');

select is(
  (select count(*) from public.entity_dm_notes where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  0::bigint,
  'player cannot read DM-private notes');

select throws_ok(
  $$insert into public.lugares (campaign_id, nombre) values ('dddddddd-0000-4000-8000-00000000000a', 'player wrote this')$$,
  '42501', null,
  'player cannot insert entities');

select is(
  tests.affected($$update public.lugares set nombre = 'edited' where id = 91001$$),
  0::bigint,
  'player cannot update entities');

select is(
  tests.affected($$update public.lugares set estado = 'publicado' where id = 91003$$),
  0::bigint,
  'a player cannot change the estado of an entity (non-pjs table)');

select is(
  (select count(*) from public.map_points where id = 92102),
  1::bigint,
  'a publicado map point on a visible map is visible to players');

select is(
  (select count(*) from public.map_points where id = 92101),
  0::bigint,
  'a publicado map point on a borrador map is invisible to players');

select is(
  tests.affected($$delete from public.lugares where id = 91001$$),
  0::bigint,
  'player cannot delete entities');

select throws_ok(
  $$insert into public.entity_dm_notes (campaign_id, entity_type, entity_id, notas)
    values ('dddddddd-0000-4000-8000-00000000000a', 'lugares', 91001, 'player note')$$,
  '42501', null,
  'player cannot write DM-private notes');

------------------------------------------------------------------------------
-- Same user p1 is DM in B: full power there, still nothing in A
------------------------------------------------------------------------------
select is(
  (select array_agg(id order by id) from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000b'),
  array[91011, 91012]::bigint[],
  'as DM of B the same user sees publicado and borrador');

select is(
  (select count(*) from public.entity_dm_notes where campaign_id = 'dddddddd-0000-4000-8000-00000000000b'),
  1::bigint,
  'as DM of B the same user reads DM notes');

select is(
  tests.affected($$update public.lugares set nombre = 'edited by DM of B' where id = 91011$$),
  1::bigint,
  'as DM of B the same user can update entities');

select lives_ok(
  $$insert into public.lugares (campaign_id, nombre) values ('dddddddd-0000-4000-8000-00000000000b', 'new in B')$$,
  'as DM of B the same user can insert entities');

-- 'dual' is DM of BOTH campaigns, so RLS would allow the move: only the trigger can stop it
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000005');
select throws_ok(
  $$update public.lugares set campaign_id = 'dddddddd-0000-4000-8000-00000000000a' where id = 91011$$,
  '42501', 'campaign_id is immutable',
  'an entity cannot be moved to another campaign, even by someone who is DM of both');

select throws_ok(
  $$update public.lugares set id = 99999 where id = 91011$$,
  '42501', 'id and created_by are immutable',
  'a DM cannot renumber an entity');

select throws_ok(
  $$update public.lugares set created_by = 'bbbbbbbb-0000-4000-8000-000000000005' where id = 91011$$,
  '42501', 'id and created_by are immutable',
  'a DM cannot forge authorship');

------------------------------------------------------------------------------
-- Player p2: secreto aimed at their own character
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000003');

select is(
  (select array_agg(id order by id) from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array[91001, 91005]::bigint[],
  'another player sees only the secreto aimed at their own character');

select is(
  (select array_agg(id order by id) from public.pnjs where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array[93001, 93002]::bigint[],
  'secreto pnj is visible to the targeted character''s owner');

select is(
  (select count(*) from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000b'),
  0::bigint,
  'a user who is not a member of B sees none of B''s entities');

------------------------------------------------------------------------------
-- DM of A (dm@), who is only a player in B
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000001');

select is(
  (select array_agg(id order by id) from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array[91001, 91002, 91003, 91004, 91005]::bigint[],
  'DM sees every estado in their campaign');

select is(
  (select array_agg(id order by id) from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000b' and id in (91011, 91012)),
  array[91011]::bigint[],
  'the DM of A is only a player in B: sees publicado, not borrador');

select is(
  (select count(*) from public.entity_dm_notes where campaign_id = 'dddddddd-0000-4000-8000-00000000000b'),
  0::bigint,
  'the DM of A cannot read DM notes of B');

select is(
  tests.affected($$update public.lugares set nombre = 'edited by DM of A' where id = 91001$$),
  1::bigint,
  'DM can update entities in their campaign');

select is(
  tests.affected($$update public.lugares set nombre = 'player of B edits' where id = 91011$$),
  0::bigint,
  'the same user cannot update entities in the campaign where they are a player');

select throws_ok(
  $$insert into public.lugares (campaign_id, nombre) values ('dddddddd-0000-4000-8000-00000000000b', 'player of B inserts')$$,
  '42501', null,
  'the same user cannot insert entities in the campaign where they are a player');

select lives_ok(
  $$insert into public.entity_dm_notes (campaign_id, entity_type, entity_id, notas)
    values ('dddddddd-0000-4000-8000-00000000000a', 'lugares', 91002, 'new dm note')$$,
  'DM can write DM-private notes for an entity of their campaign');

select throws_ok(
  $$insert into public.entity_dm_notes (campaign_id, entity_type, entity_id, notas)
    values ('dddddddd-0000-4000-8000-00000000000a', 'lugares', 91011, 'points at B''s entity')$$,
  '23503', null,
  'DM notes must point to an entity of the same campaign');

select is(
  tests.affected($$delete from public.lugares where id = 91001$$),
  1::bigint,
  'DM can delete entities');

select tests.as_postgres();

select is(
  (select count(*) from public.entity_dm_notes where entity_type = 'lugares' and entity_id = 91001),
  0::bigint,
  'deleting an entity removes its DM notes');

select throws_ok(
  $$insert into public.map_points (campaign_id, map_id, nombre)
    values ('dddddddd-0000-4000-8000-00000000000b', 92001, 'points at A''s map')$$,
  '23503', null,
  'a map point cannot reference a map of another campaign');

select * from finish();
rollback;
