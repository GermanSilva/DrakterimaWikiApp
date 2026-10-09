-- H10c2: server-side limits for player and claim invites (the Ajustes form already enforces them; the
-- database must not rely on the client).
--
--   * max_uses is clamped to 1..100 for every role (a 'dm' invite is still forced to 1 below);
--   * expires_at is mandatory and at most 365 days after the invite was created: a missing or later
--     date is clamped, an earlier one is kept. 'dm' invites keep their stricter 7 days.
--
-- Why a trigger-side clamp and not a CHECK constraint: it is the style of prepare_campaign_invite for
-- 'dm' invites, it never rejects a request that merely asked for too much (the DM still gets a working
-- invite), and it cannot break existing rows or tests, because the trigger only fires on INSERT or on
-- UPDATE of role/max_uses/expires_at/character_id, so untouched legacy rows stay as they are. A CHECK
-- (even NOT VALID) would also reject any later UPDATE of a legacy row that has no expiry.
-- max_uses is never clamped below the uses already consumed, to keep `uses <= max_uses` true.

create or replace function public.prepare_campaign_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.max_uses := greatest(least(new.max_uses, 100), new.uses);
  new.expires_at := least(
    coalesce(new.expires_at, 'infinity'::timestamptz),
    coalesce(new.created_at, now()) + interval '365 days'
  );

  if new.role = 'dm' then
    new.max_uses := 1;
    new.expires_at := least(
      coalesce(new.expires_at, 'infinity'::timestamptz),
      coalesce(new.created_at, now()) + interval '7 days'
    );
  end if;

  if tg_op = 'INSERT' and new.character_id is not null then
    if exists (
      select 1 from public.pjs p
      where p.id = new.character_id and p.campaign_id = new.campaign_id and p.owner_id is not null
    ) then
      raise exception 'character_already_owned' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.campaign_invites i
      where i.character_id = new.character_id
        and i.id <> new.id
        and i.uses < i.max_uses
        and (i.expires_at is null or i.expires_at > now())
    ) then
      raise exception 'character_already_has_pending_invite' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
