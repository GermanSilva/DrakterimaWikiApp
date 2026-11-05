-- pgTAP: G2c of the system-agnostic campaigns (odd/tasks/system-agnostic.md S12, S14, S16, S23, S28). validate_sheet() accepts
-- action categories on Habilidad tables (a modal block over such a table names them by key), economy tables (type economia:
-- no columns or rows, DM only, needs the coin table) and rewardDestination (at most one table, the coin table or an economy
-- table). The same cases live in src/campaign/system/sheet/sheetModelG2c.test.ts: both validators must agree.
begin;

select plan(57);

create schema tests;

create function tests.doc() returns jsonb language sql immutable as $$
  select $profile${
    "version": 1,
    "character": {
      "builtins": {
        "clase": {"enabled": true, "label": "Clase"},
        "raza": {"enabled": true, "label": "Raza"},
        "nivel": {"enabled": true, "label": "Nivel", "min": 1, "max": 20}
      },
      "sections": {"stats": true, "habilidades": true, "ataques": true, "hechizos": true, "recursos": true,
                   "equipo": true, "rasgos": true, "narrativa": true, "apariencia": true}
    },
    "currency": {"enabled": true, "denominations": [{"key": "gp", "label": "oro"}]},
    "modules": {"juegos": true, "sesion_en_vivo": true, "mapas": true, "calendario": true}
  }$profile$::jsonb;
$$;

-- the Habilidad table `acciones` (declares trucos and nivel_1), the coin table `dinero`, an economy table `caja`
create function tests.acc(extra jsonb default '{}') returns jsonb language sql immutable as $$
  select '{"kind":"table","type":"habilidad","key":"acciones","label":"Acciones","editableBy":"dm",
           "columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"dm"},
                      {"key":"categoria","label":"Categoría","type":"short","editableBy":"dm"},
                      {"key":"descripcion","label":"Descripción","type":"paragraph","editableBy":"dm"}],
           "categories":[{"key":"trucos","label":"Trucos"},{"key":"nivel_1","label":"Nivel 1"}]}'::jsonb || extra;
$$;
create function tests.coins(extra jsonb default '{}') returns jsonb language sql immutable as $$
  select '{"kind":"table","type":"monedas","key":"dinero","label":"Dinero","rows":[{"key":"oro","label":"Oro","value":100},{"key":"bronce","label":"Bronce","value":1}]}'::jsonb || extra;
$$;
create function tests.caja(extra jsonb default '{}') returns jsonb language sql immutable as $$
  select '{"kind":"table","type":"economia","key":"caja","label":"Caja","editableBy":"dm"}'::jsonb || extra;
$$;
create function tests.modal(f jsonb default '["trucos"]') returns jsonb language sql immutable as $$
  select jsonb_build_object('key', 'b_acciones', 'mode', 'modal', 'items', '["acciones"]'::jsonb, 'filterCategories', f);
$$;
create function tests.many(n int) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('key', 'c' || i, 'label', 'C' || i)) from generate_series(1, n) i;
$$;

-- a document whose only section holds `items` and `blocks`
create function tests.with(items jsonb, blocks jsonb default null) returns jsonb language sql immutable as $$
  select tests.doc() || jsonb_build_object('sheet', jsonb_build_object('roles', '{}'::jsonb, 'categories', jsonb_build_array(jsonb_build_object(
    'key', 'c', 'label', 'C', 'sections', jsonb_build_array(jsonb_build_object(
      'key', 's', 'label', 'S', 'items', items, 'blocks', coalesce(blocks, jsonb_build_array(tests.modal()))))))));
$$;
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
-- NULL when the sheet validates, otherwise the DETAIL of the error
create function tests.chk(items jsonb, blocks jsonb default null) returns text language sql as $$
  select tests.detail(tests.with(items, blocks));
$$;
-- the validated item n of the section
create function tests.kept(items jsonb, n int, blocks jsonb default null) returns jsonb language sql as $$
  select public.validate_system_profile(tests.with(items, blocks)) #> array['sheet','categories','0','sections','0','items',n::text];
$$;
create function tests.kept_block(items jsonb, blocks jsonb) returns jsonb language sql as $$
  select public.validate_system_profile(tests.with(items, blocks)) #> '{sheet,categories,0,sections,0,blocks,0}';
$$;
create function tests.at(p text) returns text language sql immutable as $$
  select 'sheet.categories[0].sections[0].' || p;
$$;

-- ===== action categories (S23)
select is(tests.chk(jsonb_build_array(tests.acc())), null, 'a Habilidad table with categories and a modal block naming them by key validates');
select is(
  tests.kept(jsonb_build_array(tests.acc('{"categories":[{"key":"nivel_1","label":" Nivel 1 ","extra":1},{"key":"trucos","label":"Trucos"}]}')), 0, jsonb_build_array(tests.modal('["trucos"]'))) -> 'categories',
  '[{"key":"nivel_1","label":"Nivel 1"},{"key":"trucos","label":"Trucos"}]'::jsonb,
  'categories are returned normalised, in order, labels trimmed, unknown properties dropped');
select is(tests.kept(jsonb_build_array(tests.acc() - 'categories'), 0, '[]'::jsonb) ? 'categories', false, 'a table without categories is returned without the property');
select is(tests.chk(jsonb_build_array(tests.acc(jsonb_build_object('categories', tests.many(1)))), '[]'::jsonb), null, 'one category validates');
select is(tests.chk(jsonb_build_array(tests.acc(jsonb_build_object('categories', tests.many(30)))), '[]'::jsonb), null, 'thirty categories validate');
select is(tests.chk(jsonb_build_array(tests.acc('{"categories":[]}')), '[]'::jsonb), tests.at('items[0].categories'), 'no categories are rejected');
select is(tests.chk(jsonb_build_array(tests.acc(jsonb_build_object('categories', tests.many(31)))), '[]'::jsonb), tests.at('items[0].categories'), 'thirty-one categories are rejected');

select is(tests.chk(jsonb_build_array(tests.acc(v.extra)), '[]'::jsonb), tests.at('items[0].' || v.path), 'rejects ' || v.label)
from (values
  ('categories that are not a list', '{"categories":"trucos"}'::jsonb, 'categories'),
  ('a category that is not an object', '{"categories":["trucos"]}'::jsonb, 'categories[0]'),
  ('a repeated key', '{"categories":[{"key":"a","label":"A"},{"key":"a","label":"B"}]}'::jsonb, 'categories[1].key'),
  ('a key with the wrong charset', '{"categories":[{"key":"Bad Key","label":"A"}]}'::jsonb, 'categories[0].key'),
  ('a prototype key', '{"categories":[{"key":"constructor","label":"A"}]}'::jsonb, 'categories[0].key'),
  ('a missing key', '{"categories":[{"label":"A"}]}'::jsonb, 'categories[0].key'),
  ('a missing label', '{"categories":[{"key":"a"}]}'::jsonb, 'categories[0].label'),
  ('an empty label', '{"categories":[{"key":"a","label":"  "}]}'::jsonb, 'categories[0].label')
) v(label, extra, path);

select is(tests.chk(jsonb_build_array(tests.acc('{"type":"libre","key":"libre"}')), '[]'::jsonb), tests.at('items[0].categories'), 'rejects categories on a Libre table');
select is(tests.chk(jsonb_build_array(tests.coins('{"categories":[{"key":"a","label":"A"}]}')), '[]'::jsonb), tests.at('items[0].categories'), 'rejects categories on the coin table');

select is(tests.chk(jsonb_build_array(tests.acc()), jsonb_build_array(tests.modal('["nivel_1","trucos"]'))), null, 'a modal block may name declared keys in any order');
select is(tests.chk(jsonb_build_array(tests.acc()), jsonb_build_array(tests.modal('["trucos","trucos"]'))), null, 'or repeat one');
select is(tests.chk(jsonb_build_array(tests.acc()), jsonb_build_array(tests.modal('["trucos","ghost"]'))), tests.at('blocks[0].filterCategories[1]'), 'rejects a key the table does not declare');
select is(tests.chk(jsonb_build_array(tests.acc()), jsonb_build_array(tests.modal('["Trucos"]'))), tests.at('blocks[0].filterCategories[0]'), 'rejects the label of a category');
select is(tests.chk(jsonb_build_array(tests.acc()), jsonb_build_array(tests.modal('[]'))), tests.at('blocks[0].filterCategories'), 'a modal block still names at least one category');
select is(tests.chk(jsonb_build_array(tests.acc()), jsonb_build_array(tests.modal('[5]'))), tests.at('blocks[0].filterCategories[0]'), 'and an entry that is a text');

select is(tests.chk(jsonb_build_array(tests.acc() - 'categories'), jsonb_build_array(tests.modal('[" Cualquier cosa ","Nivel 1"]'))), null, 'a table without categories keeps free text filterCategories');
select is(tests.kept_block(jsonb_build_array(tests.acc() - 'categories'), jsonb_build_array(tests.modal('[" Cualquier cosa ","Nivel 1"]'))) -> 'filterCategories', '["Cualquier cosa","Nivel 1"]'::jsonb, 'trimmed as before');
select is(tests.chk(jsonb_build_array(tests.acc() - 'categories'), jsonb_build_array(tests.modal('[]'))), tests.at('blocks[0].filterCategories'), 'and still needs one');

-- ===== economy tables (S28, S12, S14)
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja())), null, 'an economy table next to the coin table validates');
select is(tests.kept(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"junk":1}')), 2), '{"kind":"table","type":"economia","key":"caja","label":"Caja","editableBy":"dm"}'::jsonb, 'it is returned normalised');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja(), tests.caja('{"key":"banco","label":"Banco"}'))), null, 'several economy tables validate');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.caja())), 'sheet.categories', 'an economy table without a coin table is rejected at the categories path');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"editableBy":"player"}'))), tests.at('items[2].editableBy'), 'a player economy table is rejected (DM only)');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja() - 'editableBy')), tests.at('items[2].editableBy'), 'a missing editor is rejected');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"rows":[]}'))), tests.at('items[2].rows'), 'rows are rejected: it holds amounts only');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"columns":[]}'))), tests.at('items[2].columns'), 'columns are rejected');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"key":"monedas"}'))), tests.at('items[2].key'), 'a reserved key is rejected');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"key":"dinero"}'))), tests.at('items[2].key'), 'a repeated key is rejected');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"key":"Bad Key"}'))), tests.at('items[2].key'), 'a key with the wrong charset is rejected');

select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja()), jsonb_build_array(tests.modal(), '{"key":"b2","mode":"plano","items":["dinero","caja"]}'::jsonb)), null, 'a plano block can show it');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja()), jsonb_build_array(tests.modal(), jsonb_build_object('key', 'b2', 'mode', m, 'items', '["caja"]'::jsonb, 'filterCategories', '["trucos"]'::jsonb))),
  tests.at('blocks[1].mode'), 'a ' || m || ' block cannot show it')
from unnest(array['tile', 'stat', 'capacidades', 'modal']) m;

select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja(),
    '{"kind":"field","key":"total","label":"Total","type":"number","editableBy":"dm"}'::jsonb || jsonb_build_object('formula', f))),
  tests.at('items[3].formula'), 'a formula cannot read an economy table: ' || f)
from unnest(array['suma({caja}, "oro")', '{caja} + 1']) f;
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja(),
    '{"kind":"field","key":"total","label":"Total","type":"number","editableBy":"dm","calc":{"table":"caja","op":"conteo"}}'::jsonb)),
  tests.at('items[3].calc.table'), 'a calculation cannot read an economy table');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.coins('{"key":"otro","rows":[{"key":"plata","label":"Plata","value":1}]}'))), 'sheet.categories', 'two coin tables are still rejected');

-- ===== reward destination (S28)
select is(tests.kept(jsonb_build_array(tests.acc(), tests.coins('{"rewardDestination":true}')), 1) -> 'rewardDestination', 'true'::jsonb, 'the coin table can be the reward destination');
select is(tests.kept(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"rewardDestination":true}')), 2) -> 'rewardDestination', 'true'::jsonb, 'an economy table can be the reward destination');
select is(tests.kept(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"rewardDestination":false}')), 2) -> 'rewardDestination', 'false'::jsonb, 'false is kept as given');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins('{"rewardDestination":false}'), tests.caja('{"rewardDestination":true}'), tests.caja('{"key":"banco","label":"B","rewardDestination":false}'))), null, 'false on any number of tables next to one true validates');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins('{"rewardDestination":true}'), tests.caja('{"rewardDestination":true}'))), tests.at('items[2].rewardDestination'), 'a second destination (coin table then economy) is rejected at the second table');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"rewardDestination":true}'), tests.caja('{"key":"banco","label":"B","rewardDestination":true}'))), tests.at('items[3].rewardDestination'), 'two economy destinations are rejected at the second');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins(), tests.caja('{"rewardDestination":"yes"}'))), tests.at('items[2].rewardDestination'), 'a value that is not a boolean is rejected on an economy table');
select is(tests.chk(jsonb_build_array(tests.acc(), tests.coins('{"rewardDestination":1}'))), tests.at('items[1].rewardDestination'), 'and on the coin table');
select is(tests.chk(jsonb_build_array(tests.acc('{"rewardDestination":true}'), tests.coins())), tests.at('items[0].rewardDestination'), 'rejects it on a table that holds no amounts');

-- ===== nothing else changed
select is(tests.detail(tests.doc()), null, 'a document with no sheet still validates');
select is(public.validate_system_profile(tests.with(jsonb_build_array(tests.coins()), '[]'::jsonb)) #> '{sheet,categories,0,sections,0,items,0}', tests.coins(), 'a coin table is returned unchanged, with no new properties');

select * from finish();
rollback;
