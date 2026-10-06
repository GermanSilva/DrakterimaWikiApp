-- pgTAP: identity, campaign creation, membership, invites.
-- Self-contained: builds its own users/campaigns inside the transaction (rolled back at the end),
-- so it does not depend on supabase/seed.sql.
begin;

select plan(47);

------------------------------------------------------------------------------
-- Inline helpers (no external dependencies)
------------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

-- Impersonate an authenticated user (what PostgREST does with a verified JWT).
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
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end;
$$;

create function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
end;
$$;

-- Runs a statement as the current role and returns the number of rows it touched.
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
--   dm      DM of A, player in B          p1  player in A (owns 90001), DM of B
--   p2      player in A (owns 90002)      outsider  member of nothing      extra  member of nothing
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'test-dm@example.test', '{"full_name":"Test DM"}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'test-player1@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'test-player2@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'test-outsider@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'test-extra@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'test-late@example.test', '{}');

insert into public.campaigns (id, slug, name) values
  ('dddddddd-0000-4000-8000-00000000000a', 'test-camp-a', 'Test Campaign A'),
  ('dddddddd-0000-4000-8000-00000000000b', 'test-camp-b', 'Test Campaign B');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000001', 'dm'),
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000002', 'player'),
  ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000003', 'player'),
  ('dddddddd-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000002', 'dm'),
  ('dddddddd-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000001', 'player');

insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (90002, 'dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000003', 'P2 character'),
  (90004, 'dddddddd-0000-4000-8000-00000000000a', null, 'Unclaimed character');

insert into public.campaign_invites (campaign_id, code, role, character_id, max_uses, expires_at) values
  ('dddddddd-0000-4000-8000-00000000000a', 'testinvitecode0000000000000000claim', 'player', 90004, 1, null),
  ('dddddddd-0000-4000-8000-00000000000a', 'testinvitecode00000000000000expired', 'player', null, 5, now() - interval '1 day'),
  ('dddddddd-0000-4000-8000-00000000000b', 'testinvitecode000000000000000000open', 'player', null, 3, null);

-- DM invites (as postgres, bypassing column grants): normalisation is done by a trigger.
-- The open one asks for 5 uses and no expiry; the past one is already expired.
insert into public.campaign_invites (campaign_id, code, role, max_uses, expires_at) values
  ('dddddddd-0000-4000-8000-00000000000b', 'testinvitecode0000000000000000dmopen', 'dm', 5, null),
  ('dddddddd-0000-4000-8000-00000000000b', 'testinvitecode00000000000000000dmpast', 'dm', 1, now() - interval '1 hour');

------------------------------------------------------------------------------
-- Invite creation rules and account deletion (as postgres)
------------------------------------------------------------------------------
select ok(
  (select max_uses = 1 and expires_at is not null and expires_at <= now() + interval '7 days 1 minute'
     from public.campaign_invites where code = 'testinvitecode0000000000000000dmopen'),
  'a DM invite is forced to a single use with a default expiry of at most 7 days');

insert into public.campaign_invites (campaign_id, code, role, max_uses, expires_at) values
  ('dddddddd-0000-4000-8000-00000000000b', 'testinvitecode00000000000000dmfuture', 'dm', 1, now() + interval '2 years');
select ok(
  (select expires_at <= now() + interval '7 days 1 minute'
     from public.campaign_invites where code = 'testinvitecode00000000000000dmfuture'),
  'an explicit far-future expiry on a DM invite is clamped to 7 days');

update public.campaign_invites set expires_at = now() + interval '1 year'
  where code = 'testinvitecode00000000000000dmfuture';
select ok(
  (select expires_at <= now() + interval '7 days 1 minute'
     from public.campaign_invites where code = 'testinvitecode00000000000000dmfuture'),
  'a DM invite expiry cannot be extended past 7 days after creation');

select throws_ok(
  $$insert into public.campaign_invites (campaign_id, role, character_id, max_uses)
    values ('dddddddd-0000-4000-8000-00000000000a', 'player', 90004, 1)$$,
  '23514', 'character_already_has_pending_invite',
  'a character cannot have two live invites');

select throws_ok(
  $$insert into public.campaign_invites (campaign_id, role, character_id, max_uses)
    values ('dddddddd-0000-4000-8000-00000000000a', 'player', 90002, 1)$$,
  '23514', 'character_already_owned',
  'an invite cannot target a character that is already owned');

select throws_ok(
  $$delete from auth.users where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$,
  '23514',
  'cannot remove, demote or delete the account of the only DM of a campaign: transfer the DM role to another member or delete the campaign first',
  'deleting the account of the only DM of a campaign is blocked with an explicit message');

------------------------------------------------------------------------------
-- Profiles
------------------------------------------------------------------------------
select is(
  (select display_name from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  'Test DM',
  'profile is created on signup and takes full_name from the auth metadata');

select is(
  (select display_name from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000004'),
  'test-outsider',
  'profile falls back to the email local part when there is no name');

------------------------------------------------------------------------------
-- Anonymous callers
------------------------------------------------------------------------------
select tests.as_anon();
select throws_ok(
  'select * from public.campaigns', '42501', null,
  'anon has no access to campaigns');

select throws_ok(
  $$select public.create_campaign('anon-camp', 'Anon')$$, '42501', null,
  'anon cannot call create_campaign');

------------------------------------------------------------------------------
-- Outsider: sees nothing, cannot join by writing rows
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000004');

select is(
  (select count(*) from public.campaigns), 0::bigint,
  'outsider sees no campaigns');

select is(
  (select count(*) from public.campaign_members), 0::bigint,
  'outsider sees no members');

select is(
  (select count(*) from public.profiles where id <> 'bbbbbbbb-0000-4000-8000-000000000004'), 0::bigint,
  'outsider sees no profiles of other users');

select throws_ok(
  $$insert into public.campaign_members (campaign_id, user_id, role)
    values ('dddddddd-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000004', 'dm')$$,
  '42501', null,
  'outsider cannot insert themselves as DM');

select throws_ok(
  $$insert into public.campaigns (slug, name) values ('sneaky-camp', 'Sneaky')$$,
  '42501', null,
  'campaigns cannot be inserted directly (only through create_campaign)');

------------------------------------------------------------------------------
-- create_campaign
------------------------------------------------------------------------------
select is(
  (select slug from public.create_campaign('  Fresh-Camp ', ' Fresh Campaign ')),
  'fresh-camp',
  'create_campaign normalises slug and returns the campaign');

select is(
  (select m.role
     from public.campaign_members m
     join public.campaigns c on c.id = m.campaign_id
    where c.slug = 'fresh-camp'
      and m.user_id = 'bbbbbbbb-0000-4000-8000-000000000004'),
  'dm',
  'the creator becomes DM of the new campaign');

select is(
  (select count(*) from public.game_pot p join public.campaigns c on c.id = p.campaign_id where c.slug = 'fresh-camp'),
  1::bigint,
  'create_campaign seeds the game pot');

select is(
  (select count(*) from public.campaign_config k join public.campaigns c on c.id = k.campaign_id
    where c.slug = 'fresh-camp' and k.key = 'loteria'),
  1::bigint,
  'create_campaign seeds the lottery config');

select throws_ok(
  $$select public.create_campaign('Bad Slug!', 'x')$$, '23514', null,
  'create_campaign rejects an invalid slug');

select throws_ok(
  $$select public.create_campaign('test-camp-a', 'dup')$$, '23505', null,
  'create_campaign rejects a duplicate slug');

select throws_ok(
  $$select public.create_campaign('Admin', 'x')$$, 'P0001', 'reserved_slug',
  'create_campaign rejects reserved slugs');

-- the outsider already created 1 campaign; give them 19 more (as postgres) to hit the cap of 20
select tests.as_postgres();
insert into public.campaigns (slug, name, created_by)
select 'cap-' || i, 'Cap ' || i, 'bbbbbbbb-0000-4000-8000-000000000004'
from generate_series(1, 19) as i;

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000004');
select throws_ok(
  $$select public.create_campaign('one-too-many', 'x')$$, 'P0001', 'campaign_limit_reached',
  'create_campaign enforces a per-user cap of 20 campaigns');

------------------------------------------------------------------------------
-- Invites
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000005');

select throws_ok(
  $$select public.accept_invite('testinvitecode00000000000000expired')$$, 'P0001', 'invite_expired',
  'an expired invite is rejected');

select throws_ok(
  $$select public.accept_invite('no-such-code')$$, 'P0001', 'invite_not_found',
  'an unknown code is rejected');

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000004');

select is(
  (public.accept_invite('testinvitecode0000000000000000claim') ->> 'role'),
  'player',
  'accept_invite returns the granted role');

select is(
  (select role from public.campaign_members
    where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'
      and user_id = 'bbbbbbbb-0000-4000-8000-000000000004'),
  'player',
  'accept_invite adds the membership');

select is(
  (select owner_id from public.pjs where id = 90004),
  'bbbbbbbb-0000-4000-8000-000000000004'::uuid,
  'accept_invite assigns ownership of the invited character');

select lives_ok(
  $$select public.accept_invite('testinvitecode0000000000000000claim')$$,
  'accept_invite is idempotent for an existing member');

select is(
  (public.accept_invite('  testinvitecode0000000000000000claim  ') ->> 'claimed'),
  'false',
  'a replay (code is trimmed) reports claimed = false and joined = false');

select tests.as_postgres();
select is(
  (select uses from public.campaign_invites where code = 'testinvitecode0000000000000000claim'),
  1,
  'replaying an invite does not consume another use');

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.accept_invite('testinvitecode0000000000000000claim')$$, 'P0001', 'invite_exhausted',
  'an exhausted invite is rejected for a new user');

select is(
  (public.accept_invite('testinvitecode000000000000000000open') ->> 'character_id'),
  null,
  'a plain invite joins the campaign without a character');

select is(
  (select role from public.campaign_members
    where campaign_id = 'dddddddd-0000-4000-8000-00000000000b'
      and user_id = 'bbbbbbbb-0000-4000-8000-000000000005'),
  'player',
  'the same user can join a second campaign');

------------------------------------------------------------------------------
-- Visibility of campaigns / members / invites
------------------------------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000002');

select is(
  (select count(*) from public.campaigns where id in
    ('dddddddd-0000-4000-8000-00000000000a', 'dddddddd-0000-4000-8000-00000000000b')),
  2::bigint,
  'a user in two campaigns sees both');

select is(
  (select count(*) from public.campaign_invites where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'),
  0::bigint,
  'a player cannot read the invites of a campaign (codes are credentials)');

select is(
  tests.affected($$update public.campaigns set name = 'Hijacked' where id = 'dddddddd-0000-4000-8000-00000000000a'$$),
  0::bigint,
  'a player cannot update the campaign they only play in');

select is(
  tests.affected($$update public.campaigns set name = 'Renamed by DM of B' where id = 'dddddddd-0000-4000-8000-00000000000b'$$),
  1::bigint,
  'the same user can update the campaign they DM');

select is(
  (select count(*) from public.campaign_invites where campaign_id = 'dddddddd-0000-4000-8000-00000000000b'),
  4::bigint,
  'the DM of B reads the invites of B (one player invite, three DM invites)');

------------------------------------------------------------------------------
-- Leaving, removing, last DM
------------------------------------------------------------------------------
select throws_ok(
  $$delete from public.campaign_members
     where campaign_id = 'dddddddd-0000-4000-8000-00000000000b'
       and user_id = 'bbbbbbbb-0000-4000-8000-000000000002'$$,
  '23514', null,
  'the last DM cannot leave their campaign');

select throws_ok(
  $$update public.campaign_members set role = 'player'
     where campaign_id = 'dddddddd-0000-4000-8000-00000000000b'
       and user_id = 'bbbbbbbb-0000-4000-8000-000000000002'$$,
  '23514', null,
  'the last DM cannot be demoted');

select is(
  tests.affected($$delete from public.campaign_members
    where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'
      and user_id = 'bbbbbbbb-0000-4000-8000-000000000003'$$),
  0::bigint,
  'a player cannot remove another member');

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000003');
select is(
  tests.affected($$delete from public.campaign_members
    where campaign_id = 'dddddddd-0000-4000-8000-00000000000a'
      and user_id = 'bbbbbbbb-0000-4000-8000-000000000003'$$),
  1::bigint,
  'a player can leave a campaign');

select tests.as_postgres();
select is(
  (select owner_id from public.pjs where id = 90002), null::uuid,
  'leaving a campaign releases the leaver''s characters');

-- DM invites last: accepting one adds a second DM to B, which would change the last-DM tests above.
select tests.as_user('bbbbbbbb-0000-4000-8000-000000000004');
select is(
  (public.accept_invite('testinvitecode0000000000000000dmopen') ->> 'role'),
  'dm',
  'a DM invite grants the dm role');

select tests.as_user('bbbbbbbb-0000-4000-8000-000000000006');
select throws_ok(
  $$select public.accept_invite('testinvitecode0000000000000000dmopen')$$, 'P0001', 'invite_exhausted',
  'a DM invite is single-use even though 5 uses were requested');

select throws_ok(
  $$select public.accept_invite('testinvitecode00000000000000000dmpast')$$, 'P0001', 'invite_expired',
  'an expired DM invite is rejected');

select * from finish();
rollback;
