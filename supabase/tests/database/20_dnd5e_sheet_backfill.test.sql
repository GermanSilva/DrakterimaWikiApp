-- pgTAP: F2c of the system-agnostic campaigns. Every campaign carries the D&D 5e sheet (backfill) and new campaigns get it
-- by default; saving through set_system_profile keeps it. Self-contained: rolled back at the end.
begin;

select plan(9);

-- 1-2: the backfill covered every existing campaign and left a valid document
select is((select count(*)::int from public.campaigns where not (system_profile ? 'sheet')), 0, 'no campaign is left without a sheet');
select ok((select bool_and(public.validate_system_profile(system_profile) = system_profile) from public.campaigns), 'every stored document validates and comes back unchanged');

-- 3-5: the default for new campaigns
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sheet-dm@example.test', '{"full_name": "Sheet DM"}'::jsonb);
insert into public.campaigns (id, slug, name, created_by)
values ('cccccccc-0000-4000-8000-0000000000aa', 'sheet-default', 'Sheet default', 'cccccccc-0000-4000-8000-000000000001');
insert into public.campaign_members (campaign_id, user_id, role)
values ('cccccccc-0000-4000-8000-0000000000aa', 'cccccccc-0000-4000-8000-000000000001', 'dm');
select ok((select system_profile ? 'sheet' from public.campaigns where id = 'cccccccc-0000-4000-8000-0000000000aa'), 'a new campaign gets a sheet by default');
select is((select jsonb_array_length(system_profile #> '{sheet,categories}') from public.campaigns where id = 'cccccccc-0000-4000-8000-0000000000aa'), 4, 'with the four categories of the D&D preset');
select is((select system_profile #>> '{sheet,roles,hp}' from public.campaigns where id = 'cccccccc-0000-4000-8000-0000000000aa'), 'stat_hp', 'and the role bindings');

-- 6-7: coins (S12, S14): the five D&D denominations, copper is the base
select is(
  (select jsonb_object_agg(r ->> 'key', (r ->> 'value')::int)
     from public.campaigns c,
          jsonb_array_elements(c.system_profile #> '{sheet,categories,2,sections,2,items,1,rows}') r
    where c.id = 'cccccccc-0000-4000-8000-0000000000aa'),
  '{"cp": 1, "sp": 10, "ep": 50, "gp": 100, "pp": 1000}'::jsonb,
  'the coin table defines cp 1, sp 10, ep 50, gp 100, pp 1000');
select is((select system_profile #>> '{sheet,categories,2,sections,2,items,1,type}' from public.campaigns where id = 'cccccccc-0000-4000-8000-0000000000aa'), 'monedas', 'and it is the coin table');

-- 8-9: the DM write path keeps the sheet
create function pg_temp.save_as_dm() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_system_profile('cccccccc-0000-4000-8000-0000000000aa',
    (select system_profile from public.campaigns where id = 'cccccccc-0000-4000-8000-0000000000aa'),
    (select updated_at from public.campaigns where id = 'cccccccc-0000-4000-8000-0000000000aa'));
  execute 'reset role';
end;
$$;
select lives_ok($$ select pg_temp.save_as_dm() $$, 'a DM saves the document back as it is');
select is((select jsonb_array_length(system_profile #> '{sheet,categories}') from public.campaigns where id = 'cccccccc-0000-4000-8000-0000000000aa'), 4, 'and the sheet is still there after the save');

select * from finish();
rollback;
