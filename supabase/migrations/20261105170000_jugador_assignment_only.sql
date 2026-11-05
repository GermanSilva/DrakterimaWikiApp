-- G4b of the system-agnostic campaigns (odd/tasks/system-agnostic.md S30, S33). HIGH RISK: permissions / guards.
--
-- G4a (20261105160000) let a campaign DM change `pjs.jugador` by hand, which contradicts S30 ("solo lectura y solo
-- configurable por el DM al asignar un personaje a un jugador. No debe ser un campo de texto libre"). Now, for any caller
-- with a request identity (an authenticated user, the DM included):
--   * INSERT: jugador is derived from the owner (profiles.display_name) or '' when there is no owner, whatever was sent.
--   * UPDATE with the owner changed: jugador is derived from the new owner, as before.
--   * UPDATE with the owner unchanged: a jugador different from the stored one is refused (42501). Writing the stored
--     value back is not a change, so a form that sends the whole row keeps working.
-- Callers WITHOUT a request identity (postgres, migrations, service_role) keep today's behaviour: they may write the text of
-- a character without an owner (the data migration of G10 needs it); an owner still derives jugador for them as well.
--
-- Only the trigger function is redefined (same signature, SECURITY DEFINER, empty search_path, revokes); the trigger itself
-- is untouched. No data is rewritten.
--
-- ROLLBACK: re-run the definition of public.pjs_enforce_jugador() from 20261105160000_sheet_guard_options_jugador.sql
-- (a DM may then type jugador again and an insert without an owner keeps the text); no data is touched by this migration.

create or replace function public.pjs_enforce_jugador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id is not null then
      select p.display_name into new.jugador from public.profiles p where p.id = new.owner_id;
      new.jugador := coalesce(new.jugador, '');
    elsif (select auth.uid()) is not null then
      new.jugador := '';
    end if;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id then
    new.jugador := '';
    if new.owner_id is not null then
      select p.display_name into new.jugador from public.profiles p where p.id = new.owner_id;
      new.jugador := coalesce(new.jugador, '');
    end if;
    return new;
  end if;

  -- this function is SECURITY DEFINER (it reads profiles), so current_user is the owner here: the caller is told apart by
  -- the request identity instead. No identity (postgres, migrations, service_role) may write it; every user, a DM
  -- included, may only send back the stored value.
  if new.jugador is distinct from old.jugador and (select auth.uid()) is not null then
    raise exception 'the player of a character is set by assigning it, not edited'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.pjs_enforce_jugador() from public, anon, authenticated;
