-- pgTAP: G2a of the system-agnostic campaigns (odd/tasks/system-agnostic.md S19, S21, S24, S29). validate_sheet() accepts the
-- text and table formulas of the client language (src/campaign/system/formula/formula.ts): text literals, `&`, signo(),
-- suma/promedio/conteo/lookup over a table reference, text formulas on short fields, hidden formula fields, and checks that
-- every table reference is a free, skill or coin table whose column names exist. The same cases live in
-- src/campaign/system/sheet/sheetModel.test.ts ("G2a"): both validators must agree. Cycles stay the client's job.
begin;

select plan(61);

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

-- the base sheet of 19_sheet_validation (items 0-4) plus a free table `equipo` with a row formula column (item 5)
create function tests.sheet() returns jsonb language sql immutable as $$
  select jsonb_set($sheet${
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
            {"key": "oro", "label": "Oro", "value": 100}, {"key": "bronce", "label": "Bronce", "value": 1}]},
          {"kind": "table", "type": "libre", "key": "equipo", "label": "Equipo", "editableBy": "player", "columns": [
            {"key": "nombre", "label": "Nombre", "type": "short", "editableBy": "player"},
            {"key": "peso", "label": "Peso", "type": "number", "editableBy": "player"},
            {"key": "cantidad", "label": "Cantidad", "type": "number", "editableBy": "player"},
            {"key": "total", "label": "Total", "type": "number", "formula": "{peso} * {cantidad}", "editableBy": "player"}]}
        ],
        "blocks": [
          {"key": "b1", "mode": "stat", "items": ["stats"]},
          {"key": "b2", "mode": "capacidades", "items": ["skills"]},
          {"key": "b3", "mode": "tile", "items": ["extra", "prof"]}
        ]
      }]
    }],
    "roles": {}
  }$sheet$::jsonb, '{categories,0,sections,0,blocks,3}', '{"key": "b4", "mode": "plano", "items": ["dinero", "equipo"]}'::jsonb);
$$;

create function tests.with_sheet(s jsonb) returns jsonb language sql immutable as $$
  select tests.doc() || jsonb_build_object('sheet', s);
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

-- the sheet with item 6 set (a field under test)
create function tests.sheet_with(item jsonb) returns jsonb language sql immutable as $$
  select tests.with_sheet(jsonb_set(tests.sheet(), '{categories,0,sections,0,items,6}', item));
$$;
-- NULL when the field validates, otherwise the DETAIL of the error
create function tests.calc(item jsonb) returns text language sql as $$
  select tests.detail(tests.sheet_with(item));
$$;
create function tests.fld(formula text, extra jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object('kind', 'field', 'key', 'calc', 'label', 'Calc', 'type', 'number', 'formula', formula, 'editableBy', 'dm') || extra;
$$;
create function tests.mut(p text[], v jsonb) returns jsonb language sql immutable as $$
  select tests.with_sheet(jsonb_set(tests.sheet(), p, v));
$$;

-- 1-2: the base sheet is valid and unchanged
select is(tests.detail(tests.with_sheet(tests.sheet())), null, 'the base sheet with a free table validates');
select is(public.validate_system_profile(tests.with_sheet(tests.sheet())) -> 'sheet', tests.sheet(), 'and is returned unchanged');

-- 3-8: text formulas on short fields (S24)
select is(tests.calc(tests.fld('"1d8 (" & {prof} & "/" & {prof} & ")"', '{"type":"short"}')), null, 'a short field can carry a text formula');
select is(
  public.validate_system_profile(tests.sheet_with(tests.fld('signo({prof}) & "!"', '{"type":"short"}'))) #>> '{sheet,categories,0,sections,0,items,6,formula}',
  'signo({prof}) & "!"', 'and the formula is kept as written');
select is(tests.calc(tests.fld('"x" & {prof}')), null, 'a number field can carry a text formula (the result type is checked when it is computed)');
select is(tests.calc(tests.fld('"x"', '{"type":"paragraph"}')), 'sheet.categories[0].sections[0].items[6].formula', 'a paragraph field still cannot carry a formula');
select is(tests.calc(tests.fld('"x"', '{"type":"short","editableBy":"player"}')), 'sheet.categories[0].sections[0].items[6].editableBy', 'a short formula field is DM level only');
select is(tests.calc(tests.fld('"x"', '{"type":"boolean"}')), null, 'a boolean field still can');

-- 9-19: formula charset (any character but control characters other than tab) and lexical shape
select is(tests.calc(tests.fld('"{ghost} } {" & "Ünï ✓ 日本 😀"', '{"type":"short"}')), null, 'braces and any unicode inside a text literal are just text');
select is(tests.calc(tests.fld('"a' || chr(9) || 'b"', '{"type":"short"}')), null, 'a tab inside a text literal is accepted');
select is(tests.calc(tests.fld('"a' || chr(7) || 'b"', '{"type":"short"}')), 'sheet.categories[0].sections[0].items[6].formula', 'a control character inside a text literal is rejected');
select is(tests.calc(tests.fld('"a' || chr(10) || 'b"', '{"type":"short"}')), 'sheet.categories[0].sections[0].items[6].formula', 'so is a line break');
select is(tests.calc(tests.fld('"a' || chr(133) || 'b"', '{"type":"short"}')), 'sheet.categories[0].sections[0].items[6].formula', 'and a C1 control character');
select is(tests.calc(tests.fld('"open', '{"type":"short"}')), 'sheet.categories[0].sections[0].items[6].formula', 'an unclosed text literal is rejected');
select is(tests.calc(tests.fld('1; drop table pjs')), 'sheet.categories[0].sections[0].items[6].formula', 'characters outside the language are still rejected outside text literals');
select is(tests.calc(tests.fld('{prof} ~ 1')), 'sheet.categories[0].sections[0].items[6].formula', 'including an operator the language does not have');
select is(tests.calc(tests.fld(repeat('1+', 250) || '1')), 'sheet.categories[0].sections[0].items[6].formula', 'a formula over 500 characters is rejected');
select is(tests.calc(tests.fld(repeat(' ', 3) || chr(9))), 'sheet.categories[0].sections[0].items[6].formula', 'a blank formula is rejected');
select is(tests.calc(tests.fld('"a" & {ghost}', '{"type":"short"}')), 'sheet.categories[0].sections[0].items[6].formula', 'a reference that does not exist is rejected inside a text formula');

-- 20-24: hidden formula fields (S21)
select is(
  public.validate_system_profile(tests.sheet_with(tests.fld('{prof} * 2', '{"hidden":true}'))) #> '{sheet,categories,0,sections,0,items,6,hidden}',
  'true'::jsonb, 'hidden is kept on a formula field');
select is(
  public.validate_system_profile(tests.sheet_with(tests.fld('{prof} * 2', '{"hidden":false}'))) #> '{sheet,categories,0,sections,0,items,6,hidden}',
  'false'::jsonb, 'including false');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,2,hidden}', 'true')), 'sheet.categories[0].sections[0].items[2].hidden', 'at the path of hidden');
select is(tests.calc(tests.fld('1', '{"hidden":"yes"}')), 'sheet.categories[0].sections[0].items[6].hidden', 'hidden must be a boolean');

-- 25-26: another formula reads a hidden field
select is(
  tests.detail(tests.with_sheet(jsonb_set(jsonb_set(tests.sheet(), '{categories,0,sections,0,items,6}', tests.fld('{prof} * 2', '{"key":"oculto","hidden":true}')),
    '{categories,0,sections,0,items,7}', tests.fld('{oculto} + 1', '{"key":"visible"}')))),
  null, 'a formula can read a hidden field');
select is(tests.calc(tests.fld('1', '{"hidden":null}')), 'sheet.categories[0].sections[0].items[6].hidden', 'a null hidden is rejected');

-- 27-34: table references that are valid (S29)
select is(tests.calc(tests.fld(f)), null, 'accepts ' || f)
from unnest(array[
  'suma({equipo}, "peso")',
  'promedio({equipo}, "total")',
  'conteo({equipo})',
  'conteo({equipo}, "nombre")',
  'lookup({equipo}, "nombre", "cuerda", "peso", 0)',
  'suma({dinero}, "value")',
  'lookup({dinero}, "key", "oro", "value")',
  'lookup({dinero}, "key", "oro", "label") & ""'
]) f;

-- 35-43: table references that are not
select is(tests.calc(tests.fld(f)), 'sheet.categories[0].sections[0].items[6].formula', 'rejects ' || f)
from unnest(array[
  'suma({equipo}, "ghost")',
  'lookup({equipo}, "ghost", 1, "peso")',
  'lookup({equipo}, "nombre", "x", "ghost")',
  'suma({dinero}, "total")',
  'conteo({stats})',
  'conteo({skills})',
  'suma({prof}, "x")',
  'suma({stat_str}, "x")',
  'suma({ghost}, "peso")'
]) f;

-- 44-47: a table key used as a plain value
select is(tests.calc(tests.fld(f)), 'sheet.categories[0].sections[0].items[6].formula', 'rejects the table used as a value: ' || f)
from unnest(array['{equipo} + 1', '{dinero} + 1', '{stats} + 1', '{skills} & "x"']) f;

-- 48: other sections
select is(
  tests.detail(tests.with_sheet(jsonb_set(tests.sheet(), '{categories,0,sections,1}',
    '{"key":"otra","label":"Otra","items":[{"kind":"field","key":"peso_total","label":"Peso","type":"number","formula":"suma({equipo}, \"peso\")","editableBy":"dm"}],"blocks":[{"key":"b","mode":"tile","items":["peso_total"]}]}'::jsonb))),
  null, 'a formula reads the tables of other sections');

-- 49-56: row formula columns
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,3,formula}', '"{peso} * {ghost}"')), 'sheet.categories[0].sections[0].items[5].columns[3].formula', 'a row column local that is not a column of the table is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,3,formula}', '"{peso} * {cantidad} + {prof} + suma({dinero}, \"value\")"')), null, 'a row column reads sheet fields and other tables');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,3,formula}', '"{peso} / suma({equipo}, \"peso\")"')), null, 'and the stored columns of its own table');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,3,formula}', '"{peso} + suma({equipo}, \"ghost\")"')), 'sheet.categories[0].sections[0].items[5].columns[3].formula', 'but only columns that exist');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,0,formula}', '"\"x\""')), 'sheet.categories[0].sections[0].items[5].columns[0].formula', 'a formula on a text column is rejected (row columns are numbers or flags)');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,3,formula}', '"{equipo} + 1"')), 'sheet.categories[0].sections[0].items[5].columns[3].formula', 'a row column cannot read a table as a value');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,3,formula}', '"{nombre} & \"x\""')), null, 'a row column local may be text (the type is checked when it is computed)');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,3,formula}', '"{total}"')), null, 'a row column may name itself (cycles are the client''s job, as for every formula)');

-- 57-61: nothing else changed
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,formula}', '"{modificador} + 1"')), 'sheet.categories[0].sections[0].items[3].formula', 'a plain field formula still cannot read {modificador}');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,formula}', '"{prof.valor}"')), 'sheet.categories[0].sections[0].items[3].formula', 'a dotted reference to a field is still unknown');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,formula}', '"{constructor}"')), 'sheet.categories[0].sections[0].items[3].formula', 'a prototype reference is still rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,formula}', '"{stat_str.modificador} + {stat_str} + {skill_athletics.bonus}"')), null, 'rows and row columns are still references');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,formula}', '"{prof"')), 'sheet.categories[0].sections[0].items[3].formula', 'an unclosed reference is still rejected');

-- the D&D preset (default of every new campaign) is covered by 20_dnd5e_sheet_backfill; a document with no sheet is untouched
select is(tests.detail(tests.doc()), null, 'a document with no sheet still validates');

select * from finish();
rollback;
