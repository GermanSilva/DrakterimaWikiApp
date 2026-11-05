-- pgTAP: G5b of the system-agnostic campaigns (S12, S14, S28, S16). Every coin credit outside the sheet (lottery prize, pot
-- payout, credit_character_coins) goes to the REWARD DESTINATION of the campaign sheet: the coin table (pjs.monedas) or an
-- economy table (pjs.data[<key>]), merged per denomination. A campaign without a stored sheet (or whose sheet has no coin table)
-- keeps the legacy behaviour; a sheet with no destination (or no denominations) refuses the credit and the lottery.
-- Self-contained fixture, rolled back at the end.
begin;

select plan(70);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- the error message of a statement, or 'ok' when it ran (SQLSTATE prefix keeps permission denials apart)
create function tests.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

-- stores a sheet through the real validator (a rejected sheet fails the fixture), as postgres
create function tests.put_sheet(p_campaign uuid, p_sheet jsonb) returns void language plpgsql as $$
begin
  update public.campaigns
  set system_profile = public.validate_system_profile((system_profile - 'sheet') || jsonb_build_object('sheet', p_sheet))
  where id = p_campaign;
end;
$$;

create function tests.sheet(p_items jsonb) returns jsonb language sql as $$
  select jsonb_build_object('categories', jsonb_build_array(jsonb_build_object('key', 'c', 'label', 'C', 'sections',
    jsonb_build_array(jsonb_build_object('key', 'alpha', 'label', 'Alpha', 'items', p_items, 'blocks', '[]'::jsonb)))), 'roles', '{}'::jsonb);
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture: dm (..0301), player 1 (..0302), player 2 (..0303), outsider (..0304)
--   L legacy (no sheet)            -> keys cp..pp, pjs.monedas, pot columns
--   P preset (column default)      -> the D&D coin table marked as destination
--   M custom coin table, destination = the coin table (cobre/plata/oro)
--   E coin table cp/gp + economy table 'bolsa' as destination
--   N coin table with denominations but NO destination
--   Z destination marked but the coin table has no denominations
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('eeeeeeee-0000-4000-8000-000000000' || (300 + n))::uuid, 'authenticated', 'authenticated', 'rewdest-u' || n || '@example.test'
from generate_series(1, 4) as n;

insert into public.campaigns (id, slug, name)
select ('ffffffff-0000-4000-8000-0000000003' || c)::uuid, 'rewdest-' || c, 'Reward ' || c from unnest(array['1a', '1b', '1c', '1d', '1e', '1f']) c;
-- 1a = L, 1b = P, 1c = M, 1d = E, 1e = N, 1f = Z

insert into public.campaign_members (campaign_id, user_id, role)
select ('ffffffff-0000-4000-8000-0000000003' || c)::uuid, u.id, u.role
from unnest(array['1a', '1b', '1c', '1d', '1e', '1f']) c,
     (values ('eeeeeeee-0000-4000-8000-000000000301'::uuid, 'dm'), ('eeeeeeee-0000-4000-8000-000000000302'::uuid, 'player'),
             ('eeeeeeee-0000-4000-8000-000000000303'::uuid, 'player')) as u(id, role);

-- character ids: 98<campaign index>01 owned by player 1, 98<index>02 owned by player 2
insert into public.pjs (id, campaign_id, owner_id, nombre, data)
select 98000 + idx * 10 + k, ('ffffffff-0000-4000-8000-0000000003' || c)::uuid,
       ('eeeeeeee-0000-4000-8000-000000000' || (301 + k))::uuid, 'Char ' || c || k,
       case when c = '1d' and k = 2 then '{"stat_hp": 12, "bolsa": {"gp": 5, "cp": 0, "extra": 1}}'::jsonb else '{"stat_hp": 8}'::jsonb end
from unnest(array['1a', '1b', '1c', '1d', '1e', '1f']) with ordinality as t(c, idx), generate_series(1, 2) k;
-- 98011/98012 = L, 98021/98022 = P, 98031/98032 = M, 98041/98042 = E, 98051/98052 = N, 98061/98062 = Z

insert into public.game_pot (campaign_id, gp, cp)
select ('ffffffff-0000-4000-8000-0000000003' || c)::uuid, 5, 0 from unnest(array['1a', '1b', '1c', '1d', '1e', '1f']) c;

insert into public.campaign_config (campaign_id, key, value, visibility)
select ('ffffffff-0000-4000-8000-0000000003' || c)::uuid, 'loteria',
       case c
         when '1a' then '{"commonMinRoll": 1, "commonPrize": {"cp": 3}, "specialPrize": {"cp": 3}}'
         when '1b' then '{"commonMinRoll": 1, "commonPrize": {"cp": 3}, "specialPrize": {"cp": 3}}'
         when '1c' then '{"commonMinRoll": 1, "commonPrize": {"cobre": 3, "plata": 1}, "specialPrize": {"cobre": 3, "plata": 1}}'
         when '1d' then '{"commonMinRoll": 1, "commonPrize": {"cp": 1, "gp": 2}, "specialPrize": {"cp": 1, "gp": 2}}'
         else '{"commonMinRoll": 1, "commonPrize": {"cp": 3}, "specialPrize": {"cp": 3}}'
       end::jsonb, 'members'
from unnest(array['1a', '1b', '1c', '1d', '1e', '1f']) c;

-- sheets (L has none; P keeps the column default)
update public.campaigns set system_profile = system_profile - 'sheet' where id = 'ffffffff-0000-4000-8000-00000000031a';
select tests.put_sheet('ffffffff-0000-4000-8000-00000000031c', tests.sheet('[
  {"kind":"table","type":"monedas","key":"dinero","label":"Dinero","rewardDestination":true,
   "rows":[{"key":"cobre","label":"Cobre","value":1},{"key":"plata","label":"Plata","value":10},{"key":"oro","label":"Oro","value":100}]}]'::jsonb));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000031d', tests.sheet('[
  {"kind":"table","type":"monedas","key":"dinero","label":"Dinero",
   "rows":[{"key":"cp","label":"Cobre","value":1},{"key":"gp","label":"Oro","value":100}]},
  {"kind":"table","type":"economia","key":"bolsa","label":"Bolsa","editableBy":"dm","rewardDestination":true}]'::jsonb));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000031e', tests.sheet('[
  {"kind":"table","type":"monedas","key":"dinero","label":"Dinero",
   "rows":[{"key":"cp","label":"Cobre","value":1},{"key":"gp","label":"Oro","value":100}]}]'::jsonb));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000031f', tests.sheet('[
  {"kind":"table","type":"monedas","key":"dinero","label":"Dinero","rewardDestination":true,"rows":[]}]'::jsonb));

------------------------------------------------------------------------------
-- Stored data: the preset default carries the flag, nothing in the database is left without a destination
------------------------------------------------------------------------------
select ok(jsonb_path_exists((select system_profile -> 'sheet' from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000031b'),
  '$.categories[*].sections[*].items[*] ? (@.type == "monedas" && @.rewardDestination == true)'),
  'a new campaign (column default) has the coin table marked as the reward destination');
select is((select count(*) from public.campaigns c
            where jsonb_path_exists(c.system_profile -> 'sheet', '$.categories[*].sections[*].items[*] ? (@.type == "monedas")')
              and not jsonb_path_exists(c.system_profile -> 'sheet', '$.categories[*].sections[*].items[*] ? (@.rewardDestination == true)')
              and c.id not in ('ffffffff-0000-4000-8000-00000000031e')),
  0::bigint, 'no stored sheet with a coin table is left without a destination (the backfill ran)');

-- the pure backfill helper
select is(public._sheet_mark_reward_destination(tests.sheet('[{"kind":"table","type":"monedas","key":"dinero","label":"D","rows":[{"key":"cp","label":"C","value":1}]}]'::jsonb))
            #>> '{categories,0,sections,0,items,0,rewardDestination}', 'true', 'the backfill marks a coin table that has no destination anywhere') ;
select is(public._sheet_mark_reward_destination(tests.sheet('[{"kind":"table","type":"monedas","key":"dinero","label":"D","rows":[{"key":"cp","label":"C","value":1}]},
    {"kind":"table","type":"economia","key":"bolsa","label":"B","editableBy":"dm","rewardDestination":true}]'::jsonb)) #>> '{categories,0,sections,0,items,0,rewardDestination}', null,
  'it leaves the coin table alone when an economy table already is the destination');
select is(public._sheet_mark_reward_destination(tests.sheet('[{"kind":"field","key":"f","label":"F","type":"short","editableBy":"dm"}]'::jsonb)),
  tests.sheet('[{"kind":"field","key":"f","label":"F","type":"short","editableBy":"dm"}]'::jsonb), 'a sheet without a coin table is returned as it was');
select is(public._sheet_mark_reward_destination(public._sheet_mark_reward_destination(tests.sheet('[{"kind":"table","type":"monedas","key":"dinero","label":"D","rows":[]}]'::jsonb))),
  public._sheet_mark_reward_destination(tests.sheet('[{"kind":"table","type":"monedas","key":"dinero","label":"D","rows":[]}]'::jsonb)), 'and it is idempotent');
select lives_ok($$ select public.validate_system_profile((select system_profile from public.campaigns where id = 'ffffffff-0000-4000-8000-00000000031b')) $$,
  'the flagged preset still passes the SQL validator');

------------------------------------------------------------------------------
-- Internal helpers are not callable through the API
------------------------------------------------------------------------------
select is(has_function_privilege('authenticated', 'public._reward_target(uuid)', 'execute'), false, '_reward_target is internal');
select is(has_function_privilege('authenticated', 'public._reward_normalize(jsonb, jsonb)', 'execute'), false, '_reward_normalize is internal');
select is(has_function_privilege('authenticated', 'public._sheet_mark_reward_destination(jsonb)', 'execute'), false, '_sheet_mark_reward_destination is internal');
select is(has_function_privilege('authenticated', 'public.credit_character_coins(uuid, bigint, jsonb, timestamptz)', 'execute'), false, 'credit_character_coins stays internal');
select is((select prosecdef from pg_proc where oid = 'public._reward_target(uuid)'::regprocedure), true, '_reward_target is SECURITY DEFINER');
select is((select proconfig from pg_proc where oid = 'public._reward_target(uuid)'::regprocedure), array['search_path=""'], 'with an empty search_path');
select is((select proconfig from pg_proc where oid = 'public.play_loteria(uuid, bigint)'::regprocedure), array['search_path=""'], 'play_loteria keeps its empty search_path');
select is((select prosecdef from pg_proc where oid = 'public.assign_pot_to_character(uuid, bigint, jsonb)'::regprocedure), true, 'assign_pot_to_character is still SECURITY DEFINER');

------------------------------------------------------------------------------
-- L: a campaign WITHOUT a sheet behaves exactly as before (legacy keys, columns, silent coercion)
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000302');
select is(public.play_loteria('ffffffff-0000-4000-8000-00000000031a', 98011) - 'roll', jsonb_build_object('prize', '{"cp":3,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb, 'prize_target', 'player'),
  'L: a player play returns the five legacy keys');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000301');
select is((public.play_loteria('ffffffff-0000-4000-8000-00000000031a', null) -> 'prize'), '{"cp":3,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb, 'L: the DM roll goes to the pot with the legacy keys');
select is(((public.assign_pot_to_character('ffffffff-0000-4000-8000-00000000031a', 98012, '{"gp": 2, "zz": 9, "sp": "x"}'))) - 'updated_at', '{"campaign_id":"ffffffff-0000-4000-8000-00000000031a","cp":3,"sp":0,"ep":0,"gp":3,"pp":0}'::jsonb,
  'L: a pot payout debits the pot; unknown and malformed keys are still coerced to 0 (legacy)');
select throws_ok($$select public.assign_pot_to_character('ffffffff-0000-4000-8000-00000000031a', 98012, '{"gp": 999}')$$, 'P0001', 'insufficient_pot', 'L: insufficient_pot as before');
select tests.as_postgres();
select is((select monedas from public.pjs where id = 98011), '{"cp":3,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb, 'L: stored monedas of the winner');
select is((select monedas from public.pjs where id = 98012), '{"cp":0,"sp":0,"ep":0,"gp":2,"pp":0}'::jsonb, 'L: stored monedas of the payout target');
select ok((select sections_updated ? 'equipo' from public.pjs where id = 98011), 'L: the equipment section is stamped');
select is((select data from public.pjs where id = 98011), '{"stat_hp": 8}'::jsonb, 'L: pjs.data is untouched');

------------------------------------------------------------------------------
-- P: the preset default (sheet with the flagged coin table, keys cp..pp) credits pjs.monedas like before
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000302');
select is((public.play_loteria('ffffffff-0000-4000-8000-00000000031b', 98021) -> 'prize'), '{"cp":3,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb, 'P: the preset lottery pays the five preset denominations');
select tests.as_postgres();
select is((select monedas from public.pjs where id = 98021), '{"cp":3,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb, 'P: credited to pjs.monedas');
select ok((select sections_updated ? 'equipo' from public.pjs where id = 98021), 'P: the section holding the coin table (equipo) is stamped');

------------------------------------------------------------------------------
-- M: custom denominations, destination = the coin table
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000302');
select is((public.play_loteria('ffffffff-0000-4000-8000-00000000031c', 98031) -> 'prize'), '{"cobre":3,"plata":1,"oro":0}'::jsonb, 'M: the prize is expressed in the sheet denominations');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000031c', 98031)$$, 'P0001', 'already_played_today', 'M: one play per day still holds');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000304');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000031c', 98031)$$, '42501', 'not_a_member', 'M: a non-member is still refused first');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000303');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000031c', 98031)$$, '42501', 'not_your_character', 'M: a player cannot play for someone else''s character');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000031c', null)$$, 'P0001', 'character_required', 'M: a player must name a character');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000301');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000031c', null)$$, 'P0001', 'pot_denominations_unsupported', 'M: the DM lottery (pot) is refused: the pot has fixed columns');
select throws_ok($$select public.assign_pot_to_character('ffffffff-0000-4000-8000-00000000031c', 98032, '{"gp": 1}')$$, 'P0001', 'pot_denominations_unsupported', 'M: a pot payout is refused for the same reason');
select tests.as_postgres();
select is((select monedas from public.pjs where id = 98031), '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0,"cobre":3,"plata":1,"oro":0}'::jsonb, 'M: monedas merged: sheet denominations added, existing keys kept');
select is((select count(*) from public.game_logs where campaign_id = 'ffffffff-0000-4000-8000-00000000031c'), 1::bigint, 'M: the refused DM play left no log');
select is((select gp from public.game_pot where campaign_id = 'ffffffff-0000-4000-8000-00000000031c'), 5::bigint, 'M: and the pot is untouched');
select lives_ok($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000031c', 98031, '{"cobre": 2, "oro": 1}', now())$$, 'M: a second credit');
select is((select monedas ->> 'cobre' || '/' || (monedas ->> 'oro') from public.pjs where id = 98031), '5/1', 'M: credits ADD to the existing amounts');
select is(tests.err($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000031c', 98031, '{"zzz": 1}', now())$$), 'P0001:invalid_coins', 'M: an unknown denomination is refused');
select is(tests.err($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000031c', 98031, '{"cobre": -1}', now())$$), 'P0001:invalid_coins', 'M: a negative amount is refused');
select is(tests.err($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000031c', 98031, '{"cobre": 1.5}', now())$$), 'P0001:invalid_coins', 'M: a fractional amount is refused');
select is(tests.err($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000031c', 98031, '{"cobre": "abc"}', now())$$), 'P0001:invalid_coins', 'M: a text amount is refused');
select is(tests.err($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000031c', 98031, '[1]', now())$$), 'P0001:invalid_coins', 'M: a non-object payload is refused');
select is(tests.err($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000031c', 98031, '{"cp": 0, "cobre": 1}', now())$$), 'ok', 'M: a zero for a key that is not a denomination loses nothing and is tolerated');
select is((select monedas ->> 'cobre' from public.pjs where id = 98031), '6', 'M: and the refused credits left the balance as it was (5 + 1)');

------------------------------------------------------------------------------
-- E: destination = an economy table; pjs.monedas is not touched
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000302');
select is((public.play_loteria('ffffffff-0000-4000-8000-00000000031d', 98041) -> 'prize'), '{"cp":1,"gp":2}'::jsonb, 'E: the prize lists the sheet denominations');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000301');
select is((public.play_loteria('ffffffff-0000-4000-8000-00000000031d', null) -> 'prize_target'), '"pot"'::jsonb, 'E: legacy-key denominations can use the pot');
select is((select cp || '/' || gp from public.game_pot where campaign_id = 'ffffffff-0000-4000-8000-00000000031d'), '1/7', 'E: the DM prize reached the pot (0+1 / 5+2)');
select is(((public.assign_pot_to_character('ffffffff-0000-4000-8000-00000000031d', 98042, '{"gp": 3}')) ->> 'gp'), '4', 'E: a payout debits the pot');
select throws_ok($$select public.assign_pot_to_character('ffffffff-0000-4000-8000-00000000031d', 98042, '{"gp": 99}')$$, 'P0001', 'insufficient_pot', 'E: insufficient_pot against the same denominations');
select throws_ok($$select public.assign_pot_to_character('ffffffff-0000-4000-8000-00000000031d', 98042, '{"pp": 1}')$$, 'P0001', 'invalid_coins', 'E: a payout in a key that is not a denomination is refused');
select is((select gp from public.game_pot where campaign_id = 'ffffffff-0000-4000-8000-00000000031d'), 4::bigint, 'E: the refused payouts left the pot as it was');
select tests.as_postgres();
select is((select data -> 'bolsa' from public.pjs where id = 98041), '{"cp":1,"gp":2}'::jsonb, 'E: the winner''s economy table holds the prize');
select is((select data -> 'bolsa' from public.pjs where id = 98042), '{"cp":0,"gp":8,"extra":1}'::jsonb, 'E: a payout MERGES into existing amounts (5 + 3), other entries kept');
select is((select data - 'bolsa' from public.pjs where id = 98042), '{"stat_hp": 12}'::jsonb, 'E: the rest of pjs.data is untouched');
select is((select monedas from public.pjs where id = 98041), '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb, 'E: pjs.monedas is not credited');
select ok((select sections_updated ? 'alpha' and not (sections_updated ? 'equipo') from public.pjs where id = 98041), 'E: the section holding the economy table is stamped');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000302');
select is(tests.err($$update public.pjs set data = data || '{"bolsa": {"gp": 1000}}' where id = 98041$$), '42501:players may only edit identity fields of their own character', 'E: a player cannot write the economy table directly');
select is(tests.err($$update public.pjs set monedas = '{"gp": 1000}' where id = 98041$$), '42501:players may only edit identity fields of their own character', 'E: nor the monedas column');
select throws_ok($$select public.assign_pot_to_character('ffffffff-0000-4000-8000-00000000031d', 98041, '{"gp": 1}')$$, '42501', 'dm_only', 'E: payouts stay DM-only');
select is(tests.err($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000031d', 98041, '{"gp": 1000}', now())$$), '42501:permission denied for function credit_character_coins', 'E: a player cannot call the credit function');

------------------------------------------------------------------------------
-- N: denominations but no destination; Z: destination but no denominations. Everything is refused and nothing changes.
------------------------------------------------------------------------------
select tests.as_user('eeeeeeee-0000-4000-8000-000000000302');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000031e', 98051)$$, 'P0001', 'no_reward_destination', 'N: the lottery is refused for a player');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000031f', 98061)$$, 'P0001', 'no_reward_destination', 'Z: and without denominations');
select tests.as_user('eeeeeeee-0000-4000-8000-000000000301');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000031e', null)$$, 'P0001', 'no_reward_destination', 'N: the lottery is refused for the DM');
select throws_ok($$select public.assign_pot_to_character('ffffffff-0000-4000-8000-00000000031e', 98052, '{"gp": 1}')$$, 'P0001', 'no_reward_destination', 'N: a pot payout is refused');
select throws_ok($$select public.assign_pot_to_character('ffffffff-0000-4000-8000-00000000031f', 98062, '{"gp": 1}')$$, 'P0001', 'no_reward_destination', 'Z: a pot payout is refused');
select tests.as_postgres();
select is(tests.err($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000031e', 98051, '{"gp": 1}', now())$$), 'P0001:no_reward_destination', 'N: credit_character_coins refuses');
select is((select count(*) from public.game_logs where campaign_id in ('ffffffff-0000-4000-8000-00000000031e', 'ffffffff-0000-4000-8000-00000000031f')), 0::bigint, 'N/Z: no lottery log was written');
select is((select count(*) from public.pjs where campaign_id in ('ffffffff-0000-4000-8000-00000000031e', 'ffffffff-0000-4000-8000-00000000031f')
             and (monedas <> '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb or data <> '{"stat_hp": 8}'::jsonb or sections_updated <> '{}'::jsonb)), 0::bigint, 'N/Z: no character changed');
select is((select sum(gp)::bigint from public.game_pot where campaign_id in ('ffffffff-0000-4000-8000-00000000031e', 'ffffffff-0000-4000-8000-00000000031f')), 10::bigint, 'N/Z: the pots are untouched');

select * from finish();
rollback;
