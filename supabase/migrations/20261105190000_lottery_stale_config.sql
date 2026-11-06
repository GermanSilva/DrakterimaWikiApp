-- G5b follow-up of the system-agnostic campaigns (odd/tasks/system-agnostic.md, S12, S16, S28). A lottery config whose prizes hold
-- a NON-ZERO amount under a key that is not a denomination of the sheet is not configured (S12: the lottery exists only with a
-- complete configuration). Before, every winning roll of play_loteria raised `invalid_coins` and wrote nothing, so the player kept
-- retrying until a losing roll was logged and could never win. Now play_loteria raises `lottery_config_stale` BEFORE rolling: no
-- roll, no log, no credit, and the daily play is not consumed. The DM fixes it by saving the prizes again in Ajustes.
-- Zero amounts (0, -0, "0".."000000000000000", null) under unknown keys are still tolerated, as in _reward_normalize.
-- Legacy campaigns (no sheet, or a sheet without a coin table) and `none` campaigns behave exactly as before.
--
-- Rollback (manual, not part of the migration): restore play_loteria from 20261105180000 (create or replace), then
--   drop function public._lottery_stale_keys(jsonb, jsonb).

------------------------------------------------------------------------------
-- _lottery_stale_keys: the keys of the stored prizes that hold a non-zero amount and are not denominations. Pure, internal.
------------------------------------------------------------------------------
create function public._lottery_stale_keys(p_target jsonb, p_cfg jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_target ->> 'mode' is distinct from 'monedas' and p_target ->> 'mode' is distinct from 'economia' then '{}'::text[]
    else coalesce((
      select array_agg(distinct e.key order by e.key)
      from unnest(array['specialPrize', 'commonPrize']) as prize(name),
           jsonb_each(case when jsonb_typeof(p_cfg -> prize.name) = 'object' then p_cfg -> prize.name else '{}'::jsonb end) as e(key, value)
      where not (p_target -> 'denominations' ? e.key)
        and not (
          (jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric = 0)
          or (jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '^0{1,15}$')
          or jsonb_typeof(e.value) = 'null')
    ), '{}'::text[])
  end;
$$;

revoke execute on function public._lottery_stale_keys(jsonb, jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------
-- play_loteria: as 20261105180000, refusing a stale prize configuration before the roll
-- Errors (message): authentication required, not_a_member, character_required, not_your_character, no_reward_destination,
--   pot_denominations_unsupported, lottery_config_stale, already_played_today, invalid_coins.
------------------------------------------------------------------------------
create or replace function public.play_loteria(p_campaign_id uuid, p_character_id bigint default null)
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
  v_dest jsonb;
  v_def_special jsonb;
  v_def_common jsonb;
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

  -- S12/S28: no denominations or no reward destination = no lottery; the fixed-column pot cannot hold custom denominations
  v_dest := public._reward_target(p_campaign_id);
  if v_dest ->> 'mode' = 'none' then
    raise exception 'no_reward_destination';
  end if;
  if v_target = 'pot' and v_dest ->> 'mode' <> 'legacy' and exists (
    select 1 from jsonb_array_elements_text(v_dest -> 'denominations') d where d not in ('cp', 'sp', 'ep', 'gp', 'pp')
  ) then
    raise exception 'pot_denominations_unsupported';
  end if;

  select value into v_cfg
  from public.campaign_config
  where campaign_id = p_campaign_id and key = 'loteria';

  -- S12: a prize in a key that is no longer a denomination = lottery not configured; refuse before rolling or writing anything
  if cardinality(public._lottery_stale_keys(v_dest, v_cfg)) > 0 then
    raise exception 'lottery_config_stale';
  end if;

  v_min_text := v_cfg ->> 'commonMinRoll';
  v_min := case when v_min_text ~ '^[0-9]{1,2}$' then v_min_text::integer else 17 end;
  v_roll := 1 + floor(random() * 20)::integer;

  -- the defaults of a missing config only apply where their denomination exists
  v_def_special := case when v_dest ->> 'mode' = 'legacy' or (v_dest -> 'denominations') @> '["sp"]'::jsonb then '{"sp": 1}'::jsonb else '{}'::jsonb end;
  v_def_common := case when v_dest ->> 'mode' = 'legacy' or (v_dest -> 'denominations') @> '["cp"]'::jsonb then '{"cp": 3}'::jsonb else '{}'::jsonb end;

  if v_roll = 20 then
    v_prize := public._reward_normalize(v_dest, coalesce(v_cfg -> 'specialPrize', v_def_special));
  elsif v_roll >= v_min then
    v_prize := public._reward_normalize(v_dest, coalesce(v_cfg -> 'commonPrize', v_def_common));
  else
    v_prize := public._reward_normalize(v_dest, '{}'::jsonb);
  end if;
  v_won := exists (select 1 from jsonb_each_text(v_prize) e where e.value <> '0');

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
      values (v_uid, p_campaign_id, 'pjs', p_character_id, coalesce(v_dest ->> 'section', 'equipo'), v_now)
      on conflict (user_id, campaign_id, entity_type, entity_id, section)
      do update set seen_at = excluded.seen_at;
    end if;
  else
    -- upsert: a missing pot row (e.g. an imported campaign) must not silently drop the prize
    insert into public.game_pot (campaign_id, cp, sp, ep, gp, pp)
    values (
      p_campaign_id,
      coalesce((v_prize ->> 'cp')::bigint, 0), coalesce((v_prize ->> 'sp')::bigint, 0),
      coalesce((v_prize ->> 'ep')::bigint, 0), coalesce((v_prize ->> 'gp')::bigint, 0),
      coalesce((v_prize ->> 'pp')::bigint, 0)
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
