-- pgTAP: G7b of the system-agnostic campaigns (odd/tasks/system-agnostic.md S26, S32, S11). HIGH RISK: the DM-only RPCs delete or
-- move stored character data.
--   Part 1: validate_sheet / validate_system_profile accept and normalise the optional `discarded` list (the same cases live in
--           src/campaign/system/sheet/sheetModelG7b.test.ts: both validators must agree). A discarded key may be reused by a live item.
--   Part 2: discarded items are inert: a player cannot write a discarded data key (sheet_guard_access ignores them).
--   Part 3: purge_discarded_item removes exactly the data keys the item owns from every character of the campaign (and the actions of
--           a discarded Habilidad table), and the entry from the list; nothing else changes (md5 of whole rows minus those keys).
--   Part 4: rekey_discarded_item restores an item under a new key: moves (or copies, when the old key is live again) the values.
--   Refusals: dm_only, campaign_conflict, discarded_item_not_found, discarded_key_live, discarded_rekey_invalid, discarded_key_taken.
-- Self-contained fixture, rolled back at the end.
begin;

select plan(103);

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

create function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- sqlstate:message of a statement, or 'ok' when it ran
create function tests.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

-- the DETAIL of the error a statement raises (the offending path of a validator), '' when it ran
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

-- stores a sheet through the real validator (a rejected sheet fails the fixture), as postgres
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

-- one discarded entry
create function tests.entry(p_item jsonb) returns jsonb language sql as $$
  select jsonb_build_object('item', p_item, 'section', 'alpha', 'at', '2026-11-06T10:00:00.000Z');
$$;

-- the optimistic-concurrency version of campaign A
create function tests.base() returns timestamptz language sql as $$
  select updated_at from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a';
$$;

-- the stored profile of A with the discarded entry `p_from` removed and `p_item` added at the end of the first section
create function tests.restore_profile(p_from text, p_item jsonb) returns jsonb language plpgsql as $$
declare
  v_p jsonb;
  v_s jsonb;
begin
  select system_profile into v_p from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a';
  v_s := v_p -> 'sheet';
  v_s := jsonb_set(v_s, '{categories,0,sections,0,items}', (v_s #> '{categories,0,sections,0,items}') || jsonb_build_array(p_item));
  v_s := jsonb_set(v_s, '{discarded}', coalesce((select jsonb_agg(e) from jsonb_array_elements(v_s -> 'discarded') e where e #>> '{item,key}' <> p_from), '[]'::jsonb));
  return jsonb_set(v_p, '{sheet}', v_s);
end;
$$;

-- snapshot of every character, then a comparison "the same rows, except these data keys are gone" (updated_at aside)
create table tests.snap (tag text, id bigint, j jsonb);

create function tests.snapshot(p_tag text) returns void language sql as $$
  insert into tests.snap select p_tag, id, to_jsonb(p) from public.pjs p;
$$;

create function tests.same_except(p_tag text, p_campaign uuid, p_keys text[]) returns boolean language sql as $$
  select coalesce(bool_and(
    md5((((s.j - 'updated_at') || jsonb_build_object('data', (s.j -> 'data') - p_keys)))::text) = md5((to_jsonb(p) - 'updated_at')::text)), false)
  from tests.snap s join public.pjs p on p.id = s.id
  where s.tag = p_tag and p.campaign_id = p_campaign;
$$;

-- characters of other campaigns must be byte-identical (updated_at included)
create function tests.identical(p_tag text, p_campaign uuid) returns boolean language sql as $$
  select coalesce(bool_and(md5(s.j::text) = md5(to_jsonb(p)::text)), false)
  from tests.snap s join public.pjs p on p.id = s.id
  where s.tag = p_tag and p.campaign_id = p_campaign;
$$;

-- the same, also dropping another discarded entry from the list
create function tests.restore_profile_dropping(p_from text, p_item jsonb, p_drop text) returns jsonb language sql as $$
  select jsonb_set(p, '{sheet,discarded}', coalesce((select jsonb_agg(e) from jsonb_array_elements(p #> '{sheet,discarded}') e where e #>> '{item,key}' <> p_drop), '[]'::jsonb))
  from (select tests.restore_profile(p_from, p_item) p) q;
$$;

-- a capacidades table of 100 rows: heavier than 12000 bytes, still a valid live item
create function tests.big_table() returns jsonb language sql as $$
  select jsonb_build_object('kind', 'table', 'type', 'capacidades', 'key', 'habs', 'label', 'H',
    'columns', '[{"key":"prof","label":"Prof","type":"number","editableBy":"dm"}]'::jsonb,
    'rows', (select jsonb_agg(jsonb_build_object('key', 'hab_' || n, 'label', 'Habilidad número ' || n || ' con un nombre bastante largo para pesar', 'stat', 'fue', 'use', 'valor', 'editableBy', 'dm')) from generate_series(0, 99) n));
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture: dm (..0401), player 1 (..0402), player 2 (..0403), outsider (..0404)
--   A = ...032a with the sheet below, B = ...032b (a bystander campaign with the same keys in its characters)
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('eeeeeeee-0000-4000-8000-000000000' || (400 + n))::uuid, 'authenticated', 'authenticated', 'discard-u' || n || '@example.test'
from generate_series(1, 4) as n;

insert into public.campaigns (id, slug, name) values
  ('ffffffff-0000-4000-8000-00000000032a', 'discard-a', 'Discard A'),
  ('ffffffff-0000-4000-8000-00000000032b', 'discard-b', 'Discard B');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('ffffffff-0000-4000-8000-00000000032a', 'eeeeeeee-0000-4000-8000-000000000401', 'dm'),
  ('ffffffff-0000-4000-8000-00000000032a', 'eeeeeeee-0000-4000-8000-000000000402', 'player'),
  ('ffffffff-0000-4000-8000-00000000032a', 'eeeeeeee-0000-4000-8000-000000000403', 'player'),
  ('ffffffff-0000-4000-8000-00000000032b', 'eeeeeeee-0000-4000-8000-000000000401', 'dm');

-- every key a discarded item might own, plus look-alikes that must survive a purge
insert into public.pjs (id, campaign_id, owner_id, nombre, data) values
  (99101, 'ffffffff-0000-4000-8000-00000000032a', 'eeeeeeee-0000-4000-8000-000000000402', 'A uno',
   '{"vida": 7, "mana": "m1", "fuerza": 3, "gone": "g1", "gone2": "keep", "gone_x": "keep", "gone__nota": "keep", "sabio": 4, "sabio_2": "keep",
     "ath": 1, "ath__nota": "n", "ath__extra": "e", "ath__prof": "keep", "bolsillo": [{"a": 1}], "hechizos": [{"x": 1}], "viejo": "v1",
     "s1": 1, "s1__nota": "x", "s2": 2, "extra_other": "keep", "atl": 1, "atl__nota": "an", "atl__extra": "ae", "atl__prof": "keep", "conjuros": [{"x": 9}],
     "fz": "f1", "fz_max": "keep", "fzs": "keep", "fz_": "keep", "rr": 5, "rr__nota": "rn", "rr_": "keep", "rr2__nota": "keep", "rr__prof": "keep"}'),
  (99102, 'ffffffff-0000-4000-8000-00000000032a', 'eeeeeeee-0000-4000-8000-000000000403', 'A dos',
   '{"vida": 5, "mana": "m2", "gone": "g2", "gone2": "keep", "sabio": 2, "ath": 2, "ath__nota": "n2", "bolsillo": [{"a": 2}], "viejo": "v2", "s1": 9, "extra_other": "keep"}'),
  (99103, 'ffffffff-0000-4000-8000-00000000032a', null, 'A sin dueño', '{"gone": "g3", "viejo": "v3", "extra_other": "keep"}'),
  (99201, 'ffffffff-0000-4000-8000-00000000032b', null, 'B uno',
   '{"gone": "gb", "sabio": 1, "ath": 1, "ath__nota": "nb", "bolsillo": [{"a": 3}], "hechizos": [{"x": 3}], "mana": "mb", "viejo": "vb", "s1": 5}');

-- actions need their Habilidad tables in the sheet when they are written; the tables are discarded afterwards
select tests.put_sheet('ffffffff-0000-4000-8000-00000000032a', tests.sheet('[
  {"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]},
  {"kind":"table","type":"habilidad","key":"otra","label":"Otra","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]},
  {"kind":"table","type":"habilidad","key":"conjuros","label":"Conjuros","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]}]'::jsonb));
insert into public.campaign_actions (id, campaign_id, table_key, category, name, extras) values
  (97501, 'ffffffff-0000-4000-8000-00000000032a', 'hechizos', '', 'Luz', '{"nota": "a"}'),
  (97502, 'ffffffff-0000-4000-8000-00000000032a', 'hechizos', '', 'Escudo', '{}'),
  (97503, 'ffffffff-0000-4000-8000-00000000032a', 'otra', '', 'Otra cosa', '{}'),
  (97504, 'ffffffff-0000-4000-8000-00000000032a', 'conjuros', '', 'Rayo', '{}');
insert into public.pj_action_links (pj_id, action_id, campaign_id, state) values
  (99101, 97501, 'ffffffff-0000-4000-8000-00000000032a', '{}'),
  (99102, 97502, 'ffffffff-0000-4000-8000-00000000032a', '{}'),
  (99101, 97503, 'ffffffff-0000-4000-8000-00000000032a', '{}'),
  (99102, 97504, 'ffffffff-0000-4000-8000-00000000032a', '{}');

------------------------------------------------------------------------------
-- Part 1: the validator
------------------------------------------------------------------------------
select tests.put_sheet('ffffffff-0000-4000-8000-00000000032a', tests.sheet('[
  {"kind":"field","key":"vida","label":"Vida","type":"number","editableBy":"player"},
  {"kind":"field","key":"mana","label":"Maná","type":"short","editableBy":"dm"},
  {"kind":"table","type":"stat","key":"atrib","label":"Atributos","rows":[{"key":"fuerza","label":"Fuerza","modifier":"{valor}","editableBy":"player"}]},
  {"kind":"table","type":"habilidad","key":"otra","label":"Otra","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]}]'::jsonb,
  jsonb_build_array(
    tests.entry('{"kind":"field","key":"gone","label":"  Perdido  ","type":"short","editableBy":"dm"}'),
    tests.entry('{"kind":"row","type":"stat","table":"atrib","key":"sabio","label":"Sabiduría","modifier":"{valor}","editableBy":"dm"}'),
    tests.entry('{"kind":"row","type":"capacidades","table":"habs","key":"ath","label":"Atletismo","stat":"fuerza","use":"valor","editableBy":"dm","columns":["prof","nota","extra"]}'),
    tests.entry('{"kind":"table","type":"libre","key":"bolsillo","label":"Bolsillo","editableBy":"player","columns":[{"key":"a","label":"A","type":"number","editableBy":"player"}]}'),
    tests.entry('{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]}'),
    tests.entry('{"kind":"field","key":"mana","label":"Maná viejo","type":"short","editableBy":"dm"}'),
    tests.entry('{"kind":"field","key":"viejo","label":"Viejo","type":"short","editableBy":"dm"}'),
    tests.entry('{"kind":"table","type":"capacidades","key":"salvac","label":"Salvaciones","columns":[{"key":"prof","label":"Prof","type":"number","editableBy":"dm"},{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}],
       "rows":[{"key":"s1","label":"Uno","stat":"fuerza","use":"valor","editableBy":"dm"},{"key":"s2","label":"Dos","stat":"fuerza","use":"valor","editableBy":"dm"}]}'),
    tests.entry('{"kind":"row","type":"capacidades","table":"habs2","key":"atl","label":"Atletismo","stat":"fuerza","use":"valor","editableBy":"dm","columns":["prof","nota","extra"]}'),
    tests.entry('{"kind":"table","type":"habilidad","key":"conjuros","label":"Conjuros","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]}'),
    tests.entry('{"kind":"field","key":"fz","label":"Fz","type":"short","editableBy":"dm"}'),
    tests.entry('{"kind":"row","type":"capacidades","table":"habs3","key":"rr","label":"Rr","stat":"fuerza","use":"valor","editableBy":"dm","columns":["prof","nota"]}'))));

select is(jsonb_array_length(public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"gone","label":"G","type":"short"}')))) -> 'discarded'), 1,
  'the validator keeps a discarded entry');
select is(public.validate_sheet(tests.sheet('[]')) ? 'discarded', false, 'a sheet without the list stays without it');
select is(public.validate_sheet(tests.sheet('[]', '[]'::jsonb)) -> 'discarded', '[]'::jsonb, 'an empty list is accepted as stored');
select is((select system_profile #>> '{sheet,discarded,0,item,label}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a'), 'Perdido',
  'the label of a discarded item is trimmed like any label');
select is(jsonb_array_length((select system_profile #> '{sheet,discarded}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a')), 12,
  'the fixture sheet stores the twelve discarded entries');
select is(public.validate_sheet(tests.sheet('[{"kind":"field","key":"gone","label":"Nuevo","type":"short","editableBy":"dm"}]',
  jsonb_build_array(tests.entry('{"kind":"field","key":"gone","label":"Viejo","type":"short"}')))) #>> '{categories,0,sections,0,items,0,label}', 'Nuevo',
  'a live item may reuse the key of a discarded one (S32)');

select is(octet_length(tests.big_table()::text) > 12000, true, 'the 100-row table is heavier than the old per-item bound');
select is(jsonb_array_length(public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry(tests.big_table())))) -> 'discarded'), 1, 'a discarded table of 100 rows is accepted (any live item can be discarded)');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"gone","label":"G","type":"short"}'::jsonb || jsonb_build_object('pad', repeat('x', 50000)))))) $$), 'sheet',
  'the only bound is the size of the whole sheet, as for a live one');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', '"x"'::jsonb)) $$), 'sheet.discarded', 'discarded must be an array');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', (select jsonb_agg(tests.entry(jsonb_build_object('kind', 'field', 'key', 'k' || n, 'label', 'K', 'type', 'short'))) from generate_series(1, 101) n))) $$),
  'sheet.discarded', 'more than 100 entries are refused');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', '["x"]'::jsonb)) $$), 'sheet.discarded[0]', 'an entry must be an object');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', '[{"section":"alpha","at":"2026-11-06T10:00:00.000Z"}]'::jsonb)) $$), 'sheet.discarded[0].item', 'an entry needs its item');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"thing","key":"a","label":"A"}')))) $$), 'sheet.discarded[0].item.kind', 'the kind is field, table or row');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"Bad","label":"A","type":"short"}')))) $$), 'sheet.discarded[0].item.key', 'the key must be a valid key');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"nombre","label":"A","type":"short"}')))) $$), 'sheet.discarded[0].item.key', 'a reserved key is refused');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a__b","label":"A","type":"short"}')))) $$), 'sheet.discarded[0].item.key', 'a key with a double underscore is refused');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a","label":"","type":"short"}')))) $$), 'sheet.discarded[0].item.label', 'the label is validated');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a","label":"A","type":"nope"}')))) $$), 'sheet.discarded[0].item.type', 'a field has a known type');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"table","key":"a","label":"A","type":"nope"}')))) $$), 'sheet.discarded[0].item.type', 'a table has a known type');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"row","type":"capacidades","key":"a","label":"A","table":"t"}')))) $$), 'sheet.discarded[0].item.columns', 'a capacidades row names the columns it had');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"row","type":"stat","key":"a","label":"A"}')))) $$), 'sheet.discarded[0].item.table', 'a row names its table');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(jsonb_build_object('item', '{"kind":"field","key":"a","label":"A","type":"short"}'::jsonb, 'section', 'Bad Key', 'at', '2026-11-06T10:00:00.000Z')))) $$), 'sheet.discarded[0].section', 'the section is a key');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(jsonb_build_object('item', '{"kind":"field","key":"a","label":"A","type":"short"}'::jsonb, 'section', 'alpha', 'at', 'yesterday')))) $$), 'sheet.discarded[0].at', 'the date is an ISO timestamp');
select is(tests.det($$ select public.validate_sheet(tests.sheet('[]', jsonb_build_array(tests.entry('{"kind":"field","key":"a","label":"A","type":"short"}'), tests.entry('{"kind":"field","key":"a","label":"B","type":"short"}')))) $$), 'sheet.discarded[1].item.key', 'a key is discarded once');

------------------------------------------------------------------------------
-- Part 2: discarded items are inert for the player guard
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000402');
select is(tests.err($$ update public.pjs set data = data || '{"vida": 9}' where id = 99101 $$), 'ok', 'the player still writes a live player field');
select is(left(tests.err($$ update public.pjs set data = data || '{"gone": "hack"}' where id = 99101 $$), 6), '42501:', 'a player cannot write a discarded field key');
select is(left(tests.err($$ update public.pjs set data = data || '{"ath__nota": "hack"}' where id = 99101 $$), 6), '42501:', 'a player cannot write a discarded capacidades column key');
select is(left(tests.err($$ update public.pjs set data = data || '{"bolsillo": []}' where id = 99101 $$), 6), '42501:', 'a player cannot write a discarded player table even though it was player-editable');
select tests.as_postgres();
select is((select data ->> 'gone' from public.pjs where id = 99101), 'g1', 'the discarded value is still there, untouched');
select is((select data -> 'bolsillo' from public.pjs where id = 99101), '[{"a": 1}]'::jsonb, 'the discarded table is untouched');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000402');
select is((public.sheet_guard_access('ffffffff-0000-4000-8000-00000000032a', '{}', '{}') -> 'keys') ? 'gone', false, 'sheet_guard_access does not list a discarded key');
select is((public.sheet_guard_access('ffffffff-0000-4000-8000-00000000032a', '{}', '{}') -> 'keys') ? 'vida', true, 'sheet_guard_access lists the live player field');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'gone', tests.base()) $$), '42501:dm_only', 'a player cannot purge');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"viejo":"nuevo"}', '{}', tests.base()) $$), '42501:dm_only', 'a player cannot rekey');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000404');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'gone', now()) $$), '42501:dm_only', 'an outsider cannot purge');
select tests.as_postgres();
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('purge_discarded_item', 'rekey_discarded_item')
              and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute'))), 0,
  'both RPCs are executable by authenticated only, not anon or public');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('purge_discarded_item', 'rekey_discarded_item') and p.prosecdef and p.proconfig = array['search_path=""']), 2,
  'both RPCs are SECURITY DEFINER with an empty search_path');

------------------------------------------------------------------------------
-- Part 3: purge
------------------------------------------------------------------------------
select tests.snapshot('pre');
create table tests.campaign_before as select id, system_profile, updated_at from public.campaigns;

-- refusals change nothing
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'nope', tests.base()) $$), 'P0001:discarded_item_not_found', 'an unknown key is refused');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'vida', tests.base()) $$), 'P0001:discarded_item_not_found', 'a live key is not a discarded item');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'mana', tests.base()) $$), 'P0001:discarded_key_live', 'a discarded key a live item uses again is refused (its values belong to the live item)');
select is(tests.err($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'gone', '2020-01-01') $$), 'P0001:campaign_conflict', 'a stale version is a conflict');
select tests.as_postgres();
select ok(tests.identical('pre', 'ffffffff-0000-4000-8000-00000000032a'), 'refusals left every character byte-identical');
select is((select system_profile from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a'),
          (select system_profile from tests.campaign_before where id = 'ffffffff-0000-4000-8000-00000000032a'), 'refusals left the sheet unchanged');

-- a field
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'gone', tests.base()) $$, 'the DM purges a discarded field');
select tests.as_postgres();
select ok(tests.same_except('pre', 'ffffffff-0000-4000-8000-00000000032a', array['gone']), 'only the key of the field is gone, from every character (look-alikes gone2, gone_x, gone__nota stay)');
select ok(tests.identical('pre', 'ffffffff-0000-4000-8000-00000000032b'), 'a character of another campaign is byte-identical');
select is((select count(*)::int from public.pjs where campaign_id = 'ffffffff-0000-4000-8000-00000000032a' and data ? 'gone'), 0, 'no character keeps the key');
select is((select jsonb_array_length(system_profile #> '{sheet,discarded}') from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a'), 11, 'the entry left the list');
select is((select system_profile #> '{sheet,discarded}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a') @> jsonb_build_array(tests.entry('{"kind":"field","key":"gone","label":"Perdido","type":"short","editableBy":"dm"}')), false,
  'the purged entry is not in the list any more');
select is((select system_profile - 'sheet' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a'),
          (select system_profile - 'sheet' from tests.campaign_before where id = 'ffffffff-0000-4000-8000-00000000032a'), 'the rest of the system document is unchanged');
select is((select system_profile #- '{sheet,discarded}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a'),
          (select system_profile #- '{sheet,discarded}' from tests.campaign_before where id = 'ffffffff-0000-4000-8000-00000000032a'), 'the live part of the sheet is unchanged');

-- a Stat row
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'sabio', tests.base()) $$, 'the DM purges a discarded Stat row');
select tests.as_postgres();
select ok(tests.same_except('pre', 'ffffffff-0000-4000-8000-00000000032a', array['gone', 'sabio']), 'only the row key is gone (sabio_2 stays)');

-- a Capacidades row: the row key and row__column for the columns after the first
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'ath', tests.base()) $$, 'the DM purges a discarded Capacidades row');
select tests.as_postgres();
select ok(tests.same_except('pre', 'ffffffff-0000-4000-8000-00000000032a', array['gone', 'sabio', 'ath', 'ath__nota', 'ath__extra']), 'the row, its second and third column go; ath__prof (not a stored key) stays');
select is((select data ->> 'ath__prof' from public.pjs where id = 99101), 'keep', 'ath__prof is untouched');

-- a whole Capacidades table: every row and every column after the first
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'salvac', tests.base()) $$, 'the DM purges a discarded Capacidades table');
select tests.as_postgres();
select ok(tests.same_except('pre', 'ffffffff-0000-4000-8000-00000000032a', array['gone', 'sabio', 'ath', 'ath__nota', 'ath__extra', 's1', 's1__nota', 's2']), 'every row of the table goes with its columns');

-- a Libre table
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'bolsillo', tests.base()) $$, 'the DM purges a discarded Libre table');
select tests.as_postgres();
select ok(tests.same_except('pre', 'ffffffff-0000-4000-8000-00000000032a', array['gone', 'sabio', 'ath', 'ath__nota', 'ath__extra', 's1', 's1__nota', 's2', 'bolsillo']), 'the table value is gone');

-- a Habilidad table: its value, its catalogue entries and their links (not the other table)
select is((select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-00000000032a'), 4, 'before: four catalogue entries');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'hechizos', tests.base()) $$, 'the DM purges a discarded Habilidad table');
select tests.as_postgres();
select ok(tests.same_except('pre', 'ffffffff-0000-4000-8000-00000000032a', array['gone', 'sabio', 'ath', 'ath__nota', 'ath__extra', 's1', 's1__nota', 's2', 'bolsillo', 'hechizos']), 'the table value is gone');
select is((select array_agg(id order by id) from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-00000000032a'), array[97503, 97504]::bigint[], 'its catalogue entries are gone, the other table keeps its entry');
select is((select count(*)::int from public.pj_action_links where campaign_id = 'ffffffff-0000-4000-8000-00000000032a'), 2, 'their links went with them (cascade), the other link stays');
select ok(tests.identical('pre', 'ffffffff-0000-4000-8000-00000000032b'), 'the other campaign is still byte-identical after every purge');

-- look-alike keys: neither a purge nor a rename touches what the item does not own
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'fz', '{"fz_max":"fz_2"}',
  tests.restore_profile('fz', '{"kind":"field","key":"fz_2","label":"N","type":"short","editableBy":"dm"}'), tests.base()) $$), 'P0001:discarded_rekey_invalid', 'rekey: a look-alike (fz_max) is not a key the item owns');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'fz', tests.base()) $$, 'the DM purges fz');
select lives_ok($$ select public.purge_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'rr', tests.base()) $$, 'the DM purges the row rr');
select tests.as_postgres();
select ok(tests.same_except('pre', 'ffffffff-0000-4000-8000-00000000032a', array['gone', 'sabio', 'ath', 'ath__nota', 'ath__extra', 's1', 's1__nota', 's2', 'bolsillo', 'hechizos', 'fz', 'rr', 'rr__nota']),
  'only fz, rr and rr__nota went');
select is((select (data ->> 'fz_max') || (data ->> 'fzs') || (data ->> 'fz_') || (data ->> 'rr_') || (data ->> 'rr2__nota') || (data ->> 'rr__prof') from public.pjs where id = 99101), 'keepkeepkeepkeepkeepkeep', 'fz_max, fzs, fz_, rr_, rr2__nota and rr__prof stay');
select is((select jsonb_array_length(system_profile #> '{sheet,discarded}') from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a'), 4, 'four entries remain (the reused key, viejo, atl and conjuros)');

------------------------------------------------------------------------------
-- Part 4: rekey (restore under a new key)
------------------------------------------------------------------------------
select tests.snapshot('mid');

-- refusals first
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'nope', '{"nope":"nuevo"}',
  tests.restore_profile('viejo', '{"kind":"field","key":"nuevo","label":"N","type":"short","editableBy":"dm"}'), tests.base()) $$), 'P0001:discarded_item_not_found', 'rekey: an unknown key is refused');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"zzz":"nuevo"}',
  tests.restore_profile('viejo', '{"kind":"field","key":"nuevo","label":"N","type":"short","editableBy":"dm"}'), tests.base()) $$), 'P0001:discarded_rekey_invalid', 'rekey: the renamed key must be one the item owns');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"viejo":"otro"}',
  tests.restore_profile('viejo', '{"kind":"field","key":"nuevo","label":"N","type":"short","editableBy":"dm"}'), tests.base()) $$), 'P0001:discarded_rekey_invalid', 'rekey: the new key must be in the new sheet');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"viejo":"nuevo"}',
  tests.restore_profile('nope', '{"kind":"field","key":"nuevo","label":"N","type":"short","editableBy":"dm"}'), tests.base()) $$), 'P0001:discarded_rekey_invalid',
  'rekey: the new sheet must not keep the entry');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"viejo":"fuerza"}',
  tests.restore_profile('viejo', '{"kind":"field","key":"nuevo","label":"N","type":"short","editableBy":"dm"}'), tests.base()) $$), 'P0001:discarded_rekey_invalid',
  'rekey: the new key must be one the restore adds, not a key a live item already had');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"viejo":"gone2"}',
  tests.restore_profile('viejo', '{"kind":"field","key":"gone2","label":"N","type":"short","editableBy":"dm"}'), tests.base()) $$), 'P0001:discarded_key_taken',
  'rekey: a new key that already holds data in a character is refused');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"viejo":"nuevo"}',
  tests.restore_profile('viejo', '{"kind":"field","key":"nuevo","label":"N","type":"short","editableBy":"dm"}'), '2020-01-01') $$), 'P0001:campaign_conflict', 'rekey: a stale version is a conflict');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"viejo":"tabla_n"}',
  tests.restore_profile('viejo', '{"kind":"table","type":"libre","key":"tabla_n","label":"T","editableBy":"dm","columns":[]}'), tests.base()) $$), 'P0001:discarded_rekey_invalid',
  'rekey: the new key must be an item of the same kind and type as the discarded one');
select is(tests.err($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"viejo":"nuevo"}',
  tests.restore_profile_dropping('viejo', '{"kind":"field","key":"nuevo","label":"N","type":"short","editableBy":"dm"}', 'mana'), tests.base()) $$), 'P0001:discarded_rekey_invalid',
  'rekey: only the restored entry may leave the list (mana would be lost)');
select tests.as_postgres();
select ok(tests.identical('mid', 'ffffffff-0000-4000-8000-00000000032a'), 'rekey refusals left every character byte-identical');

-- the old key is free: the values MOVE
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'viejo', '{"viejo":"nuevo"}',
  tests.restore_profile('viejo', '{"kind":"field","key":"nuevo","label":"Nuevo","type":"short","editableBy":"dm"}'), tests.base()) $$, 'the DM restores a field under a new key');
select tests.as_postgres();
select is((select jsonb_agg(data ->> 'nuevo' order by id) from public.pjs where campaign_id = 'ffffffff-0000-4000-8000-00000000032a'), '["v1", "v2", "v3"]'::jsonb, 'every character has its value under the new key');
select ok((select true)
          and (select bool_and(((s.j -> 'data') - 'viejo') = ((to_jsonb(p) -> 'data') - 'nuevo')) from tests.snap s join public.pjs p on p.id = s.id where s.tag = 'mid' and p.campaign_id = 'ffffffff-0000-4000-8000-00000000032a'),
  'the old key is gone and nothing else changed in the data');
select is((select count(*)::int from public.pjs where campaign_id = 'ffffffff-0000-4000-8000-00000000032a' and data ? 'viejo'), 0, 'the old key was moved, not copied');
select ok(tests.identical('mid', 'ffffffff-0000-4000-8000-00000000032b'), 'the other campaign is untouched');
select is((select jsonb_path_exists(system_profile, '$.sheet.discarded[*] ? (@.item.key == "viejo")') from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a'), false, 'the entry left the list');
select is((select system_profile #>> '{sheet,categories,0,sections,0,items,-1,key}' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a'), 'nuevo', 'the restored item sits at the end of the section');

-- the old key is live again (reuse): the values are COPIED, the live item keeps its own
select tests.snapshot('pre-copy');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'mana', '{"mana":"mana_2"}',
  tests.restore_profile('mana', '{"kind":"field","key":"mana_2","label":"Maná viejo","type":"short","editableBy":"dm"}'), tests.base()) $$, 'the DM restores a field whose key was reused under mana_2');
select tests.as_postgres();
select is((select jsonb_agg(data ->> 'mana' order by id) from public.pjs where campaign_id = 'ffffffff-0000-4000-8000-00000000032a'), '["m1", "m2", null]'::jsonb, 'the live item keeps what the characters hold under its key');
select is((select jsonb_agg(data ->> 'mana_2' order by id) from public.pjs where campaign_id = 'ffffffff-0000-4000-8000-00000000032a'), '["m1", "m2", null]'::jsonb, 'the restored item got a copy under the new key');
select ok((select bool_and(((s.j -> 'data')) = ((to_jsonb(p) -> 'data') - 'mana_2')) from tests.snap s join public.pjs p on p.id = s.id where s.tag = 'pre-copy' and p.campaign_id = 'ffffffff-0000-4000-8000-00000000032a'),
  'only mana_2 was added');

-- a Capacidades row: the row key and row__column keys follow it, ath__prof-like look-alikes (atl__prof) do not
select tests.snapshot('pre-row');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'atl', '{"atl":"atl_2"}',
  tests.restore_profile('atl', '{"kind":"table","type":"capacidades","key":"habs2","label":"Habilidades","columns":[
    {"key":"prof","label":"Prof","type":"number","editableBy":"dm"},{"key":"nota","label":"Nota","type":"short","editableBy":"dm"},{"key":"extra","label":"Extra","type":"short","editableBy":"dm"}],
    "rows":[{"key":"atl_2","label":"Atletismo","stat":"fuerza","use":"valor","editableBy":"dm"}]}'), tests.base()) $$, 'the DM restores a Capacidades row under a new key');
select tests.as_postgres();
select is((select (data -> 'atl_2', data -> 'atl_2__nota', data -> 'atl_2__extra', data ? 'atl', data ? 'atl__nota', data ? 'atl__extra', data -> 'atl__prof')::text from public.pjs where id = 99101),
  '(1,"""an""","""ae""",f,f,f,"""keep""")', 'the row and its columns moved to the new key; the key the row never owned stayed');
select ok((select bool_and(((s.j -> 'data') - 'atl' - 'atl__nota' - 'atl__extra') = ((to_jsonb(p) -> 'data') - 'atl_2' - 'atl_2__nota' - 'atl_2__extra'))
             from tests.snap s join public.pjs p on p.id = s.id where s.tag = 'pre-row' and p.campaign_id = 'ffffffff-0000-4000-8000-00000000032a'), 'nothing else changed in any character');

-- a Habilidad table: the value and the catalogue entries follow the new key
select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select lives_ok($$ select public.rekey_discarded_item('ffffffff-0000-4000-8000-00000000032a', 'conjuros', '{"conjuros":"conjuros_2"}',
  tests.restore_profile('conjuros', '{"kind":"table","type":"habilidad","key":"conjuros_2","label":"Conjuros","editableBy":"dm","columns":[{"key":"nota","label":"Nota","type":"short","editableBy":"dm"}]}'), tests.base()) $$,
  'the DM restores a Habilidad table under a new key');
select tests.as_postgres();
select is((select data -> 'conjuros_2' from public.pjs where id = 99101), '[{"x": 9}]'::jsonb, 'the table value moved');
select is((select table_key from public.campaign_actions where id = 97504), 'conjuros_2', 'its catalogue entry follows the new key');
select is((select count(*)::int from public.pj_action_links where action_id = 97504), 1, 'and its link is kept');
select ok(tests.identical('mid', 'ffffffff-0000-4000-8000-00000000032b'), 'the other campaign is untouched by every rekey');
select is((select jsonb_array_length(coalesce(system_profile #> '{sheet,discarded}', '[]')) from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000032a'), 0, 'the discarded list is empty again');

select * from finish();
rollback;
