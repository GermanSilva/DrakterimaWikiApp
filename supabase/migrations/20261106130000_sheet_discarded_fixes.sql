-- G7b fix round 1 (independent verify of 20261106120000_sheet_discarded.sql). HIGH RISK: same functions, tighter rules.
--
--   1. validate_sheet: a discarded item no longer has a size cap of its own (it was 12000 bytes, below a valid live Capacidades table of
--      80+ rows). The size of the WHOLE sheet (49152 bytes here, 40000 characters in sheetModel.ts) bounds the list as it bounds every
--      live item, so anything a live sheet can hold can be discarded. Everything else of the validator is unchanged.
--   2. rekey_discarded_item (same signature) now also refuses with discarded_rekey_invalid when
--        * a new key is not the restored item in p_profile: a field/table whose own key is renamed must exist in the new sheet with the
--          same kind and type; a renamed row key must be a row of the table (same type) the item belongs to;
--        * p_profile drops any OTHER discarded entry: every stored entry except the restored one must still be in the new list, unchanged.
--      (Look-alike keys such as fz_max for fz were already refused: a rename root must be a key the item owns.)
--
-- ROLLBACK (manual, not part of the migration): re-run the validate_sheet and rekey_discarded_item definitions of
-- 20261106120000_sheet_discarded.sql.

create or replace function public.validate_sheet(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_core jsonb;
  v_in jsonb;
  v_out jsonb := '[]'::jsonb;
  v_e record;
  v_path text;
  v_item jsonb;
  v_kind text;
  v_type text;
  v_key text;
  v_keys text[] := '{}';
  v_cols jsonb;
  v_col record;
  v_col_keys text[];
  v_col_key text;
  v_section text;
begin
  if octet_length(p::text) > 49152 or jsonb_typeof(p) is distinct from 'object' then
    perform public._sheet_fail('');
  end if;
  if not (p ? 'discarded') then
    return public._validate_sheet_core(p);
  end if;
  v_core := public._validate_sheet_core(p - 'discarded');

  v_in := p -> 'discarded';
  if jsonb_typeof(v_in) is distinct from 'array' or jsonb_array_length(v_in) > 100 then
    perform public._sheet_fail('.discarded');
  end if;
  for v_e in select value, ordinality - 1 as i from jsonb_array_elements(v_in) with ordinality loop
    v_path := '.discarded[' || v_e.i || ']';
    if jsonb_typeof(v_e.value) is distinct from 'object' then
      perform public._sheet_fail(v_path);
    end if;
    v_item := v_e.value -> 'item';
    if jsonb_typeof(v_item) is distinct from 'object' then -- no cap of its own: the size of the whole sheet (above) bounds it, as for a live item
      perform public._sheet_fail(v_path || '.item');
    end if;
    v_kind := v_item ->> 'kind';
    if v_kind is null or v_kind not in ('field', 'table', 'row') then
      perform public._sheet_fail(v_path || '.item.kind');
    end if;
    v_key := public._sheet_key(v_item -> 'key', v_path || '.item.key', false);
    if v_key = any (v_keys) then
      perform public._sheet_fail(v_path || '.item.key');
    end if;
    v_keys := v_keys || v_key;
    v_item := v_item || jsonb_build_object('label', public._sheet_label(v_item -> 'label', v_path || '.item.label'));
    v_type := v_item ->> 'type';
    if v_kind = 'field' then
      if v_type is null or v_type not in ('short', 'paragraph', 'number', 'boolean', 'options') then
        perform public._sheet_fail(v_path || '.item.type');
      end if;
    elsif v_kind = 'table' then
      if v_type is null or v_type not in ('stat', 'capacidades', 'habilidad', 'libre', 'monedas', 'economia') then
        perform public._sheet_fail(v_path || '.item.type');
      end if;
    else
      if v_type is null or v_type not in ('stat', 'capacidades') then
        perform public._sheet_fail(v_path || '.item.type');
      end if;
      perform public._sheet_key(v_item -> 'table', v_path || '.item.table', true);
      if v_type = 'capacidades' then
        v_cols := v_item -> 'columns';
        if jsonb_typeof(v_cols) is distinct from 'array' or jsonb_array_length(v_cols) < 1 or jsonb_array_length(v_cols) > 12 then
          perform public._sheet_fail(v_path || '.item.columns');
        end if;
        v_col_keys := '{}';
        for v_col in select value from jsonb_array_elements(v_cols) loop
          v_col_key := public._sheet_key(v_col.value, v_path || '.item.columns', true);
          if v_col_key = any (v_col_keys) then
            perform public._sheet_fail(v_path || '.item.columns');
          end if;
          v_col_keys := v_col_keys || v_col_key;
        end loop;
      elsif v_item ? 'columns' then
        perform public._sheet_fail(v_path || '.item.columns');
      end if;
    end if;
    v_section := public._sheet_key(v_e.value -> 'section', v_path || '.section', true);
    if jsonb_typeof(v_e.value -> 'at') is distinct from 'string'
       or (v_e.value ->> 'at') !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$' then
      perform public._sheet_fail(v_path || '.at');
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('item', v_item, 'section', v_section, 'at', v_e.value -> 'at'));
  end loop;
  return v_core || jsonb_build_object('discarded', v_out);
end;
$$;

revoke execute on function public.validate_sheet(jsonb) from public, anon, authenticated;

create or replace function public.rekey_discarded_item(p_campaign_id uuid, p_key text, p_renames jsonb, p_profile jsonb, p_base timestamptz)
returns public.campaigns
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.campaigns;
  v_profile jsonb;
  v_new jsonb;
  v_entry jsonb;
  v_item jsonb;
  v_roots text[];
  v_old_structural text[];
  v_new_structural text[];
  v_live text[];
  v_pair record;
  v_owned text;
  v_old_keys text[] := '{}';
  v_new_keys text[] := '{}';
  v_targets text[] := '{}';
  v_to text;
  v_table_key text;
  i int;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;

  v_profile := public.validate_system_profile(p_profile);

  select * into v_row from public.campaigns c where c.id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found';
  end if;
  if not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;
  if p_base is null or v_row.updated_at is distinct from p_base then
    raise exception 'campaign_conflict';
  end if;

  select e into v_entry
    from jsonb_array_elements(case when jsonb_typeof(v_row.system_profile #> '{sheet,discarded}') = 'array'
                                   then v_row.system_profile #> '{sheet,discarded}' else '[]'::jsonb end) e
   where e #>> '{item,key}' = p_key
   limit 1;
  if v_entry is null then
    raise exception 'discarded_item_not_found';
  end if;
  v_item := v_entry -> 'item';
  v_new := v_profile -> 'sheet';

  -- the new document puts the item back: its entry is gone from the list
  if jsonb_typeof(v_new) is distinct from 'object'
     or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_new -> 'discarded') = 'array' then v_new -> 'discarded' else '[]'::jsonb end) e
                 where e #>> '{item,key}' = p_key) then
    raise exception 'discarded_rekey_invalid';
  end if;

  -- only the restored entry may leave the list: every other stored entry is still there, unchanged
  if exists (select 1
               from jsonb_array_elements(case when jsonb_typeof(v_row.system_profile #> '{sheet,discarded}') = 'array' then v_row.system_profile #> '{sheet,discarded}' else '[]'::jsonb end) e
              where e #>> '{item,key}' <> p_key
                and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_new -> 'discarded') = 'array' then v_new -> 'discarded' else '[]'::jsonb end) n where n = e)) then
    raise exception 'discarded_rekey_invalid';
  end if;

  if jsonb_typeof(p_renames) is distinct from 'object' or (select count(*) from jsonb_each(p_renames)) not between 1 and 100 then
    raise exception 'discarded_rekey_invalid';
  end if;
  v_roots := public._discarded_rename_roots(v_item);
  v_old_structural := public._sheet_structural_keys(v_row.system_profile -> 'sheet');
  v_new_structural := public._sheet_structural_keys(v_new);
  for v_pair in select key as f, value as t from jsonb_each(p_renames) loop
    if jsonb_typeof(v_pair.t) is distinct from 'string' then
      raise exception 'discarded_rekey_invalid';
    end if;
    if not (v_pair.f = any (v_roots)) or v_pair.f = (v_pair.t #>> '{}')
       or (v_pair.t #>> '{}') !~ '^[a-z][a-z0-9_]{0,39}$' or strpos(v_pair.t #>> '{}', '__') > 0
       or not ((v_pair.t #>> '{}') = any (v_new_structural))
       or (v_pair.t #>> '{}') = any (v_old_structural)
       or (v_pair.t #>> '{}') = any (v_targets) then
      raise exception 'discarded_rekey_invalid';
    end if;
    v_targets := v_targets || (v_pair.t #>> '{}');
  end loop;

  -- each new key must be the restored item itself in the new sheet: the item (same kind and type) when its own key is renamed,
  -- otherwise a row of the table (same type) the item belongs to
  for v_pair in select key as f, value #>> '{}' as t from jsonb_each(p_renames) loop
    v_to := v_pair.t;
    if v_item ->> 'kind' in ('field', 'table') and v_pair.f = p_key then
      if not exists (select 1 from jsonb_path_query(v_new, '$.categories[*].sections[*].items[*]') it
                      where it ->> 'key' = v_to and it ->> 'kind' = v_item ->> 'kind' and it ->> 'type' is not distinct from v_item ->> 'type') then
        raise exception 'discarded_rekey_invalid';
      end if;
    else
      v_table_key := case when v_item ->> 'kind' = 'row' then v_item ->> 'table' else coalesce(p_renames ->> p_key, p_key) end;
      if not exists (select 1
                       from jsonb_path_query(v_new, '$.categories[*].sections[*].items[*]') it,
                            jsonb_array_elements(case when jsonb_typeof(it -> 'rows') = 'array' then it -> 'rows' else '[]'::jsonb end) r
                      where it ->> 'kind' = 'table' and it ->> 'key' = v_table_key and it ->> 'type' = v_item ->> 'type' and r ->> 'key' = v_to) then
        raise exception 'discarded_rekey_invalid';
      end if;
    end if;
  end loop;

  -- the data keys that move: each owned key follows the renamed root it belongs to
  foreach v_owned in array public._discarded_data_keys(v_item) loop
    for v_pair in select key as f, value #>> '{}' as t from jsonb_each(p_renames) loop
      if v_owned = v_pair.f or left(v_owned, length(v_pair.f) + 2) = v_pair.f || '__' then
        v_old_keys := v_old_keys || v_owned;
        v_new_keys := v_new_keys || (v_pair.t || substr(v_owned, length(v_pair.f) + 1));
        exit;
      end if;
    end loop;
  end loop;

  if cardinality(v_new_keys) > 0
     and exists (select 1 from public.pjs p where p.campaign_id = p_campaign_id and p.data ?| v_new_keys) then
    raise exception 'discarded_key_taken';
  end if;
  if v_item ->> 'kind' = 'table' and v_item ->> 'type' = 'habilidad' and p_renames ? p_key
     and exists (select 1 from public.campaign_actions a where a.campaign_id = p_campaign_id and a.table_key = p_renames ->> p_key) then
    raise exception 'discarded_key_taken';
  end if;

  update public.campaigns c set system_profile = v_profile where c.id = p_campaign_id returning * into v_row;

  v_live := public._sheet_data_keys(v_new);
  for i in 1 .. cardinality(v_old_keys) loop
    -- the old key is live again: the live item keeps its values and the restored one gets a copy
    if v_old_keys[i] = any (v_live) then
      update public.pjs p set data = p.data || jsonb_build_object(v_new_keys[i], p.data -> v_old_keys[i])
       where p.campaign_id = p_campaign_id and p.data ? v_old_keys[i];
    else
      update public.pjs p set data = (p.data - v_old_keys[i]) || jsonb_build_object(v_new_keys[i], p.data -> v_old_keys[i])
       where p.campaign_id = p_campaign_id and p.data ? v_old_keys[i];
    end if;
  end loop;
  if v_item ->> 'kind' = 'table' and v_item ->> 'type' = 'habilidad' and p_renames ? p_key and not (p_key = any (v_new_structural)) then
    update public.campaign_actions a set table_key = p_renames ->> p_key where a.campaign_id = p_campaign_id and a.table_key = p_key;
  end if;
  return v_row;
end;
$$;

revoke execute on function public.rekey_discarded_item(uuid, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.rekey_discarded_item(uuid, text, jsonb, jsonb, timestamptz) to authenticated;
