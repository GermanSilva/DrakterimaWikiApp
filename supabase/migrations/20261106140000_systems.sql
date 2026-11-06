-- G8a of the system-agnostic campaigns (odd/tasks/system-agnostic.md S25, S32, S4, S5): the hub-level list of SYSTEMS.
-- HIGH RISK: new table, RLS, SECURITY DEFINER RPCs and membership/campaign triggers. The UI is G8b.
--
--   systems(id, name, document, kind, campaign_id, owner_id, branched_from, archived_at, ...)
--     kind 'origin'   marked by the hub owner ("Sistema Origen"); owner_id is NULL (it belongs to the hub, so deleting the account of
--                     the hub owner who created it never deletes it); archived instead of deleted.
--     kind 'homebrew' branched by a DM from the system of one of their campaigns (campaign_id = that campaign); owner_id = the DM.
--     kind 'frozen'   copy kept for a user who stopped managing a campaign (S25) or whose campaign was deleted; owner_id = that user.
--     document        a system document (the same jsonb as campaigns.system_profile: version 1, at most 64 KB). It is the TEMPLATE only:
--                     the document never holds character data (that lives in pjs), and the `sheet.discarded` list (G7b, definitions of
--                     removed fields that only make sense next to the characters' hidden data) is dropped from every copy.
--     branched_from   informational lineage (nullable, set null if the source is ever gone). campaign_id of an origin is informational too.
--   Nobody writes the table through the API: authenticated has SELECT only. Every change goes through an RPC below, so a system is never
--   hard-deleted by the API (archive instead).
--
-- Visibility (RLS, select only)
--   hub owner      everything, archived included.
--   anybody else   only NON-archived rows, and only: origins (any signed-in user: requesters list them to pick a base), their own frozen
--                  copies, and the homebrew of campaigns they currently DM. Players and outsiders therefore see origins and nothing else.
--                  A DM who stops managing a campaign loses the homebrew of that campaign (they keep the frozen copy).
--
-- RPCs (SECURITY DEFINER, empty search_path, authenticated only)
--   branch_system(campaign, name)              DM of that campaign (a hub owner counts as DM of every campaign, as everywhere else):
--                                              a homebrew holding a copy of the campaign's CURRENT system_profile. Cap: 50 homebrew per user.
--   rename_system(system, name)                the owner of a homebrew / frozen copy, or the hub owner for any system.
--   create_origin_from_campaign(campaign, name) hub owner: a new origin from a campaign's document.
--   promote_system(system, name)               hub owner: makes a NEW origin from a homebrew or frozen copy (document copied, lineage
--                                              branched_from = the source, which stays untouched, so the DM keeps their homebrew).
--   archive_system(system, archived)           hub owner: archive / unarchive. An archived system is not selectable by anybody but the owner.
--   system_usable_by(system)                   whether the caller may use the system as the base of a new campaign (see below).
--
-- Frozen copies (S25, S32). Triggers, never blocking: they must not make removing a DM, demoting a DM or deleting a campaign fail.
--   * AFTER DELETE / UPDATE OF role on campaign_members: when a DM row goes away or the role changes away from 'dm', a frozen copy of the
--     campaign's current system_profile is inserted for that user. Players get none. Deduplicated: skipped when that user already holds a
--     frozen copy FROM THE SAME CAMPAIGN with an identical document (so promote/demote loops add nothing, but an evolved campaign adds one).
--   * BEFORE DELETE on campaigns: the same for every current DM (the members cascade runs after the campaign row is gone, when the document
--     can no longer be read, so the campaign trigger does it while the row still exists). The members trigger then finds no campaign and skips.
--   * Account deletion (profile gone) creates nothing: there is nobody to keep it for, and the FK would otherwise abort the deletion.
--   * systems.campaign_id is ON DELETE SET NULL (not cascade, not convert): a campaign's homebrew is scoped to that campaign (S25), so once
--     the campaign is gone it is simply no longer reachable by DMs (only the hub owner still sees it); nothing is lost because the DM
--     already got a frozen copy of the template at deletion time.
--
-- Campaign requests (S25, S4)
--   * campaign_requests.system_id (nullable; null = today's default document, exactly the old behaviour). Checked when the request is
--     created (prepare_campaign_request) and again at approval: usable = not archived AND (origin, or the requester's own frozen copy, or a
--     homebrew of a campaign the requester currently DMs). Refusal: system_not_available (P0001); at approval the request stays pending.
--   * On approval the new campaign's system_profile is a COPY of the base document (S4: copy, not link) and the informational lineage is
--     stored in campaigns.based_on_system (a real column with a foreign key: the lineage is queryable and survives edits of the document,
--     whose own validator would otherwise need a new key; set null if the system is ever gone). campaigns.system (the text slug) is untouched.
--   * create_campaign (hub owner direct creation) is not changed: hub owners can branch from any campaign instead.
--
-- Errors: dm_only, hub_owner_only, system_owner_only (42501); system_not_found, system_not_available, invalid_system_kind,
-- campaign_not_found, systems_limit_reached (P0001); invalid_name (23514).
--
-- ROLLBACK (manual, not part of the migration): re-create prepare_campaign_request from 20261023120000_campaign_request_branding.sql and
-- approve_campaign_request from the same file; then
--   drop trigger campaigns_freeze_systems on public.campaigns; drop trigger campaign_members_freeze_system on public.campaign_members;
--   alter table public.campaign_requests drop column system_id; alter table public.campaigns drop column based_on_system;
--   drop table public.systems cascade; and drop the functions created here (branch_system, rename_system, create_origin_from_campaign,
--   promote_system, archive_system, system_usable_by (both), system_template, freeze_campaign_system, freeze_on_dm_exit,
--   freeze_on_campaign_delete). Frozen copies are lost with the table.

------------------------------------------------------------------------------
-- systems
------------------------------------------------------------------------------

create table public.systems (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  document      jsonb not null,
  kind          text not null check (kind in ('origin', 'homebrew', 'frozen')),
  campaign_id   uuid references public.campaigns (id) on delete set null,
  owner_id      uuid references public.profiles (id) on delete cascade,
  branched_from uuid references public.systems (id) on delete set null,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint systems_document_check check (
    jsonb_typeof(document) = 'object'
    and coalesce(document -> 'version' = '1'::jsonb, false)
    and octet_length(document::text) <= 65536
  ),
  -- an origin belongs to the hub; the other kinds always have an owner
  constraint systems_owner_check check ((kind = 'origin') = (owner_id is null))
);

create index systems_owner_idx on public.systems (owner_id) where owner_id is not null;
create index systems_campaign_idx on public.systems (campaign_id) where campaign_id is not null;
create index systems_origin_idx on public.systems (kind) where archived_at is null;
create index systems_branched_from_idx on public.systems (branched_from) where branched_from is not null;

comment on table public.systems is
  'Hub-level systems (S25): origin (hub owner), homebrew (branched by a DM from a campaign), frozen (kept for a former DM). Template only, never character data. Written only through RPCs/triggers, never deleted by the API.';

create trigger systems_set_updated_at
  before update on public.systems
  for each row execute function public.set_updated_at();

alter table public.campaigns
  add column based_on_system uuid references public.systems (id) on delete set null;
comment on column public.campaigns.based_on_system is
  'Informational lineage (S4/S25): the system this campaign was created from (a copy was taken; nothing is inherited). Never writable through the API.';

alter table public.campaign_requests
  add column system_id uuid references public.systems (id) on delete set null;
comment on column public.campaign_requests.system_id is
  'Optional base system of the requested campaign (null = the default document). Validated at request and at approval.';

grant insert (system_id) on public.campaign_requests to authenticated;
grant select (system_id) on public.campaign_requests to authenticated;

------------------------------------------------------------------------------
-- RLS: select only
------------------------------------------------------------------------------

alter table public.systems enable row level security;

create policy systems_select on public.systems
  for select to authenticated
  using (
    (select public.is_hub_owner())
    or (
      archived_at is null
      and (
        kind = 'origin'
        or (kind = 'frozen' and owner_id = (select auth.uid()))
        or (kind = 'homebrew' and campaign_id is not null and public.is_campaign_dm(campaign_id))
      )
    )
  );

revoke all on public.systems from anon, authenticated;
grant select on public.systems to authenticated;

------------------------------------------------------------------------------
-- Helpers (not callable through the API unless stated)
------------------------------------------------------------------------------

-- The template part of a system document: everything except the discarded-field definitions of the sheet (G7b).
create function public.system_template(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p #- '{sheet,discarded}';
$$;

revoke execute on function public.system_template(jsonb) from public, anon, authenticated;

-- May p_user use the system as the base of a new campaign? Not archived, and an origin, or their own frozen copy, or a homebrew of a
-- campaign they currently DM (real membership: the hub owner does not request campaigns).
create function public.system_usable_by(p_system_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.systems s
    where s.id = p_system_id
      and s.archived_at is null
      and (
        s.kind = 'origin'
        or (s.kind = 'frozen' and s.owner_id = p_user)
        or (s.kind = 'homebrew' and s.campaign_id is not null and exists (
          select 1 from public.campaign_members m
          where m.campaign_id = s.campaign_id and m.user_id = p_user and m.role = 'dm'))
      )
  );
$$;

revoke execute on function public.system_usable_by(uuid, uuid) from public, anon, authenticated;

-- The same question about the caller only (so it reveals nothing about anybody else); used by the invoker-rights request trigger.
create function public.system_usable_by(p_system_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.system_usable_by(p_system_id, (select auth.uid()));
$$;

revoke execute on function public.system_usable_by(uuid) from public, anon, authenticated;
grant execute on function public.system_usable_by(uuid) to authenticated;

-- Inserts the frozen copy of a campaign's system for a user (see the header). Silent when there is nothing to keep or to keep it for.
create function public.freeze_campaign_system(p_campaign_id uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign record;
  v_doc jsonb;
begin
  select c.name, c.system_profile, c.based_on_system into v_campaign from public.campaigns c where c.id = p_campaign_id;
  if not found then
    return; -- the campaign is being deleted: its BEFORE DELETE trigger already froze it for the DMs
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    return; -- the account is being deleted
  end if;

  v_doc := public.system_template(v_campaign.system_profile);
  begin
    v_doc := public.validate_system_profile(v_doc);
  exception when others then
    null; -- a legacy document that no longer validates is kept as it is: this must never block removing a DM
  end;

  if exists (
    select 1 from public.systems s
    where s.kind = 'frozen' and s.owner_id = p_user and s.campaign_id = p_campaign_id and s.document = v_doc
  ) then
    return;
  end if;

  insert into public.systems (name, document, kind, campaign_id, owner_id, branched_from)
  values (left(v_campaign.name, 100) || ' (copia congelada)', v_doc, 'frozen', p_campaign_id, p_user, v_campaign.based_on_system);
end;
$$;

revoke execute on function public.freeze_campaign_system(uuid, uuid) from public, anon, authenticated;

create function public.freeze_on_dm_exit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'dm' and (tg_op = 'DELETE' or new.role <> 'dm') then
    perform public.freeze_campaign_system(old.campaign_id, old.user_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.freeze_on_dm_exit() from public, anon, authenticated;

create trigger campaign_members_freeze_system
  after update of role or delete on public.campaign_members
  for each row execute function public.freeze_on_dm_exit();

create function public.freeze_on_campaign_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in select m.user_id from public.campaign_members m where m.campaign_id = old.id and m.role = 'dm' loop
    perform public.freeze_campaign_system(old.id, v_user);
  end loop;
  return old;
end;
$$;

revoke execute on function public.freeze_on_campaign_delete() from public, anon, authenticated;

create trigger campaigns_freeze_systems
  before delete on public.campaigns
  for each row execute function public.freeze_on_campaign_delete();

------------------------------------------------------------------------------
-- RPCs
------------------------------------------------------------------------------

create function public.branch_system(p_campaign_id uuid, p_name text)
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
  if (select count(*) from public.systems s where s.owner_id = v_uid and s.kind = 'homebrew') >= 50 then
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

-- The owner of a homebrew / frozen copy, or the hub owner. A system the caller cannot see is system_not_found (nothing is revealed).
create function public.rename_system(p_system_id uuid, p_name text)
returns public.systems
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
  return v_sys;
end;
$$;

revoke execute on function public.rename_system(uuid, text) from public, anon, authenticated;
grant execute on function public.rename_system(uuid, text) to authenticated;

create function public.create_origin_from_campaign(p_campaign_id uuid, p_name text)
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

  insert into public.systems (name, document, kind, campaign_id, owner_id, branched_from)
  values (
    v_name,
    public.validate_system_profile(public.system_template(v_campaign.system_profile)),
    'origin', p_campaign_id, null, v_campaign.based_on_system
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.create_origin_from_campaign(uuid, text) from public, anon, authenticated;
grant execute on function public.create_origin_from_campaign(uuid, text) to authenticated;

create function public.promote_system(p_system_id uuid, p_name text default null)
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

  insert into public.systems (name, document, kind, campaign_id, owner_id, branched_from)
  values (v_name, public.validate_system_profile(public.system_template(v_src.document)), 'origin', v_src.campaign_id, null, v_src.id)
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.promote_system(uuid, text) from public, anon, authenticated;
grant execute on function public.promote_system(uuid, text) to authenticated;

create function public.archive_system(p_system_id uuid, p_archived boolean)
returns public.systems
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
  return v_row;
end;
$$;

revoke execute on function public.archive_system(uuid, boolean) from public, anon, authenticated;
grant execute on function public.archive_system(uuid, boolean) to authenticated;

------------------------------------------------------------------------------
-- Campaign requests: the base system
------------------------------------------------------------------------------

-- Same as 20261023120000_campaign_request_branding.sql plus the base-system check (still invoker rights).
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

-- Same as 20261023120000_campaign_request_branding.sql; with a base system the requester must still be allowed to use it, and the new
-- campaign gets a COPY of its document plus the informational based_on_system. Any failure rolls everything back (request stays pending).
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

  if v_req.system_id is not null then
    if not public.system_usable_by(v_req.system_id, v_req.requester_id) then
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

  if v_req.system_id is not null then
    update public.campaigns c set system_profile = v_doc, based_on_system = v_req.system_id where c.id = v_campaign.id;
  end if;

  update public.campaign_requests
  set status = 'approved', decided_by = v_uid, decided_at = now(), campaign_id = v_campaign.id
  where id = v_req.id;

  return v_campaign.slug;
end;
$$;
