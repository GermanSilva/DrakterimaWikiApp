-- pgTAP: dots and tracks (odd/tasks/ficha-indice-lateral.md S15). validate_sheet() keeps `dots` (1..10) on number fields,
-- number columns and Stat tables, and `track` ({superficial, aggravated?}) on number fields, and rejects the malformed ones.
-- The same cases live in src/campaign/system/sheet/formatsDotsTrack.test.tsx: both validators must agree.
begin;

select plan(19);

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

-- items: 0 stat table, 1 capacidades (column 0), 2 hambre, 3 salud, 4 leve, 5 agravada, 6 nombre (short)
create function tests.sheet() returns jsonb language sql immutable as $$
  select $sheet${
    "categories": [{"key": "c", "label": "C", "sections": [{"key": "s", "label": "S",
      "items": [
        {"kind": "table", "type": "stat", "key": "atributos", "label": "Atributos", "rows": [{"key": "fue", "label": "Fuerza", "modifier": "{valor}", "editableBy": "dm"}]},
        {"kind": "table", "type": "capacidades", "key": "habilidades", "label": "Habilidades",
         "columns": [{"key": "nivel_h", "label": "Nivel", "type": "number", "editableBy": "dm", "default": 0}],
         "rows": [{"key": "sigilo", "label": "Sigilo", "stat": "fue", "use": "valor", "editableBy": "dm"}]},
        {"kind": "field", "key": "hambre", "label": "Hambre", "type": "number", "editableBy": "player"},
        {"kind": "field", "key": "salud", "label": "Salud", "type": "number", "editableBy": "player"},
        {"kind": "field", "key": "leve", "label": "Leve", "type": "number", "editableBy": "player"},
        {"kind": "field", "key": "agravada", "label": "Agravada", "type": "number", "editableBy": "player"},
        {"kind": "field", "key": "nombre_x", "label": "Texto", "type": "short", "editableBy": "player"}
      ],
      "blocks": [{"key": "b", "mode": "tile", "items": ["hambre"]}]}]}],
    "roles": {}
  }$sheet$::jsonb;
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

-- set `v` at `p` (relative to the first section) and validate
create function tests.with(p text[], v jsonb) returns jsonb language sql immutable as $$
  select tests.doc(jsonb_set(tests.sheet(), array['categories', '0', 'sections', '0'] || p, v));
$$;
create function tests.kept(p text[], v jsonb) returns jsonb language sql as $$
  select public.validate_system_profile(tests.with(p, v)) #> (array['sheet', 'categories', '0', 'sections', '0'] || p);
$$;
create function tests.err(p text[], v jsonb) returns text language sql as $$
  select tests.detail(tests.with(p, v));
$$;
create function tests.at(p text) returns text language sql immutable as $$
  select 'sheet.categories[0].sections[0].items' || p;
$$;

select is(tests.kept('{items,2,dots}', '5'), '5'::jsonb, 'dots on a number field');
select is(tests.kept('{items,1,columns,0,dots}', '5'), '5'::jsonb, 'dots on a number column');
select is(tests.kept('{items,0,dots}', '10'), '10'::jsonb, 'dots on a stat table');
select is(tests.kept('{items,3,track}', '{"superficial":"leve","aggravated":"agravada"}'), '{"superficial":"leve","aggravated":"agravada"}'::jsonb, 'a track with both damages');
select is(tests.kept('{items,3,track}', '{"superficial":"leve","extra":1}'), '{"superficial":"leve"}'::jsonb, 'a track with superficial damage only, unknown keys dropped');
select is(tests.err('{items,2,dots}', '0'), tests.at('[2].dots'), 'dots 0');
select is(tests.err('{items,2,dots}', '11'), tests.at('[2].dots'), 'dots 11');
select is(tests.err('{items,2,dots}', '2.5'), tests.at('[2].dots'), 'dots 2.5');
select is(tests.err('{items,2,dots}', '"5"'), tests.at('[2].dots'), 'dots as text');
select is(tests.err('{items,6,dots}', '5'), tests.at('[6].dots'), 'dots on a short field');
select is(tests.detail(tests.doc(jsonb_set(jsonb_set(tests.sheet(), '{categories,0,sections,0,items,2,dots}', '5'), '{categories,0,sections,0,items,2,format}', '"signed"'))), tests.at('[2].dots'), 'dots with the signed format');
select is(tests.err('{items,1,dots}', '5'), tests.at('[1].dots'), 'dots on a capacidades table');
select is(tests.err('{items,3,track}', '{"superficial":"nada"}'), tests.at('[3].track'), 'a track on an unknown field');
select is(tests.err('{items,3,track}', '{"superficial":"salud"}'), tests.at('[3].track'), 'a track counting itself');
select is(tests.err('{items,3,track}', '{"superficial":"leve","aggravated":"leve"}'), tests.at('[3].track'), 'the same damage field twice');
select is(tests.err('{items,3,track}', '{"superficial":"nombre_x"}'), tests.at('[3].track'), 'damage in a short field');
select is(tests.err('{items,3,track}', '"x"'), tests.at('[3].track'), 'a track that is not an object');
select is(tests.err('{items,6,track}', '{"superficial":"leve"}'), tests.at('[6].track'), 'a track on a short field');
select is(tests.kept('{items,2}', '{"kind":"field","key":"hambre","label":"Hambre","type":"number","editableBy":"player"}'),
  '{"kind":"field","key":"hambre","label":"Hambre","type":"number","editableBy":"player"}'::jsonb, 'a field without dots stays as it was');

select * from finish();
rollback;
