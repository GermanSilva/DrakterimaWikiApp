-- pgTAP: preview_invite() (read-only preview of an invite before accept_invite consumes it).
-- Self-contained fixture, rolled back at the end.
begin;

select plan(37);

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
--   campaign A (https logo): u1 DM, u2 player (owns Mara)         pjs: Eldric (free), Mara (u2), Zed (u2 later)
--   campaign B (http logo) : u4 DM                                 pj : Secret B
--   u3 : member of nothing (the invited user)
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('77777777-0000-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'preview-u' || n || '@example.test'
from generate_series(1, 4) as n;

insert into public.campaigns (id, slug, name, branding) values
  ('66666666-0000-4000-8000-00000000000a', 'preview-a', 'Preview A',
   '{"logo_url":"https://img.example.test/a.png","accent_color":"#112233"}'),
  ('66666666-0000-4000-8000-00000000000b', 'preview-b', 'Preview B Hidden Name',
   '{"logo_url":"http://img.example.test/b.png"}');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('66666666-0000-4000-8000-00000000000a', '77777777-0000-4000-8000-000000000001', 'dm'),
  ('66666666-0000-4000-8000-00000000000a', '77777777-0000-4000-8000-000000000002', 'player'),
  ('66666666-0000-4000-8000-00000000000b', '77777777-0000-4000-8000-000000000004', 'dm');

insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (7001, '66666666-0000-4000-8000-00000000000a', null, 'Eldric'),
  (7002, '66666666-0000-4000-8000-00000000000a', '77777777-0000-4000-8000-000000000002', 'Mara'),
  (7003, '66666666-0000-4000-8000-00000000000a', null, 'Zed'),
  (7004, '66666666-0000-4000-8000-00000000000b', null, 'Secret B'),
  (7005, '66666666-0000-4000-8000-00000000000a', null, 'Yuri');

insert into public.campaign_invites (campaign_id, code, role, max_uses, character_id) values
  ('66666666-0000-4000-8000-00000000000a', 'pv-plain',     'player', 3, null),
  ('66666666-0000-4000-8000-00000000000a', 'pv-dm',        'dm',     1, null),
  ('66666666-0000-4000-8000-00000000000a', 'pv-expired',   'player', 3, null),
  ('66666666-0000-4000-8000-00000000000a', 'pv-used-up',   'player', 1, null),
  ('66666666-0000-4000-8000-00000000000a', 'pv-claim',     'player', 1, 7001),
  ('66666666-0000-4000-8000-00000000000a', 'pv-claim-zed', 'player', 1, 7003),
  ('66666666-0000-4000-8000-00000000000a', 'pv-claim-expired-yuri', 'player', 1, 7005),
  ('66666666-0000-4000-8000-00000000000b', 'pv-b-plain',   'player', 1, null),
  ('66666666-0000-4000-8000-00000000000b', 'pv-b-claim',   'player', 1, 7004);

update public.campaign_invites set expires_at = now() - interval '1 hour' where code in ('pv-expired', 'pv-claim-expired-yuri');
update public.campaign_invites set uses = 1 where code = 'pv-used-up';
-- somebody else took Zed after his invite was created
update public.pjs set owner_id = '77777777-0000-4000-8000-000000000002' where id in (7003, 7005);

------------------------------------------------------------------------------
-- Structure and privileges
------------------------------------------------------------------------------
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""'] and p.provolatile = 's'
     from pg_proc p where p.oid = 'public.preview_invite(text)'::regprocedure),
  'preview_invite is STABLE SECURITY DEFINER with an empty search_path');
select ok(
  has_function_privilege('authenticated', 'public.preview_invite(text)', 'execute')
  and not has_function_privilege('anon', 'public.preview_invite(text)', 'execute'),
  'callable by authenticated only (anon has no execute privilege)');

------------------------------------------------------------------------------
-- A valid invite, seen by the invited outsider (u3)
------------------------------------------------------------------------------
select tests.as_user('77777777-0000-4000-8000-000000000003');

select is(
  public.preview_invite('pv-plain'),
  jsonb_build_object(
    'campaign_name', 'Preview A', 'campaign_slug', 'preview-a', 'logo_url', 'https://img.example.test/a.png',
    'role', 'player', 'character_name', null, 'is_member', false, 'nothing_to_do', false),
  'a valid plain invite previews the campaign, logo, role and no character');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.preview_invite('pv-plain')) k),
  array['campaign_name', 'campaign_slug', 'character_name', 'is_member', 'logo_url', 'nothing_to_do', 'role'],
  'the preview exposes exactly seven fields (no code, ids, counters, dates or branding extras)');
select is(public.preview_invite('  pv-plain  ') ->> 'campaign_name', 'Preview A', 'the code is trimmed like accept_invite does');
select is(public.preview_invite('pv-dm') ->> 'role', 'dm', 'a dm invite previews role dm');

-- logo: only https
select is(public.preview_invite('pv-b-plain') -> 'logo_url', 'null'::jsonb, 'a non-https logo is never returned');

------------------------------------------------------------------------------
-- Claim invite: the PJ name only
------------------------------------------------------------------------------
select is(
  public.preview_invite('pv-claim'),
  jsonb_build_object(
    'campaign_name', 'Preview A', 'campaign_slug', 'preview-a', 'logo_url', 'https://img.example.test/a.png',
    'role', 'player', 'character_name', 'Eldric', 'is_member', false, 'nothing_to_do', false),
  'a claim invite shows the name of its character');
select ok(
  position('Mara' in public.preview_invite('pv-claim')::text) = 0
  and position('Zed' in public.preview_invite('pv-claim')::text) = 0
  and position('7001' in public.preview_invite('pv-claim')::text) = 0,
  'the claim preview names no other character and no ids');

-- no leakage of other campaigns / codes
select ok(
  position('Hidden Name' in public.preview_invite('pv-plain')::text) = 0
  and position('pv-' in public.preview_invite('pv-plain')::text) = 0
  and position('Secret B' in public.preview_invite('pv-plain')::text) = 0,
  'the preview contains nothing of another campaign and not the code');
select is(
  public.preview_invite('pv-b-claim') ->> 'character_name', 'Secret B',
  'an invite of campaign B previews campaign B''s data only (its own character)');
select is(public.preview_invite('pv-b-claim') ->> 'campaign_name', 'Preview B Hidden Name', 'and its own campaign name');

------------------------------------------------------------------------------
-- Error states (same messages and order as accept_invite) with no data
------------------------------------------------------------------------------
select throws_ok($$select public.preview_invite('pv-expired')$$, 'P0001', 'invite_expired', 'an expired invite');
select throws_ok($$select public.preview_invite('pv-used-up')$$, 'P0001', 'invite_exhausted', 'an exhausted invite');
select throws_ok($$select public.preview_invite('does-not-exist')$$, 'P0001', 'invite_not_found', 'a code that does not exist');
select throws_ok($$select public.preview_invite('')$$, 'P0001', 'invite_not_found', 'an empty code');
select throws_ok($$select public.preview_invite(null)$$, 'P0001', 'invite_not_found', 'a null code');
select throws_ok($$select public.preview_invite('pv-claim-zed')$$, 'P0001', 'character_already_claimed',
  'a claim invite whose character was taken by someone else');

-- accept_invite reveals the same, so the preview is not a new oracle
select throws_ok($$select public.accept_invite('pv-expired')$$, 'P0001', 'invite_expired', 'accept_invite agrees: expired');
select throws_ok($$select public.accept_invite('pv-used-up')$$, 'P0001', 'invite_exhausted', 'accept_invite agrees: exhausted');
select throws_ok($$select public.accept_invite('pv-claim-zed')$$, 'P0001', 'character_already_claimed', 'accept_invite agrees: claimed');

-- expired invite of a taken character: expiry is reported first, the character state stays hidden
select throws_ok($$select public.preview_invite('pv-claim-expired-yuri')$$, 'P0001', 'invite_expired',
  'an expired claim invite reports the expiry, never the character state');

------------------------------------------------------------------------------
-- anon
------------------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$select public.preview_invite('pv-plain')$$, '42501', null, 'anon cannot preview an invite');

------------------------------------------------------------------------------
-- Already a member (u2 owns Mara)
------------------------------------------------------------------------------
select tests.as_user('77777777-0000-4000-8000-000000000002');
select is(
  (public.preview_invite('pv-plain') ->> 'is_member')::boolean and (public.preview_invite('pv-plain') ->> 'nothing_to_do')::boolean,
  true, 'a member sees is_member and nothing_to_do for a plain invite');
select is(
  public.preview_invite('pv-expired') ->> 'nothing_to_do', 'true',
  'a member with nothing to claim previews even an expired invite (accept_invite is a no-op for them too)');
select is(
  public.preview_invite('pv-claim') ->> 'nothing_to_do', 'false',
  'a member is still offered an unowned character to claim');
select is(
  public.preview_invite('pv-claim') ->> 'is_member', 'true',
  'and is told they are already a member');

------------------------------------------------------------------------------
-- Not a member of the DM's other campaign: a DM of B is an outsider for A's invites
------------------------------------------------------------------------------
select tests.as_user('77777777-0000-4000-8000-000000000004');
select is(public.preview_invite('pv-plain') ->> 'is_member', 'false', 'the DM of campaign B is not a member of A');

------------------------------------------------------------------------------
-- Read-only: nothing changed
------------------------------------------------------------------------------
select tests.as_postgres();
select is(
  (select array_agg(code || ':' || uses order by code collate "C") from public.campaign_invites where code like 'pv-%'),
  array['pv-b-claim:0', 'pv-b-plain:0', 'pv-claim:0', 'pv-claim-expired-yuri:0', 'pv-claim-zed:0', 'pv-dm:0', 'pv-expired:0', 'pv-plain:0', 'pv-used-up:1'],
  'no invite use was consumed by any preview');
select is(
  (select count(*)::int from public.campaign_members where campaign_id = '66666666-0000-4000-8000-00000000000a'),
  2, 'no membership was created');
select is(
  (select owner_id::text from public.pjs where id = 7001), null,
  'no character was claimed');

-- accept still works afterwards, once, and the use is then counted
select tests.as_user('77777777-0000-4000-8000-000000000003');
select is((public.accept_invite('pv-plain') ->> 'joined')::boolean, true, 'accept_invite after the preview joins');
select tests.as_postgres();
select is((select uses from public.campaign_invites where code = 'pv-plain'), 1, 'and only then is a use consumed');

-- the invite list stays DM-only: the previewing user cannot read invites
select tests.as_user('77777777-0000-4000-8000-000000000004');
select is((select count(*)::int from public.campaign_invites where campaign_id = '66666666-0000-4000-8000-00000000000a'), 0,
  'previewing does not grant read access to the invites of the campaign');
select tests.as_user('77777777-0000-4000-8000-000000000001');
select is((select count(*)::int from public.campaign_invites where campaign_id = '66666666-0000-4000-8000-00000000000a'), 7,
  'the DM lists their own invites (and not the other campaign''s)');
-- revoke: a DM deletes an invite and the preview then reports not found
delete from public.campaign_invites where code = 'pv-dm';
select tests.as_user('77777777-0000-4000-8000-000000000004');
select throws_ok($$select public.preview_invite('pv-dm')$$, 'P0001', 'invite_not_found', 'a revoked (deleted) invite previews as not found');
select tests.as_user('77777777-0000-4000-8000-000000000002');
delete from public.campaign_invites where code = 'pv-claim';
select tests.as_postgres();
select is((select count(*)::int from public.campaign_invites where code = 'pv-claim'), 1, 'a player cannot delete an invite (RLS hides it: nothing deleted)');

select * from finish();
rollback;
