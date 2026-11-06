-- pgTAP: G6a of the system-agnostic campaigns (odd/tasks/system-agnostic.md S35, S36, S37; S22/S23 for context).
--   Part 1: Habilidad columns declare scope 'entry' | 'character' (validate_system_profile; the same cases live in
--           src/campaign/system/sheet/sheetModelG6a.test.ts: both validators must agree).
--   Part 2: the shared action collection (campaign_actions) and the per-character links with state (pj_action_links):
--           DM full CRUD, player reads only linked + own private entries, player writes only link state (character-scope
--           columns of a player-editable table, values judged by _sheet_value_ok), same-campaign / private-link rules,
--           dedupe, entry validation against the sheet, cascades, realtime.
-- Self-contained fixture, rolled back at the end.
begin;

select plan(107);

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
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- runs one statement as the CURRENT role: 'ok' when it changed exactly one row, 'norows' when RLS hid it, else the SQLSTATE
create function tests.try(p_sql text) returns text language plpgsql security invoker as $$
declare
  n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'norows' end;
exception when others then
  return sqlstate;
end;
$$;

-- same, but returns SQLSTATE:message (the stable reason code of a refused statement)
create function tests.reason(p_sql text) returns text language plpgsql security invoker as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture: dm (..0101, DM of A, B, C and D), player (..0102, owns pj 98001 in A), outsider (..0103, member of nothing),
--          player2 (..0104, owns pj 98004 in A)
--   A = sheet with the Habilidad tables hechizos (player, categories) and rasgos (DM), B = same sheet, C = D&D preset,
--   D = no sheet
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('eeeeeeee-0000-4000-8000-000000000' || (100 + n))::uuid,
       'authenticated', 'authenticated', 'coll-u' || n || '@example.test', json_build_object('full_name', 'Coll ' || n)::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, slug, name, created_by) values
  ('ffffffff-0000-4000-8000-0000000031aa', 'coll-a', 'Coll A', 'eeeeeeee-0000-4000-8000-000000000101'),
  ('ffffffff-0000-4000-8000-0000000031bb', 'coll-b', 'Coll B', 'eeeeeeee-0000-4000-8000-000000000101'),
  ('ffffffff-0000-4000-8000-0000000031cc', 'coll-c', 'Coll C', 'eeeeeeee-0000-4000-8000-000000000101'),
  ('ffffffff-0000-4000-8000-0000000031dd', 'coll-d', 'Coll D', 'eeeeeeee-0000-4000-8000-000000000101');
insert into public.campaign_members (campaign_id, user_id, role)
select c, 'eeeeeeee-0000-4000-8000-000000000101', 'dm'
from (values ('ffffffff-0000-4000-8000-0000000031aa'::uuid), ('ffffffff-0000-4000-8000-0000000031bb'),
             ('ffffffff-0000-4000-8000-0000000031cc'), ('ffffffff-0000-4000-8000-0000000031dd')) as cs(c);
insert into public.campaign_members (campaign_id, user_id, role) values
  ('ffffffff-0000-4000-8000-0000000031aa', 'eeeeeeee-0000-4000-8000-000000000102', 'player'),
  ('ffffffff-0000-4000-8000-0000000031aa', 'eeeeeeee-0000-4000-8000-000000000104', 'player');
insert into public.pjs (id, campaign_id, owner_id, nombre) values
  (98001, 'ffffffff-0000-4000-8000-0000000031aa', 'eeeeeeee-0000-4000-8000-000000000102', 'Player 1 in A'),
  (98004, 'ffffffff-0000-4000-8000-0000000031aa', 'eeeeeeee-0000-4000-8000-000000000104', 'Player 2 in A'),
  (98011, 'ffffffff-0000-4000-8000-0000000031bb', null, 'Unowned in B');
update public.campaigns set system_profile = system_profile - 'sheet' where id = 'ffffffff-0000-4000-8000-0000000031dd';

create function tests.base() returns jsonb language sql stable as $$
  select system_profile - 'sheet' from public.campaigns where id = 'ffffffff-0000-4000-8000-0000000031cc';
$$;

-- hechizos: a player table with categories; entry columns escuela / coste, character columns preparado / usos / forma / nota
-- rasgos: a DM table without categories; entry column fuente, character column usada (DM)
create function tests.sheet() returns jsonb language sql stable as $$
  select $sheet${
    "categories": [{"key": "c", "label": "C", "sections": [
      {"key": "alpha", "label": "Alpha", "items": [
        {"kind": "table", "type": "habilidad", "key": "hechizos", "label": "Hechizos", "editableBy": "player",
         "categories": [{"key": "truco", "label": "Truco"}, {"key": "nivel1", "label": "Nivel 1"}],
         "columns": [
          {"key": "escuela", "label": "Escuela", "type": "short", "editableBy": "player", "scope": "entry"},
          {"key": "coste", "label": "Coste", "type": "number", "editableBy": "player"},
          {"key": "preparado", "label": "Preparado", "type": "boolean", "editableBy": "player", "scope": "character"},
          {"key": "usos", "label": "Usos", "type": "number", "editableBy": "player", "scope": "character"},
          {"key": "forma", "label": "Forma", "type": "options", "display": "select", "editableBy": "player", "scope": "character",
           "options": [{"key": "a", "label": "A"}, {"key": "b", "label": "B"}]},
          {"key": "nota", "label": "Nota", "type": "paragraph", "editableBy": "player", "scope": "character"}]},
        {"kind": "table", "type": "habilidad", "key": "rasgos", "label": "Rasgos", "editableBy": "dm",
         "columns": [
          {"key": "fuente", "label": "Fuente", "type": "short", "editableBy": "dm"},
          {"key": "usada", "label": "Usada", "type": "boolean", "editableBy": "dm", "scope": "character"}]},
        {"kind": "table", "type": "libre", "key": "inv", "label": "Inv", "editableBy": "dm",
         "columns": [{"key": "a", "label": "A", "type": "short", "editableBy": "dm"}]}
      ], "blocks": []}]}],
    "roles": {}
  }$sheet$::jsonb;
$$;
create function tests.profile() returns jsonb language sql stable as $$
  select tests.base() || jsonb_build_object('sheet', tests.sheet());
$$;
grant execute on function tests.profile(), tests.sheet(), tests.base() to authenticated;

select tests.as_user('eeeeeeee-0000-4000-8000-000000000101');
select lives_ok(
  $$ select public.set_system_profile('ffffffff-0000-4000-8000-0000000031aa', tests.profile(),
       (select updated_at from public.campaigns where id = 'ffffffff-0000-4000-8000-0000000031aa')),
            public.set_system_profile('ffffffff-0000-4000-8000-0000000031bb', tests.profile(),
       (select updated_at from public.campaigns where id = 'ffffffff-0000-4000-8000-0000000031bb')) $$,
  'the DM stores the sheet with scoped Habilidad columns in A and B through the RPC');
select tests.as_postgres();

------------------------------------------------------------------------------
-- Part 1: column scope in the validator
------------------------------------------------------------------------------
create function tests.detail(doc jsonb) returns text language plpgsql as $$
declare
  d text;
begin
  perform public.validate_system_profile(doc);
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end;
$$;
create function tests.hab(columns jsonb, extra jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object('kind', 'table', 'type', 'habilidad', 'key', 'h', 'label', 'H', 'editableBy', 'dm', 'columns', columns) || extra;
$$;
create function tests.col(key text, extra jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object('key', key, 'label', key, 'type', 'short', 'editableBy', 'dm') || extra;
$$;
create function tests.doc_of(items jsonb) returns jsonb language sql stable as $$
  select tests.base() || jsonb_build_object('sheet', jsonb_build_object('roles', '{}'::jsonb, 'categories', jsonb_build_array(
    jsonb_build_object('key', 'c', 'label', 'C', 'sections', jsonb_build_array(
      jsonb_build_object('key', 's', 'label', 's', 'items', items, 'blocks', '[]'::jsonb))))));
$$;
-- NULL when a sheet whose only section holds `items` validates, otherwise the DETAIL of the error
create function tests.chk(items jsonb) returns text language sql as $$
  select tests.detail(tests.doc_of(items));
$$;
create function tests.kept_columns(items jsonb) returns jsonb language sql as $$
  select public.validate_system_profile(tests.doc_of(items)) #> '{sheet,categories,0,sections,0,items,0,columns}';
$$;
create function tests.at(p text) returns text language sql immutable as $$
  select 'sheet.categories[0].sections[0].' || p;
$$;

select is(tests.chk(jsonb_build_array(tests.hab(jsonb_build_array(tests.col('a', '{"scope":"entry"}'), tests.col('b', '{"type":"boolean","scope":"character"}'), tests.col('c'))))),
  null, 'a Habilidad table with entry and character columns validates');
select is(tests.kept_columns(jsonb_build_array(tests.hab(jsonb_build_array(tests.col('a', '{"scope":"entry"}'), tests.col('b', '{"scope":"character"}'), tests.col('c'))))) #>> '{0,scope}',
  'entry', 'an entry scope is returned as declared');
select is(tests.kept_columns(jsonb_build_array(tests.hab(jsonb_build_array(tests.col('a', '{"scope":"entry"}'), tests.col('b', '{"scope":"character"}'), tests.col('c'))))) #>> '{1,scope}',
  'character', 'a character scope is returned as declared');
select is((tests.kept_columns(jsonb_build_array(tests.hab(jsonb_build_array(tests.col('a'))))) -> 0) ? 'scope', false, 'a column without scope is returned without the property');
select is(tests.chk(jsonb_build_array(tests.hab(jsonb_build_array(tests.col('a'), tests.col('b', '{"scope":"both"}'))))), tests.at('items[0].columns[1].scope'), 'an unknown scope is rejected at the column');
select is(tests.chk(jsonb_build_array(tests.hab(jsonb_build_array(tests.col('a', '{"scope":null}'))))), tests.at('items[0].columns[0].scope'), 'a null scope is rejected');
select is(tests.chk(jsonb_build_array(tests.hab(jsonb_build_array(tests.col('a', '{"scope":"Entry"}'))))), tests.at('items[0].columns[0].scope'), 'scopes are case sensitive');
select is(tests.chk(jsonb_build_array(tests.hab(jsonb_build_array(tests.col('a', '{"type":"number"}'), tests.col('b', '{"type":"number","formula":"{a} + 1","scope":"character"}'))))),
  tests.at('items[0].columns[1].scope'), 'scope on a formula column is rejected');
select is(tests.chk(jsonb_build_array(tests.hab(jsonb_build_array(tests.col('a', '{"scope":"character"}')), '{"type":"libre","key":"l"}'))),
  tests.at('items[0].columns[0].scope'), 'scope on a Libre column is rejected');
select is(tests.chk(jsonb_build_array(
    '{"kind":"table","type":"stat","key":"attrs","label":"Attrs","rows":[{"key":"fue","label":"FUE","modifier":"0","editableBy":"dm"}]}'::jsonb,
    '{"kind":"table","type":"capacidades","key":"caps","label":"Caps","columns":[{"key":"prof","label":"Prof","type":"short","editableBy":"dm","scope":"entry"}],"rows":[{"key":"r","label":"R","stat":"fue","use":"modificador","editableBy":"dm"}]}'::jsonb)),
  tests.at('items[1].columns[0].scope'), 'scope on a Capacidades column is rejected');

------------------------------------------------------------------------------
-- Part 2: shape, privileges, realtime
------------------------------------------------------------------------------
select is((select count(*)::int from pg_class where relname in ('campaign_actions', 'pj_action_links') and relrowsecurity), 2, 'RLS is enabled on both tables');
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('campaign_actions', 'pj_action_links')), 2, 'both tables are in the realtime publication (like the entities)');
select is((select count(*)::int from pg_trigger where tgname in ('campaign_actions_set_updated_at', 'pj_action_links_set_updated_at',
  'campaign_actions_forbid_campaign_change', 'pj_action_links_forbid_campaign_change') and not tgisinternal), 4, 'updated_at and campaign_id immutability triggers exist on both tables');

------------------------------------------------------------------------------
-- Fixture rows (no request identity: like a migration or the importer)
------------------------------------------------------------------------------
insert into public.campaign_actions (id, campaign_id, table_key, category, name, description, extras, private_to_pj) values
  (97001, 'ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco',  'Luz',         'Una luz.',   '{"escuela": "evocacion", "coste": 0}', null),
  (97002, 'ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'nivel1', 'Escudo',      '',           '{}', null),
  (97003, 'ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco',  'Chispa',      '',           '{}', null),
  (97004, 'ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco',  'Mi truco',    'Privado.',   '{}', 98001),
  (97005, 'ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco',  'Truco ajeno', 'Privado 2.', '{}', 98004),
  (97006, 'ffffffff-0000-4000-8000-0000000031aa', 'rasgos',   'Raza',   'Vision',      '',           '{"fuente": "elfo"}', null),
  (97020, 'ffffffff-0000-4000-8000-0000000031bb', 'hechizos', 'truco',  'Luz',         '',           '{}', null);
insert into public.pj_action_links (pj_id, action_id, campaign_id, state) values
  (98001, 97001, 'ffffffff-0000-4000-8000-0000000031aa', '{}'),
  (98001, 97002, 'ffffffff-0000-4000-8000-0000000031aa', '{"preparado": true}'),
  (98001, 97006, 'ffffffff-0000-4000-8000-0000000031aa', '{}'),
  (98004, 97002, 'ffffffff-0000-4000-8000-0000000031aa', '{}'),
  (98004, 97005, 'ffffffff-0000-4000-8000-0000000031aa', '{}'),
  (98011, 97020, 'ffffffff-0000-4000-8000-0000000031bb', '{}');

------------------------------------------------------------------------------
-- Visibility
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000102');
select is((select array_agg(id order by id) from public.campaign_actions), array[97001, 97002, 97004, 97006]::bigint[],
  'player 1 sees the entries linked to their character plus the one private to it, nothing else');
select is((select count(*)::int from public.campaign_actions where id = 97003), 0, 'an unlinked entry is invisible to the player');
select is((select count(*)::int from public.campaign_actions where id = 97005), 0, 'the private entry of ANOTHER character is invisible even if it is linked there');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-0000000031bb'), 0, 'entries of other campaigns are invisible');
select is((select array_agg(action_id order by action_id) from public.pj_action_links), array[97001, 97002, 97006]::bigint[], 'the player sees only the links of their own character');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000104');
select is((select array_agg(id order by id) from public.campaign_actions), array[97002, 97005]::bigint[], 'player 2 sees their linked entry and their private one');
select is((select count(*)::int from public.pj_action_links where pj_id = 98001), 0, 'player 2 cannot see the links of another character');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000103');
select is((select count(*)::int from public.campaign_actions), 0, 'an outsider sees no entries');
select is((select count(*)::int from public.pj_action_links), 0, 'an outsider sees no links');
select tests.as_anon();
select is(tests.try('select 1 from public.campaign_actions limit 1'), '42501', 'anon has no privilege on the entries');
select is(tests.try('select 1 from public.pj_action_links limit 1'), '42501', 'anon has no privilege on the links');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000101');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-0000000031aa'), 6, 'the DM sees every entry of the campaign, private ones included');
select is((select count(*)::int from public.pj_action_links where campaign_id = 'ffffffff-0000-4000-8000-0000000031aa'), 5, 'the DM sees every link of the campaign');

------------------------------------------------------------------------------
-- The player cannot create, change or remove entries, nor create or remove links
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000102');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'Mio') $$), '42501', 'a player cannot insert an entry');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name, private_to_pj) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'Mio privado', 98001) $$), '42501', 'a player cannot insert an entry private to their own character either');
select is(tests.try($$ update public.campaign_actions set name = 'Hack' where id = 97001 $$), 'norows', 'a player cannot update an entry');
select is(tests.try($$ update public.campaign_actions set name = 'Hack' where id = 97004 $$), 'norows', 'a player cannot update their own private entry (only the DM edits entries)');
select is(tests.try($$ delete from public.campaign_actions where id = 97004 $$), 'norows', 'a player cannot delete an entry');
select is(tests.try($$ insert into public.pj_action_links (pj_id, action_id, campaign_id) values (98001, 97003, 'ffffffff-0000-4000-8000-0000000031aa') $$), '42501', 'a player cannot link an entry');
select is(tests.try($$ delete from public.pj_action_links where pj_id = 98001 and action_id = 97001 $$), 'norows', 'a player cannot unlink an entry');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000103');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'Out') $$), '42501', 'an outsider cannot insert an entry');
select is(tests.try($$ update public.pj_action_links set state = '{"usos": 1}' where pj_id = 98001 $$), 'norows', 'an outsider cannot change link state');
select tests.as_postgres();
select is((select count(*)::int from public.campaign_actions where id in (97001, 97004) and name in ('Luz', 'Mi truco')), 2, 'the refused writes left the entries untouched');

------------------------------------------------------------------------------
-- Player writes of link state: character-scope columns of a player-editable table, valid values
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000102');
select is(tests.try($$ update public.pj_action_links set state = state || '{"preparado": true}' where pj_id = 98001 and action_id = 97001 $$), 'ok', 'a player sets a boolean character column');
select is(tests.try($$ update public.pj_action_links set state = state || '{"usos": 2}' where pj_id = 98001 and action_id = 97001 $$), 'ok', 'a player sets a number character column');
select is(tests.try($$ update public.pj_action_links set state = state || '{"forma": "b"}' where pj_id = 98001 and action_id = 97001 $$), 'ok', 'a player sets an options character column to a declared key');
select is(tests.try($$ update public.pj_action_links set state = state || '{"nota": "pensar"}' where pj_id = 98001 and action_id = 97001 $$), 'ok', 'a player sets a paragraph character column');
select is(tests.try($$ update public.pj_action_links set state = state || '{"usos": null}' where pj_id = 98001 and action_id = 97001 $$), 'ok', 'null clears a value');
select is(tests.reason($$ update public.pj_action_links set state = state || '{"usos": "muchos"}' where pj_id = 98001 and action_id = 97001 $$), '23514:invalid_link_state', 'a wrong type is refused');
select is(tests.reason($$ update public.pj_action_links set state = state || '{"usos": 1000000000001}' where pj_id = 98001 and action_id = 97001 $$), '23514:invalid_link_state', 'a number out of range is refused');
select is(tests.reason($$ update public.pj_action_links set state = state || '{"forma": "z"}' where pj_id = 98001 and action_id = 97001 $$), '23514:invalid_link_state', 'an undeclared option key is refused');
select is(tests.reason($$ update public.pj_action_links set state = state || '{"preparado": "si"}' where pj_id = 98001 and action_id = 97001 $$), '23514:invalid_link_state', 'a boolean column refuses text');
select is(tests.reason($$ update public.pj_action_links set state = state || '{"inventado": 1}' where pj_id = 98001 and action_id = 97001 $$), '23514:invalid_link_state', 'an undeclared key is refused');
select is(tests.reason($$ update public.pj_action_links set state = state || '{"escuela": "x"}' where pj_id = 98001 and action_id = 97001 $$), '23514:invalid_link_state', 'an ENTRY-scope column is not link state');
select is(tests.reason($$ update public.pj_action_links set state = state || '{"usada": true}' where pj_id = 98001 and action_id = 97006 $$), '42501:link_state_not_writable', 'a character column of a DM table is closed to the player');
select is(tests.try($$ update public.pj_action_links set state = '{"preparado": true}' where pj_id = 98004 and action_id = 97002 $$), 'norows', 'a player cannot change the link of ANOTHER character');
select is(tests.try($$ update public.pj_action_links set pj_id = 98004 where pj_id = 98001 and action_id = 97001 $$), '42501', 'a player cannot move a link to another character (no privilege on the column)');
select is(tests.try($$ update public.pj_action_links set action_id = 97003 where pj_id = 98001 and action_id = 97001 $$), '42501', 'a player cannot repoint a link (no privilege on the column)');
select tests.as_postgres();
select is((select state from public.pj_action_links where pj_id = 98001 and action_id = 97001), '{"preparado": true, "forma": "b", "nota": "pensar", "usos": null}'::jsonb, 'only the accepted writes are stored');
select is((select state from public.pj_action_links where pj_id = 98001 and action_id = 97006), '{}'::jsonb, 'the refused write on the DM table stored nothing');

------------------------------------------------------------------------------
-- DM: full CRUD on entries and links
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000101');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name, description, extras, function)
  values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'nivel1', 'Rayo', 'Un rayo.', '{"escuela": "evocacion", "coste": 3}', '[{"step": "x"}]') $$), 'ok', 'the DM creates an entry');
select is(tests.try($$ update public.campaign_actions set description = 'Un rayo azul.', extras = '{"coste": 4}' where name = 'Rayo' $$), 'ok', 'the DM edits an entry');
select is(tests.try($$ update public.campaign_actions set function = null where name = 'Rayo' $$), 'ok', 'the DM clears the function');
select is(tests.try($$ insert into public.pj_action_links (pj_id, action_id, campaign_id) values (98001, (select id from public.campaign_actions where name = 'Rayo'), 'ffffffff-0000-4000-8000-0000000031aa') $$), 'ok', 'the DM links an entry to a character');
select is(tests.try($$ update public.pj_action_links set state = '{"preparado": true, "usos": 1}' where pj_id = 98001 and action_id = (select id from public.campaign_actions where name = 'Rayo') $$), 'ok', 'the DM writes link state');
select is(tests.try($$ update public.pj_action_links set state = '{"usada": true}' where pj_id = 98001 and action_id = 97006 $$), 'ok', 'the DM writes the state of a DM table');
select is(tests.reason($$ update public.pj_action_links set state = '{"escuela": "x"}' where pj_id = 98001 and action_id = (select id from public.campaign_actions where name = 'Rayo') $$), '23514:invalid_link_state', 'even the DM cannot put an entry-scope key into link state');
select is(substr(tests.reason($$ update public.pj_action_links set state = '[]' where pj_id = 98001 and action_id = (select id from public.campaign_actions where name = 'Rayo') $$), 1, 5), '23514', 'link state must be an object');
select is(tests.try($$ delete from public.pj_action_links where pj_id = 98001 and action_id = (select id from public.campaign_actions where name = 'Rayo') $$), 'ok', 'the DM unlinks');
select is(tests.try($$ delete from public.campaign_actions where name = 'Rayo' $$), 'ok', 'the DM deletes an entry');
select is(tests.try($$ update public.campaign_actions set campaign_id = 'ffffffff-0000-4000-8000-0000000031bb' where id = 97001 $$), '42501', 'the campaign of an entry cannot be changed');

------------------------------------------------------------------------------
-- Entry validation against the sheet
------------------------------------------------------------------------------
select is(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'nope', '', 'X') $$), '23514:action_not_in_sheet', 'the table must exist in the sheet');
select is(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'inv', '', 'X') $$), '23514:action_not_in_sheet', 'the table must be a Habilidad table');
select is(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031dd', 'hechizos', '', 'X') $$), '23514:action_not_in_sheet', 'a campaign without a sheet has no collection');
select is(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'nivel9', 'X') $$), '23514:invalid_action_category', 'a table with categories takes only a declared key');
select is(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'Truco', 'X') $$), '23514:invalid_action_category', 'the label is not the key');
select is(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', '', 'X') $$), '23514:invalid_action_category', 'a table with categories refuses an empty category');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'rasgos', 'Cualquier texto libre', 'Libre') $$), 'ok', 'a table without categories takes free text');
select is(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name, extras) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'X', '{"inventado": 1}') $$), '23514:invalid_action_extras', 'extras take only declared columns');
select is(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name, extras) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'X', '{"preparado": true}') $$), '23514:invalid_action_extras', 'a character-scope column is not an extra');
select is(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name, extras) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'X', '{"coste": "caro"}') $$), '23514:invalid_action_extras', 'extras are judged by the column type');
select is(substr(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name, extras) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'X', '[]') $$), 1, 5), '23514', 'extras must be an object');
select is(substr(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name, extras) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'X', jsonb_build_object('escuela', repeat('x', 21000))) $$), 1, 5), '23514', 'extras are bounded in size');
select is(tests.reason($$ update public.campaign_actions set category = 'nivel9' where id = 97001 $$), '23514:invalid_action_category', 'an update to an undeclared category is refused');
select is(tests.try($$ update public.campaign_actions set extras = '{"coste": 1}' where id = 97001 $$), 'ok', 'an update with valid extras passes');
select is(substr(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', '') $$), 1, 5), '23514', 'the name is required');
select is(substr(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', '   ') $$), 1, 5), '23514', 'a blank name is refused');
select is(substr(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', repeat('n', 201)) $$), 1, 5), '23514', 'the name is bounded');
select is(substr(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name, description) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'Largo', repeat('d', 20001)) $$), 1, 5), '23514', 'the description is bounded');
select is(substr(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name, function) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'F1', '"texto"') $$), 1, 5), '23514', 'the function is an object or an array');
select is(substr(tests.reason($$ insert into public.campaign_actions (campaign_id, table_key, category, name, function) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'F2', jsonb_build_object('steps', repeat('s', 60000))) $$), 1, 5), '23514', 'the function is bounded in size');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name, function) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'F3', '{"steps": []}') $$), 'ok', 'an object function is stored (its content is validated in G6c)');

------------------------------------------------------------------------------
-- Dedupe: (campaign, table, category, lower(name), private character)
------------------------------------------------------------------------------
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'Luz') $$), '23505', 'the same shared name in the same table and category is a duplicate');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'LUZ') $$), '23505', 'names are compared case-insensitively');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'nivel1', 'Luz') $$), 'ok', 'the same name in another category is allowed');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name, private_to_pj) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'Luz', 98001) $$), 'ok', 'a private entry may reuse a shared name');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name, private_to_pj) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'luz', 98001) $$), '23505', 'but not twice for the same character');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name, private_to_pj) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'Luz', 98004) $$), 'ok', 'another character may have a private entry with the same name');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name) values ('ffffffff-0000-4000-8000-0000000031bb', 'hechizos', 'nivel1', 'Luz') $$), 'ok', 'another campaign has its own namespace');

------------------------------------------------------------------------------
-- Same-campaign and private-entry rules
------------------------------------------------------------------------------
select is(tests.try($$ insert into public.pj_action_links (pj_id, action_id, campaign_id) values (98001, 97020, 'ffffffff-0000-4000-8000-0000000031aa') $$), '23503', 'an entry of another campaign cannot be linked (campaign A character, campaign B entry)');
select is(tests.try($$ insert into public.pj_action_links (pj_id, action_id, campaign_id) values (98001, 97020, 'ffffffff-0000-4000-8000-0000000031bb') $$), '23503', 'nor with the campaign of the entry (the character is not in it)');
select is(tests.try($$ insert into public.campaign_actions (campaign_id, table_key, category, name, private_to_pj) values ('ffffffff-0000-4000-8000-0000000031aa', 'hechizos', 'truco', 'Cross', 98011) $$), '23503', 'an entry cannot be private to a character of another campaign');
select is(tests.reason($$ insert into public.pj_action_links (pj_id, action_id, campaign_id) values (98001, 97005, 'ffffffff-0000-4000-8000-0000000031aa') $$), '23514:action_private_to_other_character', 'a private entry cannot be linked to another character');
select is(tests.try($$ insert into public.pj_action_links (pj_id, action_id, campaign_id) values (98001, 97004, 'ffffffff-0000-4000-8000-0000000031aa') $$), 'ok', 'a private entry can be linked to its own character');
select is(tests.reason($$ update public.campaign_actions set private_to_pj = 98004 where id = 97004 $$), '23514:action_private_to_other_character', 'an entry cannot become private to another character while linked elsewhere');
select is(tests.try($$ insert into public.pj_action_links (pj_id, action_id, campaign_id) values (98001, 97001, 'ffffffff-0000-4000-8000-0000000031aa') $$), '23505', 'a link is unique per character and entry');

------------------------------------------------------------------------------
-- Cascades
------------------------------------------------------------------------------
select tests.as_postgres();
delete from public.pjs where id = 98004;
select is((select count(*)::int from public.campaign_actions where id = 97005 or private_to_pj = 98004), 0, 'deleting a character deletes the entries private to it');
select is((select count(*)::int from public.pj_action_links where pj_id = 98004), 0, 'deleting a character deletes its links');
select is((select count(*)::int from public.campaign_actions where id = 97002), 1, 'shared entries survive the deletion of a character');
delete from public.campaign_actions where id = 97001;
select is((select count(*)::int from public.pj_action_links where action_id = 97001), 0, 'deleting an entry deletes its links');
select is((select count(*)::int from public.pj_action_links where pj_id = 98001 and action_id = 97002), 1, 'the links of other entries stay');
delete from public.campaigns where id = 'ffffffff-0000-4000-8000-0000000031bb';
select is((select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-0000000031bb')
        + (select count(*)::int from public.pj_action_links where campaign_id = 'ffffffff-0000-4000-8000-0000000031bb'), 0, 'deleting a campaign deletes its entries and links');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'ffffffff-0000-4000-8000-0000000031aa' and private_to_pj is not null), 2, 'the other campaign keeps its private entries');

select * from finish();
rollback;
