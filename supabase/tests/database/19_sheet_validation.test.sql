-- pgTAP: F2b of the system-agnostic campaigns. validate_system_profile() accepts, validates and PRESERVES the optional
-- `sheet` (the character sheet as data, odd/design/sheet-builder.md). Each rejection asserts the exact DETAIL path,
-- which is the same path format the client validator (src/campaign/system/sheet/sheetModel.ts) reports.
begin;

select plan(45);

create schema tests;

-- a complete valid document WITHOUT a sheet
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

-- the same shape the TypeScript tests use as their base sheet
create function tests.sheet() returns jsonb language sql immutable as $$
  select $sheet${
    "categories": [{
      "key": "mecanicas", "label": "Mecánicas",
      "sections": [{
        "key": "atributos", "label": "Atributos",
        "items": [
          {"kind": "table", "type": "stat", "key": "stats", "label": "Stats", "rows": [
            {"key": "stat_str", "label": "FUE", "modifier": "floor(({valor} - 10) / 2)", "editableBy": "player"},
            {"key": "stat_dex", "label": "DES", "modifier": "floor(({valor} - 10) / 2)", "editableBy": "dm"}]},
          {"kind": "table", "type": "capacidades", "key": "skills", "label": "Habilidades",
           "columns": [{"key": "bonus", "label": "Bonus", "type": "number", "editableBy": "player"}],
           "rows": [{"key": "skill_athletics", "label": "Atletismo", "stat": "stat_str", "use": "modificador", "editableBy": "player"}]},
          {"kind": "field", "key": "extra", "label": "Extra", "type": "number", "editableBy": "player"},
          {"kind": "field", "key": "prof", "label": "Competencia", "type": "number", "formula": "2 + floor(({nivel} - 1) / 4)", "editableBy": "dm"},
          {"kind": "table", "type": "monedas", "key": "dinero", "label": "Dinero", "rows": [
            {"key": "oro", "label": "Oro", "value": 100}, {"key": "bronce", "label": "Bronce", "value": 1}]}
        ],
        "blocks": [
          {"key": "b1", "mode": "stat", "items": ["stats"]},
          {"key": "b2", "mode": "capacidades", "items": ["skills"]},
          {"key": "b3", "mode": "tile", "items": ["extra", "prof"]}
        ]
      }]
    }],
    "roles": {}
  }$sheet$::jsonb;
$$;

create function tests.with_sheet(s jsonb) returns jsonb language sql immutable as $$
  select tests.doc() || jsonb_build_object('sheet', s);
$$;

-- the sheet after changing one path
create function tests.mut(p text[], v jsonb) returns jsonb language sql immutable as $$
  select tests.with_sheet(jsonb_set(tests.sheet(), p, v));
$$;

-- NULL when the document validates, otherwise the DETAIL of the error
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

-- 1-4: documents
select is(tests.detail(tests.doc()), null, 'a document with no sheet still validates');
select ok(not (public.validate_system_profile(tests.doc()) ? 'sheet'), 'and no sheet key is invented');
select is(tests.detail(tests.with_sheet(tests.sheet())), null, 'a well formed sheet validates');
select is(public.validate_system_profile(tests.with_sheet(tests.sheet())) -> 'sheet', tests.sheet(), 'and is returned unchanged (nothing dropped, nothing rewritten)');

-- 5-6: normalisation
select is(
  public.validate_system_profile(tests.mut('{categories,0,label}', '"  Mecánicas  "'::jsonb)) #>> '{sheet,categories,0,label}',
  'Mecánicas', 'labels are trimmed');
select ok(
  not (public.validate_system_profile(tests.with_sheet(tests.sheet() || '{"extra":1}'::jsonb)) -> 'sheet' ? 'extra'),
  'unknown properties of the sheet are dropped');

-- 7-9: shape
select is(tests.detail(tests.with_sheet('[]'::jsonb)), 'sheet', 'a sheet that is not an object is rejected');
select is(tests.detail(tests.with_sheet('{"roles":{}}'::jsonb)), 'sheet.categories', 'a sheet needs categories');
select is(
  tests.detail(tests.with_sheet(jsonb_set(tests.sheet(), '{categories}', (select jsonb_agg(jsonb_build_object('key', 'c' || i, 'label', 'C', 'sections', '[]'::jsonb)) from generate_series(1, 13) i)))),
  'sheet.categories', 'more than 12 categories are rejected');

-- 10-16: keys
select is(tests.detail(tests.mut('{categories,0,sections,0,items,2,key}', '"Stat"')), 'sheet.categories[0].sections[0].items[2].key', 'a key with uppercase is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,2,key}', '"nombre"')), 'sheet.categories[0].sections[0].items[2].key', 'a key the application owns is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,2,key}', '"constructor"')), 'sheet.categories[0].sections[0].items[2].key', 'a prototype name is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,2,key}', '"stat_str"')), 'sheet.categories[0].sections[0].items[2].key', 'a key repeated across items and rows is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,1,columns,0,key}', '"nombre"')), null, 'an application-owned name is fine as a COLUMN key');
select is(
  tests.detail(tests.mut('{categories,0,sections,0,items,1,columns}', '[{"key":"constructor","label":"X","type":"number","editableBy":"dm"}]')),
  'sheet.categories[0].sections[0].items[1].columns[0].key', 'but a prototype name is not');
select is(
  tests.detail(tests.mut('{categories,0,sections,0,items,1,columns}', '[{"key":"a","label":"A","type":"number","editableBy":"dm"},{"key":"a","label":"B","type":"number","editableBy":"dm"}]')),
  'sheet.categories[0].sections[0].items[1].columns[1].key', 'a repeated column key is rejected');

-- 17-19: labels
select is(tests.detail(tests.mut('{categories,0,label}', '""')), 'sheet.categories[0].label', 'an empty label is rejected');
select is(tests.detail(tests.mut('{categories,0,label}', to_jsonb('a' || chr(8203) || 'b'))), 'sheet.categories[0].label', 'a label with a zero-width character is rejected');
select is(tests.detail(tests.mut('{categories,0,label}', to_jsonb(repeat('x', 61)))), 'sheet.categories[0].label', 'a label over 60 characters is rejected');

-- 20-22: structure rules (S11)
select is(tests.detail(tests.mut('{categories,0,sections,0,items,0,rows,0,editableBy}', '"owner"')), 'sheet.categories[0].sections[0].items[0].rows[0].editableBy', 'editableBy must be dm or player');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,0,rows,0}', '{"key":"stat_str","label":"FUE","editableBy":"dm"}')), 'sheet.categories[0].sections[0].items[0].rows[0].modifier', 'a stat row needs its modifier formula');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,1,rows,0,stat}', '"stat_nope"')), 'sheet.categories[0].sections[0].items[1].rows[0].stat', 'a capacidad must point to an existing stat row');

-- 23-25: formulas (charset and size only; the parser is the client)
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,formula}', '"1; drop table pjs"')), 'sheet.categories[0].sections[0].items[3].formula', 'a formula with characters outside the language is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,formula}', to_jsonb(repeat('1+', 300) || '1'))), 'sheet.categories[0].sections[0].items[3].formula', 'a formula over 500 characters is rejected');
select is(
  tests.detail(tests.mut('{categories,0,sections,0,items,2}', '{"kind":"field","key":"bio","label":"Bio","type":"paragraph","formula":"1","editableBy":"dm"}')),
  'sheet.categories[0].sections[0].items[2].formula', 'a formula needs a number or boolean field');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,editableBy}', '"player"')), 'sheet.categories[0].sections[0].items[3].editableBy', 'a formula field is DM level only');

-- 27-32: coins (S12, S14)
select is(tests.detail(tests.mut('{categories,0,sections,0,items,4,rows}', '[{"key":"oro","label":"Oro","value":10}]')), 'sheet.categories[0].sections[0].items[4].rows', 'the smallest denomination must be worth 1');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,4,rows}', '[{"key":"oro","label":"Oro","value":1},{"key":"plata","label":"P","value":1}]')), 'sheet.categories[0].sections[0].items[4].rows', 'denomination values must differ');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,4,rows,0,value}', '1.5')), 'sheet.categories[0].sections[0].items[4].rows[0].value', 'a denomination value is an integer');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,4,rows,0,value}', '1000000000000')), 'sheet.categories[0].sections[0].items[4].rows[0].value', 'a denomination value over 1e9 is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,4,rows}', '[]')), null, 'a coin table with no denominations yet is valid (the lottery stays hidden)');
select is(
  tests.detail(tests.with_sheet(jsonb_set(tests.sheet(), '{categories,0,sections,0,items}', (tests.sheet() #> '{categories,0,sections,0,items}') || '{"kind":"table","type":"monedas","key":"dinero2","label":"D2","rows":[]}'::jsonb))),
  'sheet.categories', 'only one coin table is allowed');

-- 33-36: blocks
select is(tests.detail(tests.mut('{categories,0,sections,0,blocks,0,items}', '["ghost"]')), 'sheet.categories[0].sections[0].blocks[0].items', 'a block can only list items of its section');
select is(tests.detail(tests.mut('{categories,0,sections,0,blocks,0}', '{"key":"b1","mode":"tile","items":["stats"]}')), 'sheet.categories[0].sections[0].blocks[0].mode', 'a display mode must fit the item kind');
select is(
  tests.detail(tests.mut('{categories,0,sections,0,blocks}', (tests.sheet() #> '{categories,0,sections,0,blocks}') || '{"key":"b4","mode":"plano","items":["extra"]}'::jsonb)),
  'sheet.categories[0].sections[0].blocks[3].items', 'an item cannot be shown by two blocks');
select is(
  tests.detail(tests.mut('{categories,0,sections,0,blocks}', (tests.sheet() #> '{categories,0,sections,0,blocks}') || '{"key":"b4","mode":"modal","items":[]}'::jsonb)),
  'sheet.categories[0].sections[0].blocks[3].filterCategories', 'a modal block names the categories it filters');

-- 37-39: roles
select is(tests.detail(tests.mut('{roles}', '{"hp":"extra"}')), null, 'a role bound to a number field is valid');
select is(tests.detail(tests.mut('{roles}', '{"hp":"ghost"}')), 'sheet.roles.hp', 'a role bound to a missing field is rejected');
select is(tests.detail(tests.mut('{roles}', '{"nonsense":"extra"}')), 'sheet.roles.nonsense', 'an unknown role is rejected');

-- 40-41: the sheet cannot be smuggled through the old validation
select is(tests.detail(tests.doc() || '{"sheet":null}'::jsonb), 'sheet', 'a null sheet is rejected, not ignored');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,2,default}', to_jsonb(repeat('x', 4001)))), 'sheet.categories[0].sections[0].items[2].default', 'a default that does not match the type is rejected');

-- 42-45: verifier findings (F1 DoS, F2 tab, F3 data slot collision, F5 default length in code points)
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,formula}', to_jsonb('2 +' || chr(9) || '1'))), null, 'a tab inside a formula is accepted, as the client language allows it');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,2,key}', '"skill_athletics__bonus"')), 'sheet.categories[0].sections[0].items[2].key', 'a top level key cannot hold a double underscore, which separates row and column in data');
select is(tests.detail(tests.with_sheet(jsonb_set(tests.sheet(), '{categories,0,label}', to_jsonb(repeat('x', 50000))))), 'sheet', 'a sheet over 48 KB is refused before it is walked');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,2}', jsonb_build_object('kind','field','key','bio','label','Bio','type','short','editableBy','dm','default',repeat(chr(128512),4001)))), 'sheet.categories[0].sections[0].items[2].default', 'a default over 4000 characters is rejected whatever they are');

select * from finish();
rollback;
