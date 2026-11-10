-- pgTAP: option marks (odd/tasks/ficha-indice-lateral.md S9). validate_sheet() keeps an optional `mark` of 1 to 3
-- characters on the options of an options field or column, trimmed, and rejects an empty, too long, non-text or hidden-
-- character mark. The same cases live in src/campaign/system/sheet/optionMarks.test.tsx: both validators must agree.
begin;

select plan(11);

create schema tests;

create function tests.doc(s jsonb) returns jsonb language sql immutable as $$
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
  }$profile$::jsonb || jsonb_build_object('sheet', s);
$$;

-- one capacidades table whose first column is an options column; `opts` are its options
create function tests.sheet(opts jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('roles', '{}'::jsonb, 'categories', jsonb_build_array(jsonb_build_object(
    'key', 'c', 'label', 'C', 'sections', jsonb_build_array(jsonb_build_object(
      'key', 'habilidades', 'label', 'Habilidades',
      'items', jsonb_build_array(
        '{"kind":"table","type":"stat","key":"stats","label":"Stats","rows":[{"key":"sab","label":"Sabiduría","modifier":"{valor}","editableBy":"dm"}]}'::jsonb,
        jsonb_build_object('kind', 'table', 'type', 'capacidades', 'key', 'skills', 'label', 'Habilidades', 'editableBy', 'dm',
          'columns', jsonb_build_array(jsonb_build_object('key', 'rango', 'label', 'Rango', 'type', 'options', 'display', 'select', 'editableBy', 'dm', 'options', opts)),
          'rows', '[{"key":"sk0","label":"Medicina","stat":"sab","use":"valor","editableBy":"dm"}]'::jsonb)),
      'blocks', '[{"key":"b","mode":"capacidades","items":["skills"]}]'::jsonb)))));
$$;

create function tests.opts(mark jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object('key', 'u', 'label', 'Sin entrenar', 'mark', mark), '{"key":"e","label":"Entrenado","mark":"E"}'::jsonb);
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

create function tests.kept(opts jsonb) returns jsonb language sql as $$
  select public.validate_system_profile(tests.doc(tests.sheet(opts))) #> '{sheet,categories,0,sections,0,items,1,columns,0,options}';
$$;

create function tests.mark_path() returns text language sql immutable as $$
  select 'sheet.categories[0].sections[0].items[1].columns[0].options[0].mark';
$$;

select is(tests.kept(tests.opts('"—"')), '[{"key":"u","label":"Sin entrenar","mark":"—"},{"key":"e","label":"Entrenado","mark":"E"}]'::jsonb, 'keeps marks of 1 character');
select is(tests.kept(tests.opts('" Ex "')) #>> '{0,mark}', 'Ex', 'trims a mark');
select is(tests.kept(tests.opts('"◆◆◆"')) #>> '{0,mark}', '◆◆◆', '3 code points are allowed');
select is(tests.kept('[{"key":"u","label":"Sin entrenar"},{"key":"e","label":"Entrenado"}]'::jsonb),
  '[{"key":"u","label":"Sin entrenar"},{"key":"e","label":"Entrenado"}]'::jsonb, 'options without marks stay as they were');
select is(tests.detail(tests.doc(tests.sheet(tests.opts('""')))), tests.mark_path(), 'rejects an empty mark');
select is(tests.detail(tests.doc(tests.sheet(tests.opts('"  "')))), tests.mark_path(), 'rejects a blank mark');
select is(tests.detail(tests.doc(tests.sheet(tests.opts('"Expe"')))), tests.mark_path(), 'rejects a mark over 3 characters');
select is(tests.detail(tests.doc(tests.sheet(tests.opts('7')))), tests.mark_path(), 'rejects a number as mark');
select is(tests.detail(tests.doc(tests.sheet(tests.opts(to_jsonb('E' || chr(8203)))))), tests.mark_path(), 'rejects hidden characters');
select is(tests.detail(tests.doc(tests.sheet(tests.opts('null')))), tests.mark_path(), 'rejects a null mark');
select is(tests.kept(jsonb_build_array('{"key":"u","label":"U"}'::jsonb, '{"key":"e","label":"E","mark":"●"}'::jsonb)) #> '{1}',
  '{"key":"e","label":"E","mark":"●"}'::jsonb, 'a mark on one option only');

select * from finish();
rollback;
