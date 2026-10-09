-- H10d2: delete_campaign takes the campaign row lock only AFTER the DM check, plus a comment fix for
-- prepare_campaign_invite. Replaces the function of 20261011130000 (same signature, grants and errors).
--
-- Why: the first version ran `select ... for update` on the campaign row before looking at who was
-- calling, so any authenticated user who guessed a campaign id could make the call wait on (or hold)
-- the row lock of a campaign they have nothing to do with. Now:
--   1. is_campaign_dm is checked first, WITHOUT a lock. A non-DM, a stranger and an unknown id all get
--      the same 'dm_only' (42501) without touching the row, so they neither block nor learn anything;
--   2. only a DM then takes `for update` on the campaign row;
--   3. the DM check is repeated under the lock (a demotion that committed while we waited must win),
--      then the slug is compared, then the row is deleted.
-- protect_last_dm also locks the campaign row (for update) when a DM is demoted or removed, so such a
-- demotion serialises with this delete: whichever takes the lock first finishes, the other re-reads.
-- Every other behaviour and error is unchanged (28000 without a session, slug_mismatch P0001, trimmed
-- case-sensitive slug, cascades as documented in 20261011130000).

create or replace function public.delete_campaign(p_campaign_id uuid, p_confirm_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_slug text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Cheap pre-check, no lock: whoever is not a DM of this campaign stops here.
  if not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;

  select c.slug into v_slug
  from public.campaigns c
  where c.id = p_campaign_id
  for update;

  -- Re-check under the lock: the campaign may have been deleted, or the caller demoted, while waiting.
  if not found or not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;

  if p_confirm_slug is null or btrim(p_confirm_slug) <> v_slug then
    raise exception 'slug_mismatch';
  end if;

  delete from public.campaigns where id = p_campaign_id;
end;
$$;

revoke execute on function public.delete_campaign(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_campaign(uuid, text) to authenticated;

-- prepare_campaign_invite: the header of 20261011120000_invite_limits.sql says the trigger "clamps max_uses to
-- 1..100". The lower bound is really enforced by the table (max_uses integer not null check (max_uses >= 1)); the
-- trigger only clamps the upper bound and keeps uses <= max_uses. Checking it found one real gap: an explicit
-- NULL max_uses never reached the NOT NULL constraint, because least(NULL, 100) ignores the NULL and the clamp
-- silently turned it into 100. The function below is the same as before plus an explicit NULL rejection (23502,
-- what the column would have raised), so NULL, 0 and negatives are all refused instead of NULL becoming 100.

create or replace function public.prepare_campaign_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.max_uses is null then
    raise exception 'max_uses must not be null' using errcode = '23502';
  end if;
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

comment on function public.prepare_campaign_invite() is
  'BEFORE INSERT/UPDATE trigger on campaign_invites. Clamps max_uses to at most 100 (never below uses) and expires_at to at most 365 days after creation (7 days and one use for dm invites), and rejects character invites for an owned character or one with a pending invite. The lower bound (max_uses >= 1) is enforced by the table check, not here; a NULL max_uses is rejected explicitly (23502) because the clamp would otherwise turn it into 100.';
