-- G9 of the system-agnostic campaigns (odd/tasks/system-agnostic.md S26, S32). HIGH RISK: a scheduled job deletes stored character
-- data (pjs.data keys, catalogue entries of a Habilidad table) with nobody logged in.
--
-- Lifecycle. A discarded entry (sheet.discarded [{item, section, at}], G7b) is deleted automatically once `at` is more than
-- _discarded_retention_days() = 60 days old (S26). The client warns the DM 7 days before (S32, DISCARDED_WARNING_DAYS in the builder).
--
--   _discarded_retention_days()          the ONE constant of the 60 days (the client mirrors it in discardedLifecycle.ts).
--   _purge_discarded_entry(campaign, key)  the purge itself, extracted from purge_discarded_item without a change of behaviour: removes
--       exactly the pjs.data keys the item owns from every character of the campaign, the catalogue entries of a discarded Habilidad
--       table, and the entry from the list. Refuses unknown keys (discarded_item_not_found) and keys a live item uses again
--       (discarded_key_live). The caller holds the campaign row lock. Returns the number of characters that held a key.
--       purge_discarded_item (DM, manual) is redefined to call it: same checks, same result.
--   purge_expired_discarded()            for every campaign with an expired entry: lock the campaign row, purge each expired entry
--       through _purge_discarded_entry and log it. One subtransaction per campaign: an error rolls back that campaign only (a warning is
--       raised) and the next one still runs. An expired entry whose key is live again is SKIPPED, never purged (the values belong to the
--       live item); it is retried every day until the DM restores or purges it. Returns the number of entries purged.
--       SECURITY DEFINER, empty search_path, execute for NO API role: only the scheduler (postgres) runs it.
--   discarded_purge_log(campaign_id, key, purged_at, characters_affected)   what the job did; RLS: select for the DMs of the campaign
--       (is_campaign_dm, a hub owner counts), no write for API roles. Rows go with the campaign.
--   cron job 'purge-expired-discarded', daily at 03:15 UTC (pg_cron).
--
-- DEPLOY: hosted Supabase has pg_cron available; the migration creates it (`create extension if not exists pg_cron`). If the project
-- refuses (permissions), enable it once in Dashboard > Database > Extensions, then re-run `supabase db push`.
--
-- ROLLBACK (manual, not part of the migration): select cron.unschedule('purge-expired-discarded'); drop function
--   public.purge_expired_discarded(); drop table public.discarded_purge_log; re-run the purge_discarded_item definition of
--   20261106120000_sheet_discarded.sql; drop function public._purge_discarded_entry(uuid, text); drop function
--   public._discarded_retention_days().

create extension if not exists pg_cron;

create function public._discarded_retention_days()
returns int
language sql
immutable
set search_path = ''
as $$ select 60 $$;

revoke execute on function public._discarded_retention_days() from public, anon, authenticated;

create function public._purge_discarded_entry(p_campaign_id uuid, p_key text)
returns int
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_row public.campaigns;
  v_entry jsonb;
  v_keys text[];
  v_list jsonb;
  v_chars int := 0;
begin
  select * into v_row from public.campaigns c where c.id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found';
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
    get diagnostics v_chars = row_count;
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
   where c.id = p_campaign_id;
  return v_chars;
end;
$$;

revoke execute on function public._purge_discarded_entry(uuid, text) from public, anon, authenticated;

-- the manual purge of G7b, now through the shared step (checks and result unchanged)
create or replace function public.purge_discarded_item(p_campaign_id uuid, p_key text, p_base timestamptz)
returns public.campaigns
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.campaigns;
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

  perform public._purge_discarded_entry(p_campaign_id, p_key);
  select * into v_row from public.campaigns c where c.id = p_campaign_id;
  return v_row;
end;
$$;

create table public.discarded_purge_log (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  key text not null,
  purged_at timestamptz not null default now(),
  characters_affected int not null check (characters_affected >= 0)
);

create index discarded_purge_log_campaign_idx on public.discarded_purge_log (campaign_id, purged_at desc);

alter table public.discarded_purge_log enable row level security;
revoke all on public.discarded_purge_log from anon, authenticated;
grant select on public.discarded_purge_log to authenticated;

create policy discarded_purge_log_select on public.discarded_purge_log
  for select to authenticated
  using (public.is_campaign_dm(campaign_id));

create function public.purge_expired_discarded()
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
         and (e ->> 'at')::timestamptz < now() - make_interval(days => public._discarded_retention_days());
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

revoke execute on function public.purge_expired_discarded() from public, anon, authenticated;

select cron.schedule('purge-expired-discarded', '15 3 * * *', 'select public.purge_expired_discarded()');
