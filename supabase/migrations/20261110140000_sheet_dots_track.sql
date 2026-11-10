-- Dots and tracks (odd/tasks/ficha-indice-lateral.md S15):
--   `dots`  (whole number 1..10) on a number field, a number column or a Stat table: the value is drawn as that many dots;
--           never together with the signed format.
--   `track` ({ superficial, aggravated? }) on a number field: its value is the number of boxes, and the damage is counted
--           in other number fields (distinct, not the track itself).
-- Same rules as dotsOf / the track pass of validateSheet (src/campaign/system/sheet/sheetModel.ts).
--
-- validate_sheet is wrapped once more (approach of 20261106120000 and 20261110130000): the current definition is renamed to
-- _validate_sheet_noformats; the new validate_sheet strips `dots` and `track`, validates the rest through it, then checks
-- each stripped value against the normalised item at the same position and puts it back. Additive: a sheet without dots or
-- tracks validates exactly as before.
--
-- Rollback: drop function public.validate_sheet(jsonb); alter function public._validate_sheet_noformats(jsonb) rename to
-- validate_sheet. A stored sheet with dots or tracks would then lose them on its next save.

alter function public.validate_sheet(jsonb) rename to _validate_sheet_noformats;
revoke execute on function public._validate_sheet_noformats(jsonb) from public, anon, authenticated;

create function public.validate_sheet(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_in jsonb := p;
  v_core jsonb;
  v_items jsonb;
  v_found jsonb := '[]'::jsonb; -- [{path: text[], at: text, prop: 'dots'|'track', value}]
  v_c record;
  v_s record;
  v_i record;
  v_col record;
  v_f jsonb;
  v_target jsonb;
  v_val jsonb;
  v_refs text[];
  v_ref text;
  v_ok boolean;
begin
  if octet_length(p::text) > 49152 or jsonb_typeof(p) is distinct from 'object' then
    perform public._sheet_fail('');
  end if;
  -- collect and strip (positions are kept: the core validator rebuilds every list in order)
  if jsonb_typeof(p -> 'categories') = 'array' then
    for v_c in select value, ordinality - 1 as i from jsonb_array_elements(p -> 'categories') with ordinality loop
      continue when jsonb_typeof(v_c.value -> 'sections') is distinct from 'array';
      for v_s in select value, ordinality - 1 as i from jsonb_array_elements(v_c.value -> 'sections') with ordinality loop
        continue when jsonb_typeof(v_s.value -> 'items') is distinct from 'array';
        for v_i in select value, ordinality - 1 as i from jsonb_array_elements(v_s.value -> 'items') with ordinality loop
          continue when jsonb_typeof(v_i.value) is distinct from 'object';
          foreach v_ref in array array['dots', 'track'] loop
            if v_i.value ? v_ref then
              v_found := v_found || jsonb_build_array(jsonb_build_object(
                'path', jsonb_build_array('categories', v_c.i::text, 'sections', v_s.i::text, 'items', v_i.i::text),
                'at', '.categories[' || v_c.i || '].sections[' || v_s.i || '].items[' || v_i.i || ']',
                'prop', v_ref, 'value', v_i.value -> v_ref));
              v_in := v_in #- array['categories', v_c.i::text, 'sections', v_s.i::text, 'items', v_i.i::text, v_ref];
            end if;
          end loop;
          continue when jsonb_typeof(v_i.value -> 'columns') is distinct from 'array';
          for v_col in select value, ordinality - 1 as i from jsonb_array_elements(v_i.value -> 'columns') with ordinality loop
            if jsonb_typeof(v_col.value) = 'object' and v_col.value ? 'dots' then
              v_found := v_found || jsonb_build_array(jsonb_build_object(
                'path', jsonb_build_array('categories', v_c.i::text, 'sections', v_s.i::text, 'items', v_i.i::text, 'columns', v_col.i::text),
                'at', '.categories[' || v_c.i || '].sections[' || v_s.i || '].items[' || v_i.i || '].columns[' || v_col.i || ']',
                'prop', 'dots', 'value', v_col.value -> 'dots'));
              v_in := v_in #- array['categories', v_c.i::text, 'sections', v_s.i::text, 'items', v_i.i::text, 'columns', v_col.i::text, 'dots'];
            end if;
          end loop;
        end loop;
      end loop;
    end loop;
  end if;

  v_core := public._validate_sheet_noformats(v_in);
  if jsonb_array_length(v_found) = 0 then
    return v_core;
  end if;
  select coalesce(jsonb_object_agg(i ->> 'key', i), '{}'::jsonb) into v_items
  from jsonb_path_query(v_core, '$.categories[*].sections[*].items[*]') i;

  for v_f in select value from jsonb_array_elements(v_found) loop
    v_target := v_core #> array(select jsonb_array_elements_text(v_f -> 'path'));
    v_val := v_f -> 'value';
    if v_f ->> 'prop' = 'dots' then
      if v_target ? 'kind' and v_target ->> 'kind' = 'table' then
        v_ok := v_target ->> 'type' = 'stat';
      else
        v_ok := v_target ->> 'type' = 'number';
      end if;
      if not v_ok then
        perform public._sheet_fail((v_f ->> 'at') || '.dots');
      end if;
      if jsonb_typeof(v_val) is distinct from 'number' or (v_val::text)::numeric <> floor((v_val::text)::numeric)
         or (v_val::text)::numeric < 1 or (v_val::text)::numeric > 10 then
        perform public._sheet_fail((v_f ->> 'at') || '.dots');
      end if;
      if v_target ->> 'format' = 'signed' then
        perform public._sheet_fail((v_f ->> 'at') || '.dots');
      end if;
      v_core := jsonb_set(v_core, array(select jsonb_array_elements_text(v_f -> 'path')) || 'dots'::text, v_val);
    else
      if v_target ->> 'kind' is distinct from 'field' or v_target ->> 'type' is distinct from 'number'
         or jsonb_typeof(v_val) is distinct from 'object' or jsonb_typeof(v_val -> 'superficial') is distinct from 'string'
         or (v_val ? 'aggravated' and jsonb_typeof(v_val -> 'aggravated') is distinct from 'string') then
        perform public._sheet_fail((v_f ->> 'at') || '.track');
      end if;
      v_refs := array[v_val ->> 'superficial'] || case when v_val ? 'aggravated' then array[v_val ->> 'aggravated'] else '{}'::text[] end;
      foreach v_ref in array v_refs loop
        if v_ref = v_target ->> 'key' or v_items -> v_ref ->> 'kind' is distinct from 'field' or v_items -> v_ref ->> 'type' is distinct from 'number' then
          perform public._sheet_fail((v_f ->> 'at') || '.track');
        end if;
      end loop;
      if array_length(v_refs, 1) = 2 and v_refs[1] = v_refs[2] then
        perform public._sheet_fail((v_f ->> 'at') || '.track');
      end if;
      v_core := jsonb_set(v_core, array(select jsonb_array_elements_text(v_f -> 'path')) || 'track'::text,
        jsonb_build_object('superficial', v_val ->> 'superficial') || case when v_val ? 'aggravated' then jsonb_build_object('aggravated', v_val ->> 'aggravated') else '{}'::jsonb end);
    end if;
  end loop;
  return v_core;
end;
$$;
revoke execute on function public.validate_sheet(jsonb) from public, anon, authenticated;
