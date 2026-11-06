-- G8a-2 of the system-agnostic campaigns (odd/tasks/system-agnostic.md S38; refines S25, S32). HIGH RISK: new column and SECURITY DEFINER
-- helpers on top of the systems table, the freeze trigger path and the request approval.
--
-- User decision (Log L19, "Sí, sin las privadas"): homebrew branches and frozen copies carry the campaign action collection's SHARED
-- entries with their functions (never an entry private to a character: that is the character's data), and a campaign created from such a
-- system starts with that catalogue (no links).
--
--   systems.actions   jsonb array of { table_key, category, name, description, extras, function } (function may be null). Bounded: at most
--                     200 entries, at most 1 MB in total, every entry shape-checked by systems_actions_ok() in a CHECK constraint (the same
--                     per-field limits as campaign_actions). Default '[]'. Visibility is the row's: RLS is unchanged (select policy of
--                     systems), so whoever may read a system reads its catalogue, nobody else does. The catalogue of an ORIGIN is therefore
--                     readable by every signed-in user, like its document.
--   Capture           system_capture_actions(campaign) takes the shared entries (private_to_pj is null) in id order. Entries that would
--                     exceed the 200 / 1 MB bounds are skipped rather than failing. Used by branch_system, create_origin_from_campaign and
--                     the freeze path (promote_system copies the catalogue of its source). The freeze path additionally swallows any
--                     failure to capture (catalogue = empty), so removing a DM or deleting a campaign is still never blocked. Frozen
--                     dedupe now compares the catalogue too: same document and same catalogue from the same campaign = no new copy.
--   Seeding           system_seed_actions(campaign, actions, created_by) inserts the entries into campaign_actions THROUGH the normal
--                     validate_campaign_action trigger, each in its own subtransaction: an entry the copied sheet rejects (missing table,
--                     unknown category, bad extras) or that duplicates another is skipped, never fatal. No links are created.
--                     approve_campaign_request calls it right after the copied system_profile is in place, with the REQUESTER as
--                     created_by: they are the DM who owns the catalogue from then on (the approver, a hub owner, is not a member of the
--                     campaign, and the column is ON DELETE SET NULL anyway). The result is stored on the request:
--                     campaign_requests.seeded_actions / skipped_actions (null for a request without a base; readable by the requester
--                     and the hub owner, never writable).
--                     Without a base nothing changes.
--
-- ROLLBACK (manual, not part of the migration): re-create branch_system, freeze_campaign_system from 20261106150000_systems_fixes.sql,
-- create_origin_from_campaign and promote_system from 20261106140000_systems.sql, approve_campaign_request from 20261106150000; then
-- drop function public.system_seed_actions(uuid, jsonb, uuid), public.system_capture_actions(uuid); alter table public.systems drop column
-- actions; drop function public.systems_actions_ok(jsonb); alter table public.campaign_requests drop column seeded_actions, drop column
-- skipped_actions. Catalogues stored in systems are lost with the column.

------------------------------------------------------------------------------
-- Shape and bounds
------------------------------------------------------------------------------

create function public.systems_actions_ok(a jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(a) is distinct from 'array' then false
    when jsonb_array_length(a) > 200 or octet_length(a::text) > 1048576 then false
    else not exists (
      select 1 from jsonb_array_elements(a) e
      where jsonb_typeof(e) is distinct from 'object'
         or jsonb_typeof(e -> 'table_key') is distinct from 'string' or char_length(e ->> 'table_key') not between 1 and 64
         or jsonb_typeof(e -> 'category') is distinct from 'string' or char_length(e ->> 'category') > 60
         or jsonb_typeof(e -> 'name') is distinct from 'string' or char_length(btrim(e ->> 'name')) not between 1 and 200
         or jsonb_typeof(e -> 'description') is distinct from 'string' or char_length(e ->> 'description') > 20000
         or jsonb_typeof(e -> 'extras') is distinct from 'object' or octet_length((e -> 'extras')::text) > 20000
         or jsonb_typeof(coalesce(e -> 'function', 'null'::jsonb)) not in ('object', 'array', 'null')
         or octet_length(coalesce(e -> 'function', 'null'::jsonb)::text) > 50000
    )
  end;
$$;

revoke execute on function public.systems_actions_ok(jsonb) from public, anon, authenticated;

alter table public.systems
  add column actions jsonb not null default '[]'::jsonb,
  add constraint systems_actions_check check (public.systems_actions_ok(actions));
comment on column public.systems.actions is
  'Shared action-collection entries of the source campaign (S38): [{table_key, category, name, description, extras, function}], at most 200 / 1 MB, never private entries.';

alter table public.campaign_requests
  add column seeded_actions integer,
  add column skipped_actions integer;
comment on column public.campaign_requests.seeded_actions is 'Entries of the base system catalogue inserted into the new campaign on approval (null: no base).';
comment on column public.campaign_requests.skipped_actions is 'Entries skipped on approval because the copied sheet rejected them or they were duplicates (null: no base).';
grant select (seeded_actions, skipped_actions) on public.campaign_requests to authenticated;

------------------------------------------------------------------------------
-- Capture and seed helpers (not callable through the API)
------------------------------------------------------------------------------

create function public.system_capture_actions(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_e jsonb;
  v_n integer := 0;
  v_size integer := 2;
begin
  for v_e in
    select jsonb_build_object('table_key', a.table_key, 'category', a.category, 'name', a.name,
                              'description', a.description, 'extras', a.extras, 'function', a.function)
    from public.campaign_actions a
    where a.campaign_id = p_campaign_id and a.private_to_pj is null
    order by a.id
  loop
    exit when v_n >= 200;
    continue when v_size + octet_length(v_e::text) + 1 > 1000000; -- does not fit: skipped, not fatal
    v_out := v_out || jsonb_build_array(v_e);
    v_n := v_n + 1;
    v_size := v_size + octet_length(v_e::text) + 1;
  end loop;
  return v_out;
end;
$$;

revoke execute on function public.system_capture_actions(uuid) from public, anon, authenticated;

-- Returns how many entries were skipped.
create function public.system_seed_actions(p_campaign_id uuid, p_actions jsonb, p_created_by uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e jsonb;
  v_skipped integer := 0;
begin
  if jsonb_typeof(p_actions) is distinct from 'array' then
    return 0;
  end if;
  for v_e in select value from jsonb_array_elements(p_actions) loop
    begin
      insert into public.campaign_actions (campaign_id, table_key, category, name, description, extras, private_to_pj, function, created_by)
      values (p_campaign_id, v_e ->> 'table_key', v_e ->> 'category', v_e ->> 'name', v_e ->> 'description', v_e -> 'extras', null,
              nullif(v_e -> 'function', 'null'::jsonb), p_created_by);
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return v_skipped;
end;
$$;

revoke execute on function public.system_seed_actions(uuid, jsonb, uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- RPCs and triggers that carry the catalogue
------------------------------------------------------------------------------

create or replace function public.branch_system(p_campaign_id uuid, p_name text)
returns public.systems
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
  return v_row;
end;
$$;

create or replace function public.create_origin_from_campaign(p_campaign_id uuid, p_name text)
returns public.systems
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
  return v_row;
end;
$$;

create or replace function public.promote_system(p_system_id uuid, p_name text default null)
returns public.systems
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
  return v_row;
end;
$$;

create or replace function public.freeze_campaign_system(p_campaign_id uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign record;
  v_doc jsonb;
  v_actions jsonb;
  v_new uuid;
  v_excess integer;
begin
  select c.name, c.system_profile, c.based_on_system into v_campaign from public.campaigns c where c.id = p_campaign_id;
  if not found then
    return; -- the campaign is being deleted: its BEFORE DELETE trigger already froze it for the DMs
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    return; -- the account is being deleted
  end if;

  begin
    v_doc := public.validate_system_profile(public.system_template(v_campaign.system_profile));
  exception when others then
    return; -- a legacy document that does not validate is not a template worth keeping; never block the removal
  end;

  begin
    v_actions := public.system_capture_actions(p_campaign_id);
    if not public.systems_actions_ok(v_actions) then
      v_actions := '[]'::jsonb;
    end if;
  exception when others then
    v_actions := '[]'::jsonb; -- never block the removal because of the catalogue
  end;

  if exists (
    select 1 from public.systems s
    where s.kind = 'frozen' and s.owner_id = p_user and s.campaign_id = p_campaign_id and s.document = v_doc and s.actions = v_actions
  ) then
    return;
  end if;

  insert into public.systems (name, document, kind, campaign_id, owner_id, branched_from, actions)
  values (left(v_campaign.name, 100) || ' (copia congelada)', v_doc, 'frozen', p_campaign_id, p_user, v_campaign.based_on_system, v_actions)
  returning id into v_new;

  select count(*) - 30 into v_excess from public.systems s where s.kind = 'frozen' and s.owner_id = p_user;
  if v_excess > 0 then
    delete from public.systems s
    where s.id in (
      select o.id from public.systems o
      where o.kind = 'frozen' and o.owner_id = p_user and o.id <> v_new
      order by o.created_at, o.id
      limit v_excess
    );
  end if;
end;
$$;

create or replace function public.approve_campaign_request(p_request_id bigint, p_slug text default null, p_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.campaign_requests;
  v_campaign public.campaigns;
  v_doc jsonb;
  v_actions jsonb;
  v_skipped integer;
  v_seeded integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_hub_owner() then
    raise exception 'hub_owner_only' using errcode = '42501';
  end if;

  select * into v_req from public.campaign_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;

  if v_req.system_requested then
    if v_req.system_id is null or not public.system_usable_by(v_req.system_id, v_req.requester_id) then
      raise exception 'system_not_available';
    end if;
    select public.validate_system_profile(public.system_template(s.document)), s.actions into v_doc, v_actions
    from public.systems s where s.id = v_req.system_id;
  end if;

  v_campaign := public.create_campaign_for(
    v_req.requester_id,
    coalesce(nullif(btrim(p_slug), ''), v_req.slug_wanted),
    coalesce(nullif(btrim(p_name), ''), v_req.name),
    jsonb_build_object('tagline', v_req.tagline, 'accent_color', v_req.accent_color, 'logo_url', v_req.logo_url)
  );

  if v_req.system_requested then
    update public.campaigns c set system_profile = v_doc, based_on_system = v_req.system_id where c.id = v_campaign.id;
    -- the copied sheet is in place: the catalogue goes through the normal entry validation, a rejected entry is skipped
    v_skipped := public.system_seed_actions(v_campaign.id, v_actions, v_req.requester_id);
    v_seeded := jsonb_array_length(v_actions) - v_skipped;
  end if;

  update public.campaign_requests
  set status = 'approved', decided_by = v_uid, decided_at = now(), campaign_id = v_campaign.id,
      seeded_actions = v_seeded, skipped_actions = v_skipped
  where id = v_req.id;

  return v_campaign.slug;
end;
$$;
