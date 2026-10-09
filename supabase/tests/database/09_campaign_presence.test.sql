-- pgTAP: campaign_presence (DM-only "last connection") and touch_campaign_presence().
-- Self-contained fixture, rolled back at the end.
begin;

select plan(30);

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

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture (as postgres)
--   campaigns A, B
--   u1 : DM of A      u2, u3 : players in A      u4 : DM of B      u5 : player in B
--   u6 : member of nothing
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('88888888-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'presence-u' || n || '@example.test'
from generate_series(1, 6) as n;

insert into public.campaigns (id, slug, name) values
  ('99999999-0000-4000-8000-00000000000a', 'presence-a', 'Presence A'),
  ('99999999-0000-4000-8000-00000000000b', 'presence-b', 'Presence B');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('99999999-0000-4000-8000-00000000000a', '88888888-0000-4000-8000-000000000001', 'dm'),
  ('99999999-0000-4000-8000-00000000000a', '88888888-0000-4000-8000-000000000002', 'player'),
  ('99999999-0000-4000-8000-00000000000a', '88888888-0000-4000-8000-000000000003', 'player'),
  ('99999999-0000-4000-8000-00000000000b', '88888888-0000-4000-8000-000000000004', 'dm'),
  ('99999999-0000-4000-8000-00000000000b', '88888888-0000-4000-8000-000000000005', 'player');

------------------------------------------------------------------------------
-- Structure and privileges
------------------------------------------------------------------------------
select has_table('public', 'campaign_presence', 'campaign_presence exists');
select col_is_pk('public', 'campaign_presence', array['campaign_id', 'user_id'], 'primary key is (campaign_id, user_id)');
select ok((select relrowsecurity from pg_class where oid = 'public.campaign_presence'::regclass), 'RLS is enabled');
select ok(
  not exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'campaign_presence'),
  'campaign_presence is NOT published to realtime');
select ok(
  has_table_privilege('authenticated', 'public.campaign_presence', 'select')
  and not has_table_privilege('authenticated', 'public.campaign_presence', 'insert')
  and not has_table_privilege('authenticated', 'public.campaign_presence', 'update')
  and not has_table_privilege('authenticated', 'public.campaign_presence', 'delete'),
  'authenticated can only SELECT (no insert / update / delete privilege)');
select ok(not has_table_privilege('anon', 'public.campaign_presence', 'select'), 'anon has no access');
select ok(
  has_function_privilege('authenticated', 'public.touch_campaign_presence(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.touch_campaign_presence(uuid)', 'execute'),
  'the RPC is callable by authenticated only');
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""']
     from pg_proc p where p.oid = 'public.touch_campaign_presence(uuid)'::regprocedure),
  'the RPC is SECURITY DEFINER with an empty search_path');

------------------------------------------------------------------------------
-- Writing: members only, own row only
------------------------------------------------------------------------------
select tests.as_user('88888888-0000-4000-8000-000000000002');
select lives_ok($$select public.touch_campaign_presence('99999999-0000-4000-8000-00000000000a')$$,
  'a player can touch their own presence in their campaign');
select tests.as_user('88888888-0000-4000-8000-000000000003');
select lives_ok($$select public.touch_campaign_presence('99999999-0000-4000-8000-00000000000a')$$, 'another player touches');
select tests.as_user('88888888-0000-4000-8000-000000000001');
select lives_ok($$select public.touch_campaign_presence('99999999-0000-4000-8000-00000000000a')$$, 'the DM touches too');
select tests.as_user('88888888-0000-4000-8000-000000000005');
select lives_ok($$select public.touch_campaign_presence('99999999-0000-4000-8000-00000000000b')$$, 'a player of campaign B touches B');

select tests.as_user('88888888-0000-4000-8000-000000000006');
select throws_ok(
  $$select public.touch_campaign_presence('99999999-0000-4000-8000-00000000000a')$$,
  '42501', 'not_a_member', 'a non-member cannot touch presence of a campaign');
select tests.as_user('88888888-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.touch_campaign_presence('99999999-0000-4000-8000-00000000000b')$$,
  '42501', 'not_a_member', 'a member of A cannot touch presence of campaign B');
select tests.as_anon();
select throws_ok(
  $$select public.touch_campaign_presence('99999999-0000-4000-8000-00000000000a')$$,
  '42501', null, 'anon cannot call the RPC');

select tests.as_postgres();
select is(
  (select count(*)::int from public.campaign_presence where campaign_id in ('99999999-0000-4000-8000-00000000000a', '99999999-0000-4000-8000-00000000000b')),
  4, 'exactly the four successful touches left a row (denied calls wrote nothing)');
select is(
  (select array_agg(user_id::text order by user_id) from public.campaign_presence where campaign_id = '99999999-0000-4000-8000-00000000000a'),
  array['88888888-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000002', '88888888-0000-4000-8000-000000000003'],
  'each row belongs to the caller that touched it');

-- direct writes are refused for authenticated
select tests.as_user('88888888-0000-4000-8000-000000000002');
select throws_ok(
  $$insert into public.campaign_presence (campaign_id, user_id) values ('99999999-0000-4000-8000-00000000000a', '88888888-0000-4000-8000-000000000002')$$,
  '42501', null, 'a player cannot insert a presence row directly');
select throws_ok(
  $$update public.campaign_presence set last_seen_at = now()$$,
  '42501', null, 'a player cannot update presence rows');
select throws_ok(
  $$delete from public.campaign_presence$$,
  '42501', null, 'a player cannot delete presence rows');
select tests.as_user('88888888-0000-4000-8000-000000000001');
select throws_ok(
  $$update public.campaign_presence set last_seen_at = now()$$,
  '42501', null, 'not even the DM can update presence rows');

------------------------------------------------------------------------------
-- Reading: the campaign DM only
------------------------------------------------------------------------------
select tests.as_user('88888888-0000-4000-8000-000000000001');
select is(
  (select array_agg(user_id::text order by user_id) from public.campaign_presence),
  array['88888888-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000002', '88888888-0000-4000-8000-000000000003'],
  'the DM reads every row of their campaign (and none of campaign B)');

select tests.as_user('88888888-0000-4000-8000-000000000002');
select is((select count(*)::int from public.campaign_presence), 0, 'a player reads no row, not even their own');

select tests.as_user('88888888-0000-4000-8000-000000000004');
select is(
  (select array_agg(user_id::text order by user_id) from public.campaign_presence),
  array['88888888-0000-4000-8000-000000000005'],
  'the DM of another campaign reads only their own campaign rows');

select tests.as_user('88888888-0000-4000-8000-000000000006');
select is((select count(*)::int from public.campaign_presence), 0, 'a non-member reads nothing');

select tests.as_anon();
select throws_ok($$select * from public.campaign_presence$$, '42501', null, 'anon cannot read the table');

------------------------------------------------------------------------------
-- Throttle: a touch inside the 5 minute window is a no-op
------------------------------------------------------------------------------
select tests.as_postgres();
update public.campaign_presence
   set last_seen_at = now() - interval '1 minute'
 where user_id = '88888888-0000-4000-8000-000000000002';
update public.campaign_presence
   set last_seen_at = now() - interval '1 hour'
 where user_id = '88888888-0000-4000-8000-000000000003';

select tests.as_user('88888888-0000-4000-8000-000000000002');
select public.touch_campaign_presence('99999999-0000-4000-8000-00000000000a');
select tests.as_postgres();
select is(
  (select last_seen_at from public.campaign_presence where user_id = '88888888-0000-4000-8000-000000000002'),
  now() - interval '1 minute',
  'a touch within 5 minutes leaves last_seen_at untouched');

update public.campaign_presence
   set last_seen_at = now() - interval '6 minutes'
 where user_id = '88888888-0000-4000-8000-000000000002';
select tests.as_user('88888888-0000-4000-8000-000000000002');
select public.touch_campaign_presence('99999999-0000-4000-8000-00000000000a');
select tests.as_postgres();
select is(
  (select last_seen_at from public.campaign_presence where user_id = '88888888-0000-4000-8000-000000000002'),
  now(),
  'a touch after the window moves last_seen_at to now()');

select is(
  (select last_seen_at from public.campaign_presence where user_id = '88888888-0000-4000-8000-000000000003'),
  now() - interval '1 hour',
  'touching never alters another user''s row');

------------------------------------------------------------------------------
-- Cascades
------------------------------------------------------------------------------
delete from public.campaigns where id = '99999999-0000-4000-8000-00000000000b';
select is(
  (select count(*)::int from public.campaign_presence where campaign_id = '99999999-0000-4000-8000-00000000000b'),
  0, 'deleting a campaign removes its presence rows');

select * from finish();
rollback;
