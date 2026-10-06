-- Campaign hub, part 3/3: authorization helpers, guard triggers, RPCs, RLS, grants, realtime.
--
-- DRAFT: not executed yet (no Docker). Verify with `supabase db reset` + `supabase test db`.
--
-- Authorization model
--   * Every table has RLS enabled. Access is granted only to the `authenticated` role (no anon grants).
--   * Membership/role/ownership checks go through the SECURITY DEFINER helpers below, so policies never
--     query RLS-protected tables recursively. Helpers use `set search_path = ''` and qualified names.
--   * Entities: DM sees everything; members see 'publicado'; 'secreto' only when one of the caller's own
--     characters is in visible_to; 'borrador' is DM-only; non-members see nothing.
--   * Entity writes are DM-only, with two narrow exceptions enforced here and not in the UI:
--       - a PJ owner may edit identity fields of their own character (guard_pj_player_update);
--       - players change coin balances only through play_loteria() (SECURITY DEFINER); coins live in
--         the pjs.monedas / monedas_guardado columns, which the guard rejects for non-DMs.
--   * Performance note: policies call the helpers with row-dependent arguments (campaign_id, estado,
--     visible_to), so they cannot be hoisted into an initplan `(select fn(...))`; only auth.uid() is
--     wrapped (inside the helpers). Moving the helpers to a `private` schema was NOT done: policies
--     run with the caller privileges and need EXECUTE on them anyway, and the move adds risk for no
--     gain here. The helpers are still not callable by anon, and are indexed by campaign_id/owner.

------------------------------------------------------------------------------
-- Helper functions
------------------------------------------------------------------------------

create function public.is_campaign_member(cid uuid)
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
  );
$$;

create function public.is_campaign_dm(cid uuid)
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
  );
$$;

-- Ids of the characters the caller owns in a campaign.
create function public.my_character_ids(cid uuid)
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.id), '{}'::bigint[])
  from public.pjs p
  where p.campaign_id = cid
    and p.owner_id = (select auth.uid());
$$;

-- The single visibility rule used by every entity SELECT policy.
create function public.can_see_entity(cid uuid, estado text, visible_to bigint[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_campaign_dm(cid)
    or (
      public.is_campaign_member(cid)
      and (
        estado = 'publicado'
        or (estado = 'secreto' and visible_to && public.my_character_ids(cid))
      )
    );
$$;

-- True when the caller and `uid` are members of at least one common campaign.
create function public.shares_campaign_with(uid uuid)
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
  );
$$;

-- Safe integer parse: anything that is not 1-15 digits (negative, decimal, text, null, huge) is 0,
-- so a malformed config or payload can never raise a cast error or overflow a balance.
create function public.coin_value(v text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when v ~ '^[0-9]{1,15}$' then v::bigint else 0 end;
$$;

-- Normalises a coin object to {cp, sp, ep, gp, pp} non-negative integers.
create function public.coin_amounts(src jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'cp', public.coin_value(src ->> 'cp'),
    'sp', public.coin_value(src ->> 'sp'),
    'ep', public.coin_value(src ->> 'ep'),
    'gp', public.coin_value(src ->> 'gp'),
    'pp', public.coin_value(src ->> 'pp')
  );
$$;

------------------------------------------------------------------------------
-- Guard triggers
------------------------------------------------------------------------------

-- Non-DM users may only change the identity subset of their own character. Everything else
-- (mechanics, inventory, coins, level, XP, estado, visible_to, owner_id, DM data) is rejected.
--
-- Allowed subset, taken from the current player-edit UI (PJForm with isOwnPlayer: only the
-- "Identidad" tab; nivel and experiencia are hidden for the owner; notas/estado are DM-only):
--   columns: nombre, jugador, clase, raza, region, imagen_url
--   data keys: trasfondo_dnd, alineamiento, edad, altura, peso, ojos, piel, pelo, apariencia,
--              personalidad, ideales, vinculos, defectos, trasfondo, motivo, custom_fields
--              (custom_fields replaces the hard-coded `magralita` field)
-- sections_updated is allowed too: it is only UI metadata for unread dots, maintained by the client
-- today. TODO(H8): derive it in a trigger instead and drop it from this list.
--
-- Roles that bypass the check: the DM of the campaign, and callers running as the table owner or
-- service_role (SECURITY DEFINER RPCs, the Firestore import script). Everyone else is checked,
-- so a new role is restricted by default.
create function public.guard_pj_player_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed_columns constant text[] := array[
    'nombre', 'jugador', 'clase', 'raza', 'region', 'imagen_url',
    'data', 'sections_updated', 'updated_at'
  ];
  allowed_data_keys constant text[] := array[
    'trasfondo_dnd', 'alineamiento', 'edad', 'altura', 'peso', 'ojos', 'piel', 'pelo',
    'apariencia', 'personalidad', 'ideales', 'vinculos', 'defectos', 'trasfondo', 'motivo',
    'custom_fields'
  ];
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if public.is_campaign_dm(old.campaign_id) then
    return new;
  end if;

  if (to_jsonb(new) - allowed_columns) is distinct from (to_jsonb(old) - allowed_columns)
     or (new.data - allowed_data_keys) is distinct from (old.data - allowed_data_keys)
  then
    raise exception 'players may only edit identity fields of their own character'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger pjs_guard_player_update
  before update on public.pjs
  for each row execute function public.guard_pj_player_update();

-- A character can only be owned by a member of its campaign.
create function public.check_pj_owner_is_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is not null and not exists (
    select 1
    from public.campaign_members m
    where m.campaign_id = new.campaign_id
      and m.user_id = new.owner_id
  ) then
    raise exception 'character owner must be a member of the campaign' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger pjs_check_owner_is_member
  before insert or update of owner_id on public.pjs
  for each row execute function public.check_pj_owner_is_member();

-- Leaving (or being removed from) a campaign releases the user's characters.
create function public.release_characters_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pjs
  set owner_id = null
  where campaign_id = old.campaign_id
    and owner_id = old.user_id;
  return old;
end;
$$;

create trigger campaign_members_release_characters
  after delete on public.campaign_members
  for each row execute function public.release_characters_on_leave();

-- entity_dm_notes.entity_id is polymorphic: make sure it points to a row of the same campaign.
create function public.validate_dm_note_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_exists boolean;
begin
  execute format(
    'select exists (select 1 from public.%I where id = $1 and campaign_id = $2)',
    new.entity_type)
  into target_exists
  using new.entity_id, new.campaign_id;

  if not target_exists then
    raise exception 'entity % % does not exist in this campaign', new.entity_type, new.entity_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger entity_dm_notes_validate_target
  before insert or update of entity_type, entity_id, campaign_id on public.entity_dm_notes
  for each row execute function public.validate_dm_note_target();

------------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER; callable by authenticated users only)
------------------------------------------------------------------------------

-- Invite normalisation and sanity checks (SECURITY DEFINER so it can read pjs regardless of RLS).
--   * a 'dm' invite is always single-use and expires after 7 days unless the DM set an earlier date
--     (a leaked DM code is a full takeover, so it must be short-lived);
--   * a character invite cannot target a character that is already owned, nor one that already has
--     another live (unconsumed, unexpired) invite.
create function public.prepare_campaign_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'dm' then
    new.max_uses := 1;
    new.expires_at := coalesce(new.expires_at, now() + interval '7 days');
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

create trigger campaign_invites_prepare
  before insert or update of role, max_uses, expires_at, character_id on public.campaign_invites
  for each row execute function public.prepare_campaign_invite();

-- Creates a campaign and makes the caller its DM. Also seeds the pot and the lottery config.
-- Abuse limits: at most 20 campaigns created per user, and a reserved slug list (future routes).
-- Errors (message): reserved_slug, campaign_limit_reached.
create function public.create_campaign(p_slug text, p_name text)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_slug text := lower(btrim(p_slug));
  v_campaign public.campaigns;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if v_slug in ('admin', 'api', 'app', 'auth', 'login', 'logout', 'settings', 'new', 'c', 'www',
                'help', 'static', 'assets') then
    raise exception 'reserved_slug';
  end if;

  if (select count(*) from public.campaigns c where c.created_by = v_uid) >= 20 then
    raise exception 'campaign_limit_reached';
  end if;

  insert into public.campaigns (slug, name, created_by)
  values (v_slug, btrim(p_name), v_uid)
  returning * into v_campaign;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign.id, v_uid, 'dm');

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

-- Redeems an invite code (trimmed). Returns
--   {joined, claimed, campaign_id, slug, role, character_id}
-- joined  = this call created the membership; claimed = this call took ownership of the character.
-- Idempotent for existing members: replaying a code never changes their role or consumes another
-- use, except that it may still claim an unclaimed character.
-- The invite row and the character row are locked (`for update`) and the claim is a conditional
-- update, so two concurrent redemptions cannot both take the same character.
-- Errors (message): invite_not_found, invite_expired, invite_exhausted, character_already_claimed.
create function public.accept_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.campaign_invites;
  v_slug text;
  v_role text;
  v_is_member boolean;
  v_char_exists boolean := false;
  v_char_owner uuid;
  v_joined boolean := false;
  v_claimed boolean := false;
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_invite
  from public.campaign_invites
  where code = btrim(p_code)
  for update;

  if not found then
    raise exception 'invite_not_found';
  end if;

  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = v_invite.campaign_id and m.user_id = v_uid
  ) into v_is_member;

  if v_invite.character_id is not null then
    select p.owner_id into v_char_owner
    from public.pjs p
    where p.id = v_invite.character_id and p.campaign_id = v_invite.campaign_id
    for update;
    v_char_exists := found;
  end if;

  -- Existing member with nothing left to claim: succeed without side effects.
  if not (v_is_member and (not v_char_exists or coalesce(v_char_owner = v_uid, false))) then
    -- Validate the invite itself first, so an expired/exhausted code never reveals
    -- whether its character is already owned.
    if v_invite.expires_at is not null and v_invite.expires_at <= now() then
      raise exception 'invite_expired';
    end if;
    if v_invite.uses >= v_invite.max_uses then
      raise exception 'invite_exhausted';
    end if;
    if v_char_exists and v_char_owner is not null and v_char_owner <> v_uid then
      raise exception 'character_already_claimed';
    end if;

    if not v_is_member then
      insert into public.campaign_members (campaign_id, user_id, role)
      values (v_invite.campaign_id, v_uid, v_invite.role)
      on conflict (campaign_id, user_id) do nothing;
      v_joined := true;
    end if;

    if v_char_exists then
      update public.pjs
      set owner_id = v_uid
      where id = v_invite.character_id
        and campaign_id = v_invite.campaign_id
        and (owner_id is null or owner_id = v_uid);
      get diagnostics v_rows = row_count;
      if v_rows = 0 then
        raise exception 'character_already_claimed';
      end if;
      v_claimed := true;
    end if;

    update public.campaign_invites set uses = uses + 1 where id = v_invite.id;
  end if;

  select c.slug into v_slug from public.campaigns c where c.id = v_invite.campaign_id;
  select m.role into v_role
  from public.campaign_members m
  where m.campaign_id = v_invite.campaign_id and m.user_id = v_uid;

  return jsonb_build_object(
    'joined', v_joined,
    'claimed', v_claimed,
    'campaign_id', v_invite.campaign_id,
    'slug', v_slug,
    'role', v_role,
    'character_id', v_invite.character_id
  );
end;
$$;

-- Adds coins to a character's `monedas` column and flags the equipment section as updated.
-- Internal: called only from the SECURITY DEFINER RPCs below (the guard trigger lets the table
-- owner through; players can never write `monedas` directly).
create function public.credit_character_coins(
  p_campaign_id uuid, p_character_id bigint, p_coins jsonb, p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_coins jsonb := public.coin_amounts(p_coins);
begin
  update public.pjs
  set monedas = jsonb_build_object(
        'cp', public.coin_value(monedas ->> 'cp') + (v_coins ->> 'cp')::bigint,
        'sp', public.coin_value(monedas ->> 'sp') + (v_coins ->> 'sp')::bigint,
        'ep', public.coin_value(monedas ->> 'ep') + (v_coins ->> 'ep')::bigint,
        'gp', public.coin_value(monedas ->> 'gp') + (v_coins ->> 'gp')::bigint,
        'pp', public.coin_value(monedas ->> 'pp') + (v_coins ->> 'pp')::bigint
      ),
      sections_updated = case
        when v_coins <> public.coin_amounts('{}'::jsonb)
          then sections_updated || jsonb_build_object('equipo', to_jsonb(p_now))
        else sections_updated
      end
  where id = p_character_id and campaign_id = p_campaign_id;
end;
$$;

-- Daily d20 lottery. The roll is generated on the server (behaviour change vs. the client-side
-- Dice3D roll: otherwise any player could submit a 20). The UI animates to the returned roll.
--   * player: p_character_id must be a character the caller owns; one play per UTC day per character;
--     the prize is credited to the character.
--   * DM: p_character_id null; the prize goes to the campaign pot (row is upserted if missing).
-- Config comes from campaign_config key 'loteria' (defaults match the Firestore seed).
-- Errors (message): not_a_member, character_required, not_your_character, already_played_today.
create function public.play_loteria(p_campaign_id uuid, p_character_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := now();
  v_cfg jsonb;
  v_min_text text;
  v_min integer;
  v_roll integer;
  v_prize jsonb;
  v_target text;
  v_won boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_campaign_member(p_campaign_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if p_character_id is null then
    if not public.is_campaign_dm(p_campaign_id) then
      raise exception 'character_required';
    end if;
    v_target := 'pot';
  else
    if not exists (
      select 1 from public.pjs p
      where p.id = p_character_id and p.campaign_id = p_campaign_id and p.owner_id = v_uid
    ) then
      raise exception 'not_your_character' using errcode = '42501';
    end if;
    v_target := 'player';
  end if;

  select value into v_cfg
  from public.campaign_config
  where campaign_id = p_campaign_id and key = 'loteria';

  v_min_text := v_cfg ->> 'commonMinRoll';
  v_min := case when v_min_text ~ '^[0-9]{1,2}$' then v_min_text::integer else 17 end;
  v_roll := 1 + floor(random() * 20)::integer;

  if v_roll = 20 then
    v_prize := public.coin_amounts(coalesce(v_cfg -> 'specialPrize', '{"sp": 1}'::jsonb));
  elsif v_roll >= v_min then
    v_prize := public.coin_amounts(coalesce(v_cfg -> 'commonPrize', '{"cp": 3}'::jsonb));
  else
    v_prize := public.coin_amounts('{}'::jsonb);
  end if;
  v_won := v_prize <> public.coin_amounts('{}'::jsonb);

  begin
    insert into public.game_logs (campaign_id, actor_type, character_id, game, roll, prize, prize_target)
    values (
      p_campaign_id,
      case when v_target = 'player' then 'player' else 'dm' end,
      p_character_id, 'loteria', v_roll, v_prize, v_target
    );
  exception when unique_violation then
    raise exception 'already_played_today';
  end;

  if v_target = 'player' then
    perform public.credit_character_coins(p_campaign_id, p_character_id, v_prize, v_now);
    if v_won then
      -- the player already saw their own prize: do not light up an unread dot for them
      insert into public.read_state (user_id, campaign_id, entity_type, entity_id, section, seen_at)
      values (v_uid, p_campaign_id, 'pjs', p_character_id, 'equipo', v_now)
      on conflict (user_id, campaign_id, entity_type, entity_id, section)
      do update set seen_at = excluded.seen_at;
    end if;
  else
    -- upsert: a missing pot row (e.g. an imported campaign) must not silently drop the prize
    insert into public.game_pot (campaign_id, cp, sp, ep, gp, pp)
    values (
      p_campaign_id,
      (v_prize ->> 'cp')::bigint, (v_prize ->> 'sp')::bigint, (v_prize ->> 'ep')::bigint,
      (v_prize ->> 'gp')::bigint, (v_prize ->> 'pp')::bigint
    )
    on conflict (campaign_id) do update
      set cp = public.game_pot.cp + excluded.cp,
          sp = public.game_pot.sp + excluded.sp,
          ep = public.game_pot.ep + excluded.ep,
          gp = public.game_pot.gp + excluded.gp,
          pp = public.game_pot.pp + excluded.pp;
  end if;

  return jsonb_build_object('roll', v_roll, 'prize', v_prize, 'prize_target', v_target);
end;
$$;

-- DM-only: moves coins from the campaign pot to a character, atomically.
-- Errors (message): dm_only, insufficient_pot, character_not_found.
create function public.assign_pot_to_character(p_campaign_id uuid, p_character_id bigint, p_coins jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coins jsonb := public.coin_amounts(p_coins);
  v_pot public.game_pot;
begin
  if not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.pjs p where p.id = p_character_id and p.campaign_id = p_campaign_id
  ) then
    raise exception 'character_not_found';
  end if;

  select * into v_pot from public.game_pot where campaign_id = p_campaign_id for update;
  if not found
     or v_pot.cp < (v_coins ->> 'cp')::bigint or v_pot.sp < (v_coins ->> 'sp')::bigint
     or v_pot.ep < (v_coins ->> 'ep')::bigint or v_pot.gp < (v_coins ->> 'gp')::bigint
     or v_pot.pp < (v_coins ->> 'pp')::bigint
  then
    raise exception 'insufficient_pot';
  end if;

  update public.game_pot
  set cp = cp - (v_coins ->> 'cp')::bigint,
      sp = sp - (v_coins ->> 'sp')::bigint,
      ep = ep - (v_coins ->> 'ep')::bigint,
      gp = gp - (v_coins ->> 'gp')::bigint,
      pp = pp - (v_coins ->> 'pp')::bigint
  where campaign_id = p_campaign_id
  returning * into v_pot;

  perform public.credit_character_coins(p_campaign_id, p_character_id, v_coins, now());

  return to_jsonb(v_pot);
end;
$$;

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.campaigns         enable row level security;
alter table public.campaign_members  enable row level security;
alter table public.campaign_invites  enable row level security;
alter table public.sesiones          enable row level security;
alter table public.pjs               enable row level security;
alter table public.pnjs              enable row level security;
alter table public.lugares           enable row level security;
alter table public.facciones         enable row level security;
alter table public.lore              enable row level security;
alter table public.items             enable row level security;
alter table public.mapas             enable row level security;
alter table public.map_points        enable row level security;
alter table public.homebrew_rules    enable row level security;
alter table public.entity_dm_notes   enable row level security;
alter table public.player_notes      enable row level security;
alter table public.read_state        enable row level security;
alter table public.disponibilidad    enable row level security;
alter table public.game_logs         enable row level security;
alter table public.game_pot          enable row level security;
alter table public.campaign_config   enable row level security;

-- profiles: own profile + profiles of people who share a campaign with you. Insert is done by the
-- auth.users trigger; users can update only their own display_name / avatar_url (column grants).
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_campaign_with(id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- campaigns: members read, DM updates. No insert/delete policy: creation goes through create_campaign().
create policy campaigns_select on public.campaigns
  for select to authenticated
  using (public.is_campaign_member(id));

create policy campaigns_update_dm on public.campaigns
  for update to authenticated
  using (public.is_campaign_dm(id))
  with check (public.is_campaign_dm(id));

-- campaign_members: members see the roster, the DM changes roles and removes people, any user can
-- leave (protect_last_dm blocks the last DM). No insert policy: joining goes through accept_invite().
create policy campaign_members_select on public.campaign_members
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy campaign_members_update_dm on public.campaign_members
  for update to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy campaign_members_delete on public.campaign_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_campaign_dm(campaign_id));

-- campaign_invites: DM only (the code is a credential).
create policy campaign_invites_dm on public.campaign_invites
  for all to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- Entity tables with the plain rule: visibility by can_see_entity, writes by DM.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sesiones', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'homebrew_rules'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.can_see_entity(campaign_id, estado, visible_to))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.is_campaign_dm(campaign_id))',
      t || '_insert_dm', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.is_campaign_dm(campaign_id))
         with check (public.is_campaign_dm(campaign_id))',
      t || '_update_dm', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.is_campaign_dm(campaign_id))',
      t || '_delete_dm', t);
  end loop;
end;
$$;

-- map_points: a point is visible only if the point itself AND its parent map are visible to the caller;
-- otherwise a publicado point on a borrador/secreto map would leak the existence and location of
-- DM-only content. Writes: DM only.
create policy map_points_select on public.map_points
  for select to authenticated
  using (
    public.can_see_entity(campaign_id, estado, visible_to)
    and exists (
      select 1
      from public.mapas m
      where m.id = map_points.map_id
        and m.campaign_id = map_points.campaign_id
        and public.can_see_entity(m.campaign_id, m.estado, m.visible_to)
    )
  );

create policy map_points_insert_dm on public.map_points
  for insert to authenticated
  with check (public.is_campaign_dm(campaign_id));

create policy map_points_update_dm on public.map_points
  for update to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy map_points_delete_dm on public.map_points
  for delete to authenticated
  using (public.is_campaign_dm(campaign_id));

-- pjs: same, plus an owner can always see and update their own character
-- (update is narrowed to identity fields by guard_pj_player_update).
create policy pjs_select on public.pjs
  for select to authenticated
  using (
    public.can_see_entity(campaign_id, estado, visible_to)
    or (owner_id = (select auth.uid()) and public.is_campaign_member(campaign_id))
  );

create policy pjs_insert_dm on public.pjs
  for insert to authenticated
  with check (public.is_campaign_dm(campaign_id));

create policy pjs_update_dm on public.pjs
  for update to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy pjs_update_owner on public.pjs
  for update to authenticated
  using (owner_id = (select auth.uid()) and public.is_campaign_member(campaign_id))
  with check (owner_id = (select auth.uid()) and public.is_campaign_member(campaign_id));

create policy pjs_delete_dm on public.pjs
  for delete to authenticated
  using (public.is_campaign_dm(campaign_id));

-- entity_dm_notes: DM only, every operation.
create policy entity_dm_notes_dm on public.entity_dm_notes
  for all to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- player_notes: the author reads/writes their own notes; the DM can read, correct and delete all
-- notes of the campaign (the current UI lets the DM edit and delete players' notes).
create policy player_notes_select on public.player_notes
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and public.is_campaign_member(campaign_id))
    or public.is_campaign_dm(campaign_id)
  );

create policy player_notes_insert_own on public.player_notes
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.is_campaign_member(campaign_id)
    and (character_id is null
         or character_id = any (public.my_character_ids(campaign_id))
         or public.is_campaign_dm(campaign_id))
  );

create policy player_notes_update on public.player_notes
  for update to authenticated
  using (
    (user_id = (select auth.uid()) and public.is_campaign_member(campaign_id))
    or public.is_campaign_dm(campaign_id)
  )
  with check (
    (
      user_id = (select auth.uid()) and public.is_campaign_member(campaign_id)
      and (character_id is null or character_id = any (public.my_character_ids(campaign_id)))
    )
    or public.is_campaign_dm(campaign_id)
  );

create policy player_notes_delete on public.player_notes
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and public.is_campaign_member(campaign_id))
    or public.is_campaign_dm(campaign_id)
  );

-- read_state: strictly per user (not even the DM reads other people's read state).
create policy read_state_own on public.read_state
  for all to authenticated
  using (user_id = (select auth.uid()) and public.is_campaign_member(campaign_id))
  with check (user_id = (select auth.uid()) and public.is_campaign_member(campaign_id));

-- disponibilidad: every member sees the calendar. The DM manages everything (session slots included);
-- a player manages 'personal' / 'no_disponible' entries of their own characters only.
create policy disponibilidad_select on public.disponibilidad
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy disponibilidad_insert on public.disponibilidad
  for insert to authenticated
  with check (
    public.is_campaign_dm(campaign_id)
    or (tipo <> 'sesion' and character_id = any (public.my_character_ids(campaign_id)))
  );

create policy disponibilidad_update on public.disponibilidad
  for update to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (tipo <> 'sesion' and character_id = any (public.my_character_ids(campaign_id)))
  )
  with check (
    public.is_campaign_dm(campaign_id)
    or (tipo <> 'sesion' and character_id = any (public.my_character_ids(campaign_id)))
  );

create policy disponibilidad_delete on public.disponibilidad
  for delete to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (tipo <> 'sesion' and character_id = any (public.my_character_ids(campaign_id)))
  );

-- game_logs: DM reads and prunes everything, players read the logs of their own characters.
-- No insert policy: rows are created by play_loteria() only.
create policy game_logs_select on public.game_logs
  for select to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (character_id is not null and character_id = any (public.my_character_ids(campaign_id)))
  );

create policy game_logs_delete_dm on public.game_logs
  for delete to authenticated
  using (public.is_campaign_dm(campaign_id));

-- game_pot: members see the pot (it is shown on the games page), changes go through RPCs
-- (the DM may also correct it directly).
create policy game_pot_select on public.game_pot
  for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy game_pot_update_dm on public.game_pot
  for update to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

-- campaign_config: readable by members unless visibility = 'dm'; DM writes.
create policy campaign_config_select on public.campaign_config
  for select to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or (visibility = 'members' and public.is_campaign_member(campaign_id))
  );

create policy campaign_config_insert_dm on public.campaign_config
  for insert to authenticated
  with check (public.is_campaign_dm(campaign_id));

create policy campaign_config_update_dm on public.campaign_config
  for update to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy campaign_config_delete_dm on public.campaign_config
  for delete to authenticated
  using (public.is_campaign_dm(campaign_id));

------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------
-- Be explicit instead of relying on the default privileges of the Supabase `public` schema:
-- anon gets nothing, authenticated gets only what the policies above can narrow down.

revoke all on all tables in schema public from anon, authenticated;

grant select                               on public.profiles          to authenticated;
grant update (display_name, avatar_url)    on public.profiles          to authenticated;

grant select                               on public.campaigns         to authenticated;
grant update (slug, name, system, branding, regions, character_custom_fields, settings)
                                           on public.campaigns         to authenticated;

grant select, delete                       on public.campaign_members  to authenticated;
grant update (role)                        on public.campaign_members  to authenticated;

grant select, delete                       on public.campaign_invites  to authenticated;
grant insert (campaign_id, role, character_id, max_uses, expires_at)
                                           on public.campaign_invites  to authenticated;
grant update (max_uses, expires_at)        on public.campaign_invites  to authenticated;

grant select, insert, update, delete on
  public.sesiones, public.pjs, public.pnjs, public.lugares, public.facciones, public.lore,
  public.items, public.mapas, public.map_points, public.homebrew_rules,
  public.entity_dm_notes, public.player_notes, public.read_state, public.disponibilidad,
  public.campaign_config
  to authenticated;

grant select, delete                       on public.game_logs         to authenticated;
grant select                               on public.game_pot          to authenticated;
grant update (cp, sp, ep, gp, pp)          on public.game_pot          to authenticated;

-- Functions: nothing is callable unless granted below (trigger functions are never called directly).
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_campaign_member(uuid),
  public.is_campaign_dm(uuid),
  public.my_character_ids(uuid),
  public.can_see_entity(uuid, text, bigint[]),
  public.shares_campaign_with(uuid),
  public.coin_value(text),
  public.coin_amounts(jsonb),
  public.create_campaign(text, text),
  public.accept_invite(text),
  public.play_loteria(uuid, bigint),
  public.assign_pot_to_character(uuid, bigint, jsonb)
  to authenticated;

------------------------------------------------------------------------------
-- Realtime
------------------------------------------------------------------------------
-- Realtime postgres_changes respects RLS for inserts/updates, so subscribers only receive rows they
-- can select. DELETE events carry only the primary key and are NOT RLS-filtered: every subscriber
-- of a published table receives the ids of rows deleted in ANY campaign. Clients must therefore
-- subscribe with a `campaign_id=eq.<id>` filter and ignore unexpected payloads (ids only, no content).
-- entity_dm_notes is deliberately NOT published (DM-private content). Supabase Broadcast channels
-- with private authorization are a later option if even ids must not leak.

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'map_points',
      'homebrew_rules', 'disponibilidad', 'game_pot', 'campaign_config'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
