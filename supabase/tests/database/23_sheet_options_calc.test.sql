-- pgTAP: G2b of the system-agnostic campaigns (odd/tasks/system-agnostic.md S16, S20, S27, S34). validate_sheet() accepts
-- option fields and columns (type options: 2..20 options with their own formula, display select or checkbox, default = an
-- option key), table calculations (calc: table, column, op) on fields, resettable number columns and a default sort on
-- Libre/Habilidad tables, and `searchable` on short and number fields. The same cases live in
-- src/campaign/system/sheet/sheetModelG2b.test.ts: both validators must agree. SQL checks structure, charset and
-- references only: a formula that does not parse (1 +) and cycles stay the client's job, so they have no case here.
begin;

select plan(137);

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

-- items: 0 stats, 1 skills (Capacidades, column bonus), 2 extra, 3 prof, 4 dinero (coins), 5 equipo (Libre), item 6 = the item under test
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

create function tests.sheet_with(item jsonb) returns jsonb language sql immutable as $$
  select tests.with_sheet(jsonb_set(tests.sheet(), '{categories,0,sections,0,items,6}', item));
$$;
-- NULL when the item validates, otherwise the DETAIL of the error
create function tests.calc(item jsonb) returns text language sql as $$
  select tests.detail(tests.sheet_with(item));
$$;
-- the normalised item 6 of the validated sheet
create function tests.kept(item jsonb) returns jsonb language sql as $$
  select public.validate_system_profile(tests.sheet_with(item)) #> '{sheet,categories,0,sections,0,items,6}';
$$;
create function tests.mut(p text[], v jsonb) returns jsonb language sql immutable as $$
  select tests.with_sheet(jsonb_set(tests.sheet(), p, v));
$$;
create function tests.at(p text) returns text language sql immutable as $$
  select 'sheet.categories[0].sections[0].' || p;
$$;

-- an options field; `extra` overrides or adds properties
create function tests.opt(extra jsonb default '{}') returns jsonb language sql immutable as $$
  select '{"kind":"field","key":"dado","label":"Dado","type":"options","display":"select","editableBy":"player",
           "options":[{"key":"d6","label":"D6"},{"key":"d8","label":"D8","formula":"8"},{"key":"d10","label":"D10","formula":"\"d\" & 10"}]}'::jsonb || extra;
$$;
create function tests.many(n int) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('key', 'o' || i, 'label', 'O' || i)) from generate_series(1, n) i;
$$;
-- a calculation field
create function tests.cf(extra jsonb default '{}') returns jsonb language sql immutable as $$
  select '{"kind":"field","key":"calculo","label":"Cálculo","type":"number","editableBy":"dm","calc":{"table":"equipo","column":"peso","op":"suma"}}'::jsonb || extra;
$$;
-- the skills table with an extra column (index 1) / the equipo table with an extra column (index 4)
create function tests.skill_col(extra jsonb default '{}') returns jsonb language sql immutable as $$
  select tests.mut('{categories,0,sections,0,items,1,columns,1}',
    '{"key":"competencia","label":"Competencia","type":"options","display":"select","format":"signed","editableBy":"player",
      "options":[{"key":"no","label":"No competente","formula":"{modificador} + {prof} * 0"},
                 {"key":"si","label":"Competente","formula":"{modificador} + {prof} * 1"},
                 {"key":"ex","label":"Experto","formula":"{modificador} + {prof} * 2"}]}'::jsonb || extra);
$$;
create function tests.equipo_col(extra jsonb default '{}') returns jsonb language sql immutable as $$
  select tests.mut('{categories,0,sections,0,items,5,columns,4}',
    '{"key":"calidad","label":"Calidad","type":"options","display":"select","editableBy":"player",
      "options":[{"key":"mala","label":"Mala","formula":"{peso} * 1"},{"key":"buena","label":"Buena","formula":"{peso} * {cantidad} + {prof} + suma({equipo}, \"peso\")"}]}'::jsonb || extra);
$$;
-- the equipo table with a property of column n set
create function tests.col_set(n int, k text, v jsonb) returns jsonb language sql immutable as $$
  select tests.mut(array['categories','0','sections','0','items','5','columns',n::text,k], v);
$$;
-- the validated reset of column 2 of equipo / the validated sortBy of equipo
create function tests.mut_reset_kept(r jsonb) returns jsonb language sql as $$
  select public.validate_system_profile(tests.col_set(2, 'reset', r)) #> '{sheet,categories,0,sections,0,items,5,columns,2,reset}';
$$;
create function tests.kept_table(doc jsonb) returns jsonb language sql as $$
  select public.validate_system_profile(doc) #> '{sheet,categories,0,sections,0,items,5,sortBy}';
$$;
create function tests.table_set(k text, v jsonb) returns jsonb language sql immutable as $$
  select tests.mut(array['categories','0','sections','0','items','5',k], v);
$$;

-- 1-2: the base sheet is valid and unchanged
select is(tests.detail(tests.with_sheet(tests.sheet())), null, 'the base sheet validates');
select is(public.validate_system_profile(tests.with_sheet(tests.sheet())) -> 'sheet', tests.sheet(), 'and is returned unchanged, with no new properties');

-- ===== option fields (S20)
-- 3-5: accepted and normalised
select is(tests.calc(tests.opt()), null, 'a select field with option formulas validates');
select is(
  tests.kept(tests.opt('{"default":"a","format":"signed","junk":true,"options":[{"key":"a","label":" A ","formula":"1","extra":1},{"key":"b","label":"B"}]}')),
  '{"kind":"field","key":"dado","label":"Dado","type":"options","display":"select","editableBy":"player","format":"signed","default":"a",
    "options":[{"key":"a","label":"A","formula":"1"},{"key":"b","label":"B"}]}'::jsonb,
  'it is returned normalised: labels trimmed, unknown properties dropped');
select is(tests.calc(tests.opt('{"display":"checkbox","options":[{"key":"no","label":"No"},{"key":"si","label":"Sí","formula":"1"}]}')), null, 'a checkbox with exactly two options validates');

-- 6-9: option counts
select is(tests.calc(tests.opt(jsonb_build_object('options', tests.many(2)))), null, 'two options validate');
select is(tests.calc(tests.opt(jsonb_build_object('options', tests.many(20)))), null, 'twenty options validate');
select is(tests.calc(tests.opt(jsonb_build_object('options', tests.many(1)))), tests.at('items[6].options'), 'one option is rejected');
select is(tests.calc(tests.opt(jsonb_build_object('options', tests.many(21)))), tests.at('items[6].options'), 'twenty-one options are rejected');

-- 10-26: rejected options fields, at the path of the offence
select is(tests.calc(v.item), tests.at('items[6].' || v.path), 'rejects ' || v.label)
from (values
  ('no options', tests.opt() - 'options', 'options'),
  ('options that are not a list', tests.opt('{"options":"a,b"}'), 'options'),
  ('an option that is not an object', tests.opt('{"options":["a",{"key":"b","label":"B"}]}'), 'options[0]'),
  ('a repeated option key', tests.opt('{"options":[{"key":"a","label":"A"},{"key":"a","label":"B"}]}'), 'options[1].key'),
  ('an option key with the wrong charset', tests.opt('{"options":[{"key":"Bad Key","label":"A"},{"key":"b","label":"B"}]}'), 'options[0].key'),
  ('a prototype option key', tests.opt('{"options":[{"key":"a","label":"A"},{"key":"constructor","label":"B"}]}'), 'options[1].key'),
  ('an option without a label', tests.opt('{"options":[{"key":"a"},{"key":"b","label":"B"}]}'), 'options[0].label'),
  ('an option formula outside the language', tests.opt('{"options":[{"key":"a","label":"A"},{"key":"b","label":"B","formula":"1; drop table pjs"}]}'), 'options[1].formula'),
  ('an option formula that reads nothing known', tests.opt('{"options":[{"key":"a","label":"A","formula":"{ghost}"},{"key":"b","label":"B"}]}'), 'options[0].formula'),
  ('an option formula that reads a table as a value', tests.opt('{"options":[{"key":"a","label":"A","formula":"{equipo} + 1"},{"key":"b","label":"B"}]}'), 'options[0].formula'),
  ('an option formula naming a column that does not exist', tests.opt('{"options":[{"key":"a","label":"A","formula":"suma({equipo}, \"ghost\")"},{"key":"b","label":"B"}]}'), 'options[0].formula'),
  ('no display', tests.opt() - 'display', 'display'),
  ('an unknown display', tests.opt('{"display":"radio"}'), 'display'),
  ('a checkbox with three options', tests.opt('{"display":"checkbox"}'), 'display'),
  ('a default that is not an option key', tests.opt('{"default":"d12"}'), 'default'),
  ('a default that is not text', tests.opt('{"default":6}'), 'default'),
  ('a formula on the field itself', tests.opt('{"formula":"1","editableBy":"dm"}'), 'formula')
) v(label, item, path);

-- 27-29: options and display belong to options fields only
select is(tests.calc('{"kind":"field","key":"n","label":"N","type":"number","editableBy":"dm","options":[{"key":"a","label":"A"},{"key":"b","label":"B"}]}'), tests.at('items[6].options'), 'options on a number field are rejected');
select is(tests.calc('{"kind":"field","key":"n","label":"N","type":"short","editableBy":"dm","display":"select"}'), tests.at('items[6].display'), 'a display on a short field is rejected');
select is(tests.calc('{"kind":"field","key":"s","label":"S","type":"short","editableBy":"dm","format":"signed"}'), tests.at('items[6].format'), 'format signed on a short field is still rejected');

-- 30-31: format
select is(tests.kept(tests.opt('{"format":"signed"}')) ->> 'format', 'signed', 'format signed is kept on an options field');
select is(tests.calc(tests.opt('{"format":"loud"}')), tests.at('items[6].format'), 'another format is rejected');

-- 32: option formulas read fields, rows and tables through functions
select is(tests.calc(tests.opt('{"options":[{"key":"a","label":"A","formula":"{prof} + {stat_str.modificador} + {skill_athletics.bonus}"},{"key":"b","label":"B","formula":"suma({equipo}, \"peso\") + suma({dinero}, \"value\")"}]}')), null,
  'an option formula reads fields, rows and tables');

-- 33: not a number field: no role
select is(tests.detail(tests.with_sheet(jsonb_set(jsonb_set(tests.sheet(), '{categories,0,sections,0,items,6}', tests.opt()), '{roles}', '{"hp":"dado"}'))), 'sheet.roles.hp', 'an options field cannot be bound to a role');

-- ===== option columns
-- 34-35
select is(tests.detail(tests.skill_col()), null, 'an options column of a Capacidades table (locals: columns, valor, modificador) validates');
select is(
  public.validate_system_profile(tests.skill_col('{"default":"no","junk":1}')) #> '{sheet,categories,0,sections,0,items,1,columns,1}',
  '{"key":"competencia","label":"Competencia","type":"options","display":"select","format":"signed","editableBy":"player","default":"no",
    "options":[{"key":"no","label":"No competente","formula":"{modificador} + {prof} * 0"},
               {"key":"si","label":"Competente","formula":"{modificador} + {prof} * 1"},
               {"key":"ex","label":"Experto","formula":"{modificador} + {prof} * 2"}]}'::jsonb,
  'and is returned normalised');
select is(tests.detail(tests.skill_col('{"options":[{"key":"a","label":"A","formula":"{bonus} + {valor}"},{"key":"b","label":"B"}]}')), null, 'its option formulas may read the columns of the row and the linked stat');

-- 37-45: every option formula is checked like a formula of that place, and the option rules apply
select is(tests.detail(v.doc), tests.at(v.path), 'rejects ' || v.label)
from (values
  ('an unknown reference in an option formula', tests.skill_col('{"options":[{"key":"a","label":"A","formula":"{ghost}"},{"key":"b","label":"B"}]}'), 'items[1].columns[1].options[0].formula'),
  ('a table read as a value in an option formula', tests.skill_col('{"options":[{"key":"a","label":"A"},{"key":"b","label":"B","formula":"{equipo} * 2"}]}'), 'items[1].columns[1].options[1].formula'),
  ('one option', tests.skill_col('{"options":[{"key":"a","label":"A"}]}'), 'items[1].columns[1].options'),
  ('a repeated option key in a column', tests.skill_col('{"options":[{"key":"a","label":"A"},{"key":"a","label":"B"}]}'), 'items[1].columns[1].options[1].key'),
  ('a checkbox column with three options', tests.skill_col('{"display":"checkbox"}'), 'items[1].columns[1].display'),
  ('a column default that is not an option', tests.skill_col('{"default":"zz"}'), 'items[1].columns[1].default'),
  ('a column with no options', tests.skill_col() #- '{sheet,categories,0,sections,0,items,1,columns,1,options}', 'items[1].columns[1].options'),
  ('a column formula on an options column', tests.skill_col('{"formula":"1"}'), 'items[1].columns[1].formula'),
  ('a local that does not exist in a Libre option formula', tests.equipo_col('{"options":[{"key":"mala","label":"Mala","formula":"{valor}"},{"key":"buena","label":"Buena"}]}'), 'items[5].columns[4].options[0].formula'),
  ('a DM column in a table the player edits', tests.equipo_col('{"editableBy":"dm"}'), 'items[5].columns[4].editableBy')
) v(label, doc, path);

-- 47-48: Libre and Habilidad
select is(tests.detail(tests.equipo_col()), null, 'an options column of a Libre table (locals: its columns) validates');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,6}',
  '{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","editableBy":"dm","columns":[
     {"key":"nombre","label":"Nombre","type":"short","editableBy":"dm"},
     {"key":"escuela","label":"Escuela","type":"options","display":"select","editableBy":"dm","options":[{"key":"a","label":"A"},{"key":"b","label":"B"}]}]}'::jsonb)),
  null, 'and of a Habilidad table');

-- ===== table calculation (S16, S34)
-- 49-68: accepted, kept without a formula
select is(tests.kept(tests.cf(jsonb_build_object('type', v.type, 'calc', v.spec || '{"junk":1}'::jsonb))),
  jsonb_build_object('kind', 'field', 'key', 'calculo', 'label', 'Cálculo', 'type', v.type, 'editableBy', 'dm', 'calc', v.spec),
  'accepts and keeps ' || v.label)
from (values
  ('suma', 'number', '{"table":"equipo","column":"peso","op":"suma"}'::jsonb),
  ('promedio', 'number', '{"table":"equipo","column":"total","op":"promedio"}'::jsonb),
  ('mayor', 'number', '{"table":"equipo","column":"peso","op":"mayor"}'::jsonb),
  ('menor', 'number', '{"table":"equipo","column":"peso","op":"menor"}'::jsonb),
  ('conteo with a column', 'number', '{"table":"equipo","column":"nombre","op":"conteo"}'::jsonb),
  ('conteo of the rows', 'number', '{"table":"equipo","op":"conteo"}'::jsonb),
  ('mas_frecuente as number', 'number', '{"table":"equipo","column":"peso","op":"mas_frecuente"}'::jsonb),
  ('mas_frecuente as text', 'short', '{"table":"equipo","column":"nombre","op":"mas_frecuente"}'::jsonb),
  ('menos_frecuente as text', 'short', '{"table":"equipo","column":"nombre","op":"menos_frecuente"}'::jsonb),
  ('a coin table column', 'number', '{"table":"dinero","column":"value","op":"suma"}'::jsonb)
) v(label, type, spec);
select ok(not (tests.kept(tests.cf()) ? 'formula'), 'a calculation field has no formula property');

-- 70-90: rejected
select is(tests.calc(v.item), tests.at('items[6].' || v.path), 'rejects ' || v.label)
from (values
  ('a formula as well', tests.cf('{"formula":"1"}'), 'calc'),
  ('a calc that is not an object', tests.cf('{"calc":"suma"}'), 'calc'),
  ('an unknown op', tests.cf('{"calc":{"table":"equipo","column":"peso","op":"mediana"}}'), 'calc.op'),
  ('no op', tests.cf('{"calc":{"table":"equipo","column":"peso"}}'), 'calc.op'),
  ('no table', tests.cf('{"calc":{"column":"peso","op":"suma"}}'), 'calc.table'),
  ('a table that does not exist', tests.cf('{"calc":{"table":"ghost","column":"peso","op":"suma"}}'), 'calc.table'),
  ('a field as the table', tests.cf('{"calc":{"table":"prof","column":"peso","op":"suma"}}'), 'calc.table'),
  ('a stat table', tests.cf('{"calc":{"table":"stats","column":"x","op":"suma"}}'), 'calc.table'),
  ('a capacidades table', tests.cf('{"calc":{"table":"skills","column":"bonus","op":"suma"}}'), 'calc.table'),
  ('no column for suma', tests.cf('{"calc":{"table":"equipo","op":"suma"}}'), 'calc.column'),
  ('no column for mayor', tests.cf('{"calc":{"table":"equipo","op":"mayor"}}'), 'calc.column'),
  ('no column for mas_frecuente', tests.cf('{"type":"short","calc":{"table":"equipo","op":"mas_frecuente"}}'), 'calc.column'),
  ('a column that does not exist', tests.cf('{"calc":{"table":"equipo","column":"ghost","op":"suma"}}'), 'calc.column'),
  ('a column that is not text', tests.cf('{"calc":{"table":"equipo","column":5,"op":"suma"}}'), 'calc.column'),
  ('a column the coin table does not have', tests.cf('{"calc":{"table":"dinero","column":"total","op":"suma"}}'), 'calc.column'),
  ('a short field for a numeric op', tests.cf('{"type":"short"}'), 'type'),
  ('a paragraph field for mas_frecuente', tests.cf('{"type":"paragraph","calc":{"table":"equipo","column":"nombre","op":"mas_frecuente"}}'), 'type'),
  ('a boolean field for mayor', tests.cf('{"type":"boolean","calc":{"table":"equipo","column":"peso","op":"mayor"}}'), 'type'),
  ('a short field for conteo', tests.cf('{"type":"short","calc":{"table":"equipo","op":"conteo"}}'), 'type'),
  ('a field the player owns', tests.cf('{"editableBy":"player"}'), 'editableBy'),
  ('overridable', tests.cf('{"overridable":true}'), 'overridable')
) v(label, item, path);

-- 91-93: hidden, searchable, format on a calculation; referenced by other formulas
select is(tests.kept(tests.cf('{"hidden":true,"format":"signed","searchable":true}')) - 'calc' - 'kind' - 'key' - 'label' - 'type' - 'editableBy',
  '{"hidden":true,"format":"signed","searchable":true}'::jsonb, 'a calculation can be hidden, signed and searchable');
select is(tests.detail(tests.with_sheet(jsonb_set(jsonb_set(tests.sheet(), '{categories,0,sections,0,items,6}', tests.cf()),
  '{categories,0,sections,0,items,7}', '{"kind":"field","key":"doble","label":"Doble","type":"number","formula":"{calculo} * 2","editableBy":"dm"}'::jsonb))),
  null, 'another formula can read a calculation by its key');
select is(tests.detail(tests.with_sheet(jsonb_set(jsonb_set(tests.sheet(), '{categories,0,sections,0,items,6}', tests.cf()),
  '{categories,0,sections,0,items,7}', '{"kind":"field","key":"calculo","label":"Otro","type":"number","editableBy":"dm"}'::jsonb))),
  tests.at('items[7].key'), 'a calculation key is a key like any other (no duplicates)');

-- ===== resettable number columns (S16)
-- 94-100: accepted and kept (column 2 = cantidad)
select is(tests.mut_reset_kept(v.reset), v.kept, 'accepts and keeps ' || v.reset::text)
from (values
  ('{"to":"zero"}'::jsonb, '{"to":"zero"}'::jsonb),
  ('{"to":"value","value":6}'::jsonb, '{"to":"value","value":6}'::jsonb),
  ('{"to":"value","value":0}'::jsonb, '{"to":"value","value":0}'::jsonb),
  ('{"to":"value","value":-2.5}'::jsonb, '{"to":"value","value":-2.5}'::jsonb),
  ('{"to":"column","column":"peso"}'::jsonb, '{"to":"column","column":"peso"}'::jsonb),
  ('{"to":"column","column":"total"}'::jsonb, '{"to":"column","column":"total"}'::jsonb),
  ('{"to":"zero","column":"peso","value":3}'::jsonb, '{"to":"zero"}'::jsonb)
) v(reset, kept);

-- 101-110: rejected
select is(tests.detail(tests.col_set(2, 'reset', v.reset)), tests.at('items[5].columns[2].reset'), 'rejects a reset with ' || v.label)
from (values
  ('an unknown target', '{"to":"max"}'::jsonb),
  ('no target', '{}'::jsonb),
  ('a value that is not an object', '"zero"'::jsonb),
  ('a column target with no column', '{"to":"column"}'::jsonb),
  ('a column that does not exist', '{"to":"column","column":"ghost"}'::jsonb),
  ('the column itself', '{"to":"column","column":"cantidad"}'::jsonb),
  ('a column that is not a number', '{"to":"column","column":"nombre"}'::jsonb),
  ('a value target with no value', '{"to":"value"}'::jsonb),
  ('a value that is not a number', '{"to":"value","value":"3"}'::jsonb)
) v(label, reset);
select is(tests.detail(tests.col_set(0, 'reset', '{"to":"zero"}')), tests.at('items[5].columns[0].reset'), 'a reset on a short column is rejected');
select is(tests.detail(tests.col_set(3, 'reset', '{"to":"zero"}')), tests.at('items[5].columns[3].reset'), 'a reset on a formula column is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,1,columns,0,reset}', '{"to":"zero"}')), tests.at('items[1].columns[0].reset'), 'a reset on a Capacidades column is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,6}',
  '{"kind":"table","type":"habilidad","key":"recursos","label":"Recursos","editableBy":"dm","columns":[
     {"key":"maximo","label":"Máximo","type":"number","editableBy":"dm"},
     {"key":"usado","label":"Usado","type":"number","reset":{"to":"column","column":"maximo"},"editableBy":"dm"}]}'::jsonb)),
  null, 'a reset on a Habilidad column validates');

-- ===== default sort
select is(tests.kept_table(tests.table_set('sortBy', '{"column":"peso","direction":"desc","junk":1}')), '{"column":"peso","direction":"desc"}'::jsonb, 'a Libre table keeps its sortBy');
select is(tests.kept_table(tests.table_set('sortBy', '{"column":"total","direction":"asc"}')), '{"column":"total","direction":"asc"}'::jsonb, 'also by a formula column');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,6}',
  '{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","editableBy":"dm","sortBy":{"column":"nombre","direction":"asc"},
    "columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"dm"}]}'::jsonb)), null, 'a Habilidad table can be sorted');
select is(tests.detail(tests.table_set('sortBy', v.sort)), tests.at('items[5].' || v.path), 'rejects a sortBy with ' || v.label)
from (values
  ('a column that does not exist', '{"column":"ghost","direction":"asc"}'::jsonb, 'sortBy.column'),
  ('no column', '{"direction":"asc"}'::jsonb, 'sortBy.column'),
  ('a direction that is not asc or desc', '{"column":"peso","direction":"up"}'::jsonb, 'sortBy.direction'),
  ('no direction', '{"column":"peso"}'::jsonb, 'sortBy.direction'),
  ('a value that is not an object', '"peso"'::jsonb, 'sortBy')
) v(label, sort, path);
select is(tests.detail(tests.mut('{categories,0,sections,0,items,1,sortBy}', '{"column":"bonus","direction":"asc"}')), tests.at('items[1].sortBy'), 'a sortBy on a Capacidades table is rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,4,sortBy}', '{"column":"value","direction":"asc"}')), tests.at('items[4].sortBy'), 'on the coin table');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,0,sortBy}', '{"column":"x","direction":"asc"}')), tests.at('items[0].sortBy'), 'and on a Stat table');

-- ===== searchable (S27)
select is(tests.kept(jsonb_build_object('kind', 'field', 'key', 'buscable', 'label', 'Buscable', 'type', t, 'editableBy', 'player', 'searchable', s)) -> 'searchable', to_jsonb(s), 'searchable ' || s || ' is kept on a ' || t || ' field')
from (values ('short', true), ('short', false), ('number', true), ('number', false)) v(t, s);
select ok(not (tests.kept('{"kind":"field","key":"buscable","label":"Buscable","type":"short","editableBy":"player"}') ? 'searchable'), 'and absent when not given');
select is(tests.calc(jsonb_build_object('kind', 'field', 'key', 'buscable', 'label', 'Buscable', 'type', t, 'editableBy', 'player', 'searchable', true)), tests.at('items[6].searchable'), 'searchable is rejected on a ' || t || ' field')
from (values ('paragraph'), ('boolean')) v(t);
select is(tests.calc(tests.opt('{"searchable":true}')), tests.at('items[6].searchable'), 'and on an options field');
select is(tests.calc(v.item), tests.at('items[6].searchable'), 'rejects ' || v.label)
from (values
  ('a searchable that is not a boolean', '{"kind":"field","key":"buscable","label":"B","type":"short","editableBy":"player","searchable":"yes"}'::jsonb),
  ('a null searchable', '{"kind":"field","key":"buscable","label":"B","type":"number","editableBy":"player","searchable":null}'::jsonb)
) v(label, item);

-- ===== the table functions mayor, menor, frecuente and infrecuente (formula language) are table functions like suma
select is(tests.calc(jsonb_build_object('kind', 'field', 'key', 'calc', 'label', 'Calc', 'type', 'number', 'formula', f, 'editableBy', 'dm')), null, 'accepts ' || f)
from unnest(array[
  'mayor({equipo}, "peso")',
  'menor({equipo}, "total")',
  'frecuente({equipo}, "nombre") & ""',
  'infrecuente({dinero}, "key") & ""'
]) f;
select is(tests.calc(jsonb_build_object('kind', 'field', 'key', 'calc', 'label', 'Calc', 'type', 'number', 'formula', f, 'editableBy', 'dm')), tests.at('items[6].formula'), 'rejects ' || f)
from unnest(array[
  'mayor({equipo}, "ghost")',
  'frecuente({stats}, "x")',
  'menor({prof}, "x")',
  'infrecuente({ghost}, "peso")',
  'mayor({equipo}, "peso") + {equipo}'
]) f;

-- ===== nothing else changed
select is(tests.detail(tests.mut('{categories,0,sections,0,items,3,formula}', '"{modificador} + 1"')), tests.at('items[3].formula'), 'a plain field formula still cannot read {modificador}');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,3,formula}', '"{peso} * {ghost}"')), tests.at('items[5].columns[3].formula'), 'a row column local that is not a column is still rejected');
select is(tests.detail(tests.mut('{categories,0,sections,0,items,5,columns,0,formula}', '"\"x\""')), tests.at('items[5].columns[0].formula'), 'a formula on a text column is still rejected');
select is(tests.detail(tests.doc()), null, 'a document with no sheet still validates');

select * from finish();
rollback;
