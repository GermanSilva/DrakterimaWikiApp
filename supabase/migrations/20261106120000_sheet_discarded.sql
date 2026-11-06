-- G7b of the system-agnostic campaigns (odd/tasks/system-agnostic.md S26, S32, S11). HIGH RISK: two DM-only SECURITY DEFINER
-- functions delete or move stored character data (pjs.data) and the catalogue entries of a discarded Habilidad table.
--
-- Model. A sheet may carry `discarded`: [{ item, section, at }] (at most 100). `item` is the definition as it was when the DM removed
-- it from the template, `section` the key of the section it came from and `at` the discard date (ISO UTC, the lifecycle G9 reads):
--   { kind: 'field', key, label, type, ... }                        a Field
--   { kind: 'table', type, key, label, ... }                         a Table (stat, capacidades, habilidad, libre, monedas, economia)
--   { kind: 'row', type: 'stat' | 'capacidades', table, key, label, columns?, ... }
--                                                                     a Stat or Capacidades row removed from a table that stays; a
--                                                                     capacidades row names the column keys the table had (they decide
--                                                                     the row__column data keys it owns)
-- A discarded item is only data: it is not drawn, not editable, not searchable, not tagged, and sheet_guard_access() reads the live
-- items only (jsonb_path_query over $.categories[*].sections[*].items[*]), so a player cannot write a discarded key. The validator
-- checks the shape (key, label, type, bounds), not the formulas inside: they referenced a sheet that no longer exists, and restoring
-- puts the item back through the full validator.
-- Key reuse (S32): a live item MAY reuse the key of a discarded one; the conflict is resolved when the discarded one is restored (rekey)
-- or refused when it is purged (the values under a live key belong to the live item). Columns removed from a table are NOT discarded.
--
-- validate_sheet is wrapped, not copied: the previous definition (20261105210000) is renamed to _validate_sheet_core and the new
-- validate_sheet validates `discarded`, hands the rest to the core and returns its result plus the normalised list. Same rules as
-- src/campaign/system/sheet/sheetModel.ts (the shared cases live in sheetModelG7b.test.ts and 32_sheet_discarded.test.sql).
--
-- RPCs (DM of the campaign, a hub owner counts; empty search_path; execute for authenticated only; the campaign row is locked and its
-- updated_at must equal `p_base`, else `campaign_conflict`; errors are P0001 reasons except dm_only 42501):
--   purge_discarded_item(p_campaign_id, p_key, p_base) -> campaigns
--       Removes, from every character of the campaign, exactly the pjs.data keys the discarded item owns (a field: its key; a Stat
--       row: its key; a Capacidades row: key and key__column for the columns after the first; a Capacidades table: that for each row;
--       a Stat table: its rows; a Libre, Habilidad or economy table: its key), deletes the catalogue entries (campaign_actions, and
--       their links by cascade) of a discarded Habilidad table, and drops the entry from sheet.discarded. Refuses unknown keys
--       (discarded_item_not_found) and keys a live item uses (discarded_key_live).
--   rekey_discarded_item(p_campaign_id, p_key, p_renames, p_profile, p_base) -> campaigns
--       Restores a discarded item whose key was reused: p_profile is the whole new system document (the item put back, the entry
--       gone from the list), p_renames maps the keys of the item that changed ({"magralita": "magralita_2"}; for a table of rows the
--       row keys). The values move to the new keys, or are COPIED when the old key is live again (the live item keeps its own). A
--       renamed Habilidad table takes its catalogue entries along unless the old key is live. Refuses: discarded_item_not_found,
--       discarded_rekey_invalid (a renamed key the item does not own, a new key the new sheet lacks or that a live item already had,
--       an entry still in the new list), discarded_key_taken (a character already holds data under a new key).
--   Both leave the other keys of every character, and every other campaign, byte-identical.
--
-- ROLLBACK (manual, not part of the migration): drop function public.rekey_discarded_item(uuid, text, jsonb, jsonb, timestamptz);
--   drop function public.purge_discarded_item(uuid, text, timestamptz); drop the helpers _discarded_data_keys, _discarded_rename_roots,
--   _sheet_data_keys, _sheet_structural_keys; drop function public.validate_sheet(jsonb);
--   alter function public._validate_sheet_core(jsonb) rename to validate_sheet. A stored `discarded` list would then be dropped by the
--   next save through set_system_profile (the old validator rebuilds only the keys it knows).

------------------------------------------------------------------------------
-- Part 1: the validator
------------------------------------------------------------------------------
alter function public.validate_sheet(jsonb) rename to _validate_sheet_core;

create function public.validate_sheet(p jsonb)
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
    if jsonb_typeof(v_item) is distinct from 'object' or octet_length(v_item::text) > 12000 then
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

revoke execute on function public.validate_sheet(jsonb), public._validate_sheet_core(jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Part 2: which data keys an item owns
------------------------------------------------------------------------------
-- The pjs.data keys of a field, table, or removed row (see the header); the same shapes as a live item. Junk is ignored: only text
-- that is a plausible key comes out.
create function public._discarded_data_keys(p_item jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kind text;
  v_type text;
  v_key text;
  v_out text[] := '{}';
  v_row record;
  v_col record;
begin
  if jsonb_typeof(p_item) is distinct from 'object' then
    return '{}';
  end if;
  v_kind := p_item ->> 'kind';
  v_type := p_item ->> 'type';
  v_key := p_item ->> 'key';
  if v_kind = 'field' then
    v_out := array[v_key];
  elsif v_kind = 'row' then
    v_out := array[v_key];
    if v_type = 'capacidades' and jsonb_typeof(p_item -> 'columns') = 'array' then
      for v_col in select value #>> '{}' as c, ordinality as o from jsonb_array_elements(p_item -> 'columns') with ordinality loop
        if v_col.o > 1 then
          v_out := v_out || (v_key || '__' || v_col.c);
        end if;
      end loop;
    end if;
  elsif v_kind = 'table' then
    if v_type in ('libre', 'habilidad', 'economia') then
      v_out := array[v_key];
    elsif v_type = 'stat' and jsonb_typeof(p_item -> 'rows') = 'array' then
      for v_row in select value from jsonb_array_elements(p_item -> 'rows') loop
        v_out := v_out || (v_row.value ->> 'key');
      end loop;
    elsif v_type = 'capacidades' and jsonb_typeof(p_item -> 'rows') = 'array' and jsonb_typeof(p_item -> 'columns') = 'array' then
      for v_row in select value from jsonb_array_elements(p_item -> 'rows') loop
        for v_col in select value ->> 'key' as c, ordinality as o from jsonb_array_elements(p_item -> 'columns') with ordinality loop
          v_out := v_out || case when v_col.o = 1 then (v_row.value ->> 'key') else (v_row.value ->> 'key') || '__' || v_col.c end;
        end loop;
      end loop;
    end if;
    -- a coin table owns no pjs.data key (its amounts are pjs.monedas)
  end if;
  return coalesce((select array_agg(distinct k) from unnest(v_out) k where k ~ '^[a-z][a-z0-9_]{0,89}$'), '{}');
end;
$$;

-- The keys a renamed item can change: the key of a field, a row or a table, plus the row keys of a Stat or Capacidades table.
create function public._discarded_rename_roots(p_item jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(k) filter (where k is not null), '{}')
    from (
      select p_item ->> 'key' as k
      union all
      select r ->> 'key'
        from jsonb_array_elements(case when p_item ->> 'kind' = 'table' and p_item ->> 'type' in ('stat', 'capacidades')
                                        and jsonb_typeof(p_item -> 'rows') = 'array' then p_item -> 'rows' else '[]'::jsonb end) r
    ) q;
$$;

-- Every pjs.data key the LIVE items of a sheet own.
create function public._sheet_data_keys(p_sheet jsonb)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct k), '{}')
    from (select unnest(public._discarded_data_keys(i)) as k
            from jsonb_path_query(p_sheet, '$.categories[*].sections[*].items[*]') i) q;
$$;

-- Every structural key of the LIVE items of a sheet: items, tables and the rows of its tables.
create function public._sheet_structural_keys(p_sheet jsonb)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct k) filter (where k is not null), '{}')
    from (select i ->> 'key' as k
            from jsonb_path_query(p_sheet, '$.categories[*].sections[*].items[*]') i
          union all
          select r ->> 'key'
            from jsonb_path_query(p_sheet, '$.categories[*].sections[*].items[*]') i,
                 jsonb_array_elements(case when jsonb_typeof(i -> 'rows') = 'array' then i -> 'rows' else '[]'::jsonb end) r) q;
$$;

revoke execute on function public._discarded_data_keys(jsonb), public._discarded_rename_roots(jsonb),
  public._sheet_data_keys(jsonb), public._sheet_structural_keys(jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Part 3: purge
------------------------------------------------------------------------------
create function public.purge_discarded_item(p_campaign_id uuid, p_key text, p_base timestamptz)
returns public.campaigns
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.campaigns;
  v_entry jsonb;
  v_keys text[];
  v_list jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;

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

  v_keys := public._discarded_data_keys(v_entry -> 'item');
  if v_keys && public._sheet_data_keys(v_row.system_profile -> 'sheet')
     or p_key = any (public._sheet_structural_keys(v_row.system_profile -> 'sheet')) then
    raise exception 'discarded_key_live';
  end if;

  if cardinality(v_keys) > 0 then
    update public.pjs p set data = p.data - v_keys where p.campaign_id = p_campaign_id and p.data ?| v_keys;
  end if;
  if v_entry #>> '{item,kind}' = 'table' and v_entry #>> '{item,type}' = 'habilidad' then
    delete from public.campaign_actions a where a.campaign_id = p_campaign_id and a.table_key = p_key;
  end if;

  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_list
    from jsonb_array_elements(v_row.system_profile #> '{sheet,discarded}') e
   where e #>> '{item,key}' <> p_key;
  update public.campaigns c
     set system_profile = case when jsonb_array_length(v_list) = 0
                               then c.system_profile #- '{sheet,discarded}'
                               else jsonb_set(c.system_profile, '{sheet,discarded}', v_list) end
   where c.id = p_campaign_id
  returning * into v_row;
  return v_row;
end;
$$;

------------------------------------------------------------------------------
-- Part 4: rekey (restore under a new key)
------------------------------------------------------------------------------
create function public.rekey_discarded_item(p_campaign_id uuid, p_key text, p_renames jsonb, p_profile jsonb, p_base timestamptz)
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

revoke execute on function public.purge_discarded_item(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.rekey_discarded_item(uuid, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.purge_discarded_item(uuid, text, timestamptz) to authenticated;
grant execute on function public.rekey_discarded_item(uuid, text, jsonb, jsonb, timestamptz) to authenticated;
