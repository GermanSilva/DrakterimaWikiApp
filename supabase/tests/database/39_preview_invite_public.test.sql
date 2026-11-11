-- pgTAP: preview_invite_public() (anonymous campaign preview on the login page for /invite links).
-- Self-contained fixture, rolled back at the end.
begin;

select plan(20);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('78787878-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'pub-preview-u' || n || '@example.test'
from generate_series(1, 2) as n;

insert into public.campaigns (id, slug, name, branding) values
  ('67676767-0000-4000-8000-00000000000a', 'pub-preview-a', 'Crónicas de Vel''Arath',
   '{"logo_url":"https://img.example.test/a.png","banner_url":"https://img.example.test/banner.jpg","accent_color":"#B91C1C","tagline":"  Sangre y ceniza  ","notes":"secret"}'),
  ('67676767-0000-4000-8000-00000000000b', 'pub-preview-b', 'Preview B',
   '{"logo_url":"http://img.example.test/b.png","banner_url":"javascript:alert(1)","accent_color":"red","tagline":42}');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('67676767-0000-4000-8000-00000000000a', '78787878-0000-4000-8000-000000000001', 'dm'),
  ('67676767-0000-4000-8000-00000000000a', '78787878-0000-4000-8000-000000000002', 'player');

insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (7801, '67676767-0000-4000-8000-00000000000a', null, 'Libre'),
  (7802, '67676767-0000-4000-8000-00000000000a', null, 'Tomado');

insert into public.campaign_invites (campaign_id, code, role, max_uses, character_id, expires_at) values
  ('67676767-0000-4000-8000-00000000000a', 'pp-plain',   'player', 3, null, '2999-01-01T00:00:00Z'),
  ('67676767-0000-4000-8000-00000000000a', 'pp-noexp',   'player', 3, null, null),
  ('67676767-0000-4000-8000-00000000000a', 'pp-expired', 'player', 3, null, now() - interval '1 hour'),
  ('67676767-0000-4000-8000-00000000000a', 'pp-used-up', 'player', 1, null, null),
  ('67676767-0000-4000-8000-00000000000a', 'pp-claim',   'player', 1, 7801, null),
  ('67676767-0000-4000-8000-00000000000a', 'pp-taken',   'player', 1, 7802, null),
  ('67676767-0000-4000-8000-00000000000b', 'pp-b',       'player', 1, null, null);
update public.campaign_invites set uses = 1 where code = 'pp-used-up';
-- invites always carry an expiry (a trigger fills/clamps it): keep the stored values to compare against
create table tests.expiry as select code, expires_at from public.campaign_invites where code like 'pp-%';
grant select on tests.expiry to anon;
-- somebody else took the character after its invite was created
update public.pjs set owner_id = '78787878-0000-4000-8000-000000000002' where id = 7802;

-- Structure and privileges
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""'] and p.provolatile = 's'
     from pg_proc p where p.oid = 'public.preview_invite_public(text)'::regprocedure),
  'preview_invite_public is STABLE SECURITY DEFINER with an empty search_path');
select ok(
  has_function_privilege('anon', 'public.preview_invite_public(text)', 'execute')
  and has_function_privilege('authenticated', 'public.preview_invite_public(text)', 'execute'),
  'callable by anon and authenticated');
select ok(
  not has_function_privilege('anon', 'public.preview_invite(text)', 'execute'),
  'the full preview_invite stays authenticated-only');

-- Valid invites, seen by an anonymous visitor
select tests.as_anon();

select is(
  public.preview_invite_public('pp-plain'),
  jsonb_build_object(
    'campaign_name', 'Crónicas de Vel''Arath',
    'logo_url', 'https://img.example.test/a.png',
    'banner_url', 'https://img.example.test/banner.jpg',
    'accent_color', '#b91c1c',
    'tagline', 'Sangre y ceniza',
    'expires_at', (select expires_at from tests.expiry where code = 'pp-plain')),
  'a valid invite previews name, logo, banner, lowercased accent, trimmed tagline and expiry');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.preview_invite_public('pp-plain')) k),
  array['accent_color', 'banner_url', 'campaign_name', 'expires_at', 'logo_url', 'tagline'],
  'exactly six keys: no slug, role, character, members or other branding');
select is(public.preview_invite_public('  pp-plain  ') ->> 'campaign_name', 'Crónicas de Vel''Arath', 'the code is trimmed');
select is((public.preview_invite_public('pp-noexp') ->> 'expires_at')::timestamptz,
  (select expires_at from tests.expiry where code = 'pp-noexp'), 'the expiry is the stored one');
select is(public.preview_invite_public('pp-claim') ->> 'campaign_name', 'Crónicas de Vel''Arath', 'a claim invite for a free character previews');
select is(
  public.preview_invite_public('pp-b'),
  jsonb_build_object('campaign_name', 'Preview B', 'logo_url', null, 'banner_url', null,
                     'accent_color', null, 'tagline', null,
                     'expires_at', (select expires_at from tests.expiry where code = 'pp-b')),
  'non-https images, a non-hex accent and a non-text tagline are nulled');

-- Errors: same states as accept_invite for an outsider, and no campaign data
select throws_ok($$ select public.preview_invite_public('nope') $$, 'P0001', 'invite_not_found', 'unknown code');
select throws_ok($$ select public.preview_invite_public('') $$, 'P0001', 'invite_not_found', 'empty code');
select throws_ok($$ select public.preview_invite_public(null) $$, 'P0001', 'invite_not_found', 'null code');
select throws_ok($$ select public.preview_invite_public('pp-expired') $$, 'P0001', 'invite_expired', 'expired invite');
select throws_ok($$ select public.preview_invite_public('pp-used-up') $$, 'P0001', 'invite_exhausted', 'used-up invite');
select throws_ok($$ select public.preview_invite_public('pp-taken') $$, 'P0001', 'character_already_claimed', 'claimed character');

-- Read-only: nothing consumed
select lives_ok($$ select public.preview_invite_public('pp-claim') $$, 'previewing again still works');
reset role;
select is((select uses from public.campaign_invites where code = 'pp-claim'), 0, 'preview does not consume a use');
select is((select owner_id from public.pjs where id = 7801), null::uuid, 'preview does not claim the character');
select is((select count(*)::int from public.campaign_members where campaign_id = '67676767-0000-4000-8000-00000000000a'), 2, 'preview adds no member');

-- Anon still cannot read the invites table directly
select tests.as_anon();
select throws_ok($$ select count(*) from public.campaign_invites $$, '42501', null, 'anon has no direct access to campaign_invites');

select * from finish();
rollback;
