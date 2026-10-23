-- Campaign branding at request / creation time: tagline (the "Lema", shown above the campaign name), accent colour
-- and logo URL.
--
--   a) campaign_requests gains tagline, accent_color and logo_url (all optional). The requester may insert them
--      (column grants); nobody can UPDATE them afterwards (the table has no UPDATE grant). They are sanitised and
--      validated in the existing BEFORE INSERT trigger and by CHECK constraints.
--   b) create_campaign_for() takes a p_branding jsonb, validates it (the single place that builds
--      campaigns.branding for new campaigns) and stores only the three known keys, without null values. The previous
--      three-argument overload is dropped so no caller can skip the validation. It stays not executable through the
--      API.
--   c) create_campaign() (hub owners) takes the three optional values; calls with only (slug, name) keep working.
--   d) approve_campaign_request() copies the request's branding into the new campaign.
--
-- Validation rules mirror the app (src/campaign/branding.ts): accent colour strict #rrggbb, logo an absolute https
-- URL of at most 500 characters without whitespace, tagline at most 140 characters.
-- New errors (23514): invalid_tagline, invalid_accent_color, invalid_logo_url.

------------------------------------------------------------------------------
-- a) request columns, privileges and sanitising
------------------------------------------------------------------------------

alter table public.campaign_requests
  add column tagline text check (char_length(tagline) <= 140),
  add column accent_color text check (accent_color ~ '^#[0-9a-f]{6}$'),
  add column logo_url text check (char_length(logo_url) <= 500 and logo_url ~ '^https://[^[:space:]]+$');

grant insert (tagline, accent_color, logo_url) on public.campaign_requests to authenticated;
grant select (tagline, accent_color, logo_url) on public.campaign_requests to authenticated;

-- Same behaviour as before for name / slug_wanted / message and the two caps; the new text columns are sanitised the
-- same way (control, bidi and zero-width characters stripped) and blank values become null.
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

------------------------------------------------------------------------------
-- b) the internal creator validates and stores the branding
------------------------------------------------------------------------------

drop function public.create_campaign_for(uuid, text, text);

create function public.create_campaign_for(p_dm uuid, p_slug text, p_name text, p_branding jsonb default '{}'::jsonb)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_name);
  v_tagline text := nullif(btrim(public.strip_control_chars(p_branding ->> 'tagline')), '');
  v_accent text := nullif(lower(btrim(public.strip_control_chars(p_branding ->> 'accent_color'))), '');
  v_logo text := nullif(btrim(public.strip_control_chars(p_branding ->> 'logo_url')), '');
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
  if v_tagline is not null and char_length(v_tagline) > 140 then
    raise exception 'invalid_tagline' using errcode = '23514';
  end if;
  if v_accent is not null and v_accent !~ '^#[0-9a-f]{6}$' then
    raise exception 'invalid_accent_color' using errcode = '23514';
  end if;
  if v_logo is not null and (char_length(v_logo) > 500 or v_logo !~ '^https://[^[:space:]]+$') then
    raise exception 'invalid_logo_url' using errcode = '23514';
  end if;

  if (select count(*) from public.campaigns c where c.created_by = p_dm) >= 20 then
    raise exception 'campaign_limit_reached';
  end if;

  begin
    insert into public.campaigns (slug, name, created_by, branding)
    values (
      v_slug, v_name, p_dm,
      jsonb_strip_nulls(jsonb_build_object('tagline', v_tagline, 'accent_color', v_accent, 'logo_url', v_logo))
    )
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

revoke execute on function public.create_campaign_for(uuid, text, text, jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------
-- c) direct creation by a hub owner
------------------------------------------------------------------------------

drop function public.create_campaign(text, text);

create function public.create_campaign(
  p_slug text,
  p_name text,
  p_tagline text default null,
  p_accent_color text default null,
  p_logo_url text default null
)
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
  return public.create_campaign_for(
    v_uid, p_slug, p_name,
    jsonb_build_object('tagline', p_tagline, 'accent_color', p_accent_color, 'logo_url', p_logo_url)
  );
end;
$$;

revoke execute on function public.create_campaign(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_campaign(text, text, text, text, text) to authenticated;

------------------------------------------------------------------------------
-- d) approval carries the request's branding
------------------------------------------------------------------------------

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
    coalesce(nullif(btrim(p_name), ''), v_req.name),
    jsonb_build_object('tagline', v_req.tagline, 'accent_color', v_req.accent_color, 'logo_url', v_req.logo_url)
  );

  update public.campaign_requests
  set status = 'approved', decided_by = v_uid, decided_at = now(), campaign_id = v_campaign.id
  where id = v_req.id;

  return v_campaign.slug;
end;
$$;
