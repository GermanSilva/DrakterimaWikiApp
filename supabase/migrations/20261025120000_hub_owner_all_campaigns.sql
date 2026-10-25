-- Hub Owner access to every campaign (DM level), without being a member.
--
-- Decision (user, 2026-10-25): "Como Hub Owner, tengo que tener acceso a todas las campañas, sin necesariamente
-- formar parte de ellas." Access level chosen: full control, like a DM of every campaign.
--
-- How: every RLS policy, guard trigger and RPC of the hub asks `is_campaign_member(cid)` / `is_campaign_dm(cid)`
-- (20261006120200_campaign_hub_security.sql), so the two helpers also answer true for a hub owner and nothing else
-- changes. The hub owner is NOT inserted into campaign_members: the roster, the "last connection" list and the
-- character ownership checks (which read the table directly) keep describing only real members.
--
-- Also here:
--   * shares_campaign_with(): a hub owner can read the profile (name, avatar) of anybody who belongs to at least one
--     campaign, so rosters, author names and the players list render. Somebody who belongs to no campaign stays hidden.
--   * touch_campaign_presence(): records presence for REAL members only. Without this the owner would pass the new
--     member check and show up in the DM's "last connection" list of every campaign they browse.
--
-- Security notes
--   * The privilege list is hub_owners, which nobody can write through the API (see 20261012120000_hub_owner_requests.sql).
--   * The helpers stay SECURITY DEFINER with an empty search_path; the new branch is an inline EXISTS on hub_owners
--     (not a call to is_hub_owner()) so it adds one indexed lookup per check and no extra function call.
--   * Deleting a campaign still needs the slug confirmation (delete_campaign), also for the owner.

create or replace function public.is_campaign_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members m
    where m.campaign_id = cid
      and m.user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.hub_owners h
    where h.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_campaign_dm(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members m
    where m.campaign_id = cid
      and m.user_id = (select auth.uid())
      and m.role = 'dm'
  ) or exists (
    select 1
    from public.hub_owners h
    where h.user_id = (select auth.uid())
  );
$$;

create or replace function public.shares_campaign_with(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members a
    join public.campaign_members b on b.campaign_id = a.campaign_id
    where a.user_id = (select auth.uid())
      and b.user_id = uid
  ) or (
    exists (select 1 from public.hub_owners h where h.user_id = (select auth.uid()))
    and exists (select 1 from public.campaign_members b where b.user_id = uid)
  );
$$;

create or replace function public.touch_campaign_presence(p_campaign_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  -- A real membership row, not is_campaign_member(): a hub owner browsing a campaign leaves no trace.
  if uid is null or not exists (
    select 1 from public.campaign_members m where m.campaign_id = p_campaign_id and m.user_id = uid
  ) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  insert into public.campaign_presence as cp (campaign_id, user_id, last_seen_at)
  values (p_campaign_id, uid, now())
  on conflict (campaign_id, user_id)
  do update set last_seen_at = excluded.last_seen_at
  where cp.last_seen_at < now() - interval '5 minutes';
end;
$$;

-- create or replace keeps the existing privileges; restated so the file is self-explanatory.
revoke execute on function public.touch_campaign_presence(uuid) from public, anon, authenticated;
grant execute on function public.touch_campaign_presence(uuid) to authenticated;
