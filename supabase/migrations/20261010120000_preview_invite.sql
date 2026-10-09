-- H10c: read-only preview of an invite, so the invited user can SEE what they are joining and confirm
-- before accept_invite() consumes a use.
--
-- preview_invite(p_code) -> jsonb
--   {campaign_name, campaign_slug, logo_url, role, character_name, is_member, nothing_to_do}
--
--   * Authenticated callers only (anon has no execute privilege; the function also refuses a null uid).
--   * SECURITY DEFINER with an empty search_path (the caller cannot read campaign_invites, which is
--     DM-only in RLS, nor other members' characters). It performs NO writes, takes NO row locks and
--     never returns the code, other invites, other characters, members or any other campaign data.
--   * What it reveals, and only for a code the caller already holds: the campaign name and slug, the
--     branding logo (https URLs only), the role the invite grants, and, for a claim invite, the NAME of
--     the single character on offer.
--   * Error states mirror accept_invite() exactly and in the same order, so the preview is not a new
--     oracle: invite_not_found, invite_expired, invite_exhausted, character_already_claimed. In those
--     states NO campaign data is returned (an old, expired or used code does not leak the campaign name
--     to its holder). A caller who is already a member with nothing left to claim gets the preview
--     (nothing_to_do = true) regardless of the invite's state, exactly as accept_invite succeeds
--     without side effects for them; they can already read the campaign anyway.
--   * The code is a 122-bit random value, so guessing it is not feasible; this function adds no
--     guessing surface beyond accept_invite().

create function public.preview_invite(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.campaign_invites;
  v_campaign public.campaigns;
  v_is_member boolean;
  v_char_exists boolean := false;
  v_char_owner uuid;
  v_char_name text;
  v_nothing_to_do boolean;
  v_logo text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_invite
  from public.campaign_invites
  where code = btrim(p_code);

  if not found then
    raise exception 'invite_not_found';
  end if;

  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = v_invite.campaign_id and m.user_id = v_uid
  ) into v_is_member;

  if v_invite.character_id is not null then
    select p.owner_id, p.nombre into v_char_owner, v_char_name
    from public.pjs p
    where p.id = v_invite.character_id and p.campaign_id = v_invite.campaign_id;
    v_char_exists := found;
  end if;

  v_nothing_to_do := v_is_member and (not v_char_exists or coalesce(v_char_owner = v_uid, false));

  if not v_nothing_to_do then
    -- Same order as accept_invite: the invite itself first, so an expired/exhausted code never
    -- reveals whether its character is already owned.
    if v_invite.expires_at is not null and v_invite.expires_at <= now() then
      raise exception 'invite_expired';
    end if;
    if v_invite.uses >= v_invite.max_uses then
      raise exception 'invite_exhausted';
    end if;
    if v_char_exists and v_char_owner is not null and v_char_owner <> v_uid then
      raise exception 'character_already_claimed';
    end if;
  end if;

  select * into v_campaign from public.campaigns c where c.id = v_invite.campaign_id;

  -- Only an absolute https URL is handed out as a logo (the client renders it in an <img>).
  v_logo := case
    when jsonb_typeof(v_campaign.branding -> 'logo_url') = 'string' then v_campaign.branding ->> 'logo_url'
    else null
  end;
  if v_logo is not null and (v_logo !~ '^https://[^\s]+$' or length(v_logo) > 2048) then
    v_logo := null;
  end if;

  return jsonb_build_object(
    'campaign_name', v_campaign.name,
    'campaign_slug', v_campaign.slug,
    'logo_url', v_logo,
    'role', v_invite.role,
    'character_name', case when v_char_exists then v_char_name else null end,
    'is_member', v_is_member,
    'nothing_to_do', v_nothing_to_do
  );
end;
$$;

revoke execute on function public.preview_invite(text) from public, anon, authenticated;
grant execute on function public.preview_invite(text) to authenticated;
