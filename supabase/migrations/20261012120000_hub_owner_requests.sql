-- H15: Hub Owner + campaign requests.
--
-- Product rule: only a "Hub Owner" can create campaigns directly. Everybody else REQUESTS one; the Hub
-- Owner approves manually and the campaign is created with the REQUESTER as its DM. Joining an existing
-- campaign through an invite is unchanged. No emails are sent: the requester sees the status in the app.
--
-- Privilege model (read this before touching it):
--   * hub_owners is the allow-list. NOBODY can write it through the API (no insert/update/delete
--     privilege and no policy for anon/authenticated): owners are assigned by the project owner with
--     service_role, a migration or the Supabase SQL editor (see docs/hosting-and-cutover.md). A user can
--     read only their own row (so the app knows whether to show the owner UI; the DB enforces anyway).
--   * is_hub_owner() is the single check used by policies and RPCs.
--   * campaign_requests: a requester reads/creates/cancels their OWN requests; owners read all. Nobody has
--     an UPDATE privilege: a request changes state only through approve_campaign_request /
--     reject_campaign_request (SECURITY DEFINER, owner only).
--   * Campaign creation has ONE implementation, create_campaign_for(), which is not executable by API
--     roles. It is reached only from create_campaign (hub owner, caller becomes DM) and
--     approve_campaign_request (hub owner, requester becomes DM). campaigns has no INSERT privilege.
--
-- Errors (message / SQLSTATE): hub_owner_only (42501); request_not_found, request_not_pending,
-- too_many_pending_requests, reserved_slug, campaign_limit_reached (P0001); invalid_slug / invalid_name (23514); slug_taken (23505).

------------------------------------------------------------------------------
-- hub_owners
------------------------------------------------------------------------------

create table public.hub_owners (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.hub_owners is
  'Platform privilege: users who can create campaigns directly and decide campaign requests. Written only by the project owner (service_role / SQL editor / migrations), never through the API.';

alter table public.hub_owners enable row level security;

create policy hub_owners_select_own on public.hub_owners
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.hub_owners from anon, authenticated;
grant select on public.hub_owners to authenticated;

create function public.is_hub_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hub_owners h where h.user_id = (select auth.uid()));
$$;

revoke execute on function public.is_hub_owner() from public, anon, authenticated;
grant execute on function public.is_hub_owner() to authenticated;

------------------------------------------------------------------------------
-- campaign_requests
------------------------------------------------------------------------------

create table public.campaign_requests (
  id          bigint generated always as identity primary key,
  requester_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  slug_wanted text check (slug_wanted ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug_wanted) between 3 and 40),
  message     text check (char_length(message) <= 1000),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_note text check (char_length(decision_note) <= 500),
  decided_by  uuid references public.profiles (id) on delete set null,
  decided_at  timestamptz,
  campaign_id uuid references public.campaigns (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index campaign_requests_requester_idx on public.campaign_requests (requester_id);
create index campaign_requests_status_idx on public.campaign_requests (status, created_at);

comment on table public.campaign_requests is
  'Requests for a new campaign. Created by the requester, decided only by a hub owner through approve/reject_campaign_request().';

create trigger campaign_requests_set_updated_at
  before update on public.campaign_requests
  for each row execute function public.set_updated_at();

-- Normalises the typed values and caps the pending requests per user (anti-spam). The advisory lock
-- serialises two concurrent inserts of the same user, so the cap cannot be beaten by a race.
create function public.prepare_campaign_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.slug_wanted := nullif(lower(btrim(new.slug_wanted)), '');
  new.message := nullif(btrim(new.message), '');

  if new.slug_wanted in ('admin', 'api', 'app', 'auth', 'login', 'logout', 'settings', 'new', 'c', 'www',
                         'help', 'static', 'assets') then
    raise exception 'reserved_slug';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('campaign_requests:' || new.requester_id::text, 0));
  if (select count(*) from public.campaign_requests r
      where r.requester_id = new.requester_id and r.status = 'pending') >= 3 then
    raise exception 'too_many_pending_requests';
  end if;
  return new;
end;
$$;

revoke execute on function public.prepare_campaign_request() from public, anon, authenticated;

create trigger campaign_requests_prepare
  before insert on public.campaign_requests
  for each row execute function public.prepare_campaign_request();

alter table public.campaign_requests enable row level security;

create policy campaign_requests_select on public.campaign_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or public.is_hub_owner());

create policy campaign_requests_insert_own on public.campaign_requests
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');

-- Cancel: the requester deletes their own request while it is still pending.
create policy campaign_requests_delete_own_pending on public.campaign_requests
  for delete to authenticated
  using (requester_id = (select auth.uid()) and status = 'pending');

-- No UPDATE policy and no UPDATE privilege: decisions go through the RPCs below.
revoke all on public.campaign_requests from anon, authenticated;
grant select, delete on public.campaign_requests to authenticated;
grant insert (name, slug_wanted, message) on public.campaign_requests to authenticated;

-- The owner's inbox shows who asked: a hub owner may read the profile of anybody with a request.
create policy profiles_select_requesters_for_hub_owner on public.profiles
  for select to authenticated
  using (
    public.is_hub_owner()
    and exists (select 1 from public.campaign_requests r where r.requester_id = profiles.id)
  );

------------------------------------------------------------------------------
-- The single campaign-creation implementation (not callable through the API)
------------------------------------------------------------------------------
-- Validates the slug and the name, enforces the reserved list and the per-DM cap, creates the campaign,
-- makes p_dm its DM and seeds game_pot + the lottery config. Callers MUST have authorised the action.
-- The cap of 20 campaigns per DM is kept as a safety net (the hub owner is the real gate now): it stops
-- a runaway script, and an owner who needs more can lift it with a one-line migration.

create function public.create_campaign_for(p_dm uuid, p_slug text, p_name text)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_name);
  v_campaign public.campaigns;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 40 then
    raise exception 'invalid_slug' using errcode = '23514';
  end if;
  if v_slug in ('admin', 'api', 'app', 'auth', 'login', 'logout', 'settings', 'new', 'c', 'www',
                'help', 'static', 'assets') then
    raise exception 'reserved_slug';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 120 then
    raise exception 'invalid_name' using errcode = '23514';
  end if;

  if (select count(*) from public.campaigns c where c.created_by = p_dm) >= 20 then
    raise exception 'campaign_limit_reached';
  end if;

  begin
    insert into public.campaigns (slug, name, created_by)
    values (v_slug, v_name, p_dm)
    returning * into v_campaign;
  exception when unique_violation then
    raise exception 'slug_taken' using errcode = '23505';
  end;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign.id, p_dm, 'dm');

  insert into public.game_pot (campaign_id) values (v_campaign.id);

  insert into public.campaign_config (campaign_id, key, value, visibility)
  values (
    v_campaign.id, 'loteria',
    jsonb_build_object(
      'commonMinRoll', 17,
      'commonPrize', jsonb_build_object('cp', 3, 'sp', 0, 'ep', 0, 'gp', 0, 'pp', 0),
      'specialPrize', jsonb_build_object('cp', 0, 'sp', 1, 'ep', 0, 'gp', 0, 'pp', 0)
    ),
    'members'
  );

  return v_campaign;
end;
$$;

revoke execute on function public.create_campaign_for(uuid, text, text) from public, anon, authenticated;

-- Direct creation is now for hub owners only; the caller becomes the DM, as before.
create or replace function public.create_campaign(p_slug text, p_name text)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_hub_owner() then
    raise exception 'hub_owner_only' using errcode = '42501';
  end if;
  return public.create_campaign_for(v_uid, p_slug, p_name);
end;
$$;

revoke execute on function public.create_campaign(text, text) from public, anon, authenticated;
grant execute on function public.create_campaign(text, text) to authenticated;

------------------------------------------------------------------------------
-- Decisions
------------------------------------------------------------------------------

-- Approves a pending request: creates the campaign with the REQUESTER as DM and marks the request.
-- p_slug / p_name override what was asked for. Returns the campaign slug. Any failure (slug taken,
-- reserved, invalid, requester over the cap) rolls everything back, so the request stays pending.
create function public.approve_campaign_request(p_request_id bigint, p_slug text default null, p_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.campaign_requests;
  v_campaign public.campaigns;
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

  v_campaign := public.create_campaign_for(
    v_req.requester_id,
    coalesce(nullif(btrim(p_slug), ''), v_req.slug_wanted),
    coalesce(nullif(btrim(p_name), ''), v_req.name)
  );

  update public.campaign_requests
  set status = 'approved', decided_by = v_uid, decided_at = now(), campaign_id = v_campaign.id
  where id = v_req.id;

  return v_campaign.slug;
end;
$$;

revoke execute on function public.approve_campaign_request(bigint, text, text) from public, anon, authenticated;
grant execute on function public.approve_campaign_request(bigint, text, text) to authenticated;

create function public.reject_campaign_request(p_request_id bigint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_hub_owner() then
    raise exception 'hub_owner_only' using errcode = '42501';
  end if;

  select status into v_status from public.campaign_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found';
  end if;
  if v_status <> 'pending' then
    raise exception 'request_not_pending';
  end if;

  update public.campaign_requests
  set status = 'rejected', decided_by = v_uid, decided_at = now(), decision_note = nullif(btrim(p_note), '')
  where id = p_request_id;
end;
$$;

revoke execute on function public.reject_campaign_request(bigint, text) from public, anon, authenticated;
grant execute on function public.reject_campaign_request(bigint, text) to authenticated;
