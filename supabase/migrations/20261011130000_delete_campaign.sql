-- H10d: delete_campaign(p_campaign_id, p_confirm_slug) -- a DM deletes a whole campaign.
--
-- There is deliberately no DELETE policy on public.campaigns: the only way to delete one is this RPC.
--
--   * authenticated callers only (anon has no execute privilege; a null uid is refused too);
--   * SECURITY DEFINER with an empty search_path: the delete runs as the table owner, after the
--     function itself has checked that the caller is a DM of THIS campaign (is_campaign_dm);
--   * a typed confirmation: p_confirm_slug must equal the campaign's slug (trimmed), so a stray call
--     or a wrong tab cannot delete the wrong campaign;
--   * a caller who is not a DM, a stranger and an unknown id all get the same 'dm_only' error (42501),
--     so the RPC is not an oracle for which campaign ids or slugs exist. The slug is compared only
--     after the DM check, so a non-DM never learns it either. A wrong slug raises 'slug_mismatch'
--     (P0001);
--   * the campaign row is locked (for update) while checking, so two concurrent calls cannot both
--     succeed and a demotion cannot race the check.
--
-- What cascades (every table that references campaigns(id) with ON DELETE CASCADE): campaign_members,
-- campaign_invites, pjs, pnjs, lugares, facciones, lore, items, sesiones, mapas, map_points,
-- homebrew_rules, entity_dm_notes, player_notes, read_state, disponibilidad, game_logs, game_pot,
-- campaign_config, campaign_presence and the campaign-scoped rows of player_availability. Characters
-- are deleted with the campaign (they belong to it). The members' accounts and profiles are untouched,
-- as are their other campaigns. protect_last_dm lets the member cascade through because the campaign
-- row is already gone. A user's quota of created campaigns is freed (the limit counts existing rows).
-- Deletion is permanent: there is no soft delete, so the client asks for the typed confirmation.

create function public.delete_campaign(p_campaign_id uuid, p_confirm_slug text)
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

  select c.slug into v_slug
  from public.campaigns c
  where c.id = p_campaign_id
  for update;

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
