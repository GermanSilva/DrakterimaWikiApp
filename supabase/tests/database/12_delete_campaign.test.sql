-- pgTAP: delete_campaign(p_campaign_id, p_confirm_slug). Self-contained fixture, rolled back at the end.
begin;

select plan(28);

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
--   campaign A (slug del-a): u1 DM, u2 player (owns Mara), u3 player
--   campaign B (slug del-b): u1 player, u4 DM, u3 DM   (u3 is a co-DM here)
--   u5 : member of nothing
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-1111-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'del-u' || n || '@example.test'
from generate_series(1, 5) as n;

insert into public.campaigns (id, slug, name) values
  ('bbbbbbbb-1111-4000-8000-00000000000a', 'del-a', 'Delete A'),
  ('bbbbbbbb-1111-4000-8000-00000000000b', 'del-b', 'Delete B');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('bbbbbbbb-1111-4000-8000-00000000000a', 'aaaaaaaa-1111-4000-8000-000000000001', 'dm'),
  ('bbbbbbbb-1111-4000-8000-00000000000a', 'aaaaaaaa-1111-4000-8000-000000000002', 'player'),
  ('bbbbbbbb-1111-4000-8000-00000000000a', 'aaaaaaaa-1111-4000-8000-000000000003', 'player'),
  ('bbbbbbbb-1111-4000-8000-00000000000b', 'aaaaaaaa-1111-4000-8000-000000000004', 'dm'),
  ('bbbbbbbb-1111-4000-8000-00000000000b', 'aaaaaaaa-1111-4000-8000-000000000003', 'dm'),
  ('bbbbbbbb-1111-4000-8000-00000000000b', 'aaaaaaaa-1111-4000-8000-000000000001', 'player');

insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (9001, 'bbbbbbbb-1111-4000-8000-00000000000a', 'aaaaaaaa-1111-4000-8000-000000000002', 'Mara'),
  (9002, 'bbbbbbbb-1111-4000-8000-00000000000b', null, 'Other');
insert into public.pnjs (campaign_id, nombre) values
  ('bbbbbbbb-1111-4000-8000-00000000000a', 'Npc A'), ('bbbbbbbb-1111-4000-8000-00000000000b', 'Npc B');
insert into public.sesiones (campaign_id, titulo) values
  ('bbbbbbbb-1111-4000-8000-00000000000a', 'Session A'), ('bbbbbbbb-1111-4000-8000-00000000000b', 'Session B');
insert into public.campaign_invites (campaign_id, code, role) values
  ('bbbbbbbb-1111-4000-8000-00000000000a', 'del-code-a', 'player'), ('bbbbbbbb-1111-4000-8000-00000000000b', 'del-code-b', 'player');
insert into public.campaign_config (campaign_id, key, value) values
  ('bbbbbbbb-1111-4000-8000-00000000000a', 'loteria', '{}'), ('bbbbbbbb-1111-4000-8000-00000000000b', 'loteria', '{}');
insert into public.campaign_presence (campaign_id, user_id) values
  ('bbbbbbbb-1111-4000-8000-00000000000a', 'aaaaaaaa-1111-4000-8000-000000000002');
insert into public.game_pot (campaign_id, gp) values
  ('bbbbbbbb-1111-4000-8000-00000000000a', 5) on conflict (campaign_id) do nothing;
insert into public.player_availability (user_id, campaign_id, tipo, fecha) values
  ('aaaaaaaa-1111-4000-8000-000000000002', 'bbbbbbbb-1111-4000-8000-00000000000a', 'no_disponible', '2026-12-01'),
  ('aaaaaaaa-1111-4000-8000-000000000002', null, 'no_disponible', '2026-12-02');

-- campaign row, members, invites, pjs, pnjs, sesiones, config, presence, availability: how many exist
create function tests.rows_of(cid uuid) returns text language sql as $$
  select concat_ws(',',
    (select count(*) from public.campaigns where id = cid),
    (select count(*) from public.campaign_members where campaign_id = cid),
    (select count(*) from public.campaign_invites where campaign_id = cid),
    (select count(*) from public.pjs where campaign_id = cid),
    (select count(*) from public.pnjs where campaign_id = cid),
    (select count(*) from public.sesiones where campaign_id = cid),
    (select count(*) from public.campaign_config where campaign_id = cid),
    (select count(*) from public.campaign_presence where campaign_id = cid),
    (select count(*) from public.player_availability where campaign_id = cid));
$$;

------------------------------------------------------------------------------
-- Structure and privileges
------------------------------------------------------------------------------
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.delete_campaign(uuid, text)'::regprocedure),
  'delete_campaign is SECURITY DEFINER with an empty search_path');
-- Lock order. A concurrent lock cannot be held from this single pgTAP session, so the order of the checks is
-- asserted on the definition: the DM check comes first (a non-DM never waits on the campaign row), then FOR UPDATE,
-- and the DM check is repeated under the lock before the slug is compared.
select ok(
  (select position('is_campaign_dm' in p.prosrc) < position('for update' in p.prosrc) from pg_proc p where p.oid = 'public.delete_campaign(uuid, text)'::regprocedure),
  'delete_campaign checks is_campaign_dm before taking the row lock');
select is(
  (select (length(p.prosrc) - length(replace(p.prosrc, 'is_campaign_dm', ''))) / length('is_campaign_dm') from pg_proc p where p.oid = 'public.delete_campaign(uuid, text)'::regprocedure),
  2, 'and re-checks it under the lock');
select ok(
  has_function_privilege('authenticated', 'public.delete_campaign(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.delete_campaign(uuid, text)', 'execute')
  and not has_function_privilege('public', 'public.delete_campaign(uuid, text)', 'execute'),
  'callable by authenticated only');
select is(tests.rows_of('bbbbbbbb-1111-4000-8000-00000000000a'), '1,3,1,1,1,1,1,1,1', 'fixture: campaign A is fully populated');

------------------------------------------------------------------------------
-- Refusals leave everything in place
------------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', 'del-a')$$, '42501', null, 'anon cannot call it');

select tests.as_user('aaaaaaaa-1111-4000-8000-000000000005');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', 'del-a')$$, '42501', 'dm_only', 'a stranger gets dm_only');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-0000000000ff', 'whatever')$$, '42501', 'dm_only', 'an unknown id gets the same dm_only (no existence oracle)');

select tests.as_user('aaaaaaaa-1111-4000-8000-000000000002');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', 'del-a')$$, '42501', 'dm_only', 'a player of the campaign cannot delete it, even with the right slug');

select tests.as_user('aaaaaaaa-1111-4000-8000-000000000004');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', 'del-a')$$, '42501', 'dm_only', 'the DM of another campaign cannot delete this one');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', 'del-b')$$, '42501', 'dm_only', 'and a non-DM never reaches the slug comparison');

select tests.as_user('aaaaaaaa-1111-4000-8000-000000000001');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', 'wrong')$$, 'P0001', 'slug_mismatch', 'the DM with a wrong slug: slug_mismatch');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', 'Del-A')$$, 'P0001', 'slug_mismatch', 'the slug is case sensitive');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', '')$$, 'P0001', 'slug_mismatch', 'an empty slug');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', null)$$, 'P0001', 'slug_mismatch', 'a null slug');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', 'del-b')$$, 'P0001', 'slug_mismatch', 'the slug of another campaign');
select throws_ok($$delete from public.campaigns where id = 'bbbbbbbb-1111-4000-8000-00000000000a'$$, '42501', null, 'there is no direct DELETE privilege on campaigns');

select tests.as_postgres();
select is(tests.rows_of('bbbbbbbb-1111-4000-8000-00000000000a'), '1,3,1,1,1,1,1,1,1', 'after every refusal campaign A is intact');

------------------------------------------------------------------------------
-- Success (the slug is trimmed)
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-1111-4000-8000-000000000001');
select lives_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', '  del-a  ')$$, 'the DM deletes the campaign with the right slug');

select tests.as_postgres();
select is(tests.rows_of('bbbbbbbb-1111-4000-8000-00000000000a'), '0,0,0,0,0,0,0,0,0', 'campaign A and everything scoped to it cascaded');
select is((select count(*)::int from public.game_pot where campaign_id = 'bbbbbbbb-1111-4000-8000-00000000000a'), 0, 'the pot cascaded');
select is(tests.rows_of('bbbbbbbb-1111-4000-8000-00000000000b'), '1,3,1,1,1,1,1,0,0', 'campaign B is untouched');
select is((select count(*)::int from public.player_availability where campaign_id is null and user_id = 'aaaaaaaa-1111-4000-8000-000000000002'), 1, 'general (campaign-less) availability survives');
select is((select count(*)::int from public.profiles where id::text like 'aaaaaaaa-1111-%'), 5, 'no profile or account was deleted');
select is((select count(*)::int from public.campaign_members where user_id = 'aaaaaaaa-1111-4000-8000-000000000001'), 1, 'the DM keeps their membership of other campaigns');

select tests.as_user('aaaaaaaa-1111-4000-8000-000000000001');
select throws_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000a', 'del-a')$$, '42501', 'dm_only', 'deleting it again: it no longer exists (dm_only)');

------------------------------------------------------------------------------
-- A co-DM (not the creator) can delete the campaign too
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-1111-4000-8000-000000000003');
select lives_ok($$select public.delete_campaign('bbbbbbbb-1111-4000-8000-00000000000b', 'del-b')$$, 'a co-DM deletes campaign B');
select tests.as_postgres();
select is(tests.rows_of('bbbbbbbb-1111-4000-8000-00000000000b'), '0,0,0,0,0,0,0,0,0', 'campaign B cascaded, with its last DMs (protect_last_dm lets the cascade through)');

select * from finish();
rollback;
