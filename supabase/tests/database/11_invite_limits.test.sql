-- pgTAP: server-side invite limits (max_uses <= 100, expiry mandatory and <= 365 days).
begin;

select plan(15);

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', '88888888-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'limits-u1@example.test');

insert into public.campaigns (id, slug, name) values ('99999999-0000-4000-8000-00000000000a', 'limits-a', 'Limits A');
insert into public.pjs (id, campaign_id, owner_id, nombre) values (8001, '99999999-0000-4000-8000-00000000000a', null, 'Free');

insert into public.campaign_invites (campaign_id, code, role, max_uses, expires_at) values
  ('99999999-0000-4000-8000-00000000000a', 'lim-none',   'player', 5,   null),
  ('99999999-0000-4000-8000-00000000000a', 'lim-far',    'player', 5,   now() + interval '5 years'),
  ('99999999-0000-4000-8000-00000000000a', 'lim-near',   'player', 5,   now() + interval '2 days'),
  ('99999999-0000-4000-8000-00000000000a', 'lim-many',   'player', 5000, now() + interval '2 days');
insert into public.campaign_invites (campaign_id, code, role, character_id, max_uses, expires_at) values
  ('99999999-0000-4000-8000-00000000000a', 'lim-claim', 'player', 8001, 1, null);

select ok(
  (select expires_at is not null and expires_at <= now() + interval '365 days 1 minute' and expires_at > now() + interval '364 days'
     from public.campaign_invites where code = 'lim-none'),
  'a player invite without expiry gets one: 365 days');
select ok(
  (select expires_at <= now() + interval '365 days 1 minute' from public.campaign_invites where code = 'lim-far'),
  'a later expiry is clamped to 365 days');
select ok(
  (select expires_at between now() + interval '1 day 23 hours' and now() + interval '2 days 1 minute'
     from public.campaign_invites where code = 'lim-near'),
  'an earlier expiry is kept');
select is((select max_uses from public.campaign_invites where code = 'lim-many'), 100, 'max_uses above 100 is clamped to 100');
select is((select max_uses from public.campaign_invites where code = 'lim-near'), 5, 'a sane max_uses is kept');
select ok((select expires_at is not null from public.campaign_invites where code = 'lim-claim'), 'a claim invite gets an expiry too');

-- updating also clamps
update public.campaign_invites set max_uses = 900, expires_at = null where code = 'lim-near';
select ok(
  (select max_uses = 100 and expires_at is not null and expires_at <= now() + interval '365 days 1 minute'
     from public.campaign_invites where code = 'lim-near'),
  'an UPDATE cannot lift the limits either');

-- a legacy row (no expiry, many uses, written before the trigger change) can still have a use consumed
alter table public.campaign_invites disable trigger campaign_invites_prepare;
insert into public.campaign_invites (campaign_id, code, role, max_uses, uses, expires_at) values
  ('99999999-0000-4000-8000-00000000000a', 'lim-legacy', 'player', 500, 300, null);
alter table public.campaign_invites enable trigger campaign_invites_prepare;
update public.campaign_invites set uses = uses + 1 where code = 'lim-legacy';
select is((select uses from public.campaign_invites where code = 'lim-legacy'), 301, 'a legacy row keeps working (uses is not under the trigger)');
update public.campaign_invites set expires_at = now() + interval '1 day' where code = 'lim-legacy';
select ok(
  (select max_uses = 301 and expires_at is not null from public.campaign_invites where code = 'lim-legacy'),
  'touching a legacy row never pushes max_uses below the uses already consumed');

-- lower bound: enforced by the table (max_uses integer not null check (max_uses >= 1)), not by the trigger
select throws_ok(
  $$insert into public.campaign_invites (campaign_id, code, role, max_uses) values ('99999999-0000-4000-8000-00000000000a', 'lim-zero', 'player', 0)$$,
  '23514', null, 'max_uses = 0 is rejected');
select throws_ok(
  $$insert into public.campaign_invites (campaign_id, code, role, max_uses) values ('99999999-0000-4000-8000-00000000000a', 'lim-neg', 'player', -3)$$,
  '23514', null, 'a negative max_uses is rejected');
select throws_ok(
  $$update public.campaign_invites set max_uses = 0 where code = 'lim-near'$$,
  '23514', null, 'an UPDATE to max_uses = 0 is rejected too');
select throws_ok(
  $$insert into public.campaign_invites (campaign_id, code, role, max_uses) values ('99999999-0000-4000-8000-00000000000a', 'lim-null', 'player', null)$$,
  '23502', null, 'a NULL max_uses is rejected, not silently clamped to 100');
-- the upper bound itself is allowed
insert into public.campaign_invites (campaign_id, code, role, max_uses, expires_at) values ('99999999-0000-4000-8000-00000000000a', 'lim-100', 'player', 100, now() + interval '2 days');
select is((select max_uses from public.campaign_invites where code = 'lim-100'), 100, 'exactly 100 is kept');
select is(
  (select obj_description('public.prepare_campaign_invite()'::regprocedure, 'pg_proc') like '%enforced by the table check%NULL max_uses is rejected%'),
  true, 'the trigger function documents that the lower bound and NULL are documented as table / explicit rejection');

select * from finish();
rollback;
