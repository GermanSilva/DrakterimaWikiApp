-- H8a hardening of what a non-DM may write into a character they own.
--
-- Replaces guard_pj_player_update() (same allowed columns / data keys as before) and adds, for non-DM
-- writers only (the DM, postgres, supabase_admin and service_role still bypass the whole guard):
--   * data.custom_fields, when it changes: a plain JSON object, <= 8 KB, string values only
--     (it is rendered by every member of the campaign, so it must stay small and boring);
--   * sections_updated, when it changes: an object of at most 16 keys, every NEW key one of the known
--     sections below ('dm' is derived from entity_dm_notes.updated_at in the hub and is never written
--     by a player), every value an ISO-8601 timestamp string not later than now() + 5 minutes, and an
--     existing key can never disappear or go back in time (the client merges per-key max).
-- The section list mirrors SECTION_FIELDS in src/pages/pj/pjConstants.js ('dm' left out, 'general' added);
-- src/campaign/pjOwnerFields.test.ts keeps both in sync.

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
  old_value text;
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

  -- sections_updated: known sections, sane timestamps, monotonic
  if new.sections_updated is distinct from old.sections_updated then
    if (select count(*) from jsonb_object_keys(new.sections_updated)) > 16 then
      raise exception 'sections_updated has too many keys' using errcode = '42501';
    end if;
    for stamp in select k as key, v as value from jsonb_each(new.sections_updated) as t(k, v) loop
      if jsonb_typeof(stamp.value) <> 'string'
         or length(stamp.value #>> '{}') > 40
         or (stamp.value #>> '{}') !~ iso
      then
        raise exception 'sections_updated values must be ISO timestamps' using errcode = '42501';
      end if;
      if (stamp.value #>> '{}')::timestamptz > now() + interval '5 minutes' then
        raise exception 'sections_updated timestamps cannot be in the future' using errcode = '42501';
      end if;
      old_value := old.sections_updated ->> stamp.key;
      if old_value is null then
        if not (stamp.key = any (stampable_sections)) then
          raise exception 'unknown section in sections_updated' using errcode = '42501';
        end if;
      elsif old_value ~ iso and (stamp.value #>> '{}')::timestamptz < old_value::timestamptz then
        raise exception 'sections_updated timestamps cannot go back' using errcode = '42501';
      end if;
    end loop;
    if exists (
      select 1 from jsonb_object_keys(old.sections_updated) as o(k)
      where not (new.sections_updated ? o.k)
    ) then
      raise exception 'sections_updated keys cannot be removed' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
