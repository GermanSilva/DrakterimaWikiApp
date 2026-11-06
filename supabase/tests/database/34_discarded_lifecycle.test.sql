-- pgTAP: G9 of the system-agnostic campaigns (odd/tasks/system-agnostic.md S26, S32). HIGH RISK: a scheduled job deletes stored
-- character data with nobody logged in.
--   Part 1: purge_expired_discarded() purges the entries older than 60 days exactly like the manual purge (a twin campaign purged by
--           its DM ends identical), leaves younger ones (59 days) and the other keys of every character untouched, skips a key
--           that is live again, and never touches a campaign without expired entries.
--   Part 2: a campaign with unreadable or impossible dates still has its valid expired entries purged (those entries stay); a campaign whose
--           purge fails midway is left byte-identical with no log rows and does not stop the rest; a second run purges nothing.
--           Boundaries: 60 days +- 1 s, a missing `at`, a future `at`; the job against a twin purged with the G7b manual body.
--   Part 3: audit rows (discarded_purge_log) written and visible only to the DMs of their campaign; API roles cannot write them.
--   Part 4: API roles cannot call the function nor the helpers; the function is definer with an empty search_path.
--   Part 5: the daily pg_cron job exists; the manual purge still behaves as before (its own suite is 32).
--   Part 6: the validator refuses a date that does not exist (30 February), like the TS model.
-- Self-contained fixture, rolled back at the end.
begin;

select plan(74);

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
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end;
$$;

create function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create function tests.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

-- the ISO UTC date of `p_days` days ago (a discarded entry's `at`)
create function tests.ago(p_days int) returns text language sql as $$
  select to_char((now() - make_interval(days => p_days)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"');
$$;

create function tests.put_sheet(p_campaign uuid, p_sheet jsonb) returns void language plpgsql as $$
begin
  update public.campaigns
  set system_profile = public.validate_system_profile((system_profile - 'sheet') || jsonb_build_object('sheet', p_sheet))
  where id = p_campaign;
end;
$$;

create function tests.sheet(p_items jsonb, p_discarded jsonb default null) returns jsonb language sql as $$
  select jsonb_build_object('categories', jsonb_build_array(jsonb_build_object('key', 'c', 'label', 'C', 'sections',
    jsonb_build_array(jsonb_build_object('key', 'alpha', 'label', 'Alpha', 'items', p_items, 'blocks', '[]'::jsonb)))), 'roles', '{}'::jsonb)
    || case when p_discarded is null then '{}'::jsonb else jsonb_build_object('discarded', p_discarded) end;
$$;

create function tests.entry(p_item jsonb, p_at text) returns jsonb language sql as $$
  select jsonb_build_object('item', p_item, 'section', 'alpha', 'at', p_at);
$$;

-- the discarded list X and T share (only the dates differ): `gone`, `hechizos` and `ath` are old (p_old, +9, +29 days), `edge` is
-- p_edge days old, `fresh` 10 days old, `mana` is old (+19) but a live item uses its key again
create function tests.entries(p_old int, p_edge int) returns jsonb language sql as $$
  select jsonb_build_array(
    tests.entry('{"kind":"field","key":"gone","label":"Perdido","type":"short","editableBy":"dm"}', tests.ago(p_old)),
    tests.entry('{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]}', tests.ago(p_old + 9)),
    tests.entry('{"kind":"row","type":"capacidades","table":"habs","key":"ath","label":"Atletismo","stat":"fuerza","use":"valor","editableBy":"dm","columns":["prof","nota"]}', tests.ago(p_old + 29)),
    tests.entry('{"kind":"field","key":"edge","label":"Borde","type":"short","editableBy":"dm"}', tests.ago(p_edge)),
    tests.entry('{"kind":"field","key":"fresh","label":"Reciente","type":"short","editableBy":"dm"}', tests.ago(10)),
    tests.entry('{"kind":"field","key":"mana","label":"Maná viejo","type":"short","editableBy":"dm"}', tests.ago(p_old + 19)));
$$;

create function tests.live_items() returns jsonb language sql as $$
  select '[{"kind":"field","key":"vida","label":"Vida","type":"number","editableBy":"player"},
           {"kind":"field","key":"mana","label":"Maná","type":"short","editableBy":"dm"}]'::jsonb;
$$;

create function tests.data_of(p_campaign uuid) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(nombre, data), '{}'::jsonb) from public.pjs where campaign_id = p_campaign;
$$;

create function tests.keys_of(p_campaign uuid) returns jsonb language sql as $$
  select (select jsonb_agg(e #>> '{item,key}' order by e #>> '{item,key}') from jsonb_array_elements(system_profile #> '{sheet,discarded}') e)
    from public.campaigns where id = p_campaign;
$$;

create function tests.version_of(p_campaign uuid) returns timestamptz language sql as $$
  select updated_at from public.campaigns where id = p_campaign;
$$;

create function tests.ago_secs(p_secs int) returns text language sql as $$
  select to_char((now() - make_interval(secs => p_secs)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"');
$$;

create function tests.det(p_sql text) returns text language plpgsql as $$
declare
  v_detail text;
begin
  execute p_sql;
  return '';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return coalesce(v_detail, '');
end;
$$;

-- the purge body of G7b (migration 20261106120000), without the DM checks: the reference the job must equal
create function tests.old_purge(p_campaign_id uuid, p_key text) returns void language plpgsql as $$
declare
  v_row public.campaigns;
  v_entry jsonb;
  v_keys text[];
  v_list jsonb;
begin
  select * into v_row from public.campaigns c where c.id = p_campaign_id for update;
  select e into v_entry
    from jsonb_array_elements(case when jsonb_typeof(v_row.system_profile #> '{sheet,discarded}') = 'array'
                                   then v_row.system_profile #> '{sheet,discarded}' else '[]'::jsonb end) e
   where e #>> '{item,key}' = p_key
   limit 1;
  v_keys := public._discarded_data_keys(v_entry -> 'item');
  if v_keys && public._sheet_data_keys(v_row.system_profile -> 'sheet')
     or p_key = any (public._sheet_structural_keys(v_row.system_profile -> 'sheet')) then
    raise exception 'discarded_key_live';
  end if;
  if cardinality(v_keys) > 0 then
    update public.pjs p set data = p.data - v_keys where p.campaign_id = p_campaign_id and p.data ?| v_keys;
  end if;
  if v_entry #>> '{item,kind}' = 'table' and v_entry #>> '{item,type}' = 'habilidad' then
    delete from public.campaign_actions a where a.campaign_id = p_campaign_id and a.table_key = p_key;
  end if;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_list
    from jsonb_array_elements(v_row.system_profile #> '{sheet,discarded}') e
   where e #>> '{item,key}' <> p_key;
  update public.campaigns c
     set system_profile = case when jsonb_array_length(v_list) = 0
                               then c.system_profile #- '{sheet,discarded}'
                               else jsonb_set(c.system_profile, '{sheet,discarded}', v_list) end
   where c.id = p_campaign_id;
end;
$$;

-- fails the purge of the key k2 in campaign V (the second key of its list): the campaign must roll back as a whole
create function tests.fail_k2() returns trigger language plpgsql as $$
begin
  if new.campaign_id = 'ffffffff-0000-4000-8000-000000000348' and old.data ? 'k2' and not (new.data ? 'k2') then
    raise exception 'boom';
  end if;
  return new;
end;
$$;

create table tests.snap (tag text, id bigint, j jsonb);

create function tests.snapshot(p_tag text) returns void language sql as $$
  insert into tests.snap select p_tag, id, to_jsonb(p) from public.pjs p;
$$;

-- "the same rows, except these data keys are gone" (updated_at aside)
create function tests.same_except(p_tag text, p_campaign uuid, p_keys text[]) returns boolean language sql as $$
  select coalesce(bool_and(
    md5((((s.j - 'updated_at') || jsonb_build_object('data', (s.j -> 'data') - p_keys)))::text) = md5((to_jsonb(p) - 'updated_at')::text)), false)
  from tests.snap s join public.pjs p on p.id = s.id
  where s.tag = p_tag and p.campaign_id = p_campaign;
$$;

create function tests.identical(p_tag text, p_campaign uuid) returns boolean language sql as $$
  select coalesce(bool_and(md5(s.j::text) = md5(to_jsonb(p)::text)), false)
  from tests.snap s join public.pjs p on p.id = s.id
  where s.tag = p_tag and p.campaign_id = p_campaign;
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture: dm1 (..0501) DMs X, T, Z and B; dm2 (..0503) DMs Y; a player (..0502) plays in X; an outsider (..0504)
--   X = ..034a (expired entries), T = ..034c (twin of X with young entries, purged by hand), Y = ..034b (another DM),
--   Z = ..0349 (dates that are unreadable or impossible, next to a valid expired entry), B = ..034d (bystander, nothing discarded),
--   P = ..0347 (boundaries: 60 days +- 1 s, no `at`, a future `at`), V = ..0348 (its purge fails at the second key; sorts first),
--   T2 = ..034e (twin of X purged with the G7b manual body); dm3 (..0505) DMs P, V and T2
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('eeeeeeee-0000-4000-8000-000000000' || (500 + n))::uuid, 'authenticated', 'authenticated', 'cycle-u' || n || '@example.test'
from generate_series(1, 5) as n;

insert into public.campaigns (id, slug, name) values
  ('ffffffff-0000-4000-8000-000000000347', 'cycle-p', 'Cycle P'),
  ('ffffffff-0000-4000-8000-000000000348', 'cycle-v', 'Cycle V'),
  ('ffffffff-0000-4000-8000-000000000349', 'cycle-z', 'Cycle Z'),
  ('ffffffff-0000-4000-8000-00000000034e', 'cycle-t2', 'Cycle T2'),
  ('ffffffff-0000-4000-8000-00000000034a', 'cycle-x', 'Cycle X'),
  ('ffffffff-0000-4000-8000-00000000034b', 'cycle-y', 'Cycle Y'),
  ('ffffffff-0000-4000-8000-00000000034c', 'cycle-t', 'Cycle T'),
  ('ffffffff-0000-4000-8000-00000000034d', 'cycle-b', 'Cycle B');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('ffffffff-0000-4000-8000-000000000347', 'eeeeeeee-0000-4000-8000-000000000505', 'dm'),
  ('ffffffff-0000-4000-8000-000000000348', 'eeeeeeee-0000-4000-8000-000000000505', 'dm'),
  ('ffffffff-0000-4000-8000-00000000034e', 'eeeeeeee-0000-4000-8000-000000000505', 'dm'),
  ('ffffffff-0000-4000-8000-000000000349', 'eeeeeeee-0000-4000-8000-000000000501', 'dm'),
  ('ffffffff-0000-4000-8000-00000000034a', 'eeeeeeee-0000-4000-8000-000000000501', 'dm'),
  ('ffffffff-0000-4000-8000-00000000034a', 'eeeeeeee-0000-4000-8000-000000000502', 'player'),
  ('ffffffff-0000-4000-8000-00000000034b', 'eeeeeeee-0000-4000-8000-000000000503', 'dm'),
  ('ffffffff-0000-4000-8000-00000000034c', 'eeeeeeee-0000-4000-8000-000000000501', 'dm'),
  ('ffffffff-0000-4000-8000-00000000034d', 'eeeeeeee-0000-4000-8000-000000000501', 'dm');

-- X and T hold the same data (look-alike keys must survive)
insert into public.pjs (id, campaign_id, owner_id, nombre, data) values
  (99401, 'ffffffff-0000-4000-8000-00000000034a', 'eeeeeeee-0000-4000-8000-000000000502', 'uno',
   '{"vida": 7, "mana": "m1", "gone": "g1", "gone2": "keep", "gone__nota": "keep", "edge": "e1", "fresh": "f1", "hechizos": [{"x": 1}], "ath": 1, "ath__nota": "n", "ath__prof": "keep", "ath_": "keep"}'),
  (99402, 'ffffffff-0000-4000-8000-00000000034a', null, 'dos', '{"vida": 5, "gone": "g2", "edge": "e2", "ath": 2}'),
  (99403, 'ffffffff-0000-4000-8000-00000000034a', null, 'tres', '{"vida": 1, "keep_me": true}'),
  (99411, 'ffffffff-0000-4000-8000-00000000034c', null, 'uno',
   '{"vida": 7, "mana": "m1", "gone": "g1", "gone2": "keep", "gone__nota": "keep", "edge": "e1", "fresh": "f1", "hechizos": [{"x": 1}], "ath": 1, "ath__nota": "n", "ath__prof": "keep", "ath_": "keep"}'),
  (99412, 'ffffffff-0000-4000-8000-00000000034c', null, 'dos', '{"vida": 5, "gone": "g2", "edge": "e2", "ath": 2}'),
  (99413, 'ffffffff-0000-4000-8000-00000000034c', null, 'tres', '{"vida": 1, "keep_me": true}'),
  (99421, 'ffffffff-0000-4000-8000-00000000034b', null, 'y uno', '{"gone": "gy", "vida": 3}'),
  (99422, 'ffffffff-0000-4000-8000-00000000034b', null, 'y dos', '{"vida": 4}'),
  (99431, 'ffffffff-0000-4000-8000-000000000349', null, 'z uno', '{"gone": "gz", "otro": "oz", "badday": "bz", "vida": 3}'),
  (99451, 'ffffffff-0000-4000-8000-000000000347', null, 'p uno', '{"old1s": 1, "old1s_x": "keep", "young1s": 2, "young1s_x": "keep", "noat": 3, "noat_x": "keep", "fut": 4, "fut_x": "keep", "vida": 1}'),
  (99461, 'ffffffff-0000-4000-8000-000000000348', null, 'v uno', '{"k1": 1, "k2": 2, "k3": 3, "vida": 1}'),
  (99462, 'ffffffff-0000-4000-8000-000000000348', null, 'v dos', '{"k2": 9, "vida": 2}'),
  (99471, 'ffffffff-0000-4000-8000-00000000034e', null, 'uno',
   '{"vida": 7, "mana": "m1", "gone": "g1", "gone2": "keep", "gone__nota": "keep", "edge": "e1", "fresh": "f1", "hechizos": [{"x": 1}], "ath": 1, "ath__nota": "n", "ath__prof": "keep", "ath_": "keep"}'),
  (99472, 'ffffffff-0000-4000-8000-00000000034e', null, 'dos', '{"vida": 5, "gone": "g2", "edge": "e2", "ath": 2}'),
  (99473, 'ffffffff-0000-4000-8000-00000000034e', null, 'tres', '{"vida": 1, "keep_me": true}'),
  (99441, 'ffffffff-0000-4000-8000-00000000034d', null, 'b uno', '{"gone": "gb", "vida": 9}');

-- the Habilidad table must be in the sheet while its actions are written; it is discarded afterwards
select tests.put_sheet('ffffffff-0000-4000-8000-00000000034a', tests.sheet('[{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]}]'::jsonb));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000034c', tests.sheet('[{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]}]'::jsonb));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000034e', tests.sheet('[{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]}]'::jsonb));
insert into public.campaign_actions (id, campaign_id, table_key, category, name, extras) values
  (97621, 'ffffffff-0000-4000-8000-00000000034e', 'hechizos', '', 'Luz', '{}'),
  (97622, 'ffffffff-0000-4000-8000-00000000034e', 'hechizos', '', 'Escudo', '{}'),
  (97601, 'ffffffff-0000-4000-8000-00000000034a', 'hechizos', '', 'Luz', '{}'),
  (97602, 'ffffffff-0000-4000-8000-00000000034a', 'hechizos', '', 'Escudo', '{}'),
  (97611, 'ffffffff-0000-4000-8000-00000000034c', 'hechizos', '', 'Luz', '{}'),
  (97612, 'ffffffff-0000-4000-8000-00000000034c', 'hechizos', '', 'Escudo', '{}');
insert into public.pj_action_links (pj_id, action_id, campaign_id, state) values
  (99471, 97621, 'ffffffff-0000-4000-8000-00000000034e', '{}'),
  (99401, 97601, 'ffffffff-0000-4000-8000-00000000034a', '{}'),
  (99411, 97611, 'ffffffff-0000-4000-8000-00000000034c', '{}');

-- X: old entries; T: the same entries but all young (the job leaves it alone; the DM purges it by hand later)
select tests.put_sheet('ffffffff-0000-4000-8000-00000000034a', tests.sheet(tests.live_items(), tests.entries(61, 59)));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000034c', tests.sheet(tests.live_items(), tests.entries(5, 5)));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000034e', tests.sheet(tests.live_items(), tests.entries(5, 5)));
select tests.put_sheet('ffffffff-0000-4000-8000-000000000347', tests.sheet('[{"kind":"field","key":"vida","label":"Vida","type":"number","editableBy":"player"}]'::jsonb, jsonb_build_array(
  tests.entry('{"kind":"field","key":"old1s","label":"A","type":"short","editableBy":"dm"}', tests.ago_secs(60 * 86400 + 1)),
  tests.entry('{"kind":"field","key":"young1s","label":"B","type":"short","editableBy":"dm"}', tests.ago_secs(60 * 86400 - 1)),
  tests.entry('{"kind":"field","key":"noat","label":"C","type":"short","editableBy":"dm"}', tests.ago(80)),
  tests.entry('{"kind":"field","key":"fut","label":"D","type":"short","editableBy":"dm"}', tests.ago(-30)))));
update public.campaigns set system_profile = system_profile #- '{sheet,discarded,2,at}' where id = 'ffffffff-0000-4000-8000-000000000347';
select tests.put_sheet('ffffffff-0000-4000-8000-000000000348', tests.sheet('[{"kind":"field","key":"vida","label":"Vida","type":"number","editableBy":"player"}]'::jsonb, jsonb_build_array(
  tests.entry('{"kind":"field","key":"k1","label":"K1","type":"short","editableBy":"dm"}', tests.ago(70)),
  tests.entry('{"kind":"field","key":"k2","label":"K2","type":"short","editableBy":"dm"}', tests.ago(70)),
  tests.entry('{"kind":"field","key":"k3","label":"K3","type":"short","editableBy":"dm"}', tests.ago(70)))));
create trigger zz_fail_k2 before update on public.pjs for each row execute function tests.fail_k2();
select tests.put_sheet('ffffffff-0000-4000-8000-00000000034b', tests.sheet('[{"kind":"field","key":"vida","label":"Vida","type":"number","editableBy":"player"}]'::jsonb,
  jsonb_build_array(tests.entry('{"kind":"field","key":"gone","label":"Perdido","type":"short","editableBy":"dm"}', tests.ago(75)))));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000034d', tests.sheet('[{"kind":"field","key":"vida","label":"Vida","type":"number","editableBy":"player"}]'::jsonb));
-- Z: an expired entry plus one whose date is garbage (stored around the validator)
select tests.put_sheet('ffffffff-0000-4000-8000-000000000349', tests.sheet('[{"kind":"field","key":"vida","label":"Vida","type":"number","editableBy":"player"}]'::jsonb,
  jsonb_build_array(tests.entry('{"kind":"field","key":"otro","label":"Otro","type":"short","editableBy":"dm"}', tests.ago(80)),
                    tests.entry('{"kind":"field","key":"gone","label":"Perdido","type":"short","editableBy":"dm"}', tests.ago(80)))));
-- Z: [badday (30 February: the format is fine, the day does not exist), otro (not a date), gone (valid and expired)]
update public.campaigns set system_profile = jsonb_set(system_profile, '{sheet,discarded}',
  jsonb_build_array(tests.entry('{"kind":"field","key":"badday","label":"Dia","type":"short","editableBy":"dm"}', '2026-02-30T00:00:00.000Z')) || (system_profile #> '{sheet,discarded}'))
 where id = 'ffffffff-0000-4000-8000-000000000349';
update public.campaigns set system_profile = jsonb_set(system_profile, '{sheet,discarded,1,at}', '"not a date"') where id = 'ffffffff-0000-4000-8000-000000000349';

select is((select array_agg(e ->> 'at' order by e #>> '{item,key}') from jsonb_array_elements((select system_profile #> '{sheet,discarded}' from public.campaigns where id = 'ffffffff-0000-4000-8000-000000000349')) e),
  array['2026-02-30T00:00:00.000Z', tests.ago(80), 'not a date'], 'fixture: Z holds an impossible date, an unreadable date and a valid expired entry');
select is((select system_profile #>> '{sheet,discarded,2,at}' from public.campaigns where id = 'ffffffff-0000-4000-8000-000000000347'), null, 'fixture: P holds an entry without a date');
select is(jsonb_array_length((select system_profile #> '{sheet,discarded}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000034a')), 6, 'fixture: X holds six discarded entries');
select is((select count(*)::int from public.discarded_purge_log), 0, 'fixture: the audit log starts empty');

select tests.snapshot('before');
create temp table pre_campaigns on commit drop as select id, md5(system_profile::text) as m, updated_at from public.campaigns;

------------------------------------------------------------------------------
-- Part 1: the job
------------------------------------------------------------------------------
select is(public.purge_expired_discarded(), 6, 'the job purged six entries: gone, hechizos and ath of X, gone of Y, gone of Z, old1s of P (V failed, mana is live again, edge and fresh are young)');
select is(tests.keys_of('ffffffff-0000-4000-8000-00000000034a'), '["edge", "fresh", "mana"]'::jsonb, 'X keeps the young entries (59 and 10 days) and the one whose key is live again');
select ok(tests.same_except('before', 'ffffffff-0000-4000-8000-00000000034a', array['gone', 'hechizos', 'ath', 'ath__nota']),
  'X: every character is the same row minus exactly the data keys of the three expired items (md5)');
select is((select data ->> 'mana' from public.pjs where id = 99401), 'm1', 'the live-again key kept its value on the character');
select is((select data ->> 'edge' from public.pjs where id = 99401), 'e1', 'a 59 day old entry keeps its data');
select is((select data ->> 'gone2' from public.pjs where id = 99401), 'keep', 'a look-alike key (gone2) survives');
select is((select data ->> 'ath_' from public.pjs where id = 99401), 'keep', 'a look-alike key (ath_) survives');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-00000000034a'), 0, 'the catalogue entries of the purged Habilidad table are gone');
select is((select count(*)::int from public.pj_action_links where campaign_id = 'ffffffff-0000-4000-8000-00000000034a'), 0, 'and their links');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-00000000034c'), 2, 'the twin keeps its catalogue entries (nothing expired there)');

select ok(tests.same_except('before', 'ffffffff-0000-4000-8000-00000000034b', array['gone']), 'Y (another DM): purged exactly its expired key');
select is((select system_profile #> '{sheet,discarded}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000034b'), null, 'Y: the list is gone once it is empty');

select ok(tests.identical('before', 'ffffffff-0000-4000-8000-00000000034d'), 'B (nothing discarded): characters byte-identical');
select is((select md5(system_profile::text) from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000034d'),
  (select m from pre_campaigns where id = 'ffffffff-0000-4000-8000-00000000034d'), 'B: the campaign document is untouched');
select is(tests.version_of('ffffffff-0000-4000-8000-00000000034d'), (select updated_at from pre_campaigns where id = 'ffffffff-0000-4000-8000-00000000034d'), 'B: updated_at is untouched');
select ok(tests.identical('before', 'ffffffff-0000-4000-8000-00000000034c'), 'T (all young): characters byte-identical');
select is((select md5(system_profile::text) from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000034c'),
  (select m from pre_campaigns where id = 'ffffffff-0000-4000-8000-00000000034c'), 'T: the campaign document is untouched');

-- the job against the G7b manual body (T2 is purged with the code that existed before G9)
select tests.old_purge('ffffffff-0000-4000-8000-00000000034e', 'gone');
select tests.old_purge('ffffffff-0000-4000-8000-00000000034e', 'hechizos');
select tests.old_purge('ffffffff-0000-4000-8000-00000000034e', 'ath');
select is(tests.data_of('ffffffff-0000-4000-8000-00000000034a'), tests.data_of('ffffffff-0000-4000-8000-00000000034e'), 'the job equals the old manual purge body: same character data');
select is(tests.keys_of('ffffffff-0000-4000-8000-00000000034a'), tests.keys_of('ffffffff-0000-4000-8000-00000000034e'), 'and the same remaining entries');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-00000000034e'), (select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-00000000034a'), 'and the same catalogue');
select is((select system_profile #> '{sheet}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000034a') - 'discarded',
          (select system_profile #> '{sheet}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000034e') - 'discarded', 'and the same live sheet');

-- boundaries of P: 60 days + 1 s is purged; 60 days - 1 s, a missing date and a future date are kept; look-alike keys stay
select is(tests.keys_of('ffffffff-0000-4000-8000-000000000347'), '["fut", "noat", "young1s"]'::jsonb, 'P: exactly the entries at 60 days - 1 s, without a date and in the future remain');
select ok(tests.same_except('before', 'ffffffff-0000-4000-8000-000000000347', array['old1s']), 'P: only the data of the entry at 60 days + 1 s is gone (md5), look-alike keys kept');

-- exactly like the manual purge: the DM purges the same three keys on the twin
select tests.as_user('eeeeeeee-0000-4000-8000-000000000501');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000034c', 'gone', tests.version_of('ffffffff-0000-4000-8000-00000000034c')) $$, 'twin: the DM purges gone by hand');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000034c', 'hechizos', tests.version_of('ffffffff-0000-4000-8000-00000000034c')) $$, 'twin: and hechizos');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000034c', 'ath', tests.version_of('ffffffff-0000-4000-8000-00000000034c')) $$, 'twin: and ath');
select tests.as_postgres();
select is(tests.data_of('ffffffff-0000-4000-8000-00000000034a'), tests.data_of('ffffffff-0000-4000-8000-00000000034c'), 'the job and the manual purge leave the characters identical');
select is(tests.keys_of('ffffffff-0000-4000-8000-00000000034c'), '["edge", "fresh", "mana"]'::jsonb, 'and the same entries remain in the list');
select is((select system_profile #> '{sheet}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000034a') - 'discarded',
          (select system_profile #> '{sheet}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000034c') - 'discarded', 'the live sheet is the same after both');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-00000000034c'), 0, 'the manual purge also dropped the catalogue entries (same as the job)');

------------------------------------------------------------------------------
-- Part 2: a broken campaign does not stop the rest
------------------------------------------------------------------------------
select ok(tests.same_except('before', 'ffffffff-0000-4000-8000-000000000349', array['gone']), 'Z (bad dates): its valid expired entry was purged, nothing else of its characters changed (md5)');
select is(tests.keys_of('ffffffff-0000-4000-8000-000000000349'), '["badday", "otro"]'::jsonb, 'Z: the entries with an impossible or unreadable date are skipped, not purged');
select is((select array_agg(e ->> 'at' order by e #>> '{item,key}') from jsonb_array_elements((select system_profile #> '{sheet,discarded}' from public.campaigns where id = 'ffffffff-0000-4000-8000-000000000349')) e),
  array['2026-02-30T00:00:00.000Z', 'not a date'], 'Z: and their stored dates are untouched');
select is((select array_agg(key) from public.discarded_purge_log where campaign_id = 'ffffffff-0000-4000-8000-000000000349'), array['gone'], 'Z: one audit row, for the valid entry');
select ok(tests.identical('before', 'ffffffff-0000-4000-8000-000000000348'), 'V (fails at its second key): characters byte-identical, the first key was rolled back too');
select is((select md5(system_profile::text) from public.campaigns where id = 'ffffffff-0000-4000-8000-000000000348'), (select m from pre_campaigns where id = 'ffffffff-0000-4000-8000-000000000348'), 'V: the campaign document is as it was');
select is((select count(*)::int from public.discarded_purge_log where campaign_id = 'ffffffff-0000-4000-8000-000000000348'), 0, 'V: no audit rows');
select is((select count(*)::int from public.discarded_purge_log where campaign_id in ('ffffffff-0000-4000-8000-00000000034a', 'ffffffff-0000-4000-8000-00000000034b')), 4,
  'the campaigns after the failing one (by id) were still purged');
select is(public.purge_expired_discarded(), 0, 'a second run purges nothing (the live-again entry is skipped again, V fails again, Z keeps its bad dates)');
select is((select count(*)::int from public.discarded_purge_log), 6, 'and logs nothing');

------------------------------------------------------------------------------
-- Part 3: audit
------------------------------------------------------------------------------
select is((select jsonb_object_agg(key, characters_affected) from public.discarded_purge_log where campaign_id = 'ffffffff-0000-4000-8000-00000000034a'),
  '{"gone": 2, "hechizos": 1, "ath": 2}'::jsonb, 'X: key and the number of characters that held data under it');
select is((select characters_affected from public.discarded_purge_log where campaign_id = 'ffffffff-0000-4000-8000-00000000034b' and key = 'gone'), 1, 'Y: gone held by one character');
select ok((select bool_and(abs(extract(epoch from now() - purged_at)) < 60) from public.discarded_purge_log), 'purged_at is when the job ran');

select tests.as_user('eeeeeeee-0000-4000-8000-000000000501');
select is((select count(*)::int from public.discarded_purge_log), 4, 'the DM of X and Z sees their audit rows only (3 + 1), not those of Y or P');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000503');
select is((select array_agg(key) from public.discarded_purge_log), array['gone'], 'the DM of Y sees the audit row of Y only');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000502');
select is((select count(*)::int from public.discarded_purge_log), 0, 'a player sees no audit rows');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000504');
select is((select count(*)::int from public.discarded_purge_log), 0, 'an outsider sees no audit rows');
select tests.as_anon();
select is(left(tests.err($$ select * from public.discarded_purge_log $$), 6), '42501:', 'anon cannot read the audit log');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000501');
select is(left(tests.err($$ insert into public.discarded_purge_log (campaign_id, key, characters_affected) values ('ffffffff-0000-4000-8000-00000000034a', 'k', 0) $$), 6), '42501:', 'a DM cannot write the audit log');
select is(left(tests.err($$ delete from public.discarded_purge_log $$), 6), '42501:', 'a DM cannot delete audit rows');
select is(left(tests.err($$ update public.discarded_purge_log set key = 'x' $$), 6), '42501:', 'a DM cannot edit audit rows');
select tests.as_postgres();
select is((select count(*)::int from public.discarded_purge_log), 6, 'the audit rows are intact');

------------------------------------------------------------------------------
-- Part 4: who can call it
------------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('purge_expired_discarded', '_purge_discarded_entry', '_discarded_retention_days')
              and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), 0,
  'API roles cannot execute the job, the shared purge step or the retention constant');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000501');
select is(left(tests.err($$ select public.purge_expired_discarded() $$), 6), '42501:', 'a DM calling the job is refused');
select is(left(tests.err($$ select public._purge_discarded_entry('ffffffff-0000-4000-8000-00000000034c', 'fresh') $$), 6), '42501:', 'a DM calling the shared step is refused');
select tests.as_anon();
select is(left(tests.err($$ select public.purge_expired_discarded() $$), 6), '42501:', 'anon calling the job is refused');
select tests.as_postgres();
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'purge_expired_discarded' and p.prosecdef and p.proconfig = array['search_path=""']), 1,
  'the job is SECURITY DEFINER with an empty search_path');
select is(public._discarded_retention_days(), 60, 'the retention is 60 days, in one place');

------------------------------------------------------------------------------
-- Part 5: the schedule and the manual purge
------------------------------------------------------------------------------
select is((select count(*)::int from cron.job where jobname = 'purge-expired-discarded' and schedule = '15 3 * * *'
             and command = 'select public.purge_expired_discarded()' and active), 1, 'the daily 03:15 UTC job exists and is active');

select tests.as_user('eeeeeeee-0000-4000-8000-000000000501');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000034c', 'mana', tests.version_of('ffffffff-0000-4000-8000-00000000034c')) $$), 'P0001:discarded_key_live', 'manual purge still refuses a live key');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000034c', 'nope', tests.version_of('ffffffff-0000-4000-8000-00000000034c')) $$), 'P0001:discarded_item_not_found', 'manual purge still refuses an unknown key');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000034c', 'edge', '2020-01-01') $$), 'P0001:campaign_conflict', 'manual purge still checks the version');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000502');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000034a', 'edge', now()) $$), '42501:dm_only', 'manual purge is still DM only');
select tests.as_postgres();
select is((select count(*)::int from public.discarded_purge_log), 6, 'the manual purge writes no audit rows');

------------------------------------------------------------------------------
-- Part 6: the validator refuses a day that does not exist
------------------------------------------------------------------------------
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a","label":"A","type":"short"}', '2026-02-30T00:00:00Z')))) $$), 'sheet.discarded[0].at', 'validate_sheet refuses 30 February');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a","label":"A","type":"short"}', '2026-04-31T10:00:00.000Z')))) $$), 'sheet.discarded[0].at', 'validate_sheet refuses 31 April');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a","label":"A","type":"short"}', '2025-02-29T10:00:00.000Z')))) $$), 'sheet.discarded[0].at', 'validate_sheet refuses 29 February of a common year');
select is(tests.det($$ select tests.put_sheet('ffffffff-0000-4000-8000-00000000034e', tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a","label":"A","type":"short"}', '2026-02-30T00:00:00Z')))) $$), 'sheet.discarded[0].at', 'the system document validator (what saving a profile runs) refuses it too');
select is(jsonb_array_length(public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a","label":"A","type":"short"}', '2024-02-29T10:00:00.000Z')))) -> 'discarded'), 1, 'validate_sheet accepts 29 February of a leap year');
select is(jsonb_array_length(public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a","label":"A","type":"short"}', '2026-12-31T23:59:59Z')))) -> 'discarded'), 1, 'validate_sheet accepts 31 December');

select * from finish();
rollback;
