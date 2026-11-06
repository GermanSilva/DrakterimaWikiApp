-- pgTAP: G8a of the system-agnostic campaigns (odd/tasks/system-agnostic.md S25, S32, S4, S5). HIGH RISK: new table, RLS,
-- SECURITY DEFINER RPCs and membership/campaign triggers.
--   Part 1: structure and privileges (RLS, no direct writes, internal helpers not callable).
--   Part 2: branch_system (a DM of that campaign only), visibility per role, rename.
--   Part 3: hub owner: create origin from a campaign, promote a homebrew, archive/unarchive, nothing is deleted.
--   Part 4: campaign requests with a base system: checked at request time and at approval time, the campaign gets a COPY
--           (not a link); a request without a base behaves as before (compared with a never-edited fixture campaign).
--   Part 5: frozen copies: DM demoted / removed / campaign deleted -> one frozen copy for that user (template only, no duplicates),
--           players and deleted accounts get none.
-- Self-contained fixture, rolled back at the end.
begin;

select plan(155);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
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

-- ids by fixture name, whoever is asking
create function tests.sid(n text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.systems where name = n;
$$;

create function tests.rid(n text) returns bigint language sql security definer set search_path = '' as $$
  select id from public.campaign_requests where name = n;
$$;

-- the (only) frozen copy of a user, whoever is asking
create function tests.fid(u uuid) returns uuid language sql security definer set search_path = '' as $$
  select id from public.systems where kind = 'frozen' and owner_id = u;
$$;

-- how many systems of a kind / with a name the CALLER sees (RLS applies: these are invoker functions)
create function tests.seen(p_kind text) returns bigint language sql as $$
  select count(*) from public.systems where kind = p_kind;
$$;

create function tests.seen_name(p_name text) returns bigint language sql as $$
  select count(*) from public.systems where name = p_name;
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture (as postgres)
--   1 o : hub owner   2 a, 3 b : DMs of C1   4 p : player of C1   5 x : outsider   6 r : requester
--   7 d : extra DM of C1 (removed later)   8 e : extra DM of C2 (account deleted later)
--   C1 'sys-c1' has a customised system_profile (mapas off); C2 'sys-c2' keeps the column default (never edited).
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-3300-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'sys-u' || n || '@example.test', json_build_object('full_name', 'Sys User ' || n)::jsonb
from generate_series(1, 8) as n;

insert into public.hub_owners (user_id) values ('aaaaaaaa-3300-4000-8000-000000000001');

insert into public.campaigns (id, slug, name, created_by) values
  ('bbbbbbbb-3300-4000-8000-000000000001', 'sys-c1', 'Sys C1', 'aaaaaaaa-3300-4000-8000-000000000002'),
  ('bbbbbbbb-3300-4000-8000-000000000002', 'sys-c2', 'Sys C2', 'aaaaaaaa-3300-4000-8000-000000000003');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('bbbbbbbb-3300-4000-8000-000000000001', 'aaaaaaaa-3300-4000-8000-000000000002', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000001', 'aaaaaaaa-3300-4000-8000-000000000003', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000001', 'aaaaaaaa-3300-4000-8000-000000000004', 'player'),
  ('bbbbbbbb-3300-4000-8000-000000000001', 'aaaaaaaa-3300-4000-8000-000000000007', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000002', 'aaaaaaaa-3300-4000-8000-000000000003', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000002', 'aaaaaaaa-3300-4000-8000-000000000008', 'dm');
update public.campaigns set system_profile = jsonb_set(system_profile, '{modules,mapas}', 'false')
where id = 'bbbbbbbb-3300-4000-8000-000000000001';

create temp table base as select system_profile as c2_default from public.campaigns where slug = 'sys-c2';
grant select on base to authenticated;

------------------------------------------------------------------------------
-- Part 1: structure and privileges
------------------------------------------------------------------------------
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.systems'::regclass), 'RLS is enabled on systems');
select ok(
  has_table_privilege('authenticated', 'public.systems', 'select')
  and not has_table_privilege('authenticated', 'public.systems', 'insert')
  and not has_table_privilege('authenticated', 'public.systems', 'update')
  and not has_table_privilege('authenticated', 'public.systems', 'delete')
  and not has_table_privilege('anon', 'public.systems', 'select'),
  'systems: authenticated can only select (every write goes through an RPC); anon nothing');
select ok(
  has_column_privilege('authenticated', 'public.campaign_requests', 'system_id', 'insert')
  and has_column_privilege('authenticated', 'public.campaign_requests', 'system_id', 'select')
  and not has_column_privilege('authenticated', 'public.campaign_requests', 'system_id', 'update'),
  'campaign_requests.system_id is insertable and readable by the requester, never updatable');
select ok(
  (select bool_and(p.prosecdef and p.proconfig = array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.branch_system(uuid, text)'::regprocedure, 'public.rename_system(uuid, text)'::regprocedure,
                    'public.create_origin_from_campaign(uuid, text)'::regprocedure, 'public.promote_system(uuid, text)'::regprocedure,
                    'public.archive_system(uuid, boolean)'::regprocedure, 'public.system_usable_by(uuid)'::regprocedure,
                    'public.freeze_campaign_system(uuid, uuid)'::regprocedure)),
  'every new function is SECURITY DEFINER with an empty search_path');
select ok(
  has_function_privilege('authenticated', 'public.branch_system(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.rename_system(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_origin_from_campaign(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.promote_system(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.archive_system(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.branch_system(uuid, text)', 'execute')
  and not has_function_privilege('public', 'public.branch_system(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.archive_system(uuid, boolean)', 'execute'),
  'the RPCs are callable by authenticated only');
select ok(
  not has_function_privilege('authenticated', 'public.freeze_campaign_system(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.freeze_campaign_system(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.system_usable_by(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.system_template(jsonb)', 'execute'),
  'the freezing helper, the two-argument usability check and the template helper are not callable through the API');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0::bigint, 'anon can execute no function of the public schema');
select is(
  public.system_template('{"version":1,"sheet":{"discarded":[{"x":1}],"sections":[]}}'::jsonb),
  '{"version":1,"sheet":{"sections":[]}}'::jsonb,
  'system_template drops the discarded list and keeps the rest');
select is(
  public.system_template('{"version":1}'::jsonb), '{"version":1}'::jsonb, 'system_template leaves a document without a sheet untouched');

------------------------------------------------------------------------------
-- Part 2: branch_system, visibility, rename
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000002');  -- a
select lives_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000001', '  Variante de A  ')$$, 'a DM branches a homebrew from their campaign');
select tests.as_postgres();
select results_eq(
  $$select s.kind, s.owner_id, s.campaign_id, s.name, s.archived_at is null, s.document = c.system_profile, s.branched_from is null
      from public.systems s, public.campaigns c where s.name = 'Variante de A' and c.slug = 'sys-c1'$$,
  $$values ('homebrew'::text, 'aaaaaaaa-3300-4000-8000-000000000002'::uuid, 'bbbbbbbb-3300-4000-8000-000000000001'::uuid, 'Variante de A', true, true, true)$$,
  'the homebrew is owned by the DM, tied to the campaign, trimmed, and holds a copy of its current system_profile (no lineage: the campaign has no base)');

select tests.as_user('aaaaaaaa-3300-4000-8000-000000000004');  -- p (player)
select throws_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000001', 'Jugador')$$, '42501', 'dm_only', 'a player cannot branch');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000005');  -- x (outsider)
select throws_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000001', 'Intruso')$$, '42501', 'dm_only', 'an outsider cannot branch');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000002');  -- a
select throws_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000002', 'Ajena')$$, '42501', 'dm_only', 'a DM of C1 cannot branch from C2');
select throws_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000001', '   ')$$, '23514', 'invalid_name', 'a blank name is refused');
select throws_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000001', repeat('x', 121))$$, '23514', 'invalid_name', 'a name over 120 characters is refused');
select tests.as_postgres();
select is((select count(*) from public.systems), 1::bigint, 'the refused calls created nothing');

-- an origin and an archived origin, created by the fixture (the hub owner path is tested in part 3)
insert into public.systems (name, document, kind) values
  ('Origen Uno', (select system_profile from public.campaigns where slug = 'sys-c2'), 'origin'),
  ('Origen Archivado', jsonb_set((select system_profile from public.campaigns where slug = 'sys-c2'), '{modules,juegos}', 'false'), 'origin');
update public.systems set archived_at = now() where name = 'Origen Archivado';

select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');  -- b (co-DM of C1)
select is(tests.seen_name('Variante de A'), 1::bigint, 'a co-DM of the campaign sees the homebrew branched from it');
select is(tests.seen('origin'), 1::bigint, 'a DM sees the non-archived origin only');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000004');  -- p
select is(tests.seen_name('Variante de A'), 0::bigint, 'a player does not see the homebrew');
select is(tests.seen('origin'), 1::bigint, 'any signed-in user lists the non-archived origins (they need them to request a campaign)');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000005');  -- x
select is(tests.seen_name('Variante de A'), 0::bigint, 'an outsider does not see the homebrew');
select is(tests.seen_name('Origen Archivado'), 0::bigint, 'an outsider does not see an archived origin');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000008');  -- e (DM of C2 only)
select is(tests.seen_name('Variante de A'), 0::bigint, 'a DM of another campaign does not see it');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');  -- o (hub owner)
select is((select count(*) from public.systems), 3::bigint, 'the hub owner sees every system, archived included');
select tests.as_anon();
select throws_ok($$select count(*) from public.systems$$, '42501', null, 'anon cannot read systems');

select tests.as_user('aaaaaaaa-3300-4000-8000-000000000002');  -- a
select throws_ok($$insert into public.systems (name, document, kind) values ('X', '{"version":1}', 'origin')$$, '42501', null, 'no direct insert');
select throws_ok($$update public.systems set name = 'Hack'$$, '42501', null, 'no direct update');
select throws_ok($$delete from public.systems$$, '42501', null, 'no direct delete');

select lives_ok($$select public.rename_system(tests.sid('Variante de A'), 'Variante renombrada')$$, 'the owner renames their homebrew');
select is(tests.seen_name('Variante renombrada'), 1::bigint, 'the new name is stored');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');  -- b: sees it, does not own it
select throws_ok($$select public.rename_system(tests.sid('Variante renombrada'), 'Robada')$$, '42501', 'system_owner_only', 'a co-DM who does not own the homebrew cannot rename it');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000005');  -- x: does not see it
select throws_ok($$select public.rename_system(tests.sid('Variante renombrada'), 'Robada')$$, 'P0001', 'system_not_found', 'a user who cannot see a system gets system_not_found');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000002');
select throws_ok($$select public.rename_system(tests.sid('Origen Uno'), 'Mío')$$, '42501', 'system_owner_only', 'nobody but the hub owner renames an origin');
select throws_ok($$select public.rename_system(tests.sid('Variante renombrada'), '')$$, '23514', 'invalid_name', 'rename refuses a blank name');

------------------------------------------------------------------------------
-- Part 3: hub owner
------------------------------------------------------------------------------
select throws_ok($$select public.create_origin_from_campaign('bbbbbbbb-3300-4000-8000-000000000001', 'Falso')$$, '42501', 'hub_owner_only', 'a DM cannot create an origin');
select throws_ok($$select public.promote_system(tests.sid('Variante renombrada'), null)$$, '42501', 'hub_owner_only', 'a DM cannot promote');
select throws_ok($$select public.archive_system(tests.sid('Origen Uno'), true)$$, '42501', 'hub_owner_only', 'a DM cannot archive');

select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');  -- o
select lives_ok($$select public.create_origin_from_campaign('bbbbbbbb-3300-4000-8000-000000000001', 'Origen desde C1')$$, 'the hub owner creates an origin from a campaign');
select tests.as_postgres();
select results_eq(
  $$select s.kind, s.owner_id is null, s.campaign_id, s.document = c.system_profile from public.systems s, public.campaigns c
     where s.name = 'Origen desde C1' and c.slug = 'sys-c1'$$,
  $$values ('origin'::text, true, 'bbbbbbbb-3300-4000-8000-000000000001'::uuid, true)$$,
  'the origin has no owner, remembers the campaign it came from and copies its document');

select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select lives_ok($$select public.promote_system(tests.sid('Variante renombrada'), 'Homebrew oficial')$$, 'the hub owner promotes a homebrew');
select tests.as_postgres();
select results_eq(
  $$select s.kind, s.owner_id is null, s.branched_from = h.id, s.document = h.document
      from public.systems s, public.systems h where s.name = 'Homebrew oficial' and h.name = 'Variante renombrada'$$,
  $$values ('origin'::text, true, true, true)$$,
  'promotion makes a NEW origin that records the homebrew as its lineage and copies its document');
select is((select kind from public.systems where name = 'Variante renombrada'), 'homebrew', 'the promoted homebrew itself is untouched');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select throws_ok($$select public.promote_system(tests.sid('Origen Uno'), null)$$, 'P0001', 'invalid_system_kind', 'an origin cannot be promoted again');
select throws_ok($$select public.promote_system('11111111-1111-4000-8000-111111111111', null)$$, 'P0001', 'system_not_found', 'promoting an unknown system');

select lives_ok($$select public.archive_system(tests.sid('Origen Uno'), true)$$, 'the hub owner archives an origin');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000005');
select is(tests.seen_name('Origen Uno'), 0::bigint, 'an archived origin disappears for everybody else');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select is(tests.seen_name('Origen Uno'), 1::bigint, 'but the hub owner still sees it');
select lives_ok($$select public.archive_system(tests.sid('Origen Uno'), false)$$, 'and can unarchive it');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000005');
select is(tests.seen_name('Origen Uno'), 1::bigint, 'an unarchived origin is back');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select throws_ok($$delete from public.systems where name = 'Origen Uno'$$, '42501', null, 'not even the hub owner deletes a system through the API');

------------------------------------------------------------------------------
-- Part 4: requests with a base system
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000006');  -- r
select lives_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-origen', 'sys-q-origen', tests.sid('Origen Uno'))$$,
  'a requester picks a non-archived origin as the base');
select throws_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-archivado', 'sys-q-arch', tests.sid('Origen Archivado'))$$,
  'P0001', 'system_not_available', 'an archived origin cannot be the base');
select throws_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-ajeno', 'sys-q-ajeno', tests.sid('Variante renombrada'))$$,
  'P0001', 'system_not_available', 'a homebrew of a campaign the requester does not DM cannot be the base');
select throws_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-fantasma', 'sys-q-fant', '11111111-1111-4000-8000-111111111111')$$,
  'P0001', 'system_not_available', 'an unknown system id is refused');
select lives_ok($$insert into public.campaign_requests (name, slug_wanted) values ('q-sin-base', 'sys-q-plain')$$, 'a request without a base is unchanged');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000002');  -- a
select lives_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-homebrew', 'sys-q-home', tests.sid('Variante renombrada'))$$,
  'a DM can pick the homebrew of a campaign they DM');
select is((select system_id from public.campaign_requests where name = 'q-homebrew'), tests.sid('Variante renombrada'), 'the request stores the chosen base');

select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');  -- o
select is(public.approve_campaign_request(tests.rid('q-origen')), 'sys-q-origen', 'approval with a base returns the slug');
select tests.as_postgres();
select results_eq(
  $$select c.system_profile = s.document, c.based_on_system = s.id, (select role from public.campaign_members m where m.campaign_id = c.id)
      from public.campaigns c, public.systems s where c.slug = 'sys-q-origen' and s.name = 'Origen Uno'$$,
  $$values (true, true, 'dm'::text)$$,
  'the new campaign holds a COPY of the base document, records it as its base, and the requester is DM');
update public.systems set document = jsonb_set(document, '{modules,calendario}', 'false') where name = 'Origen Uno';
select is(
  (select system_profile #>> '{modules,calendario}' from public.campaigns where slug = 'sys-q-origen'), 'true',
  'copy, not link: changing the origin afterwards never alters the campaign (S4)');

-- request without a base: exactly the old behaviour (compared with the never-edited fixture campaign)
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select is(public.approve_campaign_request(tests.rid('q-sin-base')), 'sys-q-plain', 'approval without a base returns the slug');
select tests.as_postgres();
select results_eq(
  $$select c.system_profile = (select c2_default from base), c.based_on_system is null, c.system,
            (select count(*) from public.campaign_members m where m.campaign_id = c.id),
            (select count(*) from public.game_pot g where g.campaign_id = c.id)
      from public.campaigns c where c.slug = 'sys-q-plain'$$,
  $$values (true, true, 'dnd5e'::text, 1::bigint, 1::bigint)$$,
  'without a base the campaign gets the column default, no base, one DM and its pot');
select is((select status from public.campaign_requests where name = 'q-sin-base'), 'approved', 'and the request is approved');

-- approval re-checks the base: archived origin
insert into public.systems (name, document, kind) values ('Origen Tres', (select c2_default from base), 'origin');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000006');
select lives_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-tres', 'sys-q-tres', tests.sid('Origen Tres'))$$, 'a request on a fresh origin');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select lives_ok($$select public.archive_system(tests.sid('Origen Tres'), true)$$, 'the origin is archived while the request waits');
select throws_ok($$select public.approve_campaign_request(tests.rid('q-tres'))$$, 'P0001', 'system_not_available', 'approval refuses an origin archived meanwhile');
select tests.as_postgres();
select is((select status || ':' || (campaign_id is null)::text from public.campaign_requests where name = 'q-tres'), 'pending:true', 'the refused request stays pending and no campaign was created');
select is((select count(*) from public.campaigns where slug = 'sys-q-tres'), 0::bigint, 'no campaign exists for it');

------------------------------------------------------------------------------
-- Part 5: frozen copies
------------------------------------------------------------------------------
select is((select count(*) from public.systems where kind = 'frozen'), 0::bigint, 'no frozen copy so far');

-- demotion: b demotes a (the campaign has other DMs)
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');
select lives_ok($$update public.campaign_members set role = 'player' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000001' and user_id = 'aaaaaaaa-3300-4000-8000-000000000002'$$,
  'a DM is demoted');
select tests.as_postgres();
select results_eq(
  $$select s.owner_id, s.campaign_id, s.document = c.system_profile, s.archived_at is null
      from public.systems s, public.campaigns c where s.kind = 'frozen' and c.slug = 'sys-c1'$$,
  $$values ('aaaaaaaa-3300-4000-8000-000000000002'::uuid, 'bbbbbbbb-3300-4000-8000-000000000001'::uuid, true, true)$$,
  'a frozen copy of the campaign system was created for the demoted DM, from that campaign');
select is((select count(*) from public.systems where kind = 'frozen' and document #> '{sheet,discarded}' is not null), 0::bigint, 'the frozen copy holds the template only');

select tests.as_user('aaaaaaaa-3300-4000-8000-000000000002');
select is(tests.seen('frozen'), 1::bigint, 'the former DM sees their frozen copy');
select is(tests.seen_name('Variante renombrada'), 0::bigint, 'and no longer sees the homebrew of a campaign they stopped managing');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');
select is(tests.seen('frozen'), 0::bigint, 'other DMs do not see it');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000004');
select is(tests.seen('frozen'), 0::bigint, 'a player does not see it');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select is(tests.seen('frozen'), 1::bigint, 'the hub owner sees it');

-- no duplicates: re-promote and demote again with the same document
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');
select lives_ok($$update public.campaign_members set role = 'dm' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000001' and user_id = 'aaaaaaaa-3300-4000-8000-000000000002'$$, 'promoted back');
select lives_ok($$update public.campaign_members set role = 'player' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000001' and user_id = 'aaaaaaaa-3300-4000-8000-000000000002'$$, 'demoted again');
select tests.as_postgres();
select is((select count(*) from public.systems where kind = 'frozen'), 1::bigint, 'an identical frozen copy from the same campaign is not duplicated');

-- a request can use the user's own frozen copy, not somebody else's
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000002');
select lives_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-congelado', 'sys-q-frozen', (select id from public.systems where kind = 'frozen'))$$,
  'the owner of a frozen copy can use it as a base');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');
select throws_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-robo', 'sys-q-robo', tests.fid('aaaaaaaa-3300-4000-8000-000000000002'))$$,
  'P0001', 'system_not_available', 'but nobody else can (they do not even see it)');
-- the earlier homebrew request of a: a is not a DM of C1 anymore, so approval refuses it
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select throws_ok($$select public.approve_campaign_request(tests.rid('q-homebrew'))$$, 'P0001', 'system_not_available',
  'approval refuses a homebrew whose campaign the requester no longer DMs');
select is(public.approve_campaign_request(tests.rid('q-congelado')), 'sys-q-frozen', 'approval of the frozen base works');
select tests.as_postgres();
select results_eq(
  $$select c.system_profile = f.document, c.based_on_system = f.id from public.campaigns c, public.systems f where c.slug = 'sys-q-frozen' and f.kind = 'frozen'$$,
  $$values (true, true)$$, 'the campaign copied the frozen document');

-- the campaign keeps evolving: a changed document + another demotion gives a second, different frozen copy
update public.campaigns set system_profile = jsonb_set(system_profile, '{modules,juegos}', 'false') where slug = 'sys-c1';
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');
select lives_ok($$update public.campaign_members set role = 'dm' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000001' and user_id = 'aaaaaaaa-3300-4000-8000-000000000002'$$, 'promoted again');
select lives_ok($$update public.campaign_members set role = 'player' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000001' and user_id = 'aaaaaaaa-3300-4000-8000-000000000002'$$, 'demoted again after the campaign evolved');
select tests.as_postgres();
select is((select count(*) from public.systems where kind = 'frozen' and owner_id = 'aaaaaaaa-3300-4000-8000-000000000002'), 2::bigint, 'a different document gives a new frozen copy');

-- removal of a DM (as postgres)
select lives_ok($$delete from public.campaign_members where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000001' and user_id = 'aaaaaaaa-3300-4000-8000-000000000007'$$, 'a DM is removed');
select is((select count(*) from public.systems where kind = 'frozen' and owner_id = 'aaaaaaaa-3300-4000-8000-000000000007'), 1::bigint, 'the removed DM got a frozen copy');
-- a player leaving gets none
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000004');
select lives_ok($$delete from public.campaign_members where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000001' and user_id = 'aaaaaaaa-3300-4000-8000-000000000004'$$, 'a player leaves');
select tests.as_postgres();
select is((select count(*) from public.systems where kind = 'frozen' and owner_id = 'aaaaaaaa-3300-4000-8000-000000000004'), 0::bigint, 'a player gets no frozen copy');
-- the last-DM rule still holds and freezes nothing (b is now the only DM of C1)
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');
select throws_ok($$update public.campaign_members set role = 'player' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000001' and user_id = 'aaaaaaaa-3300-4000-8000-000000000003'$$,
  '23514', null, 'the only DM of a campaign still cannot be demoted');
select tests.as_postgres();
select is((select count(*) from public.systems where kind = 'frozen' and owner_id = 'aaaaaaaa-3300-4000-8000-000000000003'), 0::bigint, 'and the refused demotion froze nothing');

-- account deletion of a (non-last) DM must keep working and leaves no orphan
select lives_ok($$delete from auth.users where id = 'aaaaaaaa-3300-4000-8000-000000000008'$$, 'deleting the account of a non-last DM still works');
select is((select count(*) from public.systems where owner_id = 'aaaaaaaa-3300-4000-8000-000000000008'), 0::bigint, 'no frozen copy is created for a deleted account');

-- campaign deletion: b (last DM of C1) deletes it
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');
select lives_ok($$select public.delete_campaign('bbbbbbbb-3300-4000-8000-000000000001', 'sys-c1')$$, 'the DM deletes the campaign');
select tests.as_postgres();
select results_eq(
  $$select s.owner_id, s.campaign_id is null, s.document = jsonb_set(jsonb_set((select c2_default from base), '{modules,mapas}', 'false'), '{modules,juegos}', 'false')
      from public.systems s where s.kind = 'frozen' and s.owner_id = 'aaaaaaaa-3300-4000-8000-000000000003'$$,
  $$values ('aaaaaaaa-3300-4000-8000-000000000003'::uuid, true, true)$$,
  'deleting the campaign froze its final template for the DM who deleted it (the link to the gone campaign is cleared)');
select is((select count(*) from public.systems where kind = 'frozen'), 4::bigint, 'former DMs keep their earlier copies: a twice, d, and b (the deleting DM)');
select is((select count(*) from public.systems where name = 'Variante renombrada' and campaign_id is null), 1::bigint,
  'the homebrew of the deleted campaign survives, detached, and is not deleted');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');
select is(tests.seen_name('Variante renombrada'), 0::bigint, 'a detached homebrew is not visible to a DM');
select is(tests.seen('frozen'), 1::bigint, 'the DM sees exactly their own frozen copy');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select is(tests.seen_name('Variante renombrada'), 1::bigint, 'the hub owner still sees the detached homebrew');

------------------------------------------------------------------------------
-- Part 6: fix round 1 (independent verify)
--   users 9 d (DM of C3, account deleted later)   11, 12 DMs of C4 (invalid legacy document)
--   13 DM of C5 (homebrew cap)   14, 15 DMs of C7 (frozen cap)   16 player of C3
------------------------------------------------------------------------------
select tests.as_postgres();
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-3300-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'sys-u' || n || '@example.test', json_build_object('full_name', 'Sys User ' || n)::jsonb
from generate_series(9, 16) as n;
insert into public.campaigns (id, slug, name, created_by) values
  ('bbbbbbbb-3300-4000-8000-000000000013', 'sys-c3', 'Sys C3', 'aaaaaaaa-3300-4000-8000-000000000009'),
  ('bbbbbbbb-3300-4000-8000-000000000014', 'sys-c4', 'Sys C4', 'aaaaaaaa-3300-4000-8000-000000000011'),
  ('bbbbbbbb-3300-4000-8000-000000000015', 'sys-c5', 'Sys C5', 'aaaaaaaa-3300-4000-8000-000000000013'),
  ('bbbbbbbb-3300-4000-8000-000000000017', 'sys-c7', 'Sys C7', 'aaaaaaaa-3300-4000-8000-000000000014');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('bbbbbbbb-3300-4000-8000-000000000013', 'aaaaaaaa-3300-4000-8000-000000000009', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000013', 'aaaaaaaa-3300-4000-8000-000000000003', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000013', 'aaaaaaaa-3300-4000-8000-000000000016', 'player'),
  ('bbbbbbbb-3300-4000-8000-000000000014', 'aaaaaaaa-3300-4000-8000-000000000011', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000014', 'aaaaaaaa-3300-4000-8000-000000000012', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000015', 'aaaaaaaa-3300-4000-8000-000000000013', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000017', 'aaaaaaaa-3300-4000-8000-000000000014', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000017', 'aaaaaaaa-3300-4000-8000-000000000015', 'dm');

-- 1. a chosen base never silently turns into the default document
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000009');
select lives_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000013', 'HB-R')$$, 'd branches a homebrew');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000003');
select lives_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-hbr', 'sys-q-hbr', tests.sid('HB-R'))$$,
  'the co-DM requests a campaign on it');
select tests.as_postgres();
select lives_ok($$delete from auth.users where id = 'aaaaaaaa-3300-4000-8000-000000000009'$$, 'the account of the homebrew owner is deleted (its systems go with it)');
select is((select count(*) from public.systems where name = 'HB-R'), 0::bigint, 'the homebrew is gone');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select throws_ok($$select public.approve_campaign_request(tests.rid('q-hbr'))$$, 'P0001', 'system_not_available',
  'approval refuses a request whose chosen base no longer exists (never the default document instead)');
select tests.as_postgres();
select is((select status from public.campaign_requests where name = 'q-hbr'), 'pending', 'and the request stays pending');

-- 2. only a document that validates is frozen
update public.campaigns set system_profile = '{"version":1,"junk":"x"}'::jsonb where slug = 'sys-c4';
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000012');
select lives_ok($$update public.campaign_members set role = 'player' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000014' and user_id = 'aaaaaaaa-3300-4000-8000-000000000011'$$,
  'demoting a DM of a campaign with an invalid legacy document still works');
select tests.as_postgres();
select is((select count(*) from public.systems where owner_id = 'aaaaaaaa-3300-4000-8000-000000000011'), 0::bigint, 'and no frozen copy is stored for an invalid document');

-- 3. the homebrew cap counts only what the owner can still reach
insert into public.systems (name, document, kind, owner_id)
select 'orfano ' || n, (select c2_default from base), 'homebrew', 'aaaaaaaa-3300-4000-8000-000000000013' from generate_series(1, 50) n;
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000013');
select lives_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000015', 'Nuevo c5')$$, '50 detached homebrew do not count against the cap');
select tests.as_postgres();
insert into public.systems (name, document, kind, campaign_id, owner_id)
select 'ligado ' || n, (select c2_default from base), 'homebrew', 'bbbbbbbb-3300-4000-8000-000000000015', 'aaaaaaaa-3300-4000-8000-000000000013' from generate_series(1, 49) n;
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000013');
select throws_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000015', 'De mas')$$, 'P0001', 'systems_limit_reached',
  '50 homebrew attached to campaigns they DM reach the cap');

-- 4. frozen copies are bounded per user (the oldest are dropped; the removal itself never fails)
select tests.as_postgres();
insert into public.systems (name, document, kind, owner_id, created_at)
select 'viejo ' || n, (select c2_default from base), 'frozen', 'aaaaaaaa-3300-4000-8000-000000000014', now() - (n || ' days')::interval from generate_series(1, 30) n;
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000015');
select lives_ok($$update public.campaign_members set role = 'player' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000017' and user_id = 'aaaaaaaa-3300-4000-8000-000000000014'$$,
  'demoting a DM who already holds 30 frozen copies works');
select tests.as_postgres();
select is((select count(*) from public.systems where kind = 'frozen' and owner_id = 'aaaaaaaa-3300-4000-8000-000000000014'), 30::bigint, 'the user still holds 30 frozen copies');
select is((select count(*) from public.systems where name = 'viejo 30'), 0::bigint, 'the oldest one was dropped');
select is((select count(*) from public.systems where kind = 'frozen' and owner_id = 'aaaaaaaa-3300-4000-8000-000000000014' and campaign_id = 'bbbbbbbb-3300-4000-8000-000000000017'), 1::bigint, 'and the new one is kept');

-- a player cannot forge a frozen copy by promoting themselves and leaving
create function tests.try(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
exception when others then
  null;
end;
$$;
grant execute on function tests.try(text) to authenticated;
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000016');
select tests.try($$update public.campaign_members set role = 'dm' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000013' and user_id = 'aaaaaaaa-3300-4000-8000-000000000016'$$);
select tests.as_postgres();
select is((select role from public.campaign_members where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000013' and user_id = 'aaaaaaaa-3300-4000-8000-000000000016'), 'player', 'a player cannot promote themselves');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000016');
select tests.try($$delete from public.campaign_members where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000013' and user_id = 'aaaaaaaa-3300-4000-8000-000000000016'$$);
select tests.as_postgres();
select is((select count(*) from public.systems where owner_id = 'aaaaaaaa-3300-4000-8000-000000000016'), 0::bigint, 'and leaving afterwards forges no frozen copy');

-- an approved campaign keeps its copy whatever happens to the source
insert into public.systems (name, document, kind) values ('Origen Cuatro', (select c2_default from base), 'origin');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000006');
select lives_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-cuatro', 'sys-q-cuatro', tests.sid('Origen Cuatro'))$$, 'a request on a fourth origin');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select is(public.approve_campaign_request(tests.rid('q-cuatro')), 'sys-q-cuatro', 'approved');
select tests.as_postgres();
update public.systems set document = jsonb_set(document, '{modules,mapas}', 'false'), archived_at = now() where name = 'Origen Cuatro';
select results_eq(
  $$select c.system_profile = (select c2_default from base), c.based_on_system = s.id from public.campaigns c, public.systems s where c.slug = 'sys-q-cuatro' and s.name = 'Origen Cuatro'$$,
  $$values (true, true)$$, 'the campaign keeps its copy and its lineage after the source is edited and archived');

------------------------------------------------------------------------------
-- Part 7: G8a-2 (S38) systems carry the SHARED action entries of the campaign, never the private ones
--   users 17, 18 DMs of C8 (sheet + actions), 19 player of C8 owning pj 99001; C9 (DM 18) holds 210 shared entries
------------------------------------------------------------------------------
select tests.as_postgres();
create function tests.sheet8() returns jsonb language sql stable as $$
  select $sheet${
    "categories": [{"key": "c", "label": "C", "sections": [
      {"key": "alpha", "label": "Alpha", "items": [
        {"kind": "table", "type": "habilidad", "key": "hechizos", "label": "Hechizos", "editableBy": "player",
         "categories": [{"key": "truco", "label": "Truco"}, {"key": "nivel1", "label": "Nivel 1"}],
         "columns": [
          {"key": "escuela", "label": "Escuela", "type": "short", "editableBy": "player", "scope": "entry"},
          {"key": "preparado", "label": "Preparado", "type": "boolean", "editableBy": "player", "scope": "character"}]},
        {"kind": "table", "type": "habilidad", "key": "rasgos", "label": "Rasgos", "editableBy": "dm",
         "columns": [{"key": "fuente", "label": "Fuente", "type": "short", "editableBy": "dm"}]}
      ], "blocks": []}]}],
    "roles": {}
  }$sheet$::jsonb;
$$;
grant execute on function tests.sheet8() to authenticated;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-3300-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'sys-u' || n || '@example.test', json_build_object('full_name', 'Sys User ' || n)::jsonb
from generate_series(17, 19) as n;
insert into public.campaigns (id, slug, name, created_by) values
  ('bbbbbbbb-3300-4000-8000-000000000018', 'sys-c8', 'Sys C8', 'aaaaaaaa-3300-4000-8000-000000000017'),
  ('bbbbbbbb-3300-4000-8000-000000000019', 'sys-c9', 'Sys C9', 'aaaaaaaa-3300-4000-8000-000000000018');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('bbbbbbbb-3300-4000-8000-000000000018', 'aaaaaaaa-3300-4000-8000-000000000017', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000018', 'aaaaaaaa-3300-4000-8000-000000000018', 'dm'),
  ('bbbbbbbb-3300-4000-8000-000000000018', 'aaaaaaaa-3300-4000-8000-000000000019', 'player'),
  ('bbbbbbbb-3300-4000-8000-000000000019', 'aaaaaaaa-3300-4000-8000-000000000018', 'dm');
insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (99001, 'bbbbbbbb-3300-4000-8000-000000000018', 'aaaaaaaa-3300-4000-8000-000000000019', 'Pj acc');
update public.campaigns set system_profile = system_profile || jsonb_build_object('sheet', tests.sheet8()) where slug in ('sys-c8', 'sys-c9');
insert into public.campaign_actions (campaign_id, table_key, category, name, description, extras, private_to_pj, function) values
  ('bbbbbbbb-3300-4000-8000-000000000018', 'hechizos', 'truco', 'Luz', 'Una luz.', '{"escuela": "evocacion"}', null, '{"steps":[{"kind":"note"}]}'),
  ('bbbbbbbb-3300-4000-8000-000000000018', 'hechizos', 'nivel1', 'Escudo', '', '{}', null, null),
  ('bbbbbbbb-3300-4000-8000-000000000018', 'rasgos', '', 'Vision', '', '{"fuente": "elfo"}', null, null),
  ('bbbbbbbb-3300-4000-8000-000000000018', 'hechizos', 'truco', 'Mi truco', 'Privado.', '{}', 99001, '{"steps":[]}');
insert into public.campaign_actions (campaign_id, table_key, category, name)
select 'bbbbbbbb-3300-4000-8000-000000000019', 'hechizos', 'truco', 'bulk ' || n from generate_series(1, 210) n;

select ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'systems' and column_name = 'actions' and is_nullable = 'NO')
  and has_column_privilege('authenticated', 'public.campaign_requests', 'seeded_actions', 'select')
  and not has_column_privilege('authenticated', 'public.campaign_requests', 'seeded_actions', 'insert'),
  'systems.actions exists and the seeding counters of a request are readable, never writable');
select ok(
  not has_function_privilege('authenticated', 'public.system_capture_actions(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.system_seed_actions(uuid, jsonb, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.system_seed_actions(uuid, jsonb, uuid)', 'execute'),
  'the capture and seed helpers are not callable through the API');

-- capture on branch: shared entries only, the function travels
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000017');
select lives_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000018', 'HB-acc')$$, 'a DM branches a homebrew from a campaign with an action catalogue');
select tests.as_postgres();
select is((select jsonb_array_length(actions) from public.systems where name = 'HB-acc'), 3, 'the homebrew carries the three shared entries');
select is((select count(*) from public.systems s, jsonb_array_elements(s.actions) a where s.name = 'HB-acc' and a ->> 'name' = 'Mi truco'), 0::bigint, 'the entry private to a character never travels');
select is((select a -> 'function' from public.systems s, jsonb_array_elements(s.actions) a where s.name = 'HB-acc' and a ->> 'name' = 'Luz'), '{"steps":[{"kind":"note"}]}'::jsonb, 'the function of a shared entry travels');

-- capture on origin creation and promotion
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select lives_ok($$select public.create_origin_from_campaign('bbbbbbbb-3300-4000-8000-000000000018', 'Origin-acc')$$, 'the hub owner creates an origin from that campaign');
select lives_ok($$select public.promote_system(tests.sid('HB-acc'), 'Prom-acc')$$, 'and promotes the homebrew');
select tests.as_postgres();
select is((select jsonb_array_length(actions) from public.systems where name = 'Origin-acc'), 3, 'the origin carries the three shared entries');
select is((select actions = (select actions from public.systems where name = 'HB-acc') from public.systems where name = 'Prom-acc'), true, 'promotion copies the catalogue of the source');

-- capture on freeze (trigger path)
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000018');
select lives_ok($$update public.campaign_members set role = 'player' where campaign_id = 'bbbbbbbb-3300-4000-8000-000000000018' and user_id = 'aaaaaaaa-3300-4000-8000-000000000017'$$, 'a DM is demoted');
select tests.as_postgres();
select is((select jsonb_array_length(actions) from public.systems where kind = 'frozen' and owner_id = 'aaaaaaaa-3300-4000-8000-000000000017'), 3, 'the frozen copy carries the shared entries');
select is((select count(*) from public.systems s, jsonb_array_elements(s.actions) a where s.kind = 'frozen' and s.owner_id = 'aaaaaaaa-3300-4000-8000-000000000017' and a ->> 'name' = 'Mi truco'), 0::bigint, 'and never the private one');

-- bounds
select throws_ok($$insert into public.systems (name, document, kind, actions) values ('bad1', (select c2_default from base), 'origin', '{"a":1}')$$, '23514', null, 'actions must be an array');
select throws_ok($$insert into public.systems (name, document, kind, actions) select 'bad2', (select c2_default from base), 'origin', jsonb_agg(jsonb_build_object('table_key', 't', 'category', '', 'name', 'n' || i, 'description', '', 'extras', '{}'::jsonb, 'function', null)) from generate_series(1, 201) i$$, '23514', null, 'at most 200 entries');
select throws_ok($$insert into public.systems (name, document, kind, actions) values ('bad3', (select c2_default from base), 'origin', '[{"table_key":"t","category":"","description":"","extras":{}}]')$$, '23514', null, 'every entry needs the full shape');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000018');
select lives_ok($$select public.branch_system('bbbbbbbb-3300-4000-8000-000000000019', 'HB-bulk')$$, 'branching from a campaign with 210 shared entries still works');
select tests.as_postgres();
select is((select jsonb_array_length(actions) from public.systems where name = 'HB-bulk'), 200, 'and keeps the first 200');

-- visibility did not widen
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000019');
select is(tests.seen_name('HB-acc') + tests.seen('frozen') + tests.seen_name('HB-bulk'), 0::bigint, 'a player still sees no homebrew and no frozen copy (the catalogue is not a way in)');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000005');
select is(tests.seen_name('HB-acc') + tests.seen_name('HB-bulk'), 0::bigint, 'an outsider neither');

-- seeding on approval
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000006');
select lives_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-acc', 'sys-q-acc', tests.sid('Origin-acc'))$$, 'a request on the origin with a catalogue');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select is(public.approve_campaign_request(tests.rid('q-acc')), 'sys-q-acc', 'approved');
select tests.as_postgres();
select results_eq(
  $$select (select count(*) from public.campaign_actions a where a.campaign_id = c.id),
           (select count(*) from public.pj_action_links l where l.campaign_id = c.id),
           (select count(*) from public.campaign_actions a where a.campaign_id = c.id and a.created_by = 'aaaaaaaa-3300-4000-8000-000000000006'),
           r.seeded_actions, r.skipped_actions
      from public.campaigns c, public.campaign_requests r where c.slug = 'sys-q-acc' and r.name = 'q-acc'$$,
  $$values (3::bigint, 0::bigint, 3::bigint, 3, 0)$$,
  'the new campaign starts with the 3 shared entries, created by the requester, no links, and the request reports 3 seeded / 0 skipped');
select is((select a.function from public.campaign_actions a join public.campaigns c on c.id = a.campaign_id where c.slug = 'sys-q-acc' and a.name = 'Luz'), '{"steps":[{"kind":"note"}]}'::jsonb, 'the function was seeded too');
update public.systems set actions = '[]' where name = 'Origin-acc';
insert into public.campaign_actions (campaign_id, table_key, category, name) values ('bbbbbbbb-3300-4000-8000-000000000018', 'hechizos', 'truco', 'Nueva');
select is((select count(*) from public.campaign_actions a join public.campaigns c on c.id = a.campaign_id where c.slug = 'sys-q-acc'), 3::bigint, 'later edits to the source never propagate (copy, not link)');
insert into public.campaign_members (campaign_id, user_id, role) select id, 'aaaaaaaa-3300-4000-8000-000000000019', 'player' from public.campaigns where slug = 'sys-q-acc';
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000006');
select is((select count(*) from public.campaign_actions a join public.campaigns c on c.id = a.campaign_id where c.slug = 'sys-q-acc'), 3::bigint, 'the DM of the new campaign sees the seeded entries');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000019');
select is((select count(*) from public.campaign_actions a join public.campaigns c on c.id = a.campaign_id where c.slug = 'sys-q-acc'), 0::bigint, 'a player of the new campaign sees none until an entry is linked to their character');

-- an entry the copied sheet rejects is skipped, not fatal
select tests.as_postgres();
insert into public.systems (name, document, kind, actions) values
  ('Origin-skip', (select c2_default from base), 'origin',
   '[{"table_key":"no_existe","category":"","name":"Sin tabla","description":"","extras":{},"function":null}]');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000006');
select lives_ok($$insert into public.campaign_requests (name, slug_wanted, system_id) values ('q-skip', 'sys-q-skip', tests.sid('Origin-skip'))$$, 'a request on a catalogue the sheet cannot hold');
select tests.as_user('aaaaaaaa-3300-4000-8000-000000000001');
select is(public.approve_campaign_request(tests.rid('q-skip')), 'sys-q-skip', 'approval still succeeds');
select tests.as_postgres();
select results_eq(
  $$select (select count(*) from public.campaign_actions a where a.campaign_id = c.id), r.seeded_actions, r.skipped_actions
      from public.campaigns c, public.campaign_requests r where c.slug = 'sys-q-skip' and r.name = 'q-skip'$$,
  $$values (0::bigint, 0, 1)$$, 'the rejected entry is skipped and counted');

-- without a base: unchanged
select is((select seeded_actions is null and skipped_actions is null from public.campaign_requests where name = 'q-sin-base'), true, 'a request without a base reports no seeding');
select is((select count(*) from public.campaign_actions a join public.campaigns c on c.id = a.campaign_id where c.slug = 'sys-q-plain'), 0::bigint, 'and its campaign has an empty catalogue');

select * from finish();
rollback;
