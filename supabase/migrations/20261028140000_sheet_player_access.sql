-- F3 of the system-agnostic campaigns (odd/tasks/system-agnostic.md S7, S11, S13; odd/design/sheet-builder.md sections 5, 8):
-- what a PLAYER may write on their own character is now derived from the campaign sheet (system_profile.sheet).
--
--   * Data keys: a field the DM marked editableBy 'player', a Stat row value of an open row, a Capacidades value
--     (first column at data[row], the others at data[row__column]) when the row AND the column are open, and a whole
--     Habilidad / Libre table when the table is open. Formula fields, coins and everything structural (names, links,
--     modifier formulas) are never writable by a player. The DM, postgres, supabase_admin and service_role are
--     not restricted by the sheet (unchanged).
--   * Values: only the keys a player CHANGES are judged, by the type the sheet gives them: short text <= 500 characters,
--     paragraph <= 20000, number within +-1e12 (and the field min/max), boolean, table = array <= 500 rows / 200 KB whose
--     rows only use the non-formula columns the sheet defines (plus a numeric or string id). A value already stored is never
--     re-judged unless the player touches that key. Total character data may not grow past 256 KB.
--   * Unread dots: the sections a player may stamp are the sheet's sections plus 'general' (never 'dm').
--   * A campaign WITHOUT a sheet (or a caller that is not a member) keeps the legacy fixed lists, byte for byte.
--   * custom_fields (the legacy per-campaign custom fields) stay writable and keep their own rules.
--
-- sheet_guard_access() is the single place that reads the sheet for the guard. It is SECURITY DEFINER (the trigger runs as
-- the player, who must not need any other privilege) and answers members only. _sheet_value_ok() is internal.

create function public._sheet_value_ok(v jsonb, spec jsonb)
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
        elsif not public._sheet_value_ok(v_entry.val, jsonb_build_object('t', v_cols ->> v_entry.k)) then
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

-- Returns NULL when the legacy lists apply (no sheet, or the caller is not a member of the campaign); otherwise
-- {"keys": [data keys a player may write], "sections": [stampable sections], "error": null | "reason"}, where error is set
-- when a key the player CHANGED (old -> new) holds an invalid value or the character data grew past its cap.
create function public.sheet_guard_access(p_campaign_id uuid, p_old_data jsonb, p_new_data jsonb)
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

  select coalesce(jsonb_object_agg(q.k, q.s), '{}'::jsonb) into v_spec
  from (
    select i ->> 'key' as k,
           jsonb_strip_nulls(jsonb_build_object('t', i ->> 'type', 'min', i -> 'min', 'max', i -> 'max')) as s
      from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*]') i
     where i ->> 'kind' = 'field' and i ->> 'editableBy' = 'player' and not (i ? 'formula')
    union all
    select r ->> 'key', jsonb_build_object('t', 'number')
      from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*]') i,
           jsonb_array_elements(i -> 'rows') r
     where i ->> 'kind' = 'table' and i ->> 'type' = 'stat' and r ->> 'editableBy' = 'player'
    union all
    select case when c.ord = 1 then r ->> 'key' else (r ->> 'key') || '__' || (c.col ->> 'key') end,
           jsonb_build_object('t', c.col ->> 'type')
      from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*]') i,
           jsonb_array_elements(i -> 'rows') r,
           jsonb_array_elements(i -> 'columns') with ordinality as c(col, ord)
     where i ->> 'kind' = 'table' and i ->> 'type' = 'capacidades'
       and r ->> 'editableBy' = 'player' and c.col ->> 'editableBy' = 'player' and not (c.col ? 'formula')
    union all
    select i ->> 'key',
           jsonb_build_object('t', 'table',
             'cols', (select coalesce(jsonb_object_agg(c ->> 'key', c ->> 'type'), '{}'::jsonb) from jsonb_array_elements(i -> 'columns') c where not (c ? 'formula')))
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

------------------------------------------------------------------------------
-- guard_pj_player_update: same function as 20261007150000, with the allowed data keys, the value rules and the stampable
-- sections taken from the sheet when the campaign has one. The literal legacy lists stay below as the fallback.
------------------------------------------------------------------------------
create or replace function public.guard_pj_player_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed_columns constant text[] := array[
    'nombre', 'jugador', 'clase', 'raza', 'region', 'imagen_url',
    'data', 'sections_updated', 'updated_at'
  ];
  allowed_data_keys constant text[] := array[
    'trasfondo_dnd', 'alineamiento', 'edad', 'altura', 'peso', 'ojos', 'piel', 'pelo',
    'apariencia', 'personalidad', 'ideales', 'vinculos', 'defectos', 'trasfondo', 'motivo',
    'custom_fields'
  ];
  stampable_sections constant text[] := array[
    'stats', 'habilidades', 'ataques', 'hechizos', 'recursos', 'equipo', 'rasgos', 'narrativa',
    'apariencia', 'general'
  ];
  v_access jsonb;
  v_data_keys text[];
  v_stampable text[];
  v_max_stamps int := 16;
  iso constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$';
  cf jsonb;
  stamp record;
  cleaned jsonb;
  stamp_text text;
  stamp_ts timestamptz;
  old_text text;
  old_ts timestamptz;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if public.is_campaign_dm(old.campaign_id) then
    return new;
  end if;

  -- what this player may write comes from the campaign sheet; no sheet (or not a member) = the legacy lists above
  v_access := public.sheet_guard_access(old.campaign_id, old.data, new.data);
  if v_access is null then
    v_data_keys := allowed_data_keys;
    v_stampable := stampable_sections;
  else
    select coalesce(array_agg(k), '{}'::text[]) || array['custom_fields'] into v_data_keys
      from jsonb_array_elements_text(v_access -> 'keys') k;
    select coalesce(array_agg(s), '{}'::text[]) into v_stampable
      from jsonb_array_elements_text(v_access -> 'sections') s;
    -- stamps already stored cannot be removed, so they count against the cap besides every stampable section
    v_max_stamps := greatest(16, cardinality(v_stampable)
      + (select count(*) from jsonb_object_keys(old.sections_updated) k where not (k = any (v_stampable)))::int);
  end if;

  if (to_jsonb(new) - allowed_columns) is distinct from (to_jsonb(old) - allowed_columns)
     or (new.data - v_data_keys) is distinct from (old.data - v_data_keys)
  then
    raise exception 'players may only edit identity fields of their own character'
      using errcode = '42501';
  end if;

  if v_access is not null and (v_access ->> 'error') is not null then
    raise exception 'invalid character data: %', v_access ->> 'error' using errcode = '42501';
  end if;

  -- custom_fields: plain object of strings, small
  if (new.data -> 'custom_fields') is distinct from (old.data -> 'custom_fields') then
    cf := new.data -> 'custom_fields';
    if cf is not null and (
         jsonb_typeof(cf) <> 'object'
         or pg_column_size(cf) > 8192
         or exists (select 1 from jsonb_each(cf) e where jsonb_typeof(e.value) <> 'string')
       )
    then
      raise exception 'custom_fields must be an object of strings (max 8 KB)'
        using errcode = '42501';
    end if;
  end if;

  -- sections_updated: an object, known sections, real timestamps (future ones clamped), monotonic
  if new.sections_updated is distinct from old.sections_updated then
    if jsonb_typeof(new.sections_updated) is distinct from 'object' then
      raise exception 'sections_updated must be a JSON object' using errcode = '42501';
    end if;
    if (new.sections_updated -> 'dm') is distinct from (old.sections_updated -> 'dm') then
      raise exception 'the dm section stamp cannot be changed' using errcode = '42501';
    end if;
    if (select count(*) from jsonb_object_keys(new.sections_updated)) > v_max_stamps then
      raise exception 'sections_updated has too many keys' using errcode = '42501';
    end if;

    cleaned := '{}'::jsonb;
    for stamp in select k as key, v as value from jsonb_each(new.sections_updated) as t(k, v) loop
      if jsonb_typeof(stamp.value) <> 'string'
         or length(stamp.value #>> '{}') > 40
         or (stamp.value #>> '{}') !~ iso
      then
        raise exception 'sections_updated values must be ISO timestamps' using errcode = '42501';
      end if;
      stamp_text := stamp.value #>> '{}';
      if (old.sections_updated ->> stamp.key) is not distinct from stamp_text then
        cleaned := cleaned || jsonb_build_object(stamp.key, stamp_text); -- untouched: never re-judged
        continue;
      end if;
      begin
        stamp_ts := stamp_text::timestamptz;
      exception when others then
        raise exception 'sections_updated contains an invalid date' using errcode = '42501';
      end;
      if stamp_ts > now() then
        -- device clock ahead: keep the save, store the server time
        stamp_text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
        stamp_ts := now();
      end if;

      old_text := old.sections_updated ->> stamp.key;
      if old_text is null then
        if not (stamp.key = any (v_stampable)) then
          raise exception 'unknown section in sections_updated' using errcode = '42501';
        end if;
      elsif old_text ~ iso then
        begin
          old_ts := old_text::timestamptz;
        exception when others then
          old_ts := null;
        end;
        if old_ts is not null and stamp_ts < old_ts then
          raise exception 'sections_updated timestamps cannot go back' using errcode = '42501';
        end if;
      end if;
      cleaned := cleaned || jsonb_build_object(stamp.key, stamp_text);
    end loop;

    if exists (
      select 1 from jsonb_object_keys(old.sections_updated) as o(k)
      where not (cleaned ? o.k)
    ) then
      raise exception 'sections_updated keys cannot be removed' using errcode = '42501';
    end if;
    new.sections_updated := cleaned;
  end if;

  return new;
end;
$$;
