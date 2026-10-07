-- pgTAP: profiles caps are enforced by the database (not only by the client form) and
-- handle_new_user always produces a valid row. Rolled back at the end.
begin;

select plan(13);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Fixture (as postgres). The trigger creates one profile per user.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'cap-user@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'long@example.test',
    json_build_object('full_name', repeat('x', 200), 'avatar_url', 'http://insecure.test/a.png')::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'pic@example.test',
    json_build_object('name', '   ', 'picture', 'HTTPS://ok.test/a.png')::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'ws@example.test',
    json_build_object('avatar_url', 'https://a.test/a b.png')::jsonb);

-- handle_new_user output is always valid
select is((select display_name from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000002'), 'Usuario',
  'empty email local part falls back to Usuario');
select is((select char_length(display_name) from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000003'), 80,
  'metadata name is capped at 80');
select is((select avatar_url from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000003'), null,
  'http avatar from metadata is dropped');
select is((select display_name from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000004'), 'pic',
  'blank metadata name falls back to the email local part');
select is((select avatar_url from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000004'), 'HTTPS://ok.test/a.png',
  'uppercase https scheme is accepted');
select is((select avatar_url from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000005'), null,
  'avatar with whitespace is dropped');

-- User PATCH through the API role
select tests.as_user('eeeeeeee-0000-4000-8000-000000000001');

select throws_ok($$update public.profiles set display_name = repeat('x', 81) where id = 'eeeeeeee-0000-4000-8000-000000000001'$$,
  '23514', null, 'name over 80 characters is rejected');
select throws_ok($$update public.profiles set display_name = '   ' where id = 'eeeeeeee-0000-4000-8000-000000000001'$$,
  '23514', null, 'blank name is rejected');
select throws_ok($$update public.profiles set avatar_url = 'http://x.test/a.png' where id = 'eeeeeeee-0000-4000-8000-000000000001'$$,
  '23514', null, 'http avatar is rejected');
select throws_ok($$update public.profiles set avatar_url = 'javascript:alert(1)' where id = 'eeeeeeee-0000-4000-8000-000000000001'$$,
  '23514', null, 'javascript: avatar is rejected');
select throws_ok($$update public.profiles set avatar_url = 'https://x.test/' || repeat('a', 500) where id = 'eeeeeeee-0000-4000-8000-000000000001'$$,
  '23514', null, 'avatar over 500 characters is rejected');
select lives_ok($$update public.profiles set display_name = repeat('x', 80), avatar_url = 'https://x.test/a.png' where id = 'eeeeeeee-0000-4000-8000-000000000001'$$,
  'valid values pass');
select lives_ok($$update public.profiles set avatar_url = null where id = 'eeeeeeee-0000-4000-8000-000000000001'$$,
  'a null avatar passes');

select * from finish();
rollback;
