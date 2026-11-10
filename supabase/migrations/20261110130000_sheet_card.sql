-- Sheet card (odd/tasks/ficha-indice-lateral.md S12-S14): an optional `card` on the sheet says what the character card and
-- the detail header show besides identity and roles:
--   card = { pinned: [{ key, max?, dmOnly? }] (at most 6), statline?: <stat table key>, excerpt?: <short|paragraph field key> }
-- A pinned key is a field or a monedas/economia table (shown by its total); `max` names a number field and needs a number
-- pinned field; `dmOnly` is a boolean, kept only when true. Same rules as cardOf in src/campaign/system/sheet/sheetModel.ts.
--
-- validate_sheet is wrapped, not copied (same approach as 20261106120000): the current definition is renamed to
-- _validate_sheet_nocard and the new validate_sheet validates the rest through it, then checks `card` against the
-- normalised items it returns. Additive: a sheet without `card` validates exactly as before.
--
-- Rollback: drop function public.validate_sheet(jsonb); alter function public._validate_sheet_nocard(jsonb) rename to
-- validate_sheet. A stored sheet with a `card` would then lose it on its next save (the old validator rebuilds the sheet).

alter function public.validate_sheet(jsonb) rename to _validate_sheet_nocard;
revoke execute on function public._validate_sheet_nocard(jsonb) from public, anon, authenticated;

create function public.validate_sheet(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_core jsonb;
  v_card jsonb;
  v_items jsonb;
  v_pin record;
  v_path text;
  v_item jsonb;
  v_max jsonb;
  v_seen text[] := '{}';
  v_out jsonb := '[]'::jsonb;
  v_res jsonb;
  v_ref jsonb;
begin
  if octet_length(p::text) > 49152 or jsonb_typeof(p) is distinct from 'object' then
    perform public._sheet_fail('');
  end if;
  if not (p ? 'card') then
    return public._validate_sheet_nocard(p);
  end if;
  v_core := public._validate_sheet_nocard(p - 'card');
  v_card := p -> 'card';
  if jsonb_typeof(v_card) is distinct from 'object' then
    perform public._sheet_fail('.card');
  end if;
  -- every live item of the validated sheet, keyed by its key
  select coalesce(jsonb_object_agg(i ->> 'key', i), '{}'::jsonb) into v_items
  from jsonb_path_query(v_core, '$.categories[*].sections[*].items[*]') i;

  if jsonb_typeof(v_card -> 'pinned') is distinct from 'array' or jsonb_array_length(v_card -> 'pinned') > 6 then
    perform public._sheet_fail('.card.pinned');
  end if;
  for v_pin in select value, ordinality - 1 as i from jsonb_array_elements(v_card -> 'pinned') with ordinality loop
    v_path := '.card.pinned[' || v_pin.i || ']';
    if jsonb_typeof(v_pin.value) is distinct from 'object' then
      perform public._sheet_fail(v_path);
    end if;
    v_item := case when jsonb_typeof(v_pin.value -> 'key') = 'string' then v_items -> (v_pin.value ->> 'key') end;
    if v_item is null or not (v_item ->> 'kind' = 'field' or v_item ->> 'type' in ('monedas', 'economia')) then
      perform public._sheet_fail(v_path || '.key');
    end if;
    if (v_item ->> 'key') = any (v_seen) then
      perform public._sheet_fail(v_path || '.key');
    end if;
    v_seen := v_seen || (v_item ->> 'key');
    v_res := jsonb_build_object('key', v_item ->> 'key');
    if v_pin.value ? 'max' then
      v_max := case when jsonb_typeof(v_pin.value -> 'max') = 'string' then v_items -> (v_pin.value ->> 'max') end;
      if v_max is null or v_max ->> 'kind' is distinct from 'field' or v_max ->> 'type' is distinct from 'number'
         or v_item ->> 'kind' is distinct from 'field' or v_item ->> 'type' is distinct from 'number' then
        perform public._sheet_fail(v_path || '.max');
      end if;
      v_res := v_res || jsonb_build_object('max', v_max ->> 'key');
    end if;
    if v_pin.value ? 'dmOnly' then
      if jsonb_typeof(v_pin.value -> 'dmOnly') is distinct from 'boolean' then
        perform public._sheet_fail(v_path || '.dmOnly');
      end if;
      if (v_pin.value -> 'dmOnly') = 'true'::jsonb then
        v_res := v_res || '{"dmOnly": true}'::jsonb;
      end if;
    end if;
    v_out := v_out || jsonb_build_array(v_res);
  end loop;
  v_res := jsonb_build_object('pinned', v_out);

  if v_card ? 'statline' then
    v_ref := case when jsonb_typeof(v_card -> 'statline') = 'string' then v_items -> (v_card ->> 'statline') end;
    if v_ref is null or v_ref ->> 'kind' is distinct from 'table' or v_ref ->> 'type' is distinct from 'stat' then
      perform public._sheet_fail('.card.statline');
    end if;
    v_res := v_res || jsonb_build_object('statline', v_ref ->> 'key');
  end if;
  if v_card ? 'excerpt' then
    v_ref := case when jsonb_typeof(v_card -> 'excerpt') = 'string' then v_items -> (v_card ->> 'excerpt') end;
    if v_ref is null or v_ref ->> 'kind' is distinct from 'field' or v_ref ->> 'type' not in ('short', 'paragraph') then
      perform public._sheet_fail('.card.excerpt');
    end if;
    v_res := v_res || jsonb_build_object('excerpt', v_ref ->> 'key');
  end if;
  return v_core || jsonb_build_object('card', v_res);
end;
$$;
revoke execute on function public.validate_sheet(jsonb) from public, anon, authenticated;
