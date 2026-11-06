-- G8a-2 fix round 1 (independent verify of 20261106160000_systems_actions.sql). HIGH RISK: privacy of the action catalogue (S37).
--
-- B1. Origins are readable by every signed-in user, and create_origin_from_campaign / promote_system copy the campaign's SHARED entries
--     into them. Those entries are DM-only content until linked to a character (S37: only the DM reads the unlinked collection), so an
--     origin would have shown descriptions and functions to the players of the source campaign and to outsiders. Decision: nobody sees
--     more than before.
--       * systems.actions is no longer readable through the API: select on the table is replaced by a column grant that lists every
--         column but `actions` (new columns are NOT granted automatically). Origins keep CARRYING the catalogue; seeding is server-side
--         and untouched.
--       * get_system_actions(system) (SECURITY DEFINER, empty search_path) is the only reader. It answers only the hub owner (any
--         system), the DMs of the campaign of a non-archived homebrew, and the owner of a non-archived frozen copy: exactly the users who
--         can already see that row, except that nobody but the hub owner reads an ORIGIN's catalogue. Anybody else, a missing system or an
--         archived one gets the same refusal: system_not_available (P0001).
-- Should-fix. branch_system, rename_system, create_origin_from_campaign, promote_system and archive_system returned the whole systems row
--     (document and up to 1 MB of catalogue). They now return public.system_summary, the SystemSummary columns of the data layer (no
--     document, no actions). Same names, arguments, checks and errors as before; the functions are dropped and re-created because the
--     return type changes (grants re-applied: authenticated only).
--
-- ROLLBACK (manual, not part of the migration): drop get_system_actions(uuid), _system_summary(public.systems); re-create the five RPCs
-- from 20261106160000_systems_actions.sql (branch_system, create_origin_from_campaign, promote_system) and 20261106140000_systems.sql
-- (rename_system, archive_system) after dropping the new versions; drop type public.system_summary;
-- revoke select on public.systems from authenticated; grant select on public.systems to authenticated.

------------------------------------------------------------------------------
-- Column privilege
------------------------------------------------------------------------------

revoke select on public.systems from authenticated;
grant select (id, name, document, kind, campaign_id, owner_id, branched_from, archived_at, created_at, updated_at)
  on public.systems to authenticated;

------------------------------------------------------------------------------
-- Return type without document and catalogue
------------------------------------------------------------------------------

create type public.system_summary as (
  id            uuid,
  name          text,
  kind          text,
  campaign_id   uuid,
  owner_id      uuid,
  branched_from uuid,
  archived_at   timestamptz,
  created_at    timestamptz,
  updated_at    timestamptz
);

create function public._system_summary(s public.systems)
returns public.system_summary
language sql
immutable
set search_path = ''
as $$
  select row(s.id, s.name, s.kind, s.campaign_id, s.owner_id, s.branched_from, s.archived_at, s.created_at, s.updated_at)::public.system_summary;
$$;

revoke execute on function public._system_summary(public.systems) from public, anon, authenticated;

drop function public.branch_system(uuid, text);
drop function public.rename_system(uuid, text);
drop function public.create_origin_from_campaign(uuid, text);
drop function public.promote_system(uuid, text);
drop function public.archive_system(uuid, boolean);

------------------------------------------------------------------------------
-- The only reader of the catalogue
------------------------------------------------------------------------------

create function public.get_system_actions(p_system_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_actions jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select s.actions into v_actions
  from public.systems s
  where s.id = p_system_id
    and (
      public.is_hub_owner()
      or (
        s.archived_at is null
        and (
          (s.kind = 'frozen' and s.owner_id = v_uid)
          or (s.kind = 'homebrew' and s.campaign_id is not null and public.is_campaign_dm(s.campaign_id))
        )
      )
    );
  if not found then
    raise exception 'system_not_available';
  end if;
  return v_actions;
end;
$$;

revoke execute on function public.get_system_actions(uuid) from public, anon, authenticated;
grant execute on function public.get_system_actions(uuid) to authenticated;

------------------------------------------------------------------------------
-- RPCs: same behaviour as before, summary result
------------------------------------------------------------------------------

create function public.branch_system(p_campaign_id uuid, p_name text)
returns public.system_summary
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := nullif(btrim(public.strip_control_chars(p_name)), '');
  v_campaign record;
  v_row public.systems;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '23514';
  end if;

  select c.system_profile, c.based_on_system into v_campaign from public.campaigns c where c.id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('systems:' || v_uid::text, 0));
  if (select count(*) from public.systems s
      where s.owner_id = v_uid and s.kind = 'homebrew' and s.campaign_id is not null and public.is_campaign_dm(s.campaign_id)) >= 50 then
    raise exception 'systems_limit_reached';
  end if;

  insert into public.systems (name, document, kind, campaign_id, owner_id, branched_from, actions)
  values (
    v_name,
    public.validate_system_profile(public.system_template(v_campaign.system_profile)),
    'homebrew', p_campaign_id, v_uid, v_campaign.based_on_system,
    public.system_capture_actions(p_campaign_id)
  )
  returning * into v_row;
  return public._system_summary(v_row);
end;
$$;

revoke execute on function public.branch_system(uuid, text) from public, anon, authenticated;
grant execute on function public.branch_system(uuid, text) to authenticated;

create function public.rename_system(p_system_id uuid, p_name text)
returns public.system_summary
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := nullif(btrim(public.strip_control_chars(p_name)), '');
  v_hub boolean;
  v_sys public.systems;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '23514';
  end if;

  v_hub := public.is_hub_owner();
  -- the same visibility as the select policy
  select * into v_sys from public.systems s
  where s.id = p_system_id
    and (
      v_hub
      or (
        s.archived_at is null
        and (
          s.kind = 'origin'
          or (s.kind = 'frozen' and s.owner_id = v_uid)
          or (s.kind = 'homebrew' and s.campaign_id is not null and public.is_campaign_dm(s.campaign_id))
        )
      )
    )
  for update;
  if not found then
    raise exception 'system_not_found';
  end if;
  if not v_hub and (v_sys.owner_id is distinct from v_uid or v_sys.kind = 'origin') then
    raise exception 'system_owner_only' using errcode = '42501';
  end if;

  update public.systems s set name = v_name where s.id = p_system_id returning * into v_sys;
  return public._system_summary(v_sys);
end;
$$;

revoke execute on function public.rename_system(uuid, text) from public, anon, authenticated;
grant execute on function public.rename_system(uuid, text) to authenticated;

create function public.create_origin_from_campaign(p_campaign_id uuid, p_name text)
returns public.system_summary
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := nullif(btrim(public.strip_control_chars(p_name)), '');
  v_campaign record;
  v_row public.systems;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_hub_owner() then
    raise exception 'hub_owner_only' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '23514';
  end if;

  select c.system_profile, c.based_on_system into v_campaign from public.campaigns c where c.id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found';
  end if;

  insert into public.systems (name, document, kind, campaign_id, owner_id, branched_from, actions)
  values (
    v_name,
    public.validate_system_profile(public.system_template(v_campaign.system_profile)),
    'origin', p_campaign_id, null, v_campaign.based_on_system,
    public.system_capture_actions(p_campaign_id)
  )
  returning * into v_row;
  return public._system_summary(v_row);
end;
$$;

revoke execute on function public.create_origin_from_campaign(uuid, text) from public, anon, authenticated;
grant execute on function public.create_origin_from_campaign(uuid, text) to authenticated;

create function public.promote_system(p_system_id uuid, p_name text default null)
returns public.system_summary
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_src public.systems;
  v_name text := nullif(btrim(public.strip_control_chars(p_name)), '');
  v_row public.systems;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_hub_owner() then
    raise exception 'hub_owner_only' using errcode = '42501';
  end if;

  select * into v_src from public.systems s where s.id = p_system_id;
  if not found then
    raise exception 'system_not_found';
  end if;
  if v_src.kind = 'origin' then
    raise exception 'invalid_system_kind';
  end if;
  v_name := coalesce(v_name, v_src.name);
  if char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '23514';
  end if;

  insert into public.systems (name, document, kind, campaign_id, owner_id, branched_from, actions)
  values (v_name, public.validate_system_profile(public.system_template(v_src.document)), 'origin', v_src.campaign_id, null, v_src.id, v_src.actions)
  returning * into v_row;
  return public._system_summary(v_row);
end;
$$;

revoke execute on function public.promote_system(uuid, text) from public, anon, authenticated;
grant execute on function public.promote_system(uuid, text) to authenticated;

create function public.archive_system(p_system_id uuid, p_archived boolean)
returns public.system_summary
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.systems;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_hub_owner() then
    raise exception 'hub_owner_only' using errcode = '42501';
  end if;

  update public.systems s
  set archived_at = case when coalesce(p_archived, false) then coalesce(s.archived_at, now()) else null end
  where s.id = p_system_id
  returning * into v_row;
  if not found then
    raise exception 'system_not_found';
  end if;
  return public._system_summary(v_row);
end;
$$;

revoke execute on function public.archive_system(uuid, boolean) from public, anon, authenticated;
grant execute on function public.archive_system(uuid, boolean) to authenticated;
