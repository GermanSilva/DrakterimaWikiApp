-- G9 fix round 1 (independent verify of 20261106180000_discarded_lifecycle.sql). HIGH RISK: the job deletes stored character data.
--
--   1. The validators only checked the FORMAT of discarded[].at, so 2026-02-30T00:00:00Z was stored; every job run then failed on that
--      campaign (22008) and its valid expired entries were never deleted, while the browser read the date as 2 March. Now:
--        * _discarded_at_ok(text): the format of sheet.discarded[].at AND a day that exists in the calendar (leap years included). The
--          TS twin is realDay() in src/campaign/system/sheet/sheetModel.ts. validate_sheet (same body as 20261106130000) uses it.
--        * purge_expired_discarded() reads `at` fail-safe through the same function: an entry whose date is missing, unreadable or
--          impossible is skipped (never purged, never an error) and the campaign's other expired entries are still purged.
--   Dates stored before this migration are not rewritten: the job simply leaves such entries alone.
--
-- ROLLBACK (manual, not part of the migration): re-run the validate_sheet definition of 20261106130000_sheet_discarded_fixes.sql and the
--   purge_expired_discarded definition of 20261106180000_discarded_lifecycle.sql; drop function public._discarded_at_ok(text).

create function public._discarded_at_ok(p_at text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_at is null or p_at !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$' then
    return false;
  end if;
  perform substr(p_at, 1, 19)::timestamp; -- out of range (30 February) raises
  return true;
exception when others then
  return false;
end;
$$;

revoke execute on function public._discarded_at_ok(text) from public, anon, authenticated;

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
       or (v_e.value ->> 'at') !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$'
       or not public._discarded_at_ok(v_e.value ->> 'at') then
      perform public._sheet_fail(v_path || '.at');
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('item', v_item, 'section', v_section, 'at', v_e.value -> 'at'));
  end loop;
  return v_core || jsonb_build_object('discarded', v_out);
end;
$$;

create or replace function public.purge_expired_discarded()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_keys text[];
  v_key text;
  v_chars int;
  v_total int := 0;
  v_done int;
begin
  for v_campaign in
    select c.id
      from public.campaigns c
     where jsonb_typeof(c.system_profile #> '{sheet,discarded}') = 'array'
     order by c.id
  loop
    v_done := 0;
    begin -- subtransaction: a failure rolls back this campaign only
      perform 1 from public.campaigns c where c.id = v_campaign for update;
      select coalesce(array_agg(e #>> '{item,key}' order by ord), '{}') into v_keys
        from public.campaigns c,
             jsonb_array_elements(c.system_profile #> '{sheet,discarded}') with ordinality as t(e, ord)
       where c.id = v_campaign
         -- a missing, unreadable or impossible date is skipped (case: the cast is only tried on a date that exists)
         and case when public._discarded_at_ok(e ->> 'at') then (e ->> 'at')::timestamptz end
             < now() - make_interval(days => public._discarded_retention_days());
      foreach v_key in array v_keys loop
        begin -- nested: a key that is live again is skipped, anything else fails the campaign
          v_chars := public._purge_discarded_entry(v_campaign, v_key);
          insert into public.discarded_purge_log (campaign_id, key, characters_affected) values (v_campaign, v_key, v_chars);
          v_done := v_done + 1;
        exception when others then
          if sqlerrm is distinct from 'discarded_key_live' then
            raise;
          end if;
        end;
      end loop;
      v_total := v_total + v_done;
    exception when others then
      raise warning 'purge_expired_discarded: campaign % skipped: % (%)', v_campaign, sqlerrm, sqlstate;
    end;
  end loop;
  return v_total;
end;
$$;
