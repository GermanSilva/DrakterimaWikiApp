-- G3 of the system-agnostic campaigns (odd/tasks/system-agnostic.md S19, S32): the system document gets the optional
-- `distance` key, the campaign distance units used by the `[[{D:unit}amount]]` markup.
--
--   distance: { main: <unit key>, units: [{ key, label, value, decimals }] }
--
--   * 1..8 units; key = the sheet key charset (^[a-z][a-z0-9_]{0,39}$, not constructor/prototype), unique; label 1..60 like every
--     other label (trimmed, no control or hidden characters); value = size of the unit in a common base, a number in 1e-6..1e12
--     (ft 1, m 3.28084, squares 5; the DM fills it); decimals = the integer 0, 1 or 2 (precision of the unit, conversions floor);
--     `main` must be one of the keys.
--   * Errors are `invalid_system_profile` (P0001) with the path in DETAIL: distance, distance.units, distance.main,
--     distance.units[0], distance.units[0].key|label|value|decimals. The client validator (src/campaign/system/distance/distance.ts)
--     reports the same paths for the same cases.
--   * The key is optional and PRESERVED (normalised: labels trimmed, unknown properties dropped, decimals as integers). A document
--     without it validates exactly as before and gets none; a stored `sheet` is untouched.
--
-- validate_system_profile is redefined with create or replace; set_system_profile is unchanged (it stores what this returns).
-- Legacy distance values stay as text: no data is touched.
--
-- Rollback (manual, not part of the migration): re-run the validate_system_profile definition of
-- 20261028120000_sheet_validation.sql. A stored `distance` would then be dropped by the next save through set_system_profile.

create or replace function public.validate_system_profile(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_builtin text;
  v_section text;
  v_module text;
  v_denom jsonb;
  v_key text;
  v_seen text[] := '{}';
  v_denoms jsonb := '[]'::jsonb;
  v_builtins jsonb := '{}'::jsonb;
  v_sections jsonb := '{}'::jsonb;
  v_modules jsonb := '{}'::jsonb;
  v_node jsonb;
  v_label text;
  v_min numeric;
  v_max numeric;
  v_enabled jsonb;
  v_sheet jsonb;
  v_dist jsonb;
  v_units jsonb := '[]'::jsonb;
  v_unit jsonb;
  v_i int;
  v_path text;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'invalid_system_profile' using detail = 'document';
  end if;
  if p -> 'version' is distinct from '1'::jsonb then
    raise exception 'invalid_system_profile' using detail = 'version';
  end if;

  -- character.builtins: clase, raza, nivel
  foreach v_builtin in array array['clase', 'raza', 'nivel'] loop
    v_node := p #> array['character', 'builtins', v_builtin];
    if jsonb_typeof(v_node) is distinct from 'object' then
      raise exception 'invalid_system_profile' using detail = 'character.builtins.' || v_builtin;
    end if;
    if jsonb_typeof(v_node -> 'enabled') is distinct from 'boolean' then
      raise exception 'invalid_system_profile' using detail = 'character.builtins.' || v_builtin || '.enabled';
    end if;
    if jsonb_typeof(v_node -> 'label') is distinct from 'string' then
      raise exception 'invalid_system_profile' using detail = 'character.builtins.' || v_builtin || '.label';
    end if;
    v_label := regexp_replace(v_node ->> 'label', '^[[:space:] 　]+|[[:space:] 　]+$', '', 'g');
    if char_length(v_label) < 1 or char_length(v_label) > 60 or v_label <> public.strip_control_chars(v_label) then
      raise exception 'invalid_system_profile' using detail = 'character.builtins.' || v_builtin || '.label';
    end if;
    v_enabled := v_node -> 'enabled';
    if v_builtin = 'nivel' then
      if jsonb_typeof(v_node -> 'min') is distinct from 'number' or jsonb_typeof(v_node -> 'max') is distinct from 'number' then
        raise exception 'invalid_system_profile' using detail = 'character.builtins.nivel.range';
      end if;
      v_min := (v_node ->> 'min')::numeric;
      v_max := (v_node ->> 'max')::numeric;
      if v_min <> trunc(v_min) or v_max <> trunc(v_max) or v_min < 0 or v_max > 1000 or v_min > v_max then
        raise exception 'invalid_system_profile' using detail = 'character.builtins.nivel.range';
      end if;
      v_builtins := v_builtins || jsonb_build_object(v_builtin,
        jsonb_build_object('enabled', v_enabled, 'label', v_label, 'min', v_min::int, 'max', v_max::int));
    else
      v_builtins := v_builtins || jsonb_build_object(v_builtin, jsonb_build_object('enabled', v_enabled, 'label', v_label));
    end if;
  end loop;

  -- character.sections: nine booleans
  foreach v_section in array array['stats', 'habilidades', 'ataques', 'hechizos', 'recursos', 'equipo', 'rasgos', 'narrativa', 'apariencia'] loop
    if jsonb_typeof(p #> array['character', 'sections', v_section]) is distinct from 'boolean' then
      raise exception 'invalid_system_profile' using detail = 'character.sections.' || v_section;
    end if;
    v_sections := v_sections || jsonb_build_object(v_section, p #> array['character', 'sections', v_section]);
  end loop;

  -- currency
  if jsonb_typeof(p #> '{currency,enabled}') is distinct from 'boolean' then
    raise exception 'invalid_system_profile' using detail = 'currency.enabled';
  end if;
  if jsonb_typeof(p #> '{currency,denominations}') is distinct from 'array' or jsonb_array_length(p #> '{currency,denominations}') > 5 then
    raise exception 'invalid_system_profile' using detail = 'currency.denominations';
  end if;
  for v_denom in select * from jsonb_array_elements(p #> '{currency,denominations}') loop
    v_key := v_denom ->> 'key';
    if jsonb_typeof(v_denom) is distinct from 'object'
       or jsonb_typeof(v_denom -> 'key') is distinct from 'string'
       or v_key <> all (array['pp', 'gp', 'ep', 'sp', 'cp'])
       or v_key = any (v_seen)
       or jsonb_typeof(v_denom -> 'label') is distinct from 'string' then
      raise exception 'invalid_system_profile' using detail = 'currency.denominations';
    end if;
    v_label := regexp_replace(v_denom ->> 'label', '^[[:space:] 　]+|[[:space:] 　]+$', '', 'g');
    if char_length(v_label) < 1 or char_length(v_label) > 60 or v_label <> public.strip_control_chars(v_label) then
      raise exception 'invalid_system_profile' using detail = 'currency.denominations';
    end if;
    v_seen := v_seen || v_key;
    v_denoms := v_denoms || jsonb_build_array(jsonb_build_object('key', v_key, 'label', v_label));
  end loop;
  if (p #> '{currency,enabled}') = 'true'::jsonb and jsonb_array_length(v_denoms) = 0 then
    raise exception 'invalid_system_profile' using detail = 'currency.denominations';
  end if;

  -- modules
  foreach v_module in array array['juegos', 'sesion_en_vivo', 'mapas', 'calendario'] loop
    if jsonb_typeof(p #> array['modules', v_module]) is distinct from 'boolean' then
      raise exception 'invalid_system_profile' using detail = 'modules.' || v_module;
    end if;
    v_modules := v_modules || jsonb_build_object(v_module, p #> array['modules', v_module]);
  end loop;

  -- sheet (optional): validated by validate_sheet and preserved; a document without it keeps working unchanged
  if p ? 'sheet' then
    v_sheet := public.validate_sheet(p -> 'sheet');
  end if;

  -- distance (optional): validated here and preserved; a document without it keeps working unchanged
  if p ? 'distance' then
    v_dist := p -> 'distance';
    if jsonb_typeof(v_dist) is distinct from 'object' then
      raise exception 'invalid_system_profile' using detail = 'distance';
    end if;
    if jsonb_typeof(v_dist -> 'units') is distinct from 'array'
       or jsonb_array_length(v_dist -> 'units') < 1 or jsonb_array_length(v_dist -> 'units') > 8 then
      raise exception 'invalid_system_profile' using detail = 'distance.units';
    end if;
    v_seen := '{}';
    for v_i in 0 .. jsonb_array_length(v_dist -> 'units') - 1 loop
      v_unit := v_dist -> 'units' -> v_i;
      v_path := 'distance.units[' || v_i || ']';
      if jsonb_typeof(v_unit) is distinct from 'object' then
        raise exception 'invalid_system_profile' using detail = v_path;
      end if;
      if jsonb_typeof(v_unit -> 'key') is distinct from 'string' then
        raise exception 'invalid_system_profile' using detail = v_path || '.key';
      end if;
      v_key := v_unit ->> 'key';
      if v_key !~ '^[a-z][a-z0-9_]{0,39}$' or v_key in ('constructor', 'prototype') or v_key = any (v_seen) then
        raise exception 'invalid_system_profile' using detail = v_path || '.key';
      end if;
      v_seen := v_seen || v_key;
      if jsonb_typeof(v_unit -> 'label') is distinct from 'string' then
        raise exception 'invalid_system_profile' using detail = v_path || '.label';
      end if;
      v_label := regexp_replace(v_unit ->> 'label', '^[[:space:] 　]+|[[:space:] 　]+$', '', 'g');
      if char_length(v_label) < 1 or char_length(v_label) > 60 or v_label <> public.strip_control_chars(v_label) then
        raise exception 'invalid_system_profile' using detail = v_path || '.label';
      end if;
      if jsonb_typeof(v_unit -> 'value') is distinct from 'number'
         or (v_unit ->> 'value')::numeric < 0.000001 or (v_unit ->> 'value')::numeric > 1000000000000 then
        raise exception 'invalid_system_profile' using detail = v_path || '.value';
      end if;
      if jsonb_typeof(v_unit -> 'decimals') is distinct from 'number'
         or (v_unit ->> 'decimals')::numeric not in (0, 1, 2) then
        raise exception 'invalid_system_profile' using detail = v_path || '.decimals';
      end if;
      v_units := v_units || jsonb_build_array(jsonb_build_object(
        'key', v_key, 'label', v_label, 'value', v_unit -> 'value', 'decimals', ((v_unit ->> 'decimals')::numeric)::int));
    end loop;
    if jsonb_typeof(v_dist -> 'main') is distinct from 'string' or not ((v_dist ->> 'main') = any (v_seen)) then
      raise exception 'invalid_system_profile' using detail = 'distance.main';
    end if;
    v_dist := jsonb_build_object('main', v_dist -> 'main', 'units', v_units);
  end if;

  return jsonb_build_object(
    'version', 1,
    'character', jsonb_build_object('builtins', v_builtins, 'sections', v_sections),
    'currency', jsonb_build_object('enabled', p #> '{currency,enabled}', 'denominations', v_denoms),
    'modules', v_modules
  ) || case when v_sheet is null then '{}'::jsonb else jsonb_build_object('sheet', v_sheet) end
    || case when v_dist is null then '{}'::jsonb else jsonb_build_object('distance', v_dist) end;
end;
$$;

revoke execute on function public.validate_system_profile(jsonb) from public, anon, authenticated;
