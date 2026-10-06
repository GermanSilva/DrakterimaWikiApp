-- Campaign hub, part 1/3: identity, campaigns, membership, invites.
--
-- Verified locally with `supabase db reset` + `supabase test db` (135+ pgTAP assertions).
--
-- Migration layout:
--   1. core      (this file)  tables for identity / campaigns / members / invites + triggers
--   2. entities  wiki entity tables, DM-private notes, notes, read state, calendar, games, config
--   3. security  helper functions, guard triggers, RPCs, RLS policies, grants, realtime
--
-- Dropped on purpose: Firestore `login_logs`. Supabase Auth already keeps sign-in audit
-- logs (auth.audit_log_entries / dashboard), so there is no application table for it.

------------------------------------------------------------------------------
-- Shared trigger functions
------------------------------------------------------------------------------

-- Reused by every table that has an `updated_at` column.
-- Functions are not executable by anon/authenticated/public unless a later migration grants them
-- explicitly (the intended RPCs and the helpers that RLS policies call are granted in part 3).
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Rows must never move between campaigns: RLS checks `campaign_id` on the NEW row, so an
-- UPDATE that rewrote it would be an easy cross-tenant move for a user who is DM of two
-- campaigns. Attached to every campaign-scoped table.
create function public.forbid_campaign_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.campaign_id is distinct from old.campaign_id then
    raise exception 'campaign_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- profiles: one row per auth user (public mirror of identity)
------------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile of an auth user. Created by trigger on auth.users insert. Visible to the owner and to users sharing a campaign.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Creates the profile when a user signs up (magic link or Google).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    -- metadata comes from the identity provider / the client: cap its length
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      ''
    ), 80),
    -- only https avatars of reasonable length are kept
    (select u
       from (select coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture') as u) s
      where s.u like 'https://%' and char_length(s.u) <= 500)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- campaigns
------------------------------------------------------------------------------
-- Config that used to be hard-coded in the app lives here:
--   branding                {logo_url, accent_color, tagline, ...}
--   regions                 [{key, label, color}]  replaces helpers.js regionLabel/regionOptions
--                           (magral, nezor, heladas, islas, otro) and REGION_COLOR
--   character_custom_fields [{key, label, type}]   replaces the hard-coded PJ field `magralita`;
--                           values live in pjs.data -> 'custom_fields' ->> key
--   settings                free-form campaign settings (anything that is not branding)
-- Per-campaign mini-games and the session screen layout are in campaign_config (part 2).

create table public.campaigns (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique
                            check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  name                    text not null check (char_length(btrim(name)) between 1 and 120),
  system                  text not null default 'dnd5e' check (system in ('dnd5e')),
  branding                jsonb not null default '{}'::jsonb check (jsonb_typeof(branding) = 'object'),
  regions                 jsonb not null default '[]'::jsonb check (jsonb_typeof(regions) = 'array'),
  character_custom_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(character_custom_fields) = 'array'),
  settings                jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.campaigns is
  'A campaign (tenant). Rows are created only through create_campaign(), which also makes the caller its DM.';

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------------
-- campaign_members
------------------------------------------------------------------------------

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('dm', 'player')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index campaign_members_user_id_idx on public.campaign_members (user_id);

comment on table public.campaign_members is
  'Per-campaign role of a user. The same user can be dm in one campaign and player in another.';

create trigger campaign_members_set_updated_at
  before update on public.campaign_members
  for each row execute function public.set_updated_at();

-- A campaign must always keep at least one DM. Blocks deleting or demoting the last DM,
-- except while the campaign itself is being deleted (FK cascade removes the members).
create function public.protect_last_dm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only DM rows matter; an UPDATE that keeps role = 'dm' is harmless.
  if old.role = 'dm' and (tg_op = 'DELETE' or new.role <> 'dm') then
    -- Serialise concurrent demotions/removals of the DMs of one campaign: without this lock two
    -- transactions could each see "another DM exists" and remove both. If the campaign row is
    -- already gone, this is the FK cascade from DELETE on campaigns: nothing to protect.
    perform 1 from public.campaigns c where c.id = old.campaign_id for update;
    if found and not exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = old.campaign_id
        and m.role = 'dm'
        and m.user_id <> old.user_id
    ) then
      -- Also reached when an account is deleted (profiles -> campaign_members cascade):
      -- account deletion is BLOCKED while the user is the sole DM of an existing campaign.
      raise exception
        'cannot remove, demote or delete the account of the only DM of a campaign: transfer the DM role to another member or delete the campaign first'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger campaign_members_protect_last_dm
  before update of role or delete on public.campaign_members
  for each row execute function public.protect_last_dm();

------------------------------------------------------------------------------
-- campaign_invites
------------------------------------------------------------------------------
-- Redeemed with accept_invite(code). When character_id is set, redeeming also assigns
-- ownership of that PJ (pjs.owner_id) to the redeeming user. That is how existing
-- Drakterima characters are claimed after the Firestore import.
-- `code` is 32 hex chars from gen_random_uuid() (CSPRNG, 122 bits), no pgcrypto needed.
-- The composite FK (character_id, campaign_id) -> pjs is added in part 2 (pjs does not exist yet).

create table public.campaign_invites (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  code         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  role         text not null default 'player' check (role in ('dm', 'player')),
  character_id bigint,
  max_uses     integer not null default 1 check (max_uses >= 1),
  uses         integer not null default 0 check (uses >= 0),
  expires_at   timestamptz,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (uses <= max_uses),
  -- a character invite is a one-shot claim for a player
  check (character_id is null or (role = 'player' and max_uses = 1))
);

create index campaign_invites_campaign_id_idx on public.campaign_invites (campaign_id);
