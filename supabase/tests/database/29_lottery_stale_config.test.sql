-- pgTAP: G5b follow-up (S12, S16, S28). A lottery whose prizes hold a non-zero amount under a key that is not a denomination
-- of the sheet is NOT configured: play_loteria refuses BEFORE rolling with 'lottery_config_stale' (no roll, no log, no credit,
-- the daily play stays available). Also pins the strict amount rules of _reward_normalize, the economy destination over a
-- non-object stored value, and the reward target of a new campaign. Self-contained fixture, rolled back at the end.
begin;

select plan(32);

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

create function tests.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

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

-- the amounts of a credit against a sheet with cobre/plata/oro: the error message, or 'ok'
create function tests.norm(p_coins text) returns text language plpgsql as $$
begin
  perform public._reward_normalize('{"mode":"monedas","denominations":["cobre","plata","oro"]}'::jsonb, p_coins::jsonb);
  return 'ok';
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

------------------------------------------------------------------------------
-- Fixture: dm (..0401), player (..0402); campaigns
--   S sheet cobre/plata/oro, coin table is the destination      (char 97011)
--   T sheet cp/gp, coin table is the destination (pot supported)
--   L legacy (no sheet)                                          (char 97031)
--   E sheet cp/gp, economy table 'bolsa' is the destination      (chars 97041 scalar, 97042 array)
--   N new campaign with the column default
------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email)
select '00000000-0000-0000-0000-000000000000', ('eeeeeeee-0000-4000-8000-000000000' || (400 + n))::uuid, 'authenticated', 'authenticated', 'stale-u' || n || '@example.test'
from generate_series(1, 2) as n;

insert into public.campaigns (id, slug, name)
select ('ffffffff-0000-4000-8000-0000000004' || c)::uuid, 'stale-' || c, 'Stale ' || c from unnest(array['1a', '1b', '1c', '1d', '1e']) c;
-- 1a = S, 1b = T, 1c = L, 1d = E, 1e = N

insert into public.campaign_members (campaign_id, user_id, role)
select ('ffffffff-0000-4000-8000-0000000004' || c)::uuid, u.id, u.role
from unnest(array['1a', '1b', '1c', '1d', '1e']) c,
     (values ('eeeeeeee-0000-4000-8000-000000000401'::uuid, 'dm'), ('eeeeeeee-0000-4000-8000-000000000402'::uuid, 'player')) as u(id, role);

insert into public.pjs (id, campaign_id, owner_id, nombre, data)
values
  (97011, 'ffffffff-0000-4000-8000-00000000041a', 'eeeeeeee-0000-4000-8000-000000000402', 'S1', '{"stat_hp": 8}'),
  (97031, 'ffffffff-0000-4000-8000-00000000041c', 'eeeeeeee-0000-4000-8000-000000000402', 'L1', '{"stat_hp": 8}'),
  (97041, 'ffffffff-0000-4000-8000-00000000041d', 'eeeeeeee-0000-4000-8000-000000000402', 'E1', '{"bolsa": 5, "stat_hp": 7}'),
  (97042, 'ffffffff-0000-4000-8000-00000000041d', 'eeeeeeee-0000-4000-8000-000000000402', 'E2', '{"bolsa": [1, 2], "stat_hp": 9}');

insert into public.game_pot (campaign_id, gp, cp)
select ('ffffffff-0000-4000-8000-0000000004' || c)::uuid, 5, 0 from unnest(array['1a', '1b', '1c', '1d']) c;

insert into public.campaign_config (campaign_id, key, value, visibility) values
  ('ffffffff-0000-4000-8000-00000000041a', 'loteria', '{"commonMinRoll": 1, "commonPrize": {"gp": 1}, "specialPrize": {"cobre": 1}}', 'members'),
  ('ffffffff-0000-4000-8000-00000000041b', 'loteria', '{"commonMinRoll": 1, "commonPrize": {"cp": 1}, "specialPrize": {"sp": 2}}', 'members'),
  ('ffffffff-0000-4000-8000-00000000041c', 'loteria', '{"commonMinRoll": 1, "commonPrize": {"gp": 1, "zz": 5}, "specialPrize": {"gp": 1, "zz": 5}}', 'members');

update public.campaigns set system_profile = system_profile - 'sheet' where id = 'ffffffff-0000-4000-8000-00000000041c';
select tests.put_sheet('ffffffff-0000-4000-8000-00000000041a', tests.sheet('[
  {"kind":"table","type":"monedas","key":"dinero","label":"Dinero","rewardDestination":true,
   "rows":[{"key":"cobre","label":"Cobre","value":1},{"key":"plata","label":"Plata","value":10},{"key":"oro","label":"Oro","value":100}]}]'::jsonb));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000041b', tests.sheet('[
  {"kind":"table","type":"monedas","key":"dinero","label":"Dinero","rewardDestination":true,
   "rows":[{"key":"cp","label":"Cobre","value":1},{"key":"gp","label":"Oro","value":100}]}]'::jsonb));
select tests.put_sheet('ffffffff-0000-4000-8000-00000000041d', tests.sheet('[
  {"kind":"table","type":"monedas","key":"dinero","label":"Dinero",
   "rows":[{"key":"cp","label":"Cobre","value":1},{"key":"gp","label":"Oro","value":100}]},
  {"kind":"table","type":"economia","key":"bolsa","label":"Bolsa","editableBy":"dm","rewardDestination":true}]'::jsonb));

------------------------------------------------------------------------------
-- Amounts under keys that are not denominations: only a ZERO is tolerated; the amounts of denominations are bounded
------------------------------------------------------------------------------
select is(tests.norm('{"cobre": 1, "x": -0}'), 'ok', 'an unknown key with -0 is tolerated');
select is(tests.norm('{"x": "00"}'), 'ok', 'an unknown key with "00" is tolerated');
select is(tests.norm('{"x": null}'), 'ok', 'an unknown key with null is tolerated');
select is(tests.norm('{"x": 0.0001}'), 'P0001:invalid_coins', 'an unknown key with 0.0001 is refused');
select is(tests.norm('{"x": " 0"}'), 'P0001:invalid_coins', 'an unknown key with " 0" is refused');
select is(tests.norm('{"x": "0x0"}'), 'P0001:invalid_coins', 'an unknown key with "0x0" is refused');
select is(tests.norm('{"cobre": "1000000000000000"}'), 'P0001:invalid_coins', 'a text amount of sixteen digits is refused');
select is(tests.norm('{"cobre": 1e100}'), 'P0001:invalid_coins', 'an amount of 1e100 is refused');

------------------------------------------------------------------------------
-- A new campaign: the reward target is the coin table (pjs.monedas) in the equipment section
------------------------------------------------------------------------------
select is((public._reward_target('ffffffff-0000-4000-8000-00000000041e') ->> 'mode'), 'monedas', 'a new campaign credits the coin table (mode monedas)');
select is((public._reward_target('ffffffff-0000-4000-8000-00000000041e') ->> 'key'), 'dinero', 'its destination is the "dinero" table');
select is((public._reward_target('ffffffff-0000-4000-8000-00000000041e') ->> 'section'), 'equipo', 'in the equipo section');

------------------------------------------------------------------------------
-- Economy destination over a stored value that is not an object: replaced, the other data keys untouched
------------------------------------------------------------------------------
select lives_ok($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000041d', 97041, '{"gp": 2}', now())$$, 'E: credit over a scalar stored value');
select lives_ok($$select public.credit_character_coins('ffffffff-0000-4000-8000-00000000041d', 97042, '{"cp": 1}', now())$$, 'E: credit over an array stored value');
select is((select data from public.pjs where id = 97041), '{"bolsa": {"cp": 0, "gp": 2}, "stat_hp": 7}'::jsonb, 'E: the scalar is replaced by the balance, stat_hp untouched');
select is((select data from public.pjs where id = 97042), '{"bolsa": {"cp": 1, "gp": 0}, "stat_hp": 9}'::jsonb, 'E: the array is replaced by the balance, stat_hp untouched');

------------------------------------------------------------------------------
-- Stale prize config (S12): refused before rolling, nothing consumed
------------------------------------------------------------------------------
select is(has_function_privilege('authenticated', 'public._lottery_stale_keys(jsonb, jsonb)', 'execute'), false, '_lottery_stale_keys is internal');
select is((select prosecdef from pg_proc where oid = 'public.play_loteria(uuid, bigint)'::regprocedure), true, 'play_loteria is still SECURITY DEFINER');
select is((select proconfig from pg_proc where oid = 'public.play_loteria(uuid, bigint)'::regprocedure), array['search_path=""'], 'with an empty search_path');
select is(public._lottery_stale_keys(public._reward_target('ffffffff-0000-4000-8000-00000000041a'), '{"commonPrize":{"gp":1},"specialPrize":{"cobre":1,"zz":"0","yy":null}}'),
  array['gp'], 'only the non-zero keys that are not denominations are reported');

select tests.as_user('eeeeeeee-0000-4000-8000-000000000402');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000041a', 97011)$$, 'P0001', 'lottery_config_stale', 'S: a stale commonPrize refuses the play');
select tests.as_postgres();
select is((select count(*) from public.game_logs where campaign_id = 'ffffffff-0000-4000-8000-00000000041a'), 0::bigint, 'S: no log was written');
select is((select monedas from public.pjs where id = 97011), '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb, 'S: nothing was credited');

update public.campaign_config set value = '{"commonMinRoll": 1, "commonPrize": {"cobre": 1}, "specialPrize": {"gp": 2}}'
where campaign_id = 'ffffffff-0000-4000-8000-00000000041a' and key = 'loteria';
select tests.as_user('eeeeeeee-0000-4000-8000-000000000402');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000041a', 97011)$$, 'P0001', 'lottery_config_stale', 'S: a stale specialPrize refuses the play as well');

select tests.as_postgres();
update public.campaign_config set value = '{"commonMinRoll": 1, "commonPrize": {"cobre": 1, "gp": 0}, "specialPrize": {"cobre": 1, "zz": "00"}}'
where campaign_id = 'ffffffff-0000-4000-8000-00000000041a' and key = 'loteria';
select tests.as_user('eeeeeeee-0000-4000-8000-000000000402');
select is(tests.err($$select public.play_loteria('ffffffff-0000-4000-8000-00000000041a', 97011)$$), 'ok', 'S: a later valid play the same day is still allowed (zero stale keys tolerated)');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000041a', 97011)$$, 'P0001', 'already_played_today', 'S: and that one consumed the day');
select tests.as_postgres();
select is((select count(*) from public.game_logs where campaign_id = 'ffffffff-0000-4000-8000-00000000041a'), 1::bigint, 'S: exactly one log, from the valid play');
select is((select monedas ->> 'cobre' from public.pjs where id = 97011), '1', 'S: and one credit');

select tests.as_user('eeeeeeee-0000-4000-8000-000000000401');
select throws_ok($$select public.play_loteria('ffffffff-0000-4000-8000-00000000041b', null)$$, 'P0001', 'lottery_config_stale', 'T: the DM roll (pot) is refused too');
select tests.as_postgres();
select is((select count(*) from public.game_logs where campaign_id = 'ffffffff-0000-4000-8000-00000000041b'), 0::bigint, 'T: no log for the refused DM roll');
select is((select cp || '/' || gp from public.game_pot where campaign_id = 'ffffffff-0000-4000-8000-00000000041b'), '0/5', 'T: and the pot is untouched');

select tests.as_user('eeeeeeee-0000-4000-8000-000000000402');
select is(tests.err($$select public.play_loteria('ffffffff-0000-4000-8000-00000000041c', 97031)$$), 'ok', 'L: a legacy campaign is unchanged (unknown keys are coerced as before)');
select tests.as_postgres();
select is((select monedas ->> 'gp' from public.pjs where id = 97031), '1', 'L: the legacy credit landed in pjs.monedas');

select * from finish();
rollback;

