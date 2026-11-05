-- pgTAP: G3 of the system-agnostic campaigns (odd/tasks/system-agnostic.md S19, S32). validate_system_profile() accepts the
-- optional `distance` key { main, units: [{ key, label, value, decimals }] } and PRESERVES it (normalised). The same cases live
-- in src/campaign/system/distance/distance.test.ts (validateDistance): both validators must agree, error paths included.
begin;

select plan(72);

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

create function tests.ft(extra jsonb default '{}') returns jsonb language sql immutable as $$
  select '{"key":"ft","label":"Pies","value":1,"decimals":0}'::jsonb || extra;
$$;
create function tests.m() returns jsonb language sql immutable as $$
  select '{"key":"m","label":"Metros","value":3.28084,"decimals":1}'::jsonb;
$$;
-- a document with this distance value
create function tests.with(d jsonb) returns jsonb language sql immutable as $$
  select tests.doc() || jsonb_build_object('distance', d);
$$;
-- a one-unit distance whose unit is ft patched with `extra`
create function tests.one(extra jsonb) returns jsonb language sql immutable as $$
  select tests.with(jsonb_build_object('main', 'ft', 'units', jsonb_build_array(tests.ft(extra))));
$$;
create function tests.many(n int) returns jsonb language sql immutable as $$
  select tests.with(jsonb_build_object('main', 'u1', 'units', (
    select jsonb_agg(jsonb_build_object('key', 'u' || i, 'label', 'U' || i, 'value', 1, 'decimals', 0)) from generate_series(1, n) i)));
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

-- ===== valid documents
select is(tests.detail(tests.with('{"main":"ft","units":[{"key":"ft","label":"Pies","value":1,"decimals":0},{"key":"m","label":"Metros","value":3.28084,"decimals":1},{"key":"c","label":"Casilleros","value":5,"decimals":0}]}')),
  null, 'ft, m and squares validate');
select is(
  public.validate_system_profile(tests.with(jsonb_build_object('main', 'm', 'extra', 1, 'units', jsonb_build_array(tests.ft('{"label":"  Pies  ","junk":true}'), tests.m())))) -> 'distance',
  '{"main":"m","units":[{"key":"ft","label":"Pies","value":1,"decimals":0},{"key":"m","label":"Metros","value":3.28084,"decimals":1}]}'::jsonb,
  'the distance is returned normalised: labels trimmed, unknown properties dropped, order kept');
select is(public.validate_system_profile(tests.one('{"decimals":1.0}')) #> '{distance,units,0,decimals}', '1'::jsonb, 'decimals written as 1.0 come back as the integer 1');
select is(public.validate_system_profile(public.validate_system_profile(tests.with('{"main":"ft","units":[{"key":"ft","label":"Pies","value":1,"decimals":0},{"key":"c","label":"C","value":5,"decimals":2}]}'))),
  public.validate_system_profile(tests.with('{"main":"ft","units":[{"key":"ft","label":"Pies","value":1,"decimals":0},{"key":"c","label":"C","value":5,"decimals":2}]}')), 'validation is idempotent');
select is(tests.detail(tests.many(1)), null, 'one unit validates');
select is(tests.detail(tests.many(8)), null, 'eight units validate');
select is(public.validate_system_profile(tests.many(8)) #> '{distance,units,7,key}', '"u8"'::jsonb, 'the eighth unit is kept');
select is(tests.detail(tests.doc()), null, 'a document without distance still validates');
select is(public.validate_system_profile(tests.doc()) ? 'distance', false, 'and gets none (nothing is invented)');
select is(public.validate_system_profile(tests.doc() || '{"sheet":{"roles":{},"categories":[]},"distance":{"main":"ft","units":[{"key":"ft","label":"Pies","value":1,"decimals":0}]}}') ?& array['sheet', 'distance'], true, 'sheet and distance travel together');
select is(public.validate_system_profile(tests.doc() || '{"sheet":{"roles":{},"categories":[]}}') ? 'distance', false, 'a document with a sheet and no distance gets no distance');
select is(public.validate_system_profile(tests.one('{}')) - 'distance', public.validate_system_profile(tests.doc()), 'the rest of the document is untouched');

-- ===== unit count
select is(tests.detail(tests.many(9)), 'distance.units', 'nine units are rejected');
select is(tests.detail(tests.with('{"main":"ft","units":[]}')), 'distance.units', 'no units are rejected');
select is(tests.detail(tests.with('{"main":"ft","units":{}}')), 'distance.units', 'units that are not a list are rejected');
select is(tests.detail(tests.with('{"main":"ft"}')), 'distance.units', 'missing units are rejected');
select is(tests.detail(tests.with('{"main":"ft","units":["ft"]}')), 'distance.units[0]', 'a unit that is not an object is rejected at its index');

-- ===== not an object / main
select is(tests.detail(tests.doc() || '{"distance":null}'), 'distance', 'null is rejected');
select is(tests.detail(tests.doc() || '{"distance":[]}'), 'distance', 'a list is rejected');
select is(tests.detail(tests.doc() || '{"distance":"ft"}'), 'distance', 'a text is rejected');
select is(tests.detail(tests.doc() || '{"distance":5}'), 'distance', 'a number is rejected');
select is(tests.detail(tests.with(jsonb_build_object('main', 'yd', 'units', jsonb_build_array(tests.ft())))), 'distance.main', 'a main that is not a declared unit is rejected');
select is(tests.detail(tests.with(jsonb_build_object('units', jsonb_build_array(tests.ft())))), 'distance.main', 'a missing main is rejected');
select is(tests.detail(tests.with(jsonb_build_object('main', 1, 'units', jsonb_build_array(tests.ft())))), 'distance.main', 'a main that is not a text is rejected');
select is(tests.detail(tests.with(jsonb_build_object('main', 'FT', 'units', jsonb_build_array(tests.ft())))), 'distance.main', 'the main is matched by exact key');

-- ===== keys
select is(tests.detail(tests.one(jsonb_build_object('key', v.k))), 'distance.units[0].key', 'rejects the key ' || v.label)
from (values
  ('Ft (upper case)', '"Ft"'::jsonb), ('1a (starts with a digit)', '"1a"'::jsonb), ('a-b (hyphen)', '"a-b"'::jsonb), ('empty', '""'::jsonb),
  ('of 41 characters', to_jsonb(rpad('', 41, 'a'))), ('constructor', '"constructor"'::jsonb), ('prototype', '"prototype"'::jsonb),
  ('a number', '7'::jsonb), ('null', 'null'::jsonb), ('with a space', '"a b"'::jsonb)
) v(label, k);
select is(tests.detail(tests.with(jsonb_build_object('main', rpad('', 40, 'a'), 'units', jsonb_build_array(tests.ft(jsonb_build_object('key', rpad('', 40, 'a'))))))), null, 'a key of 40 characters validates');
select is(tests.detail(tests.with(jsonb_build_object('main', 'ft', 'units', jsonb_build_array(tests.ft() - 'key')))), 'distance.units[0].key', 'a missing key is rejected');
select is(tests.detail(tests.with(jsonb_build_object('main', 'ft', 'units', jsonb_build_array(tests.ft(), tests.m() || '{"key":"ft"}')))), 'distance.units[1].key', 'a repeated key is rejected at the second unit');

-- ===== labels
select is(tests.detail(tests.one(jsonb_build_object('label', v.l))), 'distance.units[0].label', 'rejects the label ' || v.name)
from (values
  ('empty', '""'::jsonb), ('blank', '"   "'::jsonb), ('of 61 characters', to_jsonb(rpad('', 61, 'a'))), ('with a line break', to_jsonb('a' || chr(10) || 'b')),
  ('with a zero-width space', to_jsonb('a' || chr(8203) || 'b')), ('a number', '4'::jsonb), ('null', 'null'::jsonb)
) v(name, l);
select is(tests.detail(tests.one(jsonb_build_object('label', rpad('', 60, 'a')))), null, 'a label of 60 characters validates');
select is(tests.detail(tests.with(jsonb_build_object('main', 'ft', 'units', jsonb_build_array(tests.ft() - 'label')))), 'distance.units[0].label', 'a missing label is rejected');

-- ===== values
select is(tests.detail(tests.one(jsonb_build_object('value', v.x))), 'distance.units[0].value', 'rejects the value ' || v.name)
from (values
  ('0', '0'::jsonb), ('-1', '-1'::jsonb), ('"1" (text)', '"1"'::jsonb), ('null', 'null'::jsonb), ('1e13', '10000000000000'::jsonb), ('1e-7', '0.0000001'::jsonb), ('true', 'true'::jsonb)
) v(name, x);
select is(tests.detail(tests.one('{"value":1000000000000}')), null, 'a value of 1e12 validates');
select is(tests.detail(tests.one('{"value":0.000001}')), null, 'a value of 1e-6 validates');
select is(tests.detail(tests.with(jsonb_build_object('main', 'ft', 'units', jsonb_build_array(tests.ft() - 'value')))), 'distance.units[0].value', 'a missing value is rejected');

-- ===== decimals
select is(tests.detail(tests.one(jsonb_build_object('decimals', v.x))), 'distance.units[0].decimals', 'rejects decimals ' || v.name)
from (values ('3', '3'::jsonb), ('-1', '-1'::jsonb), ('1.5', '1.5'::jsonb), ('"1" (text)', '"1"'::jsonb), ('null', 'null'::jsonb), ('true', 'true'::jsonb)) v(name, x);
select is(tests.detail(tests.one(jsonb_build_object('decimals', d))), null, 'decimals ' || d || ' validate') from unnest(array[0, 1, 2]) d;
select is(tests.detail(tests.with(jsonb_build_object('main', 'ft', 'units', jsonb_build_array(tests.ft() - 'decimals')))), 'distance.units[0].decimals', 'missing decimals are rejected');

-- ===== the first problem is reported, and the rest of the document is still checked
select is(tests.detail(tests.with(jsonb_build_object('main', 'ft', 'units', jsonb_build_array(tests.ft('{"value":0}'), tests.m() || '{"key":"X"}')))), 'distance.units[0].value', 'the first offending unit is reported');
select is(tests.detail(tests.doc() || '{"version":2,"distance":{"main":"ft","units":[]}}'), 'version', 'a bad version still wins over distance');
select is(tests.detail((tests.doc() #- '{modules,mapas}') || '{"distance":{"main":"ft","units":[{"key":"ft","label":"Pies","value":1,"decimals":0}]}}'), 'modules.mapas', 'a bad module is still rejected next to a valid distance');

-- ===== not callable by clients
select is(has_function_privilege('anon', 'public.validate_system_profile(jsonb)', 'execute'), false, 'anon cannot execute validate_system_profile');
select is(has_function_privilege('authenticated', 'public.validate_system_profile(jsonb)', 'execute'), false, 'authenticated cannot execute validate_system_profile');

select * from finish();
rollback;
