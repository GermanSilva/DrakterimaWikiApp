-- Anonymous campaign preview for the login page reached from an /invite/:code link.
--
-- preview_invite_public(p_code) -> jsonb
--   {campaign_name, logo_url, banner_url, accent_color, tagline, expires_at}
--
--   * Executable by anon and authenticated: the visitor is not signed in yet. It is a strict subset of what
--     preview_invite() shows a signed-in holder of the same code, minus anything about people: no slug, role,
--     character, DM, members or count. preview_invite() itself stays authenticated-only.
--   * SECURITY DEFINER with an empty search_path (anon cannot read campaign_invites or campaigns). It performs NO
--     writes and takes NO row locks.
--   * Error states are accept_invite()'s for a non-member, in the same order: invite_not_found, invite_expired,
--     invite_exhausted, character_already_claimed. In those states NO campaign data is returned.
--   * Images are handed out only as absolute https URLs (<= 2048 chars), the accent only as #rrggbb (lowercased)
--     and the tagline only as trimmed non-empty text (<= 140 chars); anything else becomes null.
--   * The code is a 122-bit random value, so this adds no practical guessing surface.

create function public.preview_invite_public(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.campaign_invites;
  v_branding jsonb;
  v_char_exists boolean := false;
  v_char_owner uuid;
  v_logo text;
  v_banner text;
  v_accent text;
  v_tagline text;
begin
  select * into v_invite
  from public.campaign_invites
  where code = btrim(p_code);

  if not found then
    raise exception 'invite_not_found';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'invite_expired';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_exhausted';
  end if;
  if v_invite.character_id is not null then
    select p.owner_id into v_char_owner
    from public.pjs p
    where p.id = v_invite.character_id and p.campaign_id = v_invite.campaign_id;
    v_char_exists := found;
    if v_char_exists and v_char_owner is not null then
      raise exception 'character_already_claimed';
    end if;
  end if;

  select c.branding into v_branding from public.campaigns c where c.id = v_invite.campaign_id;

  v_logo := case when jsonb_typeof(v_branding -> 'logo_url') = 'string' then v_branding ->> 'logo_url' end;
  if v_logo is not null and (v_logo !~ '^https://[^\s]+$' or length(v_logo) > 2048) then
    v_logo := null;
  end if;

  v_banner := case when jsonb_typeof(v_branding -> 'banner_url') = 'string' then v_branding ->> 'banner_url' end;
  if v_banner is not null and (v_banner !~ '^https://[^\s]+$' or length(v_banner) > 2048) then
    v_banner := null;
  end if;

  v_accent := case when jsonb_typeof(v_branding -> 'accent_color') = 'string' then v_branding ->> 'accent_color' end;
  v_accent := case when v_accent ~ '^#[0-9a-fA-F]{6}$' then lower(v_accent) end;

  v_tagline := case when jsonb_typeof(v_branding -> 'tagline') = 'string' then btrim(v_branding ->> 'tagline') end;
  v_tagline := case when v_tagline is null or v_tagline = '' then null else left(v_tagline, 140) end;

  return jsonb_build_object(
    'campaign_name', (select c.name from public.campaigns c where c.id = v_invite.campaign_id),
    'logo_url', v_logo,
    'banner_url', v_banner,
    'accent_color', v_accent,
    'tagline', v_tagline,
    'expires_at', v_invite.expires_at
  );
end;
$$;

revoke execute on function public.preview_invite_public(text) from public, anon, authenticated;
grant execute on function public.preview_invite_public(text) to anon, authenticated;
