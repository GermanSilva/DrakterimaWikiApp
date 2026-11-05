-- G4a of the system-agnostic campaigns (odd/tasks/system-agnostic.md S20, S30, S33). HIGH RISK: permissions / guards.
--
-- Part 1 (S20): a PLAYER may now write an `options` value. The F3 guard (20261028140000) judged values by type and failed
-- CLOSED for the `options` type added in 20261105130000. Now the value must be a string equal to one of the option keys
-- declared at THAT place: an options field the DM opened to the player, an open Capacidades cell (row AND column open;
-- first column at data[row], the others at data[row__col]) and an options column of a player-open Libre / Habilidad
-- table. null still clears. Nothing else changes: formula fields, structural parts, DM-only places and the legacy lists
-- (no sheet, or a caller that is not a member) behave exactly as before.
--
-- Redefined with create or replace (same signatures, same SECURITY DEFINER / search_path / revokes as before):
-- _sheet_value_ok(jsonb, jsonb) and sheet_guard_access(uuid, jsonb, jsonb). Internally a table spec's `cols` now maps a
-- column key to {"t": type, "opts": [keys]} instead of to the bare type text; both functions are replaced together.
--
-- ROLLBACK: re-run the two function definitions of 20261028140000_sheet_player_access.sql (options values are then
-- rejected again for players); no data is touched by this migration.

create or replace function public._sheet_value_ok(v jsonb, spec jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_type text := spec ->> 't';
  v_row jsonb;
  v_entry record;
  v_cols jsonb;
  v_num numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return true; -- clearing a value is always fine
  end if;

  if v_type = 'table' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 500 or octet_length(v::text) > 200000 then
      return false;
    end if;
    v_cols := coalesce(spec -> 'cols', '{}'::jsonb);
    for v_row in select e.value from jsonb_array_elements(v) e loop
      if jsonb_typeof(v_row) <> 'object' then
        return false;
      end if;
      for v_entry in select r.key as k, r.value as val from jsonb_each(v_row) r loop
        if v_entry.k = 'id' then
          if jsonb_typeof(v_entry.val) not in ('number', 'string') or char_length(v_entry.val #>> '{}') > 64 then
            return false;
          end if;
        elsif not (v_cols ? v_entry.k) then
          return false;
        elsif not public._sheet_value_ok(v_entry.val, v_cols -> v_entry.k) then
          return false;
        end if;
      end loop;
    end loop;
    return true;
  end if;

  if v_type = 'short' then
    return jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 500;
  end if;
  if v_type = 'paragraph' then
    return jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 20000;
  end if;
  if v_type = 'boolean' then
    return jsonb_typeof(v) = 'boolean';
  end if;
  if v_type = 'options' then
    -- a string equal to one of the keys declared at this place (jsonb `?` on an array tests string elements)
    return jsonb_typeof(v) = 'string' and jsonb_typeof(spec -> 'opts') = 'array' and (spec -> 'opts') ? (v #>> '{}');
  end if;
  if v_type = 'number' then
    if jsonb_typeof(v) <> 'number' then
      return false;
    end if;
    v_num := (v #>> '{}')::numeric;
    if abs(v_num) > 1000000000000 then
      return false;
    end if;
    if spec ? 'min' and v_num < (spec ->> 'min')::numeric then
      return false;
    end if;
    if spec ? 'max' and v_num > (spec ->> 'max')::numeric then
      return false;
    end if;
    return true;
  end if;
  return false;
end;
$$;

revoke execute on function public._sheet_value_ok(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.sheet_guard_access(p_campaign_id uuid, p_old_data jsonb, p_new_data jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sheet jsonb;
  v_spec jsonb;
  v_keys jsonb;
  v_sections jsonb;
  v_error text;
  v_entry record;
begin
  if not public.is_campaign_member(p_campaign_id) then
    return null;
  end if;
  select c.system_profile -> 'sheet' into v_sheet from public.campaigns c where c.id = p_campaign_id;
  if jsonb_typeof(v_sheet) is distinct from 'object' then
    return null;
  end if;

  -- 'opts' is the array of declared option keys of an options field / column (absent for every other type)
  select coalesce(jsonb_object_agg(q.k, q.s), '{}'::jsonb) into v_spec
  from (
    select i ->> 'key' as k,
           jsonb_strip_nulls(jsonb_build_object('t', i ->> 'type', 'min', i -> 'min', 'max', i -> 'max',
             'opts', (select jsonb_agg(o ->> 'key') from jsonb_array_elements(i -> 'options') o))) as s
      from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*]') i
     where i ->> 'kind' = 'field' and i ->> 'editableBy' = 'player' and not (i ? 'formula')
    union all
    select r ->> 'key', jsonb_build_object('t', 'number')
      from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*]') i,
           jsonb_array_elements(i -> 'rows') r
     where i ->> 'kind' = 'table' and i ->> 'type' = 'stat' and r ->> 'editableBy' = 'player'
    union all
    select case when c.ord = 1 then r ->> 'key' else (r ->> 'key') || '__' || (c.col ->> 'key') end,
           jsonb_strip_nulls(jsonb_build_object('t', c.col ->> 'type',
             'opts', (select jsonb_agg(o ->> 'key') from jsonb_array_elements(c.col -> 'options') o)))
      from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*]') i,
           jsonb_array_elements(i -> 'rows') r,
           jsonb_array_elements(i -> 'columns') with ordinality as c(col, ord)
     where i ->> 'kind' = 'table' and i ->> 'type' = 'capacidades'
       and r ->> 'editableBy' = 'player' and c.col ->> 'editableBy' = 'player' and not (c.col ? 'formula')
    union all
    select i ->> 'key',
           jsonb_build_object('t', 'table',
             'cols', (select coalesce(jsonb_object_agg(c ->> 'key', jsonb_strip_nulls(jsonb_build_object('t', c ->> 'type',
                        'opts', (select jsonb_agg(o ->> 'key') from jsonb_array_elements(c -> 'options') o)))), '{}'::jsonb)
                      from jsonb_array_elements(i -> 'columns') c where not (c ? 'formula')))
      from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*]') i
     where i ->> 'kind' = 'table' and i ->> 'type' in ('libre', 'habilidad') and i ->> 'editableBy' = 'player'
  ) q;

  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_keys from jsonb_object_keys(v_spec) k;
  select coalesce(jsonb_agg(t.x), '[]'::jsonb) into v_sections
  from (
    select s ->> 'key' as x from jsonb_path_query(v_sheet, '$.categories[*].sections[*]') s
    union
    select 'general'
  ) t
  where t.x <> 'dm';

  if octet_length(p_new_data::text) > 262144 and octet_length(p_new_data::text) > octet_length(p_old_data::text) then
    v_error := 'character data too large';
  end if;
  if v_error is null then
    for v_entry in select e.key as k, e.value as s from jsonb_each(v_spec) e loop
      if (p_new_data -> v_entry.k) is distinct from (p_old_data -> v_entry.k)
         and not public._sheet_value_ok(p_new_data -> v_entry.k, v_entry.s) then
        v_error := 'invalid value for ' || v_entry.k;
        exit;
      end if;
    end loop;
  end if;

  return jsonb_build_object('keys', v_keys, 'sections', v_sections, 'error', v_error);
end;
$$;

revoke execute on function public.sheet_guard_access(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sheet_guard_access(uuid, jsonb, jsonb) to authenticated;
