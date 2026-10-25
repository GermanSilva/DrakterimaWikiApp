-- pgTAP: the Hub Owner reaches every campaign (DM-level) without being a member. Self-contained fixture, rolled back at the end.
begin;

select plan(35);

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

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture (as postgres)
--   ho  (..01) : hub owner, member of NOTHING
--   out (..02) : ordinary user, member of NOTHING
--   dm  (..03) : DM of campaign A        pl (..04) : player of campaign A
--   Campaign A has members dm + pl; campaign B has no members at all.
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-3333-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'all-u' || n || '@example.test', json_build_object('full_name', 'All User ' || n)::jsonb
from generate_series(1, 4) as n;

insert into public.hub_owners (user_id) values ('aaaaaaaa-3333-4000-8000-000000000001');

insert into public.campaigns (id, slug, name, created_by) values
  ('bbbbbbbb-3333-4000-8000-00000000000a', 'all-a', 'All A', 'aaaaaaaa-3333-4000-8000-000000000003'),
  ('bbbbbbbb-3333-4000-8000-00000000000b', 'all-b', 'All B', 'aaaaaaaa-3333-4000-8000-000000000003');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('bbbbbbbb-3333-4000-8000-00000000000a', 'aaaaaaaa-3333-4000-8000-000000000003', 'dm'),
  ('bbbbbbbb-3333-4000-8000-00000000000a', 'aaaaaaaa-3333-4000-8000-000000000004', 'player');

insert into public.pnjs (id, campaign_id, nombre, estado, visible_to) values
  (94001, 'bbbbbbbb-3333-4000-8000-00000000000a', 'Publicado', 'publicado', '{}'),
  (94002, 'bbbbbbbb-3333-4000-8000-00000000000a', 'Borrador', 'borrador', '{}'),
  (94003, 'bbbbbbbb-3333-4000-8000-00000000000a', 'Secreto', 'secreto', '{999}'),
  (94004, 'bbbbbbbb-3333-4000-8000-00000000000b', 'En B', 'publicado', '{}');
insert into public.entity_dm_notes (campaign_id, entity_type, entity_id, secreto) values
  ('bbbbbbbb-3333-4000-8000-00000000000a', 'pnjs', 94001, 'solo el DM');

------------------------------------------------------------------------------
-- The helpers
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select is((select public.is_campaign_member('bbbbbbbb-3333-4000-8000-00000000000a')), true, 'hub owner: is_campaign_member is true without a membership row');
select is((select public.is_campaign_dm('bbbbbbbb-3333-4000-8000-00000000000a')), true, 'hub owner: is_campaign_dm is true without a membership row');
select is((select public.is_campaign_dm('bbbbbbbb-3333-4000-8000-00000000000b')), true, 'hub owner: also in a campaign with no members at all');

select tests.as_user('aaaaaaaa-3333-4000-8000-000000000002');
select is((select public.is_campaign_member('bbbbbbbb-3333-4000-8000-00000000000a')), false, 'ordinary user: not a member of A');
select is((select public.is_campaign_dm('bbbbbbbb-3333-4000-8000-00000000000a')), false, 'ordinary user: not a DM of A');

select tests.as_user('aaaaaaaa-3333-4000-8000-000000000004');
select is((select public.is_campaign_dm('bbbbbbbb-3333-4000-8000-00000000000a')), false, 'a player is still not a DM');
select is((select public.is_campaign_member('bbbbbbbb-3333-4000-8000-00000000000b')), false, 'a player is still not a member of another campaign');

------------------------------------------------------------------------------
-- Reading: the owner sees every campaign and everything in it
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select is((select count(*) from public.campaigns where slug in ('all-a', 'all-b')), 2::bigint, 'hub owner reads both campaigns');
select is((select count(*) from public.pnjs where campaign_id = 'bbbbbbbb-3333-4000-8000-00000000000a'), 3::bigint, 'hub owner reads published, draft and secret entities');
select is((select count(*) from public.pnjs where campaign_id = 'bbbbbbbb-3333-4000-8000-00000000000b'), 1::bigint, 'hub owner reads the entities of the empty campaign');
select is((select count(*) from public.entity_dm_notes where campaign_id = 'bbbbbbbb-3333-4000-8000-00000000000a'), 1::bigint, 'hub owner reads the DM notes');
select is((select count(*) from public.campaign_members where campaign_id = 'bbbbbbbb-3333-4000-8000-00000000000a'), 2::bigint, 'hub owner reads the roster');
select is((select count(*) from public.campaign_members where user_id = 'aaaaaaaa-3333-4000-8000-000000000001'), 0::bigint, 'the hub owner is not in any roster');
select is((select count(*) from public.profiles where id in ('aaaaaaaa-3333-4000-8000-000000000003', 'aaaaaaaa-3333-4000-8000-000000000004')), 2::bigint, 'hub owner reads the profiles of the members of any campaign');
select is((select count(*) from public.profiles where id = 'aaaaaaaa-3333-4000-8000-000000000002'), 0::bigint, 'but not the profile of somebody who belongs to no campaign');

-- nobody else gains anything
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000002');
select is((select count(*) from public.campaigns where slug in ('all-a', 'all-b')), 0::bigint, 'ordinary non-member reads no campaign');
select is((select count(*) from public.pnjs where campaign_id in ('bbbbbbbb-3333-4000-8000-00000000000a', 'bbbbbbbb-3333-4000-8000-00000000000b')), 0::bigint, 'ordinary non-member reads no entity');
select is((select count(*) from public.entity_dm_notes where campaign_id = 'bbbbbbbb-3333-4000-8000-00000000000a'), 0::bigint, 'ordinary non-member reads no DM note');
select is((select count(*) from public.profiles where id in ('aaaaaaaa-3333-4000-8000-000000000003', 'aaaaaaaa-3333-4000-8000-000000000004')), 0::bigint, 'ordinary non-member reads no member profile');

select tests.as_user('aaaaaaaa-3333-4000-8000-000000000004');
select is((select count(*) from public.pnjs where campaign_id = 'bbbbbbbb-3333-4000-8000-00000000000a'), 1::bigint, 'a player still reads only the published entity');
select is((select count(*) from public.entity_dm_notes where campaign_id = 'bbbbbbbb-3333-4000-8000-00000000000a'), 0::bigint, 'a player still reads no DM note');
select is((select count(*) from public.campaigns where slug in ('all-a', 'all-b')), 1::bigint, 'a player still reads only their own campaign');

------------------------------------------------------------------------------
-- Writing: DM-level, for the owner only
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select lives_ok(
  $$insert into public.pnjs (campaign_id, nombre) values ('bbbbbbbb-3333-4000-8000-00000000000b', 'Hecho por el owner')$$,
  'hub owner creates an entity in a campaign they are not in');
select lives_ok(
  $$update public.pnjs set nombre = 'Editado por el owner' where id = 94002$$,
  'hub owner edits an entity');
select is((select nombre from public.pnjs where id = 94002), 'Editado por el owner', 'the edit was applied');
select lives_ok(
  $$update public.campaigns set name = 'All A (owner)' where id = 'bbbbbbbb-3333-4000-8000-00000000000a'$$,
  'hub owner edits the campaign');
select is((select name from public.campaigns where id = 'bbbbbbbb-3333-4000-8000-00000000000a'), 'All A (owner)', 'the campaign edit was applied');
select lives_ok(
  $$insert into public.entity_dm_notes (campaign_id, entity_type, entity_id, notas) values ('bbbbbbbb-3333-4000-8000-00000000000b', 'pnjs', 94004, 'nota del owner')$$,
  'hub owner writes a DM note');

select tests.as_user('aaaaaaaa-3333-4000-8000-000000000002');
select throws_ok(
  $$insert into public.pnjs (campaign_id, nombre) values ('bbbbbbbb-3333-4000-8000-00000000000b', 'Intruso')$$, '42501', null,
  'an ordinary non-member cannot create an entity');
update public.campaigns set name = 'hacked' where id = 'bbbbbbbb-3333-4000-8000-00000000000a';
select tests.as_postgres();
select is((select name from public.campaigns where id = 'bbbbbbbb-3333-4000-8000-00000000000a'), 'All A (owner)', 'an ordinary non-member updated no campaign row');

------------------------------------------------------------------------------
-- No traces as a member
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select throws_ok(
  $$select public.touch_campaign_presence('bbbbbbbb-3333-4000-8000-00000000000a')$$, '42501', 'not_a_member',
  'the hub owner leaves no presence row (only real members do)');
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000004');
select lives_ok(
  $$select public.touch_campaign_presence('bbbbbbbb-3333-4000-8000-00000000000a')$$,
  'a real member still records presence');

------------------------------------------------------------------------------
-- Deleting, then losing the privilege
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000002');
select throws_ok(
  $$select public.delete_campaign('bbbbbbbb-3333-4000-8000-00000000000b', 'all-b')$$, '42501', 'dm_only',
  'an ordinary non-member cannot delete a campaign');

select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select lives_ok(
  $$select public.delete_campaign('bbbbbbbb-3333-4000-8000-00000000000b', 'all-b')$$,
  'the hub owner can delete a campaign they are not in (slug confirmation still required)');

select tests.as_postgres();
delete from public.hub_owners where user_id = 'aaaaaaaa-3333-4000-8000-000000000001';
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select is((select count(*) from public.campaigns where slug in ('all-a', 'all-b')), 0::bigint, 'once removed from hub_owners the access is gone');

select * from finish();
rollback;
