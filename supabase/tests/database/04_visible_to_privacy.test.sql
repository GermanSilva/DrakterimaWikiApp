-- pgTAP: `visible_to` is write-only for clients. Players (and the DM through the table) cannot
-- read it; the DM reads it through get_entity_visibility(). The secreto rule must keep working.
-- Self-contained fixture, rolled back at the end.
begin;

select plan(55);

------------------------------------------------------------------------------
-- Inline helpers
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
--   dm (..01): DM of A, player in B      p1 (..02): player in A (owns 90001), DM of B
--   p2 (..03): player in A (owns 90002)  outsider (..04): member of nothing
-- Campaign A lugares: 91001 publicado | 91003 secreto{90001} | 91004 secreto{} | 91005 secreto{90002}
-- Campaign B lugares: 91011 secreto{80001}
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

insert into public.pjs (id, campaign_id, owner_id, nombre, visible_to) values
  (90001, 'dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000002', 'P1 character', '{90002}'),
  (90002, 'dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000003', 'P2 character', '{}');

insert into public.lugares (id, campaign_id, nombre, estado, visible_to) values
  (91001, 'dddddddd-0000-4000-8000-00000000000a', 'A publicado', 'publicado', '{}'),
  (91003, 'dddddddd-0000-4000-8000-00000000000a', 'A secreto for 90001', 'secreto', '{90001,90002}'),
  (91004, 'dddddddd-0000-4000-8000-00000000000a', 'A secreto nobody',   'secreto', '{}'),
  (91005, 'dddddddd-0000-4000-8000-00000000000a', 'A secreto for 90002', 'secreto', '{90002}'),
  (91011, 'dddddddd-0000-4000-8000-00000000000b', 'B secreto', 'secreto', '{80001}');

insert into public.mapas (id, campaign_id, nombre, estado, visible_to) values
  (92001, 'dddddddd-0000-4000-8000-00000000000a', 'Map A', 'publicado', '{}'),
  (92002, 'dddddddd-0000-4000-8000-00000000000a', 'Map A secret for 90002', 'secreto', '{90002}'),
  (92003, 'dddddddd-0000-4000-8000-00000000000a', 'Map A secret for 90001', 'secreto', '{90001}');

insert into public.map_points (id, campaign_id, map_id, nombre, estado, visible_to) values
  (92101, 'dddddddd-0000-4000-8000-00000000000a', 92002, 'point on map hidden from p1', 'publicado', '{}'),
  (92102, 'dddddddd-0000-4000-8000-00000000000a', 92001, 'point on public map', 'publicado', '{}'),
  (92103, 'dddddddd-0000-4000-8000-00000000000a', 92003, 'point on map shared with p1', 'publicado', '{}');

------------------------------------------------------------------------------
-- Column privileges (what Realtime's apply_rls also consults via has_column_privilege)
------------------------------------------------------------------------------
select tests.as_postgres();

select is(
  (select count(*) from unnest(array[
      'sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'map_points',
      'homebrew_rules']) t
    where has_column_privilege('authenticated', format('public.%I', t), 'visible_to', 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', t), 'SELECT')),
  0::bigint,
  'authenticated has neither column nor table-level SELECT on visible_to in any of the 10 tables');

select is(
  (select count(*) from unnest(array[
      'sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'map_points',
      'homebrew_rules']) t
    where not (has_column_privilege('authenticated', format('public.%I', t), 'id', 'SELECT')
           and has_column_privilege('authenticated', format('public.%I', t), 'campaign_id', 'SELECT')
           and has_column_privilege('authenticated', format('public.%I', t), 'estado', 'SELECT')
           and has_column_privilege('authenticated', format('public.%I', t), 'data', 'SELECT')
           and has_column_privilege('authenticated', format('public.%I', t), 'updated_at', 'SELECT')
           and has_column_privilege('authenticated', format('public.%I', t), 'updated_at', 'INSERT')
           and has_column_privilege('authenticated', format('public.%I', t), 'campaign_id', 'INSERT')
           and has_column_privilege('authenticated', format('public.%I', t), 'campaign_id', 'UPDATE'))),
  0::bigint,
  'every other column stays selectable, insertable and updatable');

select is(
  (select count(*) from unnest(array[
      'sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'map_points',
      'homebrew_rules']) t
    where has_column_privilege('authenticated', format('public.%I', t), 'visible_to', 'UPDATE')
       or has_column_privilege('authenticated', format('public.%I', t), 'visible_to', 'INSERT')
       or has_column_privilege('anon', format('public.%I', t), 'visible_to', 'SELECT')
       or has_table_privilege('anon', format('public.%I', t), 'SELECT')),
  0::bigint,
  'visible_to is neither insertable nor updatable by authenticated, and anon has no access');

select ok(
  not has_function_privilege('anon', 'public.can_see_map(bigint,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_entity_visibility(text,bigint,bigint[])', 'EXECUTE')
  and not has_function_privilege('public', 'public.set_entity_visibility(text,bigint,bigint[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.set_entity_visibility(text,bigint,bigint[])', 'EXECUTE'),
  'anon cannot execute can_see_map / set_entity_visibility; authenticated can execute set_entity_visibility');

select is(
  (select count(*)
     from information_schema.columns c
     join unnest(array[
      'sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'map_points',
      'homebrew_rules']) t on t = c.table_name
    where c.table_schema = 'public' and c.column_name <> 'visible_to'
      and not has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, 'SELECT')),
  0::bigint,
  'no non-visible_to column was lost by the grant rewrite');

select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and column_name = 'visible_to'),
  10::bigint,
  'exactly the 10 known tables carry visible_to (a new one must be added to the migration lists)');

select ok(
  not has_function_privilege('anon', 'public.get_entity_visibility(text, bigint[])', 'EXECUTE')
  and not has_function_privilege('public', 'public.get_entity_visibility(text, bigint[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_entity_visibility(text, bigint[])', 'EXECUTE'),
  'only authenticated can execute get_entity_visibility');

------------------------------------------------------------------------------
-- Player p1 (player in A, owns 90001; DM in B)
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000002');

select throws_ok(
  $$select visible_to from public.lugares$$,
  '42501', 'permission denied for table lugares',
  'player cannot select visible_to (lugares)');

select throws_ok(
  $$select * from public.lugares$$,
  '42501', 'permission denied for table lugares',
  'select * is rejected for players');

select throws_ok(
  $$select visible_to from public.pjs$$,
  '42501', 'permission denied for table pjs',
  'player cannot select visible_to from pjs, even for their own character');

select throws_ok(
  $$select visible_to from public.map_points$$,
  '42501', 'permission denied for table map_points',
  'player cannot select visible_to (map_points)');

select throws_ok(
  $$select id from public.lugares where visible_to @> '{90002}'$$,
  '42501', 'permission denied for table lugares',
  'visible_to cannot be used as a filter oracle');

select throws_ok(
  $$select id from public.lugares order by visible_to$$,
  '42501', 'permission denied for table lugares',
  'visible_to cannot be used as a sort oracle');

select throws_ok(
  $$update public.lugares set nombre = nombre where campaign_id = 'dddddddd-0000-4000-8000-00000000000a' and visible_to @> '{90002}'$$,
  '42501', 'permission denied for table lugares',
  'visible_to cannot be probed through an UPDATE ... WHERE');

select throws_ok(
  $$update public.pjs set visible_to = '{90002}' where id = 90001$$,
  '42501', 'permission denied for table pjs',
  'owner cannot probe their own pjs.visible_to with an equal-value update (oracle closed)');

select throws_ok(
  $$update public.pjs set visible_to = '{}' where id = 90001$$,
  '42501', 'permission denied for table pjs',
  'a non-matching value fails the same way, so the outcome carries no information');

select throws_ok(
  $$insert into public.lugares (campaign_id, nombre, visible_to) values ('dddddddd-0000-4000-8000-00000000000a', 'x', '{1}')$$,
  '42501', 'permission denied for table lugares',
  'no client can insert a row naming visible_to');

select throws_ok(
  $$select * from public.set_entity_visibility('lugares', 91003, '{90001}')$$,
  '42501', 'dm_only',
  'a player cannot set visible_to through the RPC');

select throws_ok(
  $$select * from public.set_entity_visibility('lugares', 99999999, '{90001}')$$,
  '42501', 'dm_only',
  'same error for a missing row, so existence is not revealed');

select is(
  (select array_agg(id order by id)
     from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array[91001, 91003]::bigint[],
  'explicit-column select works and the secreto rule still filters correctly with visible_to hidden');

select is(
  (select nombre from public.lugares where id = 91003),
  'A secreto for 90001',
  'player reads the visible secreto row''s other columns');

select is(
  (select array_agg(id order by id)
     from public.map_points where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array[92102, 92103]::bigint[],
  'map_points policy (via can_see_map) still hides points on maps the player cannot see');

select is(
  (select count(*) from public.get_entity_visibility('lugares', array[91001, 91003, 91005])),
  0::bigint,
  'player calling the RPC for a campaign where they are only a player gets no rows');

select is(
  (select count(*) from public.get_entity_visibility('pjs', array[90001])),
  0::bigint,
  'a character''s owner cannot read their own pjs.visible_to through the RPC');

-- p1 is the DM of campaign B.
select is(
  (select visible_to from public.get_entity_visibility('lugares', array[91011])),
  array[80001]::bigint[],
  'a user reads visible_to through the RPC only for campaigns they DM (B)');

select is(
  (select count(*) from public.get_entity_visibility('lugares', array[91003, 91004, 91011])),
  1::bigint,
  'the same user gets nothing for campaign A rows mixed into the id list');

select throws_ok(
  $$select * from public.set_entity_visibility('lugares', 91003, '{90001}')$$,
  '42501', 'dm_only',
  'being DM of B gives no write access to A rows');

select throws_ok(
  $$select visible_to from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000b'$$,
  '42501', 'permission denied for table lugares',
  'even as DM of B, visible_to is not readable through the table');

------------------------------------------------------------------------------
-- Player p2 (owner of 90002, listed in 91003 and 91005)
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000003');

select is(
  (select array_agg(id order by id)
     from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array[91001, 91003, 91005]::bigint[],
  'second player sees the secretos aimed at their character');

------------------------------------------------------------------------------
-- Outsider
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000004');

select is(
  (select count(*) from public.get_entity_visibility('lugares', array[91001, 91003, 91004, 91005, 91011])),
  0::bigint,
  'outsider gets no rows from the RPC');

select throws_ok(
  $$select * from public.set_entity_visibility('lugares', 91003, '{90001}')$$,
  '42501', 'dm_only',
  'outsider cannot set visible_to');

------------------------------------------------------------------------------
-- DM of A
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$select visible_to from public.lugares$$,
  '42501', 'permission denied for table lugares',
  'the DM does not read visible_to through the table either (single, audited read path)');

select is(
  (select array_agg(id order by id) from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array[91001, 91003, 91004, 91005]::bigint[],
  'DM sees every row of A with explicit columns');

select is(
  (select array_agg(id order by id) from public.get_entity_visibility('lugares', array[91011, 91005, 91003, 91004, 91001])),
  array[91001, 91003, 91004, 91005]::bigint[],
  'DM RPC returns only rows of campaigns they DM (91011 of campaign B is excluded)');

select is(
  (select visible_to from public.get_entity_visibility('lugares', array[91003])),
  array[90001, 90002]::bigint[],
  'DM reads the real visible_to through the RPC');

select is(
  (select visible_to from public.get_entity_visibility('pjs', array[90001])),
  array[90002]::bigint[],
  'DM reads pjs.visible_to through the RPC');

select is(
  (select count(*) from public.get_entity_visibility('lugares', null)),
  0::bigint,
  'null id list yields nothing');

select throws_ok(
  $$update public.lugares set visible_to = '{90002}' where id = 91003$$,
  '42501', 'permission denied for table lugares',
  'even the DM cannot update visible_to through the table');

select throws_ok(
  $$insert into public.lugares (campaign_id, nombre, visible_to) values ('dddddddd-0000-4000-8000-00000000000a', 'x', '{}') returning visible_to$$,
  '42501', 'permission denied for table lugares',
  'DM insert ... returning visible_to fails with a column privilege error');

select is(
  public.set_entity_visibility('lugares', 91003, array[90002, 90002, 90001]),
  array[90001, 90002]::bigint[],
  'set_entity_visibility dedupes and sorts');

select is(
  public.set_entity_visibility('lugares', 91003, array[90002]),
  array[90002]::bigint[],
  'DM can set visible_to through the RPC');

select throws_ok(
  $$select * from public.set_entity_visibility('lugares', 91003, array[90002, 99998])$$,
  '22023', null,
  'an id that is not a character is rejected');

select throws_ok(
  $$select * from public.set_entity_visibility('lugares', 91003, array[90002, null])$$,
  '22023', null,
  'a null id is rejected');

select throws_ok(
  $$select * from public.set_entity_visibility('lugares', 91003, array[80001])$$,
  '22023', null,
  'a character of another campaign is rejected');

select throws_ok(
  $$select * from public.set_entity_visibility('lugares', 91011, '{}')$$,
  '42501', 'dm_only',
  'DM of A cannot set visible_to on campaign B rows');

select throws_ok(
  $$select * from public.set_entity_visibility('entity_dm_notes', 1, '{}')$$,
  '22023', 'unknown entity type',
  'set_entity_visibility rejects tables outside the whitelist');

select throws_ok(
  $$select * from public.get_entity_visibility('lugares', (select array_agg(g) from generate_series(1, 1001) g))$$,
  '54000', null,
  'get_entity_visibility caps the id list at 1000');

select is(
  (select visible_to from public.get_entity_visibility('lugares', array[91003])),
  array[90002]::bigint[],
  'the RPC reflects the DM''s update');

select is(
  tests.affected($$insert into public.lugares (campaign_id, nombre, estado) values ('dddddddd-0000-4000-8000-00000000000a', 'DM created', 'secreto')$$),
  1::bigint,
  'DM can insert a row without visible_to (defaults to empty)');

select is(
  (select visible_to from public.get_entity_visibility('lugares', array[(select id from public.lugares where nombre = 'DM created')])),
  '{}'::bigint[],
  'a new row starts with an empty visible_to');

select is(
  public.set_entity_visibility('lugares', (select id from public.lugares where nombre = 'DM created'), array[90001]),
  array[90001]::bigint[],
  'DM aims the new secreto at character 90001 through the RPC');

select throws_ok(
  $$select * from public.get_entity_visibility('lugares; drop table public.lugares', array[91003])$$,
  '22023', 'unknown entity type',
  'RPC rejects an injection-shaped entity type');

select throws_ok(
  $$select * from public.get_entity_visibility('entity_dm_notes', array[1])$$,
  '22023', 'unknown entity type',
  'RPC rejects tables outside the whitelist');

select throws_ok(
  $$select * from public.get_entity_visibility(null, array[1])$$,
  '22023', 'unknown entity type',
  'RPC rejects a null entity type');

-- Switching the secreto audience via the DM write path is reflected for the player.
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000002');

select is(
  (select array_agg(nombre order by nombre)
     from public.lugares where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  array['A publicado', 'DM created'],
  'the player view follows the DM''s visible_to edits (91003 removed, the new row aimed at 90001 added)');

select * from finish();
rollback;
