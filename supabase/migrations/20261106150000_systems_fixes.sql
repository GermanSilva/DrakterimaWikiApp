-- G8a fix round 1 (independent verify of 20261106140000_systems.sql). HIGH RISK: same objects, tighter rules.
--
--   1. BLOCKER. A request that chose a base could be approved with the DEFAULT document when the system disappeared (the owner's account
--      deleted: systems cascade, and campaign_requests.system_id is ON DELETE SET NULL, so the choice vanished with it).
--      Fix: campaign_requests.system_requested (boolean, set by the request trigger, never writable by the API) remembers that a base was
--      chosen. The foreign key stays SET NULL, because RESTRICT would block deleting the owner's account and CASCADE would delete the
--      request. Approval now refuses with system_not_available when system_requested is true and the base is gone or no longer usable, so
--      the request stays pending (the requester cancels it and asks again).
--   2. freeze_campaign_system only freezes a document that passes validate_system_profile (stored normalised, sheet.discarded dropped). An
--      invalid legacy document is skipped, still without ever blocking the removal of a DM.
--   3. branch_system counts, for the 50-homebrew cap, only the homebrew the caller can still reach: attached to a campaign they currently
--      DM (the same rule as the select policy). Detached homebrew (campaign gone, DM left) no longer eat the cap.
--   4. Frozen copies are bounded: at most 30 per user. When a new copy is stored the OLDEST ones beyond 30 are deleted (by created_at, then
--      id), so a removal never fails and the list cannot grow without limit. Chosen over "refuse beyond N" because the latest template is
--      the one worth keeping and refusing silently would lose it. A deleted copy only affects requests that chose it, which then fail
--      cleanly through (1).
--
-- ROLLBACK (manual, not part of the migration): re-create prepare_campaign_request / approve_campaign_request from 20261106140000_systems.sql,
-- freeze_campaign_system and branch_system from the same file, then alter table public.campaign_requests drop column system_requested.

alter table public.campaign_requests
  add column system_requested boolean not null default false;
comment on column public.campaign_requests.system_requested is
  'True when the request chose a base system (set by the insert trigger). Survives the loss of the system so approval can refuse instead of using the default document.';

-- Same as 20261106140000_systems.sql plus system_requested.
create or replace function public.prepare_campaign_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.name := btrim(public.strip_control_chars(new.name));
  new.slug_wanted := nullif(lower(btrim(public.strip_control_chars(new.slug_wanted))), '');
  new.message := nullif(btrim(public.strip_control_chars(new.message, true)), '');
  new.tagline := nullif(btrim(public.strip_control_chars(new.tagline)), '');
  new.accent_color := nullif(lower(btrim(public.strip_control_chars(new.accent_color))), '');
  new.logo_url := nullif(btrim(public.strip_control_chars(new.logo_url)), '');

  if public.is_reserved_slug(new.slug_wanted) then
    raise exception 'reserved_slug';
  end if;
  -- Named reasons (the CHECK constraints stay as a second line of defence).
  if new.tagline is not null and char_length(new.tagline) > 140 then
    raise exception 'invalid_tagline' using errcode = '23514';
  end if;
  if new.accent_color is not null and new.accent_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'invalid_accent_color' using errcode = '23514';
  end if;
  if new.logo_url is not null and (char_length(new.logo_url) > 500 or new.logo_url !~ '^https://[^[:space:]]+$') then
    raise exception 'invalid_logo_url' using errcode = '23514';
  end if;
  if new.system_id is not null and not public.system_usable_by(new.system_id) then
    raise exception 'system_not_available';
  end if;
  new.system_requested := new.system_id is not null;

  -- Serialises concurrent inserts of the same user. The counts below rely on READ COMMITTED (see H15b).
  perform pg_advisory_xact_lock(hashtextextended('campaign_requests:' || new.requester_id::text, 0));
  if (select count(*) from public.campaign_requests r
      where r.requester_id = new.requester_id and r.status = 'pending') >= 3 then
    raise exception 'too_many_pending_requests';
  end if;
  if (select count(*) from public.campaign_requests r
      where r.requester_id = new.requester_id and r.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_requests_recently';
  end if;
  return new;
end;
$$;

-- Same as 20261106140000_systems.sql; a chosen base that is gone (system_id null while system_requested) is refused like an unusable one.
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
    select public.validate_system_profile(public.system_template(s.document)) into v_doc
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
  end if;

  update public.campaign_requests
  set status = 'approved', decided_by = v_uid, decided_at = now(), campaign_id = v_campaign.id
  where id = v_req.id;

  return v_campaign.slug;
end;
$$;

-- Only a valid document is frozen; at most 30 frozen copies per user (the oldest are dropped).
create or replace function public.freeze_campaign_system(p_campaign_id uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign record;
  v_doc jsonb;
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

  if exists (
    select 1 from public.systems s
    where s.kind = 'frozen' and s.owner_id = p_user and s.campaign_id = p_campaign_id and s.document = v_doc
  ) then
    return;
  end if;

  insert into public.systems (name, document, kind, campaign_id, owner_id, branched_from)
  values (left(v_campaign.name, 100) || ' (copia congelada)', v_doc, 'frozen', p_campaign_id, p_user, v_campaign.based_on_system)
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

revoke execute on function public.freeze_campaign_system(uuid, uuid) from public, anon, authenticated;

-- The cap counts only the homebrew the caller can still reach (attached to a campaign they currently DM).
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

  insert into public.systems (name, document, kind, campaign_id, owner_id, branched_from)
  values (
    v_name,
    public.validate_system_profile(public.system_template(v_campaign.system_profile)),
    'homebrew', p_campaign_id, v_uid, v_campaign.based_on_system
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.branch_system(uuid, text) from public, anon, authenticated;
grant execute on function public.branch_system(uuid, text) to authenticated;
