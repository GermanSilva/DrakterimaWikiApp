-- pgTAP: G10c of the system-agnostic campaigns (S9, S17, S33, S35-S39), the D&D v2 data migration
-- (20261107120000_dnd5e_v2_data.sql). HIGH RISK: it rewrites stored character data. Runs _dnd5e_v2_migrate_campaign on fixtures shaped
-- like the real export (survey in odd/tasks/system-agnostic.md, G10) and pins: exact results, the backup rows, idempotency, campaigns
-- with a custom sheet left alone, the rollback recipe of the migration header, and equality with the TypeScript twin: the two JSON
-- literals below are the files src/campaign/system/sheet/migration/dnd5eV2.fixture.{input,expected}.json (dnd5eV2Parity.test.ts
-- fails if they drift), and the expected one is what migrateDnd5eV2() returns for that input.
-- Self-contained fixture, rolled back at the end.
begin;

select plan(70);

------------------------------------------------------------------------------
-- Fixture: players (display names from the fixture), campaign A (v1 preset + two custom fields), B (custom sheet),
-- C (v2 preset), D (v2 preset with an entry already in the collection)
------------------------------------------------------------------------------
create function pg_temp.fixture_in() returns jsonb language sql as $f$ select $fixture_in${"campaign":{"character_custom_fields":[{"key":"magralita","label":"Relación con la Magralita","type":"text"},{"key":"ancla","label":"Ancla","type":"text"},{"key":"idiomas","label":"Idiomas secretos","type":"text"}]},"pjs":[{"id":9101,"nivel":2,"owner_display_name":"Ana Dueña","jugador":"texto libre viejo","data":{"stat_hp":20,"skill_acrobatics":0,"skill_arcana":1,"skill_athletics":2,"save_str":true,"stat_hit_dice":"1d8 (2/2)","spell_slots":{"1":3,"2":2},"spell_slots_current":{"1":1},"hechizos":[{"id":1,"nombre":"Bola de Fuego","nivel":3,"preparado":true,"escuela":"Evocación","casting_time":"1 acción","alcance":"150 pies","componentes":"V, S, M","duracion":"Instantáneo","descripcion":"Explota.","a_niveles_superiores":"+1d6","concentracion":false,"ritual":false},{"id":2,"nombre":"Luz","nivel":0,"preparado":true,"escuela":"Evocación","casting_time":"1 acción","alcance":"Toque","componentes":"V, M","duracion":"1 hora","descripcion":"Un objeto brilla.","a_niveles_superiores":"","concentracion":false,"ritual":false},{"id":3,"nombre":"Rayo Solo","nivel":1,"preparado":false,"escuela":"Evocación","descripcion":"Un rayo.","concentracion":true,"ritual":true},{"id":4,"nombre":"Segunda Ola","nivel":10,"preparado":true,"descripcion":"Rasgo de clase."}],"recursos":[{"id":1,"nombre":"Ki","actual":1,"maximo":2,"recuperacion":"corto","notas":""},{"id":2,"nombre":"Furia","actual":0,"maximo":2,"recuperacion":"largo","notas":""}],"custom_fields":{"magralita":"Siente su pulso.","ancla":"Torre","idiomas":"Abisal"}}},{"id":9102,"nivel":3,"owner_display_name":"Beto Dueño","jugador":"","data":{"skill_stealth":1,"skill_perception":2,"stat_hit_dice":"1d10 (1/2)","spell_slots":{"1":4},"hechizos":[{"id":1,"nombre":"Bola de Fuego","nivel":3,"preparado":false,"escuela":"Evocación","casting_time":"1 acción","alcance":"150 pies","componentes":"V, S, M","duracion":"Instantáneo","descripcion":"Explota distinto.","a_niveles_superiores":"+2d6","concentracion":false,"ritual":false},{"id":2,"nombre":"Luz","nivel":0,"preparado":false,"escuela":"Evocación","casting_time":"1 acción","alcance":"Toque","componentes":"V, M","duracion":"1 hora","descripcion":"Un objeto brilla.","a_niveles_superiores":"","concentracion":false,"ritual":false}],"custom_fields":{"magralita":"Duda."}}},{"id":9103,"nivel":2,"owner_display_name":null,"jugador":"Nombre libre","data":{"skill_history":0,"stat_hit_dice":"1d8","spell_slots":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1,"9":1},"spell_slots_current":{"1":4,"2":0,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1,"9":0},"hechizos":[{"id":1,"nombre":"Aura Final","nivel":10,"preparado":true,"descripcion":"Rasgo."}],"recursos":[{"id":1,"nombre":"Inspiración","actual":1,"maximo":3,"recuperacion":"Cuando amanece","notas":""}]}},{"id":9104,"nivel":5,"owner_display_name":null,"jugador":"","data":{"skill_stealth":3,"skill_survival":1,"stat_hit_dice":"muy raro","spell_slots":{"1":0}}},{"id":9105,"nivel":2,"owner_display_name":"Cleo Dueña","jugador":"Cleo Dueña","data":{"skill_arcana":"competente","skill_history":"no","dado_golpe":"1d6","dados_disponibles":1,"spell_slots":{"1":2},"espacios_conjuro":[{"id":1,"nivel":1,"disponibles":1,"maximo":1}],"recursos":[{"id":1,"nombre":"Bendición","actual":1,"maximo":1,"recuperacion":"largo","notas":""}]}},{"id":9106,"nivel":1,"owner_display_name":null,"jugador":"","data":{}},{"id":9107,"nivel":1,"owner_display_name":null,"jugador":"","data":{"magralita":"valor plano","custom_fields":{"magralita":"valor del campo"}}}]}$fixture_in$::jsonb $f$;
create function pg_temp.fixture_out() returns jsonb language sql as $f$ select $fixture_out${"counts":{"pjs_changed":5,"entries_created":6,"links_created":7,"warnings":6},"pjs":[{"id":9101,"data":{"stat_hp":20,"skill_acrobatics":"no","skill_arcana":"competente","skill_athletics":"experto","save_str":true,"recursos":[{"id":1,"nombre":"Ki","actual":1,"maximo":2,"recuperacion":"corto","notas":""},{"id":2,"nombre":"Furia","actual":0,"maximo":2,"recuperacion":"largo","notas":""}],"dado_golpe":"1d8","dados_disponibles":2,"espacios_conjuro":[{"id":1,"nivel":1,"disponibles":1,"maximo":3},{"id":2,"nivel":2,"disponibles":2,"maximo":2}],"magralita":"Siente su pulso.","ancla":"Torre","campo_idiomas":"Abisal"},"jugador":"Ana Dueña"},{"id":9102,"data":{"skill_stealth":"competente","skill_perception":"experto","dado_golpe":"1d10","dados_disponibles":1,"espacios_conjuro":[{"id":1,"nivel":1,"disponibles":4,"maximo":4}],"magralita":"Duda."},"jugador":"Beto Dueño"},{"id":9103,"data":{"skill_history":"no","recursos":[{"id":1,"nombre":"Inspiración","actual":1,"maximo":3,"recuperacion":"largo","notas":""}],"dado_golpe":"1d8","dados_disponibles":2,"espacios_conjuro":[{"id":1,"nivel":1,"disponibles":4,"maximo":4},{"id":2,"nivel":2,"disponibles":0,"maximo":3},{"id":3,"nivel":3,"disponibles":3,"maximo":3},{"id":4,"nivel":4,"disponibles":3,"maximo":3},{"id":5,"nivel":5,"disponibles":2,"maximo":2},{"id":6,"nivel":6,"disponibles":1,"maximo":1},{"id":7,"nivel":7,"disponibles":1,"maximo":1},{"id":8,"nivel":8,"disponibles":1,"maximo":1},{"id":9,"nivel":9,"disponibles":0,"maximo":1}]},"jugador":""},{"id":9104,"data":{"skill_stealth":3,"skill_survival":"competente","dado_golpe":"muy raro"},"jugador":""},{"id":9105,"data":{"skill_arcana":"competente","skill_history":"no","dado_golpe":"1d6","dados_disponibles":1,"espacios_conjuro":[{"id":1,"nivel":1,"disponibles":1,"maximo":1}],"recursos":[{"id":1,"nombre":"Bendición","actual":1,"maximo":1,"recuperacion":"largo","notas":""}]},"jugador":"Cleo Dueña"},{"id":9106,"data":{},"jugador":""},{"id":9107,"data":{"magralita":"valor plano","custom_fields":{"magralita":"valor del campo"}},"jugador":""}],"actions":[{"table_key":"hechizos","category":"nivel_1","name":"Rayo Solo","private_to_pj":null,"description":"Un rayo.","extras":{"escuela":"Evocación","concentracion":true,"ritual":true}},{"table_key":"hechizos","category":"rasgos","name":"Aura Final","private_to_pj":null,"description":"Rasgo.","extras":{}},{"table_key":"hechizos","category":"rasgos","name":"Segunda Ola","private_to_pj":null,"description":"Rasgo de clase.","extras":{}},{"table_key":"hechizos","category":"trucos","name":"Luz","private_to_pj":null,"description":"Un objeto brilla.","extras":{"escuela":"Evocación","tiempo_lanzamiento":"1 acción","alcance":"Toque","componentes":"V, M","duracion":"1 hora"}},{"table_key":"hechizos","category":"nivel_3","name":"Bola de Fuego","private_to_pj":9101,"description":"Explota.","extras":{"escuela":"Evocación","tiempo_lanzamiento":"1 acción","alcance":"150 pies","componentes":"V, S, M","duracion":"Instantáneo","a_niveles_superiores":"+1d6"}},{"table_key":"hechizos","category":"nivel_3","name":"Bola de Fuego","private_to_pj":9102,"description":"Explota distinto.","extras":{"escuela":"Evocación","tiempo_lanzamiento":"1 acción","alcance":"150 pies","componentes":"V, S, M","duracion":"Instantáneo","a_niveles_superiores":"+2d6"}}],"links":[{"pj_id":9101,"action":{"table_key":"hechizos","category":"nivel_1","name":"Rayo Solo","private_to_pj":null},"state":{"preparado":false}},{"pj_id":9101,"action":{"table_key":"hechizos","category":"rasgos","name":"Segunda Ola","private_to_pj":null},"state":{"preparado":true}},{"pj_id":9101,"action":{"table_key":"hechizos","category":"trucos","name":"Luz","private_to_pj":null},"state":{"preparado":true}},{"pj_id":9101,"action":{"table_key":"hechizos","category":"nivel_3","name":"Bola de Fuego","private_to_pj":9101},"state":{"preparado":true}},{"pj_id":9102,"action":{"table_key":"hechizos","category":"trucos","name":"Luz","private_to_pj":null},"state":{"preparado":false}},{"pj_id":9102,"action":{"table_key":"hechizos","category":"nivel_3","name":"Bola de Fuego","private_to_pj":9102},"state":{"preparado":false}},{"pj_id":9103,"action":{"table_key":"hechizos","category":"rasgos","name":"Aura Final","private_to_pj":null},"state":{"preparado":true}}],"custom_section":{"key":"campos_campana","label":"Campos de la campaña","items":[{"kind":"field","key":"magralita","label":"Relación con la Magralita","type":"paragraph","editableBy":"dm"},{"kind":"field","key":"ancla","label":"Ancla","type":"paragraph","editableBy":"dm"},{"kind":"field","key":"campo_idiomas","label":"Idiomas secretos","type":"paragraph","editableBy":"dm"}],"blocks":[{"key":"b_campos_campana","mode":"tile","items":["magralita","ancla","campo_idiomas"]}]}}$fixture_out$::jsonb $f$;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('dddddddd-0000-4000-8000-0000000003' || (10 + n))::uuid,
       'authenticated', 'authenticated', 'dnd5ev2-u' || n || '@example.test', json_build_object('full_name', name)::jsonb
from (values (1, 'Ana Dueña'), (2, 'Beto Dueño'), (3, 'Cleo Dueña'), (4, 'Dani D')) as t(n, name);

insert into public.campaigns (id, slug, name, character_custom_fields) values
  ('dddddddd-0000-4000-8000-0000000003aa', 'dnd5ev2-a', 'Mig A', pg_temp.fixture_in() -> 'campaign' -> 'character_custom_fields'),
  ('dddddddd-0000-4000-8000-0000000003bb', 'dnd5ev2-b', 'Mig B', '[]'),
  ('dddddddd-0000-4000-8000-0000000003cc', 'dnd5ev2-c', 'Mig C', '[]'),
  ('dddddddd-0000-4000-8000-0000000003dd', 'dnd5ev2-d', 'Mig D', '[]');
insert into public.campaign_members (campaign_id, user_id, role)
select 'dddddddd-0000-4000-8000-0000000003aa', u.id, 'player' from auth.users u where u.email like 'dnd5ev2-u%@example.test' and u.email <> 'dnd5ev2-u4@example.test';

-- A: the v1 preset; B: a custom sheet; C and D keep the default (the v2 preset)
update public.campaigns set system_profile = jsonb_set(system_profile, '{sheet}', public._dnd5e_v2_sheet_v1())
 where id = 'dddddddd-0000-4000-8000-0000000003aa';
update public.campaigns set system_profile = jsonb_set(system_profile, '{sheet}', $sheet${
    "categories": [{"key": "c", "label": "C", "sections": [{"key": "alpha", "label": "Alpha", "items": [
      {"kind": "field", "key": "grado", "label": "Grado", "type": "short", "editableBy": "dm"}], "blocks": []}]}],
    "roles": {}
  }$sheet$::jsonb)
 where id = 'dddddddd-0000-4000-8000-0000000003bb';

-- the fixture characters of campaign A; the owner is the player with that display name
insert into public.pjs (id, campaign_id, owner_id, nombre, nivel, data)
select (p ->> 'id')::bigint, 'dddddddd-0000-4000-8000-0000000003aa',
       (select pr.id from public.profiles pr where pr.display_name = p ->> 'owner_display_name'),
       'Fixture ' || (p ->> 'id'), (p ->> 'nivel')::int, p -> 'data'
from jsonb_array_elements(pg_temp.fixture_in() -> 'pjs') p;
-- the legacy free text (inserting an owned character derives jugador from the owner, so it is set afterwards)
update public.pjs set jugador = x.jugador
from (select (p ->> 'id')::bigint as id, p ->> 'jugador' as jugador from jsonb_array_elements(pg_temp.fixture_in() -> 'pjs') p) x
where pjs.id = x.id;

insert into public.pjs (id, campaign_id, nombre, nivel, jugador, data) values
  (9201, 'dddddddd-0000-4000-8000-0000000003bb', 'Custom', 2, 'texto', '{"skill_arcana": 1, "stat_hit_dice": "1d8 (2/2)", "hechizos": [{"nombre": "Luz", "nivel": 0}]}'),
  (9301, 'dddddddd-0000-4000-8000-0000000003cc', 'V2 sheet', 4, 'texto', '{"stat_hit_dice": "1d10", "skill_stealth": 2, "recursos": [{"nombre": "R", "recuperacion": "Descanso corto"}]}'),
  (9401, 'dddddddd-0000-4000-8000-0000000003dd', 'Reuse', 2, '', '{"hechizos": [{"nombre": "Luz", "nivel": 0, "preparado": true, "descripcion": "otra"}]}');
insert into public.campaign_actions (id, campaign_id, table_key, category, name, description) values (99401, 'dddddddd-0000-4000-8000-0000000003dd', 'hechizos', 'trucos', 'luz', 'del DM');

create function pg_temp.snapshot(p_campaign uuid) returns jsonb language sql as $f$
  select jsonb_build_object(
    'pjs', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'jugador', jugador) order by id), '[]') from public.pjs where campaign_id = p_campaign),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('table_key', table_key, 'category', category, 'name', name, 'private_to_pj', private_to_pj,
                  'description', description, 'extras', extras) order by coalesce(private_to_pj, 0), category collate "C", lower(name) collate "C"), '[]')
                  from public.campaign_actions where campaign_id = p_campaign),
    'links', (select coalesce(jsonb_agg(jsonb_build_object('pj_id', l.pj_id, 'action', jsonb_build_object('table_key', a.table_key, 'category', a.category,
                  'name', a.name, 'private_to_pj', a.private_to_pj), 'state', l.state)
                  order by l.pj_id, coalesce(a.private_to_pj, 0), a.category collate "C", lower(a.name) collate "C"), '[]')
                  from public.pj_action_links l join public.campaign_actions a on a.id = l.action_id where l.campaign_id = p_campaign),
    'sheet', (select system_profile -> 'sheet' from public.campaigns where id = p_campaign),
    'custom_section', (select s from public.campaigns c, jsonb_path_query(c.system_profile -> 'sheet', '$.categories[*].sections[*] ? (@.key == "campos_campana")') s where c.id = p_campaign))
$f$;

------------------------------------------------------------------------------
-- Before: shape of the migration objects and of the stored sheets
------------------------------------------------------------------------------
select has_function('public', '_dnd5e_v2_migrate_campaign', array['uuid'], 'the migration function exists');
select is(public._dnd5e_v2_sheet_v2(), (select system_profile -> 'sheet' from public.campaigns where id = 'dddddddd-0000-4000-8000-0000000003cc'),
          'the v2 literal is the sheet new campaigns get by default');
select ok(not jsonb_path_exists(public._dnd5e_v2_sheet_v1(), '$.categories[*].sections[*].items[*] ? (@.key == "dado_golpe")')
          and jsonb_path_exists(public._dnd5e_v2_sheet_v2(), '$.categories[*].sections[*].items[*] ? (@.key == "dado_golpe")'), 'v1 has no dado_golpe field, v2 has');
select is(public._dnd5e_v2_sheet_kind(public._dnd5e_v2_sheet_v1()), 'v1', 'v1 is recognised');
select is(public._dnd5e_v2_sheet_kind(public._sheet_mark_reward_destination(public._dnd5e_v2_strip_custom(public._dnd5e_v2_sheet_v1()))), 'v1', 'v1 is recognised with the reward flag');
select is(public._dnd5e_v2_sheet_kind(public._dnd5e_v2_sheet_v2()), 'v2', 'v2 is recognised');
select is(public._dnd5e_v2_sheet_kind((select system_profile -> 'sheet' from public.campaigns where id = 'dddddddd-0000-4000-8000-0000000003bb')), null, 'a custom sheet is not the preset');
select is(public._dnd5e_v2_sheet_kind(jsonb_set(public._dnd5e_v2_sheet_v2(), '{roles,hp}', '"otro"')), null, 'an edited preset is not the preset');
select is(has_table_privilege('authenticated', 'public.migration_backup_dnd5e_v2', 'select')
          or has_table_privilege('anon', 'public.migration_backup_dnd5e_v2', 'select')
          or has_table_privilege('authenticated', 'public.migration_backup_dnd5e_v2', 'insert'), false, 'the backup table has no API grants');

create temp table before_b as select pg_temp.snapshot('dddddddd-0000-4000-8000-0000000003bb') as s;

------------------------------------------------------------------------------
-- Campaign A: the real-data-shaped fixture
------------------------------------------------------------------------------
create temp table run_a as select public._dnd5e_v2_migrate_campaign('dddddddd-0000-4000-8000-0000000003aa') as r;
create temp table after_a as select pg_temp.snapshot('dddddddd-0000-4000-8000-0000000003aa') as s;

select is((select r -> 'kind' from run_a), '"v1"'::jsonb, 'A: recognised as the v1 preset');
select is((select jsonb_build_object('pjs_changed', r -> 'pjs_changed', 'entries_created', r -> 'entries_created', 'links_created', r -> 'links_created', 'warnings', r -> 'warnings') from run_a),
          pg_temp.fixture_out() -> 'counts', 'A: counts equal the TypeScript twin (pjs changed, entries, links, warnings)');
select is((select s -> 'pjs' from after_a), pg_temp.fixture_out() -> 'pjs', 'A: characters (data and jugador) equal the TypeScript twin');
select is((select s -> 'actions' from after_a), pg_temp.fixture_out() -> 'actions', 'A: collection entries equal the TypeScript twin');
select is((select s -> 'links' from after_a), pg_temp.fixture_out() -> 'links', 'A: links equal the TypeScript twin');
select is((select s -> 'custom_section' from after_a), pg_temp.fixture_out() -> 'custom_section', 'A: the campaign fields section equals the TypeScript twin');
select is((select public._dnd5e_v2_strip_custom(s -> 'sheet') from after_a), public._dnd5e_v2_sheet_v2(), 'A: apart from the campaign fields the sheet is the v2 preset');
select lives_ok($$select public.validate_sheet((select s -> 'sheet' from after_a))$$, 'A: the migrated sheet passes validate_sheet');

-- exact spot checks, written out (not derived from the fixture)
select is((select data -> 'skill_arcana' from public.pjs where id = 9101), '"competente"'::jsonb, 'A: skill 1 -> competente');
select is((select array_agg(data ->> k order by k) from public.pjs, unnest(array['skill_acrobatics', 'skill_athletics']) k where id = 9101), array['no', 'experto'], 'A: skills 0 and 2 -> no and experto');
select is((select jsonb_build_array(data -> 'dado_golpe', data -> 'dados_disponibles', data ? 'stat_hit_dice') from public.pjs where id = 9102), '["1d10", 1, false]'::jsonb, 'A: "1d10 (1/2)" -> die 1d10, 1 available, key dropped');
select is((select jsonb_build_array(data -> 'dado_golpe', data -> 'dados_disponibles') from public.pjs where id = 9103), '["1d8", 2]'::jsonb, 'A: "1d8" alone -> available = nivel');
select is((select jsonb_build_array(data -> 'dado_golpe', data ? 'dados_disponibles') from public.pjs where id = 9104), '["muy raro", false]'::jsonb, 'A: unparseable hit dice kept as text in dado_golpe');
select is((select data -> 'espacios_conjuro' from public.pjs where id = 9101), '[{"id":1,"nivel":1,"disponibles":1,"maximo":3},{"id":2,"nivel":2,"disponibles":2,"maximo":2}]'::jsonb, 'A: spell slots with a current map');
select is((select jsonb_array_length(data -> 'espacios_conjuro') from public.pjs where id = 9103), 9, 'A: nine slot levels');
select is((select data ? 'espacios_conjuro' from public.pjs where id = 9104), false, 'A: a level with maximo 0 is dropped (no row at all)');
select is((select data -> 'espacios_conjuro' from public.pjs where id = 9105), '[{"id":1,"nivel":1,"disponibles":1,"maximo":1}]'::jsonb, 'A: an existing espacios_conjuro is kept untouched');
select is((select data -> 'recursos' -> 0 ->> 'recuperacion' from public.pjs where id = 9103), 'largo', 'A: unknown recuperacion -> largo');
select is((select jsonb_build_array(data -> 'magralita', data -> 'ancla', data ? 'custom_fields', data ? 'campo_magralita') from public.pjs where id = 9101), '["Siente su pulso.", "Torre", false, false]'::jsonb, 'A: custom fields moved to their own key (the preset has no magralita field, so no campo_ prefix)');
select is((select data -> 'campo_idiomas' from public.pjs where id = 9101), '"Abisal"'::jsonb, 'A: a custom field whose key the preset uses (idiomas) is renamed campo_idiomas');
select is((select data from public.pjs where id = 9107), '{"magralita": "valor plano", "custom_fields": {"magralita": "valor del campo"}}'::jsonb, 'A: a different flat value is never overwritten: both values survive');
select is((select array_agg(jugador order by id) from public.pjs where campaign_id = 'dddddddd-0000-4000-8000-0000000003aa'), array['Ana Dueña', 'Beto Dueño', '', '', 'Cleo Dueña', '', ''], 'A: jugador = owner display_name, legacy text discarded');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'dddddddd-0000-4000-8000-0000000003aa' and private_to_pj is not null), 2, 'A: same name with different content -> one private entry per character');
select is((select count(*)::int from public.pj_action_links l join public.campaign_actions a on a.id = l.action_id where a.name = 'Luz' and a.campaign_id = 'dddddddd-0000-4000-8000-0000000003aa'), 2, 'A: identical content -> one shared entry linked by both');
select is((select state from public.pj_action_links l join public.campaign_actions a on a.id = l.action_id where a.name = 'Luz' and l.pj_id = 9102), '{"preparado": false}'::jsonb, 'A: preparado is the link state');

-- backup
select is((select count(*)::int from public.migration_backup_dnd5e_v2 where campaign_id = 'dddddddd-0000-4000-8000-0000000003aa'), 6, 'A: one backup row per changed character (5) and one for the campaign');
select is((select old_data from public.migration_backup_dnd5e_v2 where pj_id = 9101), (select p -> 'data' from jsonb_array_elements(pg_temp.fixture_in() -> 'pjs') p where p ->> 'id' = '9101'), 'A: the backup holds the previous data');
select is((select old_jugador from public.migration_backup_dnd5e_v2 where pj_id = 9101), 'texto libre viejo', 'A: the backup holds the previous jugador');
select is((select old_sheet from public.migration_backup_dnd5e_v2 where pj_id is null and campaign_id = 'dddddddd-0000-4000-8000-0000000003aa'), public._dnd5e_v2_sheet_v1(), 'A: the backup holds the previous sheet');
select is((select cardinality(inserted_action_ids) from public.migration_backup_dnd5e_v2 where pj_id is null and campaign_id = 'dddddddd-0000-4000-8000-0000000003aa'), 6, 'A: the backup lists the inserted entries');
select is((select count(*)::int from public.migration_backup_dnd5e_v2 where pj_id = 9106), 0, 'A: an unchanged character has no backup row');

------------------------------------------------------------------------------
-- Idempotency: a second run changes and writes nothing
------------------------------------------------------------------------------
create temp table backups_1 as select count(*) as n, max(migrated_at) as t from public.migration_backup_dnd5e_v2;
create temp table run_a2 as select public._dnd5e_v2_migrate_campaign('dddddddd-0000-4000-8000-0000000003aa') as r;
select is((select jsonb_build_object('pjs', r -> 'pjs_changed', 'entries', r -> 'entries_created', 'links', r -> 'links_created', 'sheet', r -> 'sheet_changed') from run_a2),
          '{"pjs": 0, "entries": 0, "links": 0, "sheet": false}'::jsonb, 'second run: nothing to change');
select is(pg_temp.snapshot('dddddddd-0000-4000-8000-0000000003aa'), (select s from after_a), 'second run: characters, entries, links and sheet identical');
select is((select count(*) from public.migration_backup_dnd5e_v2), (select n from backups_1), 'second run: no new backup rows');

------------------------------------------------------------------------------
-- B: a custom sheet is left alone; C: the v2 preset gets only the data rules; D: an existing entry is reused
------------------------------------------------------------------------------
select is(public._dnd5e_v2_migrate_campaign('dddddddd-0000-4000-8000-0000000003bb'), null, 'B: a custom sheet is reported as skipped');
select is(pg_temp.snapshot('dddddddd-0000-4000-8000-0000000003bb'), (select s from before_b), 'B: nothing changed (sheet, characters, entries)');
select is((select count(*)::int from public.migration_backup_dnd5e_v2 where campaign_id = 'dddddddd-0000-4000-8000-0000000003bb'), 0, 'B: no backup rows');

create temp table run_c as select public._dnd5e_v2_migrate_campaign('dddddddd-0000-4000-8000-0000000003cc') as r;
select is((select data from public.pjs where id = 9301), '{"dado_golpe": "1d10", "dados_disponibles": 4, "skill_stealth": "experto", "recursos": [{"nombre": "R", "recuperacion": "corto"}]}'::jsonb, 'C: the v2 preset campaign gets the data rules (level 4 -> 4 dice)');
select is((select r -> 'sheet_changed' from run_c), 'false'::jsonb, 'C: the v2 sheet is not rewritten when there are no campaign fields');
select is((select count(*)::int from public.migration_backup_dnd5e_v2 where campaign_id = 'dddddddd-0000-4000-8000-0000000003cc'), 1, 'C: backup of the changed character only');

create temp table run_d as select public._dnd5e_v2_migrate_campaign('dddddddd-0000-4000-8000-0000000003dd') as r;
select is((select jsonb_build_array(r -> 'entries_created', r -> 'entries_reused', r -> 'links_created') from run_d), '[0, 1, 1]'::jsonb, 'D: the existing entry is reused and linked');
select is((select description from public.campaign_actions where id = 99401), 'del DM', 'D: the existing entry is not modified');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'dddddddd-0000-4000-8000-0000000003dd'), 1, 'D: no duplicate entry');

------------------------------------------------------------------------------
-- Rules on edge inputs the fixture does not hold (the TypeScript tests pin the same cases)
------------------------------------------------------------------------------
select is(public._dnd5e_v2_pj_data('{"skill_x": 3, "skill_y": "maestro", "skill_z": "experto", "skill_n": null}', 2, '{}'),
          '{"data": {"skill_x": 3, "skill_y": "maestro", "skill_z": "experto", "skill_n": null}, "removed": [], "warnings": 2}'::jsonb, 'skills: other values stay and count as warnings');
select is(public._dnd5e_v2_pj_data('{"stat_hit_dice": "3D6(0/7)"}', 2, '{}') -> 'data', '{"dado_golpe": "3d6", "dados_disponibles": 0}'::jsonb, 'hit dice: any spacing and case, 0 available');
select is(public._dnd5e_v2_pj_data('{"spell_slots": {"1": 2, "2": "x", "z": 1}, "spell_slots_current": {"1": 0}}', 2, '{}'),
          '{"data": {"espacios_conjuro": [{"id": 1, "nivel": 1, "disponibles": 0, "maximo": 2}]}, "removed": ["spell_slots", "spell_slots_current"], "warnings": 2}'::jsonb,
          'spell slots: a current of 0 is spent (not full); unreadable levels are skipped and counted');
select is(public._dnd5e_v2_pj_data('{"recursos": [{"recuperacion": "Descanso corto"}, {"recuperacion": " LARGO "}, {"recuperacion": "al amanecer"}, {"recuperacion": ""}, {"nombre": "x"}]}', 2, '{}'),
          '{"data": {"recursos": [{"recuperacion": "corto"}, {"recuperacion": "largo"}, {"recuperacion": "largo"}, {"recuperacion": "largo"}, {"nombre": "x"}]}, "removed": [], "warnings": 1}'::jsonb,
          'recursos: text -> largo/corto, anything else largo (warning), empty largo quietly');
select is((select jsonb_agg(jsonb_build_array(category, name, problem, nivel_fallback, truncated, dropped) order by ord)
             from public._dnd5e_v2_spell_rows(1, jsonb_build_array(
               jsonb_build_object('nombre', 'A', 'nivel', '3'),
               jsonb_build_object('nombre', 'B', 'nivel', 99),
               jsonb_build_object('nombre', '  ', 'nivel', 1),
               jsonb_build_object('nombre', 'a', 'nivel', 3),
               jsonb_build_object('nombre', 'C', 'nivel', 1, 'escuela', repeat('x', 600), 'rara', true),
               to_jsonb('texto'::text)))),
          '[["nivel_3", "A", null, false, false, false], ["rasgos", "B", null, true, false, false], ["nivel_1", "", "name_missing", false, false, false],
            ["nivel_3", "a", "duplicate", false, false, false], ["nivel_1", "C", null, false, true, true], ["rasgos", "", "row_invalid", true, false, false]]'::jsonb,
          'spell rows: level text, unreadable level -> rasgos, missing name, duplicate, truncation, unknown keys, non-object rows');
select is((select jsonb_agg(left(extras ->> 'escuela', 0) || char_length(extras ->> 'escuela')::text) from public._dnd5e_v2_spell_rows(1, jsonb_build_array(jsonb_build_object('nombre', 'C', 'nivel', 1, 'escuela', repeat('x', 600))))), '["500"]'::jsonb, 'spell rows: a text column is cut to the 500 characters an entry accepts');
select is(public._dnd5e_v2_pj_data('{"magralita": "plano", "custom_fields": {"magralita": "campo", "otro": "x"}}', 2, '{"magralita": "magralita"}'),
          '{"data": {"magralita": "plano", "custom_fields": {"magralita": "campo", "otro": "x"}}, "removed": [], "warnings": 2}'::jsonb, 'custom fields: a conflict keeps both values; an unknown entry still warns');
select is(public._dnd5e_v2_pj_data('{"magralita": "igual", "custom_fields": {"magralita": "igual"}}', 2, '{"magralita": "magralita"}'),
          '{"data": {"magralita": "igual"}, "removed": ["custom_fields"], "warnings": 0}'::jsonb, 'custom fields: an equal flat value is just kept');
select is((select jsonb_agg(jsonb_build_array(name, private) order by pj_id) from public._dnd5e_v2_spell_entries(
             '[{"pj_id": 1, "category": "nivel_3", "name": "Bola", "description": "", "extras": {}, "preparado": false},
               {"pj_id": 2, "category": "nivel_3", "name": "bola", "description": "", "extras": {}, "preparado": false}]')),
          '[["Bola", true], ["bola", true]]'::jsonb, 'entries: the same name spelled differently counts as different content (private)');
select is(public._dnd5e_v2_pj_data((pg_temp.fixture_out() -> 'pjs' -> 0 -> 'data'), 2, '{"magralita": "campo_magralita", "ancla": "ancla"}'),
          jsonb_build_object('data', pg_temp.fixture_out() -> 'pjs' -> 0 -> 'data', 'removed', '[]'::jsonb, 'warnings', 0), 'migrated data goes through the data rules unchanged');
select is((public._dnd5e_v2_custom_section(public._dnd5e_v2_sheet_v2(), jsonb_build_array(
             jsonb_build_object('key', 'notas', 'label', 'N'), jsonb_build_object('key', repeat('k', 39), 'label', 'K'),
             jsonb_build_object('key', 'idiomas', 'label', 'I'), jsonb_build_object('key', 'Mal Key', 'label', 'x'))) -> 'keymap'),
          jsonb_build_object('notas', 'campo_notas', repeat('k', 39), repeat('k', 39), 'idiomas', 'campo_idiomas'), 'campaign fields: reserved or taken keys become campo_<key>; invalid ones are skipped');

------------------------------------------------------------------------------
-- The rollback recipe of the migration header restores everything it touched
------------------------------------------------------------------------------
delete from public.pj_action_links l using public.migration_backup_dnd5e_v2 b, jsonb_array_elements(b.inserted_links) x
  where b.pj_id is null and l.campaign_id = b.campaign_id and l.pj_id = (x ->> 0)::bigint and l.action_id = (x ->> 1)::bigint;
delete from public.campaign_actions a using public.migration_backup_dnd5e_v2 b
  where b.pj_id is null and a.campaign_id = b.campaign_id and a.id = any (b.inserted_action_ids);
update public.pjs p set data = b.old_data, jugador = b.old_jugador from public.migration_backup_dnd5e_v2 b
  where b.pj_id = p.id and b.campaign_id = p.campaign_id;
update public.campaigns c set system_profile = jsonb_set(c.system_profile, '{sheet}', b.old_sheet)
  from public.migration_backup_dnd5e_v2 b where b.pj_id is null and b.campaign_id = c.id and b.old_sheet is not null;

select is((select array_agg(p -> 'data' order by (p ->> 'id')::int) from jsonb_array_elements(pg_temp.fixture_in() -> 'pjs') p),
          (select array_agg(data order by id) from public.pjs where campaign_id = 'dddddddd-0000-4000-8000-0000000003aa'), 'rollback: A characters have their previous data');
select is((select array_agg(p ->> 'jugador' order by (p ->> 'id')::int) from jsonb_array_elements(pg_temp.fixture_in() -> 'pjs') p),
          (select array_agg(jugador order by id) from public.pjs where campaign_id = 'dddddddd-0000-4000-8000-0000000003aa'), 'rollback: A characters have their previous jugador');
select is((select system_profile -> 'sheet' from public.campaigns where id = 'dddddddd-0000-4000-8000-0000000003aa'), public._dnd5e_v2_sheet_v1(), 'rollback: A has its previous sheet');
select is((select count(*)::int from public.campaign_actions where campaign_id = 'dddddddd-0000-4000-8000-0000000003aa'), 0, 'rollback: the entries it inserted are gone (their links with them)');
select is((select count(*)::int from public.pj_action_links where campaign_id in ('dddddddd-0000-4000-8000-0000000003aa', 'dddddddd-0000-4000-8000-0000000003dd')), 0, 'rollback: the links it inserted are gone');
select is((select count(*)::int from public.campaign_actions where id = 99401), 1, 'rollback: an entry that existed before is kept');
select is((select data from public.pjs where id = 9301), '{"stat_hit_dice": "1d10", "skill_stealth": 2, "recursos": [{"nombre": "R", "recuperacion": "Descanso corto"}]}'::jsonb, 'rollback: C character restored');

select * from finish();
rollback;
