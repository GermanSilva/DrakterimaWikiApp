-- pgTAP: H15 Hub Owner + campaign requests. Self-contained fixture, rolled back at the end.
begin;

select plan(74);

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

-- id of the request with this name, whoever is asking (the fixture names are unique)
create function tests.rid(n text) returns bigint language sql security definer set search_path = '' as $$
  select id from public.campaign_requests where name = n;
$$;

create function tests.exists_req(n text) returns boolean language sql security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_requests where name = n);
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture (as postgres)
--   o1 : hub owner      o2 : hub owner (second owner)
--   r1, r2, r3 : ordinary users      s1 : ordinary user who is DM of an existing campaign
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-2222-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'hub-u' || n || '@example.test', json_build_object('full_name', 'Hub User ' || n)::jsonb
from generate_series(1, 6) as n;

insert into public.hub_owners (user_id) values
  ('aaaaaaaa-2222-4000-8000-000000000001'), ('aaaaaaaa-2222-4000-8000-000000000002');

insert into public.campaigns (id, slug, name, created_by) values
  ('bbbbbbbb-2222-4000-8000-00000000000a', 'hub-existing', 'Hub Existing', 'aaaaaaaa-2222-4000-8000-000000000006');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('bbbbbbbb-2222-4000-8000-00000000000a', 'aaaaaaaa-2222-4000-8000-000000000006', 'dm');

------------------------------------------------------------------------------
-- Structure and privileges
------------------------------------------------------------------------------
select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.hub_owners'::regclass)
  and (select c.relrowsecurity from pg_class c where c.oid = 'public.campaign_requests'::regclass),
  'RLS is enabled on hub_owners and campaign_requests');
select ok(
  not has_table_privilege('authenticated', 'public.hub_owners', 'insert')
  and not has_table_privilege('authenticated', 'public.hub_owners', 'update')
  and not has_table_privilege('authenticated', 'public.hub_owners', 'delete')
  and not has_table_privilege('anon', 'public.hub_owners', 'select'),
  'hub_owners: authenticated can only select; anon nothing');
select ok(
  not has_table_privilege('authenticated', 'public.campaign_requests', 'update')
  and not has_table_privilege('anon', 'public.campaign_requests', 'select')
  and not has_table_privilege('anon', 'public.campaign_requests', 'insert'),
  'campaign_requests: no UPDATE for authenticated, nothing for anon');
select ok(
  has_column_privilege('authenticated', 'public.campaign_requests', 'name', 'insert')
  and has_column_privilege('authenticated', 'public.campaign_requests', 'slug_wanted', 'insert')
  and has_column_privilege('authenticated', 'public.campaign_requests', 'message', 'insert')
  and not has_column_privilege('authenticated', 'public.campaign_requests', 'status', 'insert')
  and not has_column_privilege('authenticated', 'public.campaign_requests', 'requester_id', 'insert')
  and not has_column_privilege('authenticated', 'public.campaign_requests', 'campaign_id', 'insert'),
  'only name, slug_wanted, message and the branding fields (tagline, accent_color, logo_url) are insertable');
select ok(
  not has_table_privilege('authenticated', 'public.campaigns', 'insert')
  and not has_function_privilege('authenticated', 'public.create_campaign_for(uuid, text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.create_campaign_for(uuid, text, text, jsonb)', 'execute')
  and not has_function_privilege('public', 'public.create_campaign_for(uuid, text, text, jsonb)', 'execute'),
  'campaigns has no INSERT privilege and the internal creator is not callable through the API');
select ok(
  (select bool_and(p.prosecdef and p.proconfig = array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.is_hub_owner()'::regprocedure, 'public.create_campaign(text, text, text, text, text)'::regprocedure,
                    'public.create_campaign_for(uuid, text, text, jsonb)'::regprocedure,
                    'public.approve_campaign_request(bigint, text, text)'::regprocedure,
                    'public.reject_campaign_request(bigint, text)'::regprocedure)),
  'every new function is SECURITY DEFINER with an empty search_path');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0::bigint, 'anon can execute no function of the public schema (smoke check 5 of the runbook)');
select ok(
  has_function_privilege('authenticated', 'public.is_hub_owner()', 'execute')
  and has_function_privilege('authenticated', 'public.approve_campaign_request(bigint, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.reject_campaign_request(bigint, text)', 'execute')
  and not has_function_privilege('anon', 'public.is_hub_owner()', 'execute')
  and not has_function_privilege('anon', 'public.approve_campaign_request(bigint, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.reject_campaign_request(bigint, text)', 'execute')
  and not has_function_privilege('anon', 'public.create_campaign(text, text, text, text, text)', 'execute')
  and not has_function_privilege('public', 'public.approve_campaign_request(bigint, text, text)', 'execute'),
  'RPCs are callable by authenticated only');

------------------------------------------------------------------------------
-- hub_owners: nobody can write it, a user sees only their own row
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-2222-4000-8000-000000000003');
select is((select public.is_hub_owner()), false, 'is_hub_owner is false for an ordinary user');
select throws_ok(
  $$insert into public.hub_owners (user_id) values ('aaaaaaaa-2222-4000-8000-000000000003')$$, '42501', null,
  'an ordinary user cannot make themselves a hub owner (insert)');
select throws_ok(
  $$update public.hub_owners set user_id = 'aaaaaaaa-2222-4000-8000-000000000003'$$, '42501', null,
  'an ordinary user cannot update hub_owners');
select throws_ok(
  $$delete from public.hub_owners$$, '42501', null,
  'an ordinary user cannot delete hub_owners');
select is((select count(*) from public.hub_owners), 0::bigint, 'an ordinary user sees no hub_owners rows');

select tests.as_user('aaaaaaaa-2222-4000-8000-000000000001');
select is((select public.is_hub_owner()), true, 'is_hub_owner is true for a hub owner');
select is((select count(*) from public.hub_owners), 1::bigint, 'a hub owner sees only their own hub_owners row');
select throws_ok(
  $$insert into public.hub_owners (user_id) values ('aaaaaaaa-2222-4000-8000-000000000003')$$, '42501', null,
  'a hub owner cannot appoint another owner through the API either');

select tests.as_anon();
select throws_ok($$select public.is_hub_owner()$$, '42501', null, 'anon cannot call is_hub_owner');
select throws_ok($$select * from public.hub_owners$$, '42501', null, 'anon cannot read hub_owners');
select throws_ok($$select * from public.campaign_requests$$, '42501', null, 'anon cannot read campaign_requests');
select throws_ok(
  $$insert into public.campaign_requests (name) values ('Anon')$$, '42501', null,
  'anon cannot create a request');

------------------------------------------------------------------------------
-- Direct campaign creation: owners only
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-2222-4000-8000-000000000003');
select throws_ok(
  $$select public.create_campaign('plain-user-camp', 'Plain')$$, '42501', 'hub_owner_only',
  'an ordinary user cannot create_campaign');
select throws_ok(
  $$insert into public.campaigns (slug, name) values ('direct-insert', 'Direct')$$, '42501', null,
  'an ordinary user cannot insert a campaign directly');
select throws_ok(
  $$select public.create_campaign_for('aaaaaaaa-2222-4000-8000-000000000003', 'bypass-camp', 'Bypass')$$, '42501', null,
  'the internal creator is not callable by an ordinary user');

select tests.as_user('aaaaaaaa-2222-4000-8000-000000000001');
select is(
  (select slug from public.create_campaign('  Owner-Camp ', ' Owner Campaign ')), 'owner-camp',
  'a hub owner can create_campaign');
select is(
  (select m.role from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
    where c.slug = 'owner-camp' and m.user_id = 'aaaaaaaa-2222-4000-8000-000000000001'),
  'dm', 'the hub owner is the DM of the campaign they create');
select throws_ok(
  $$select public.create_campaign('Admin', 'x')$$, 'P0001', 'reserved_slug', 'reserved slugs are still refused');
select throws_ok(
  $$select public.create_campaign('owner-camp', 'dup')$$, '23505', 'slug_taken', 'a taken slug is refused as slug_taken');
select throws_ok(
  $$select public.create_campaign('Bad Slug!', 'x')$$, '23514', 'invalid_slug', 'an invalid slug is refused as invalid_slug');

------------------------------------------------------------------------------
-- Requests: insert rules
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-2222-4000-8000-000000000003');
select lives_ok(
  $$insert into public.campaign_requests (name, slug_wanted, message) values ('  Req Alpha ', ' Alpha-Camp ', ' hola ')$$,
  'an ordinary user can request a campaign');
select is(
  (select concat_ws('|', name, slug_wanted, message, status, requester_id::text) from public.campaign_requests where name = 'Req Alpha'),
  'Req Alpha|alpha-camp|hola|pending|aaaaaaaa-2222-4000-8000-000000000003',
  'the request is normalised, pending and owned by the caller');
select throws_ok(
  $$insert into public.campaign_requests (name, status) values ('Sneaky', 'approved')$$, '42501', null,
  'status cannot be set on insert');
select throws_ok(
  $$insert into public.campaign_requests (name, requester_id) values ('Sneaky2', 'aaaaaaaa-2222-4000-8000-000000000004')$$, '42501', null,
  'requester_id cannot be set on insert (no requests on behalf of others)');
select throws_ok(
  $$insert into public.campaign_requests (name, slug_wanted) values ('Bad', 'Bad Slug!')$$, '23514', null,
  'an invalid wanted slug is refused');
select throws_ok(
  $$insert into public.campaign_requests (name, slug_wanted) values ('Res', 'admin')$$, 'P0001', 'reserved_slug',
  'a reserved wanted slug is refused');
select throws_ok(
  $$insert into public.campaign_requests (name) values ('   ')$$, '23514', null, 'a blank name is refused');
select throws_ok(
  $$insert into public.campaign_requests (name, message) values ('Long', repeat('x', 1001))$$, '23514', null,
  'a message over 1000 characters is refused');
select lives_ok($$insert into public.campaign_requests (name) values ('Req Beta')$$, 'a second pending request');
select lives_ok($$insert into public.campaign_requests (name) values ('Req Gamma')$$, 'a third pending request');
select throws_ok(
  $$insert into public.campaign_requests (name) values ('Req Delta')$$, 'P0001', 'too_many_pending_requests',
  'a fourth pending request is refused');

------------------------------------------------------------------------------
-- Requests: visibility, cancel, no update
------------------------------------------------------------------------------
select is((select count(*) from public.campaign_requests), 3::bigint, 'the requester sees their own requests');

select tests.as_user('aaaaaaaa-2222-4000-8000-000000000004');
select is((select count(*) from public.campaign_requests), 0::bigint, 'another user sees none of them');
select lives_ok($$insert into public.campaign_requests (name) values ('Req Other')$$, 'a different user can request too');
delete from public.campaign_requests where name = 'Req Alpha';
select is(tests.exists_req('Req Alpha'), true, 'another user cannot cancel (delete) someone else''s request');

select tests.as_user('aaaaaaaa-2222-4000-8000-000000000003');
select throws_ok(
  $$update public.campaign_requests set status = 'approved' where name = 'Req Alpha'$$, '42501', null,
  'the requester cannot update a request (no self-approval)');
delete from public.campaign_requests where name = 'Req Gamma';
select is(tests.exists_req('Req Gamma'), false, 'the requester can cancel their pending request');
select lives_ok($$insert into public.campaign_requests (name) values ('Req Delta')$$, 'cancelling frees a pending slot');

select tests.as_user('aaaaaaaa-2222-4000-8000-000000000001');
select is((select count(*) from public.campaign_requests), 4::bigint, 'a hub owner sees every request');
select is(
  (select display_name from public.profiles where id = 'aaaaaaaa-2222-4000-8000-000000000003'), 'Hub User 3',
  'a hub owner can read the profile of a requester');
select is(
  (select count(*) from public.profiles where id = 'aaaaaaaa-2222-4000-8000-000000000005'), 0::bigint,
  'but not the profile of a user without a request');
delete from public.campaign_requests where name = 'Req Alpha';
select is(tests.exists_req('Req Alpha'), true, 'a hub owner cannot delete a requester''s request through the table');

------------------------------------------------------------------------------
-- Approve
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-2222-4000-8000-000000000003');
select throws_ok(
  $$select public.approve_campaign_request(tests.rid('Req Alpha'))$$, '42501', 'hub_owner_only',
  'a requester cannot approve their own request');
select throws_ok(
  $$select public.reject_campaign_request(tests.rid('Req Alpha'), 'x')$$, '42501', 'hub_owner_only',
  'an ordinary user cannot reject');
select tests.as_user('aaaaaaaa-2222-4000-8000-000000000006');
select throws_ok(
  $$select public.approve_campaign_request(tests.rid('Req Alpha'))$$, '42501', 'hub_owner_only',
  'being the DM of a campaign does not make you a hub owner');
select tests.as_anon();
select throws_ok(
  $$select public.approve_campaign_request(tests.rid('Req Alpha'))$$, '42501', null, 'anon cannot approve');

select tests.as_user('aaaaaaaa-2222-4000-8000-000000000001');
select is(
  (select public.approve_campaign_request(tests.rid('Req Alpha'))), 'alpha-camp',
  'approve creates the campaign from the wanted slug and returns its slug');
select tests.as_postgres();
select is(
  (select m.role from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
    where c.slug = 'alpha-camp' and m.user_id = 'aaaaaaaa-2222-4000-8000-000000000003'),
  'dm', 'the REQUESTER is the DM of the approved campaign');
select is(
  (select count(*) from public.campaign_members m join public.campaigns c on c.id = m.campaign_id where c.slug = 'alpha-camp'),
  1::bigint, 'the approving owner is not a member of it');
select is(
  (select c.created_by from public.campaigns c where c.slug = 'alpha-camp'), 'aaaaaaaa-2222-4000-8000-000000000003'::uuid,
  'created_by is the requester');
select is(
  (select (select count(*) from public.game_pot p join public.campaigns c on c.id = p.campaign_id where c.slug = 'alpha-camp')
        + (select count(*) from public.campaign_config k join public.campaigns c on c.id = k.campaign_id where c.slug = 'alpha-camp' and k.key = 'loteria')),
  2::bigint, 'game_pot and the lottery config are seeded');
select is(
  (select concat_ws('|', r.status, r.decided_by::text, (r.decided_at is not null)::text, (r.campaign_id = c.id)::text)
     from public.campaign_requests r join public.campaigns c on c.slug = 'alpha-camp' where r.name = 'Req Alpha'),
  'approved|aaaaaaaa-2222-4000-8000-000000000001|true|true', 'the request records the decision and the campaign');

select tests.as_user('aaaaaaaa-2222-4000-8000-000000000002');
select throws_ok(
  $$select public.approve_campaign_request(tests.rid('Req Alpha'))$$, 'P0001', 'request_not_pending',
  'a second approval (even by another owner) is refused');
select throws_ok(
  $$select public.reject_campaign_request(tests.rid('Req Alpha'))$$, 'P0001', 'request_not_pending',
  'an approved request cannot be rejected');
select throws_ok(
  $$select public.approve_campaign_request(987654321)$$, 'P0001', 'request_not_found', 'an unknown request is refused');

-- slug conflict keeps the request pending; overriding the slug then works
select throws_ok(
  $$select public.approve_campaign_request(tests.rid('Req Beta'), 'alpha-camp')$$, '23505', 'slug_taken',
  'approve with a taken slug fails with slug_taken');
select is(
  (select status from public.campaign_requests where name = 'Req Beta'), 'pending',
  'a failed approval leaves the request pending');
select throws_ok(
  $$select public.approve_campaign_request(tests.rid('Req Beta'))$$, '23514', 'invalid_slug',
  'approve without any slug (none was requested) is refused');
select throws_ok(
  $$select public.approve_campaign_request(tests.rid('Req Beta'), 'login')$$, 'P0001', 'reserved_slug',
  'approve with a reserved slug is refused');
select is(
  (select public.approve_campaign_request(tests.rid('Req Beta'), ' Beta-Camp ', ' Beta Renamed ')), 'beta-camp',
  'the owner can override the slug and the name');
select tests.as_postgres();
select is((select name from public.campaigns where slug = 'beta-camp'), 'Beta Renamed', 'the override name is used');
select tests.as_user('aaaaaaaa-2222-4000-8000-000000000002');

------------------------------------------------------------------------------
-- Reject
------------------------------------------------------------------------------
select lives_ok($$select public.reject_campaign_request(tests.rid('Req Delta'), '  no por ahora ')$$, 'a hub owner can reject');
-- decided_by is not readable through the API (H15b): read it as postgres
select tests.as_postgres();
select is(
  (select concat_ws('|', status, decision_note, decided_by::text) from public.campaign_requests where name = 'Req Delta'),
  'rejected|no por ahora|aaaaaaaa-2222-4000-8000-000000000002', 'the rejection records note and decider');
select tests.as_user('aaaaaaaa-2222-4000-8000-000000000002');
select throws_ok(
  $$select public.approve_campaign_request(tests.rid('Req Delta'), 'delta-camp')$$, 'P0001', 'request_not_pending',
  'a rejected request cannot be approved');

select tests.as_user('aaaaaaaa-2222-4000-8000-000000000003');
delete from public.campaign_requests where name = 'Req Delta';
select is(tests.exists_req('Req Delta'), true, 'a decided request cannot be cancelled by the requester');
select is((select status from public.campaign_requests where name = 'Req Delta'), 'rejected', 'the requester sees the rejection');

select * from finish();
rollback;
