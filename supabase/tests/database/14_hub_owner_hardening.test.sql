-- pgTAP: H15b hardening of the hub-owner / campaign-request model. Self-contained fixture, rolled back at the end.
begin;

select plan(41);

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

create function tests.rid(n text) returns bigint language sql security definer set search_path = '' as $$
  select id from public.campaign_requests where name = n;
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture
--   1 : hub owner            2 : DM of an existing campaign      3 : requester
--   4 : 10 recent requests   5 : 10 old requests                 6 : ordinary stranger
--   7 : already has 20 campaigns
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-3333-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'hard-u' || n || '@example.test', json_build_object('full_name', 'Hard User ' || n)::jsonb
from generate_series(1, 7) as n;

insert into public.hub_owners (user_id) values ('aaaaaaaa-3333-4000-8000-000000000001');

insert into public.campaigns (id, slug, name, created_by) values
  ('bbbbbbbb-3333-4000-8000-00000000000a', 'hard-existing', 'Hard Existing', 'aaaaaaaa-3333-4000-8000-000000000002');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('bbbbbbbb-3333-4000-8000-00000000000a', 'aaaaaaaa-3333-4000-8000-000000000002', 'dm');

insert into public.campaigns (slug, name, created_by)
select 'hard-full-' || n, 'Full ' || n, 'aaaaaaaa-3333-4000-8000-000000000007' from generate_series(1, 20) as n;

insert into public.campaign_requests (requester_id, name, status, created_at)
select 'aaaaaaaa-3333-4000-8000-000000000004', 'Recent ' || n, 'rejected', now() - interval '1 hour'
from generate_series(1, 10) as n;
insert into public.campaign_requests (requester_id, name, status, created_at)
select 'aaaaaaaa-3333-4000-8000-000000000005', 'Old ' || n, 'rejected', now() - interval '25 hours'
from generate_series(1, 10) as n;

------------------------------------------------------------------------------
-- a) slug is immutable through the API; one reserved-slug list
------------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.campaigns', 'slug', 'update')
  and has_column_privilege('authenticated', 'public.campaigns', 'name', 'update')
  and has_column_privilege('authenticated', 'public.campaigns', 'branding', 'update')
  and has_column_privilege('authenticated', 'public.campaigns', 'regions', 'update')
  and has_column_privilege('authenticated', 'public.campaigns', 'character_custom_fields', 'update')
  and has_column_privilege('authenticated', 'public.campaigns', 'settings', 'update'),
  'campaigns: slug is no longer updatable by authenticated, the other column grants are kept');

select tests.as_user('aaaaaaaa-3333-4000-8000-000000000002');
select throws_ok(
  $$update public.campaigns set slug = 'admin' where id = 'bbbbbbbb-3333-4000-8000-00000000000a'$$, '42501', null,
  'a DM cannot PATCH the slug of their campaign to a reserved value');
select throws_ok(
  $$update public.campaigns set slug = 'hard-renamed' where id = 'bbbbbbbb-3333-4000-8000-00000000000a'$$, '42501', null,
  'a DM cannot change the slug at all');
select lives_ok(
  $$update public.campaigns set name = 'Hard Renamed' where id = 'bbbbbbbb-3333-4000-8000-00000000000a'$$,
  'a DM can still update the other columns');

select tests.as_postgres();
select is((select slug from public.campaigns where id = 'bbbbbbbb-3333-4000-8000-00000000000a'), 'hard-existing',
  'the slug is unchanged');
select ok(
  public.is_reserved_slug('admin') and public.is_reserved_slug(' Login ') and public.is_reserved_slug('ASSETS')
  and not public.is_reserved_slug('my-campaign') and public.is_reserved_slug(null) is not true,
  'is_reserved_slug: case/space-insensitive, false for normal and null');
select ok(
  has_function_privilege('authenticated', 'public.is_reserved_slug(text)', 'execute')
  and not has_function_privilege('anon', 'public.is_reserved_slug(text)', 'execute')
  and not has_function_privilege('public', 'public.is_reserved_slug(text)', 'execute'),
  'is_reserved_slug is callable by authenticated only');
select ok(
  not has_function_privilege('anon', 'public.strip_control_chars(text, boolean)', 'execute')
  and not has_function_privilege('public', 'public.strip_control_chars(text, boolean)', 'execute'),
  'strip_control_chars is not callable by anon');

select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select throws_ok($$select public.create_campaign('Login', 'x')$$, 'P0001', 'reserved_slug',
  'create_campaign_for still refuses reserved slugs through the helper');

------------------------------------------------------------------------------
-- c) the request trigger is SECURITY INVOKER, the other new functions keep definer + empty search_path
------------------------------------------------------------------------------
select tests.as_postgres();
select ok(
  not (select p.prosecdef from pg_proc p where p.oid = 'public.prepare_campaign_request()'::regprocedure)
  and (select p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.prepare_campaign_request()'::regprocedure),
  'prepare_campaign_request is SECURITY INVOKER with an empty search_path');
select ok(
  (select bool_and(p.proconfig = array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.is_reserved_slug(text)'::regprocedure, 'public.strip_control_chars(text, boolean)'::regprocedure,
                    'public.create_campaign_for(uuid, text, text)'::regprocedure,
                    'public.reject_campaign_request(bigint, text)'::regprocedure))
  and (select p.prosecdef from pg_proc p where p.oid = 'public.create_campaign_for(uuid, text, text)'::regprocedure)
  and (select p.prosecdef from pg_proc p where p.oid = 'public.reject_campaign_request(bigint, text)'::regprocedure),
  'the helpers and the decision functions have an empty search_path; the creators stay SECURITY DEFINER');
select ok(
  not has_function_privilege('authenticated', 'public.prepare_campaign_request()', 'execute')
  and not has_function_privilege('anon', 'public.prepare_campaign_request()', 'execute'),
  'the trigger function is not callable through the API');

------------------------------------------------------------------------------
-- d) policies use the wrapped form
------------------------------------------------------------------------------
select ok(
  (select p.qual ~* 'select\s+(public\.)?is_hub_owner\(\)'
     from pg_policies p where p.schemaname = 'public' and p.tablename = 'campaign_requests' and p.policyname = 'campaign_requests_select')
  and (select p.qual ~* 'select\s+(public\.)?is_hub_owner\(\)'
     from pg_policies p where p.schemaname = 'public' and p.tablename = 'profiles' and p.policyname = 'profiles_select_requesters_for_hub_owner'),
  'campaign_requests and profiles policies call is_hub_owner() as a sub-select');

------------------------------------------------------------------------------
-- e) rolling cap and pending cap
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000004');
select throws_ok($$insert into public.campaign_requests (name) values ('Eleventh')$$, 'P0001', 'too_many_requests_recently',
  'the 11th request in 24 hours is refused even though none is pending');

select tests.as_user('aaaaaaaa-3333-4000-8000-000000000005');
select lives_ok($$insert into public.campaign_requests (name) values ('After old')$$,
  'requests older than 24 hours do not count');

select tests.as_user('aaaaaaaa-3333-4000-8000-000000000006');
select throws_ok(
  $$insert into public.campaign_requests (name) values ('M1'), ('M2'), ('M3'), ('M4')$$, 'P0001', 'too_many_pending_requests',
  'a multi-row insert cannot go past the pending cap');
select is((select count(*) from public.campaign_requests where name like 'M_'), 0::bigint,
  'the whole multi-row insert was rolled back');
select lives_ok($$insert into public.campaign_requests (name) values ('M1'), ('M2'), ('M3')$$,
  'a multi-row insert that ends exactly at the cap works');
select throws_ok($$insert into public.campaign_requests (name) values ('M4')$$, 'P0001', 'too_many_pending_requests',
  'and the next one is refused');

------------------------------------------------------------------------------
-- f) control / bidi characters are stripped
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000003');
select lives_ok(
  $$insert into public.campaign_requests (name, slug_wanted, message)
    values (E'  Ab‮c​d\u0007﻿ ', E'ab​c-‮d', E'line 1\n\tline‮ 2\x'::text)$$,
  'a request with control and bidi characters is accepted after cleaning');
select is(
  (select concat_ws('|', name, slug_wanted, replace(replace(message, E'\n', '<n>'), E'\t', '<t>')) from public.campaign_requests where name = 'Abcd'),
  'Abcd|abc-d|line 1<n><t>line 2x', 'name, slug and message are cleaned; newline and tab survive in the message');
select throws_ok(
  $$insert into public.campaign_requests (name) values (E'‮​')$$, '23514', null,
  'a name made only of invisible characters is refused as blank');
select throws_ok(
  $$insert into public.campaign_requests (name, slug_wanted) values ('Bidi slug', E'‮ww​w')$$, 'P0001', 'reserved_slug',
  'a reserved slug hidden behind invisible characters is caught after cleaning');
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select lives_ok($$select public.reject_campaign_request(tests.rid('Abcd'), E'no‮ va​\u0007 hoy')$$,
  'reject with control characters in the note works');
select tests.as_postgres();
select is((select decision_note from public.campaign_requests where name = 'Abcd'), 'no va hoy',
  'the decision note is cleaned');

------------------------------------------------------------------------------
-- b) decided_by is not readable
------------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.campaign_requests', 'decided_by', 'select')
  and has_column_privilege('authenticated', 'public.campaign_requests', 'decision_note', 'select')
  and has_column_privilege('authenticated', 'public.campaign_requests', 'status', 'select')
  and not has_column_privilege('authenticated', 'public.campaign_requests', 'decided_by', 'update'),
  'decided_by has no column privilege for authenticated; the other columns stay readable');
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000003');
select throws_ok($$select decided_by from public.campaign_requests$$, '42501', null,
  'the requester cannot read decided_by');
select throws_ok($$select * from public.campaign_requests$$, '42501', null,
  'select * on campaign_requests is refused (the app always lists its columns)');
select is((select status from public.campaign_requests where name = 'Abcd'), 'rejected',
  'the requester still reads the status of their decided request');
select is((select count(*) from public.profiles where id = 'aaaaaaaa-3333-4000-8000-000000000001'), 0::bigint,
  'the requester cannot read the deciding owner''s profile (so cannot embed it either)');
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select throws_ok($$select decided_by from public.campaign_requests$$, '42501', null,
  'the hub owner cannot read decided_by either');

------------------------------------------------------------------------------
-- g) denials that were claimed but not asserted
------------------------------------------------------------------------------
-- campaign_limit_reached / invalid_name on the approve path
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000007');
select lives_ok($$insert into public.campaign_requests (name, slug_wanted) values ('Over cap', 'over-the-cap')$$,
  'the user with 20 campaigns can still ask for another');
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select throws_ok($$select public.approve_campaign_request(tests.rid('Over cap'))$$, 'P0001', 'campaign_limit_reached',
  'approving for a requester who is at the campaign cap is refused');
select is((select status from public.campaign_requests where name = 'Over cap'), 'pending',
  'and the request stays pending');
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000003');
select lives_ok($$insert into public.campaign_requests (name, slug_wanted) values ('Name test', 'name-test')$$,
  'a request to test the name override');
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select throws_ok($$select public.approve_campaign_request(tests.rid('Name test'), 'name-test', repeat('n', 121))$$,
  '23514', 'invalid_name', 'approve with a name over 120 characters is refused as invalid_name');

-- anon / ordinary reject
select tests.as_anon();
select throws_ok($$select public.reject_campaign_request(1, 'x')$$, '42501', null, 'anon cannot reject');

-- decision_note > 500
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select throws_ok($$select public.reject_campaign_request(tests.rid('Name test'), repeat('x', 501))$$, '23514', null,
  'a decision note over 500 characters is refused');
select is((select status from public.campaign_requests where name = 'Name test'), 'pending',
  'and the request stays pending');

-- profiles of requesters
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000006');
select is((select count(*) from public.profiles where id = 'aaaaaaaa-3333-4000-8000-000000000003'), 0::bigint,
  'an ordinary user cannot read the profile of somebody with a request');
select tests.as_user('aaaaaaaa-3333-4000-8000-000000000001');
select is((select count(*) from public.profiles where id = 'aaaaaaaa-3333-4000-8000-000000000003'), 1::bigint,
  'a hub owner can (control)');

select * from finish();
rollback;
