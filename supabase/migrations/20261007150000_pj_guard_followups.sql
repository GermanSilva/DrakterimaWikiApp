-- H8a guard follow-ups (replaces guard_pj_player_update again; same allowed columns / data keys).
-- For non-DM writers only (the DM, postgres, supabase_admin and service_role still bypass the guard):
--   * the 'dm' key of sections_updated can never be touched (not added, not moved, not removed): the hub
--     derives that dot from entity_dm_notes, so the key is DM / legacy-import territory;
--   * sections_updated must be a JSON object (null, array, scalar and SQL NULL are rejected with 42501
--     before the column CHECK could answer with a different error);
--   * an ISO-shaped but impossible date (month 13, hour 99, ...) is rejected with 42501, not a cast error;
--   * stamps from the future are CLAMPED to now() instead of rejected, so an owner whose device clock is
--     ahead can still save (the unread dot compares against server-side data anyway);
--   * still rejected: non-ISO values, unknown new keys, too many keys, regressions, removed keys.
-- custom_fields rules are unchanged from 20261007140000_pj_owner_hardening.sql.

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

  if (to_jsonb(new) - allowed_columns) is distinct from (to_jsonb(old) - allowed_columns)
     or (new.data - allowed_data_keys) is distinct from (old.data - allowed_data_keys)
  then
    raise exception 'players may only edit identity fields of their own character'
      using errcode = '42501';
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
    if (select count(*) from jsonb_object_keys(new.sections_updated)) > 16 then
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
        if not (stamp.key = any (stampable_sections)) then
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
