-- H9e: "last connection" of every campaign member, visible to the campaign's DM only.
--
--   * `campaign_presence` keeps ONE row per (campaign, user): the last time that member opened the
--     campaign in a client (the app calls `touch_campaign_presence` on open and on focus).
--   * Privacy boundary:
--       - SELECT: the DM of the campaign only. A player cannot read any row, not even their own, and
--         the DM of another campaign cannot read it either.
--       - There is NO insert / update / delete privilege for `authenticated` (or anyone): rows are
--         written exclusively by the SECURITY DEFINER RPC below, which can only ever write the row of
--         the caller (auth.uid()), so nobody can forge or erase another member's presence.
--   * Server-side throttle: a touch is a no-op while the stored value is newer than 5 minutes, so a
--     chatty client cannot turn this into a write-heavy heartbeat.
--   * Not published to realtime (the DM reads it on demand; no live presence feed is exposed).
--   * Players are told the DM can see their last connection (shown in the Ajustes page).

create table public.campaign_presence (
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index campaign_presence_user_id_idx on public.campaign_presence (user_id);

comment on table public.campaign_presence is
  'Last time each member opened the campaign. Readable by the campaign DM only; written only by touch_campaign_presence().';

alter table public.campaign_presence enable row level security;

create policy campaign_presence_select on public.campaign_presence
  for select to authenticated
  using (public.is_campaign_dm(campaign_id));

-- No insert / update / delete policy AND no privilege: the RPC (owner = table owner) is the only writer.
revoke all on public.campaign_presence from anon, authenticated;
grant select on public.campaign_presence to authenticated;

create function public.touch_campaign_presence(p_campaign_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not public.is_campaign_member(p_campaign_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  -- Insert the first sighting; afterwards only move the timestamp forward when the stored one is
  -- older than the throttle window (the WHERE makes a recent touch a no-op, with no row rewrite).
  insert into public.campaign_presence as cp (campaign_id, user_id, last_seen_at)
  values (p_campaign_id, uid, now())
  on conflict (campaign_id, user_id)
  do update set last_seen_at = excluded.last_seen_at
  where cp.last_seen_at < now() - interval '5 minutes';
end;
$$;

revoke execute on function public.touch_campaign_presence(uuid) from public, anon, authenticated;
grant execute on function public.touch_campaign_presence(uuid) to authenticated;
