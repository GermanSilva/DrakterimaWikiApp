-- campaign-hub H3b: players must never read `visible_to`.
--
-- Why: `visible_to` (bigint[] of pjs.id) lists which characters share a `secreto` row. RLS filters
-- rows, not columns, so a player who may see a secret would also learn which other PCs know it.
--
-- Design
--   * Table-level SELECT on the 10 tables carrying `visible_to` is revoked from `authenticated` and
--     replaced with SELECT on an explicit column list that excludes `visible_to`. (A column-level
--     REVOKE cannot subtract from a table-level GRANT, so the table-level grant has to go.)
--   * INSERT and UPDATE are likewise re-granted per column, again excluding `visible_to`, so the
--     column is not writable by any client either. Writing it with a client-supplied value that is
--     compared against the stored one (e.g. `update pjs set visible_to = X where id = <own>`
--     passing guard_pj_player_update only when X equals the stored value) would be a read oracle.
--     Now any client statement that names the column fails at privilege time regardless of value.
--     DELETE grants are unchanged. New rows get the default '{}'.
--   * Write path: `public.set_entity_visibility(entity_type, id, visible_to)`, SECURITY DEFINER,
--     DM-only, every id must be a pjs.id of the same campaign.
--   * RLS policies keep working: a policy qual on the table's OWN columns is not subject to the
--     caller's column privileges, and `can_see_entity()` is SECURITY DEFINER. BUT a policy
--     sub-select on ANOTHER table is privilege-checked as the caller: map_points_select read
--     `mapas.visible_to` and failed with 42501. It now goes through the SECURITY DEFINER helper
--     `can_see_map()` (verified in supabase/tests/database/04_visible_to_privacy.test.sql).
--   * DM read path: `public.get_entity_visibility(entity_type, ids)`, SECURITY DEFINER, DM-only
--     per row's campaign.
--
-- !! CLIENT CONTRACT (H4 data layer) !!
--   * No `select *`, supabase-js `.select()` without columns, or `RETURNING *` on these tables:
--     they fail with 42501 "permission denied for table ...". Use explicit column lists that omit
--     `visible_to` (also for the return of insert/update/upsert, or `return=minimal`).
--   * Never put `visible_to` in an insert / update / upsert payload (42501 regardless of value).
--     Upserts must list explicit columns without it.
--   * Read it with get_entity_visibility(), write it with set_entity_visibility().
--   * Any migration adding a column to one of these tables must also grant select, insert and
--     update on that column to authenticated explicitly (column lists are fixed at migration time).
--
-- Leak review: no view exists over these tables; create_campaign / accept_invite /
-- play_loteria / assign_pot_to_character return only ids, uuids or scalars, never entity rows;
-- no trigger copies the column; `entity_dm_notes` has no `visible_to`.

do $$
declare
  t    text;
  cols text;
begin
  foreach t in array array[
    'sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'map_points',
    'homebrew_rules'
  ] loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into cols
      from information_schema.columns
     where table_schema = 'public'
       and table_name = t
       and column_name <> 'visible_to';

    execute format('revoke select, insert, update on public.%I from authenticated', t);
    execute format(
      'grant select (%1$s), insert (%1$s), update (%1$s) on public.%2$I to authenticated', cols, t);
  end loop;
end;
$$;

-- A map point is visible only if its parent map is visible too. SECURITY DEFINER so the check can
-- read mapas.visible_to, which the caller may not select.
create function public.can_see_map(p_map_id bigint, cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mapas m
    where m.id = p_map_id
      and m.campaign_id = cid
      and public.can_see_entity(m.campaign_id, m.estado, m.visible_to)
  );
$$;

revoke execute on function public.can_see_map(bigint, uuid) from public, anon;
grant execute on function public.can_see_map(bigint, uuid) to authenticated;

drop policy map_points_select on public.map_points;
create policy map_points_select on public.map_points
  for select to authenticated
  using (
    public.can_see_entity(campaign_id, estado, visible_to)
    and public.can_see_map(map_id, campaign_id)
  );

-- DM-only read of the share list. Returns a row only for ids whose campaign the caller DMs;
-- other ids (other campaigns, missing, players' calls) yield nothing.
create function public.get_entity_visibility(p_entity_type text, p_ids bigint[])
returns table (id bigint, visible_to bigint[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if cardinality(p_ids) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '54000';
  end if;

  -- Whitelist: only these relation names are ever interpolated (as an identifier).
  if p_entity_type is null or p_entity_type <> all (array[
    'sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'map_points',
    'homebrew_rules'
  ]) then
    raise exception 'unknown entity type' using errcode = '22023';
  end if;

  return query execute format(
    'select e.id, e.visible_to
       from public.%I e
      where e.id = any ($1)
        and public.is_campaign_dm(e.campaign_id)
      order by e.id',
    p_entity_type
  ) using coalesce(p_ids, '{}'::bigint[]);
end;
$$;

revoke execute on function public.get_entity_visibility(text, bigint[]) from public, anon;
grant execute on function public.get_entity_visibility(text, bigint[]) to authenticated;

-- DM-only write of the share list. Same error for a missing row and a non-DM caller, so row
-- existence is not revealed. Every id must be a character of the row's own campaign.
create function public.set_entity_visibility(p_entity_type text, p_id bigint, p_visible_to bigint[])
returns bigint[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cid uuid;
  v_ids bigint[];
begin
  if p_entity_type is null or p_entity_type <> all (array[
    'sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'map_points',
    'homebrew_rules'
  ]) then
    raise exception 'unknown entity type' using errcode = '22023';
  end if;

  execute format('select campaign_id from public.%I where id = $1', p_entity_type)
    into v_cid using p_id;

  if v_cid is null or not public.is_campaign_dm(v_cid) then
    raise exception 'dm_only' using errcode = '42501';
  end if;

  if cardinality(p_visible_to) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '54000';
  end if;

  select coalesce(array_agg(x order by x), '{}'::bigint[])
    into v_ids
    from (select distinct x from unnest(coalesce(p_visible_to, '{}'::bigint[])) x) d;

  if exists (
    select 1 from unnest(coalesce(p_visible_to, '{}'::bigint[])) x
    where x is null
       or not exists (select 1 from public.pjs c where c.id = x and c.campaign_id = v_cid)
  ) then
    raise exception 'every id must be a character of the same campaign' using errcode = '22023';
  end if;

  execute format('update public.%I set visible_to = $1 where id = $2', p_entity_type)
    using v_ids, p_id;
  return v_ids;
end;
$$;

revoke execute on function public.set_entity_visibility(text, bigint, bigint[]) from public, anon;
grant execute on function public.set_entity_visibility(text, bigint, bigint[]) to authenticated;

-- Future tables/sequences created by postgres in public start closed; grants must be explicit.
-- (Existing explicit grants are unaffected: default privileges only apply to new objects.)
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
