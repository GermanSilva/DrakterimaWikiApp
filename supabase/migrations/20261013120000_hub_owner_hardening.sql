-- H15b: hardening of the hub-owner / campaign-request model (findings of the H15 security sweep).
--
--   a) campaigns.slug is immutable through the API: the `update (slug)` column grant is revoked (decision 9,
--      slug locked). Before this a DM could PATCH the slug of an owner-approved campaign to a reserved or
--      look-alike value. Defence in depth: the reserved list lives in ONE helper, is_reserved_slug(), used by
--      create_campaign_for() and the request trigger.
--   b) decided_by is no longer readable through the API (column-level SELECT): neither the requester nor the
--      owner's UI needs it, and it would let a requester learn which account decided.
--   c) prepare_campaign_request() runs as SECURITY INVOKER: it only reads the caller's own rows (RLS applies).
--   d) policies call is_hub_owner() as (select ...) so it is evaluated once per statement, not per row.
--   e) rolling cap: at most 10 requests per user in 24 hours counting every status, on top of 3 pending.
--      The cap is serialised by a per-user advisory lock. That is only sound under READ COMMITTED (the default
--      here): the count is taken after the lock is acquired, with a fresh snapshot per statement. Under
--      REPEATABLE READ / SERIALIZABLE the snapshot would predate the lock and two concurrent inserts could
--      both pass. Cancelled requests are deleted, so they are NOT counted: the pending cap bounds the live
--      requests, the rolling cap bounds decided + live ones.
--   f) Unicode control / bidi / zero-width characters are stripped from name, slug_wanted, message (newline and
--      tab kept) and decision_note, so an owner is never shown text that renders differently from what it is.
--
-- New error: too_many_requests_recently (P0001).

------------------------------------------------------------------------------
-- a) slug locked + shared reserved-slug helper
------------------------------------------------------------------------------

revoke update (slug) on public.campaigns from authenticated;

create function public.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(btrim(p_slug)) in ('admin', 'api', 'app', 'auth', 'login', 'logout', 'settings', 'new', 'c', 'www',
                                  'help', 'static', 'assets');
$$;

-- Pure and harmless, but the invoker-rights request trigger calls it as the user, so authenticated needs it.
revoke execute on function public.is_reserved_slug(text) from public, anon;
grant execute on function public.is_reserved_slug(text) to authenticated;

-- Strips control, bidi-override/isolate and zero-width characters. p_keep_newlines keeps \t \n \r (free text).
create function public.strip_control_chars(p_text text, p_keep_newlines boolean default false)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_keep_newlines
    then regexp_replace(p_text, '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f­؜​-‏ -‮⁠-⁯﻿]', '', 'g')
    else regexp_replace(p_text, '[\u0001-\u001f\u007f-\u009f­؜​-‏ -‮⁠-⁯﻿]', '', 'g')
  end;
$$;

revoke execute on function public.strip_control_chars(text, boolean) from public, anon;
grant execute on function public.strip_control_chars(text, boolean) to authenticated;

-- create_campaign_for: identical behaviour, the reserved list now comes from is_reserved_slug().
create or replace function public.create_campaign_for(p_dm uuid, p_slug text, p_name text)
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
  if public.is_reserved_slug(v_slug) then
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

------------------------------------------------------------------------------
-- c, e, f) request trigger: invoker rights, sanitising, pending cap + rolling cap
------------------------------------------------------------------------------

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

  if public.is_reserved_slug(new.slug_wanted) then
    raise exception 'reserved_slug';
  end if;

  -- Serialises concurrent inserts of the same user. The counts below rely on READ COMMITTED (see header).
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

-- reject_campaign_request: same behaviour, decision_note is sanitised.
create or replace function public.reject_campaign_request(p_request_id bigint, p_note text default null)
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
  set status = 'rejected', decided_by = v_uid, decided_at = now(),
      decision_note = nullif(btrim(public.strip_control_chars(p_note, true)), '')
  where id = p_request_id;
end;
$$;

------------------------------------------------------------------------------
-- b) decided_by is not readable through the API
------------------------------------------------------------------------------

revoke select on public.campaign_requests from authenticated;
grant select (id, requester_id, name, slug_wanted, message, status, decision_note, decided_at, campaign_id,
              created_at, updated_at)
  on public.campaign_requests to authenticated;

------------------------------------------------------------------------------
-- d) is_hub_owner() evaluated once per statement
------------------------------------------------------------------------------

alter policy campaign_requests_select on public.campaign_requests
  using (requester_id = (select auth.uid()) or (select public.is_hub_owner()));

alter policy profiles_select_requesters_for_hub_owner on public.profiles
  using (
    (select public.is_hub_owner())
    and exists (select 1 from public.campaign_requests r where r.requester_id = profiles.id)
  );
