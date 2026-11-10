-- pgTAP: sheet card (odd/tasks/ficha-indice-lateral.md S12-S14). validate_sheet() keeps an optional `card` (pinned fields
-- or coin tables with an optional number max and dmOnly, a Stat line, a text excerpt) and rejects a malformed one. The
-- same cases live in src/campaign/system/sheet/card.test.ts: both validators must agree.
begin;

select plan(20);

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

create function tests.sheet(card jsonb) returns jsonb language sql immutable as $$
  select $sheet${
    "categories": [{"key": "c", "label": "C", "sections": [{"key": "s", "label": "S",
      "items": [
        {"kind": "table", "type": "stat", "key": "atributos", "label": "Atributos", "rows": [{"key": "int", "label": "INT", "modifier": "{valor}", "editableBy": "dm"}]},
        {"kind": "field", "key": "humanidad", "label": "Humanidad", "type": "number", "editableBy": "dm"},
        {"kind": "field", "key": "humanidad_max", "label": "Humanidad máx.", "type": "number", "editableBy": "dm"},
        {"kind": "field", "key": "trauma", "label": "Trauma", "type": "short", "editableBy": "dm"},
        {"kind": "field", "key": "trasfondo", "label": "Trasfondo", "type": "paragraph", "editableBy": "dm"},
        {"kind": "table", "type": "monedas", "key": "dinero", "label": "Dinero", "rows": [{"key": "corona", "label": "Corona", "value": 100}, {"key": "obolo", "label": "Óbolo", "value": 1}]}
      ],
      "blocks": [{"key": "b", "mode": "tile", "items": ["humanidad"]}]}]}],
    "roles": {}
  }$sheet$::jsonb || case when card is null then '{}'::jsonb else jsonb_build_object('card', card) end;
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

create function tests.card(card jsonb) returns jsonb language sql as $$
  select public.validate_system_profile(tests.doc(tests.sheet(card))) #> '{sheet,card}';
$$;
create function tests.err(card jsonb) returns text language sql as $$
  select tests.detail(tests.doc(tests.sheet(card)));
$$;

select is(tests.card('{"pinned":[{"key":"humanidad","max":"humanidad_max"},{"key":"trauma","dmOnly":true},{"key":"dinero"}],"statline":"atributos","excerpt":"trasfondo"}'),
  '{"pinned":[{"key":"humanidad","max":"humanidad_max"},{"key":"trauma","dmOnly":true},{"key":"dinero"}],"statline":"atributos","excerpt":"trasfondo"}'::jsonb, 'keeps a valid card');
select is(tests.card(null), null, 'no card when none is given');
select is(tests.card('{"pinned":[{"key":"trauma","dmOnly":false}]}'), '{"pinned":[{"key":"trauma"}]}'::jsonb, 'drops dmOnly false');
select is(tests.card('{"pinned":[]}'), '{"pinned":[]}'::jsonb, 'an empty pinned list is valid');
select is(tests.err('{"pinned":[{"key":"trauma"},{"key":"trauma"},{"key":"trauma"},{"key":"trauma"},{"key":"trauma"},{"key":"trauma"},{"key":"trauma"}]}'), 'sheet.card.pinned', 'at most 6 pinned');
select is(tests.err('{}'), 'sheet.card.pinned', 'pinned is required');
select is(tests.err('"x"'), 'sheet.card', 'a card is an object');
select is(tests.err('{"pinned":[{"key":"nada"}]}'), 'sheet.card.pinned[0].key', 'an unknown pinned key');
select is(tests.err('{"pinned":[{"key":"atributos"}]}'), 'sheet.card.pinned[0].key', 'a stat table cannot be pinned');
select is(tests.err('{"pinned":[{"key":"trauma"},{"key":"trauma"}]}'), 'sheet.card.pinned[1].key', 'pinned twice');
select is(tests.err('{"pinned":[{"key":"trauma","max":"humanidad_max"}]}'), 'sheet.card.pinned[0].max', 'a max on a text field');
select is(tests.err('{"pinned":[{"key":"humanidad","max":"trauma"}]}'), 'sheet.card.pinned[0].max', 'a max that is not a number field');
select is(tests.err('{"pinned":[{"key":"trauma","dmOnly":"si"}]}'), 'sheet.card.pinned[0].dmOnly', 'dmOnly is a boolean');
select is(tests.err('{"pinned":[],"statline":"dinero"}'), 'sheet.card.statline', 'the stat line is a stat table');
select is(tests.err('{"pinned":[],"excerpt":"humanidad"}'), 'sheet.card.excerpt', 'the excerpt is a text field');
select is(tests.card('{"pinned":[],"excerpt":"trauma"}'), '{"pinned":[],"excerpt":"trauma"}'::jsonb, 'a short field is a valid excerpt');
select is(tests.card('{"pinned":[{"key":"dinero"}],"extra":1}'), '{"pinned":[{"key":"dinero"}]}'::jsonb, 'unknown card keys are dropped');

select is(tests.err('{"pinned":[{"key":"int"}]}'), 'sheet.card.pinned[0].key', 'a stat row cannot be pinned');
select is(tests.err('{"pinned":[{"key":"dinero","max":"humanidad_max"}]}'), 'sheet.card.pinned[0].max', 'a max on a coin table');
select is(tests.err('{"pinned":[],"statline":null}'), 'sheet.card.statline', 'a null stat line');

select * from finish();
rollback;
