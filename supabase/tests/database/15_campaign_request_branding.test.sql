-- pgTAP: branding fields (tagline, accent colour, logo) on campaign requests and creation. Self-contained fixture,
-- rolled back at the end.
begin;

select plan(33);

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

create function tests.as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end;
$$;

create function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
end;
$$;

create function tests.rid(n text) returns bigint language sql security definer set search_path = '' as $$
  select id from public.campaign_requests where name = n;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Fixture: 1 hub owner, 2 requester, 3 stranger
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', ('aaaaaaaa-4444-4000-8000-00000000000' || n)::uuid,
       'authenticated', 'authenticated', 'brand-u' || n || '@example.test', json_build_object('full_name', 'Brand User ' || n)::jsonb
from generate_series(1, 3) as n;

insert into public.hub_owners (user_id) values ('aaaaaaaa-4444-4000-8000-000000000001');

------------------------------------------------------------------------------
-- Requests: columns, normalisation, validation
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-4444-4000-8000-000000000002');
select lives_ok(
  format($$insert into public.campaign_requests (name, slug_wanted, tagline, accent_color, logo_url)
           values ('Req A', 'brand-a', %L, '#AABBCC', ' https://cdn.test/logo.png ')$$,
         '  Una historia ' || chr(8203) || 'de dragones  '),
  'a requester can send tagline, accent colour and logo with the request');

select tests.as_postgres();
select is((select tagline from public.campaign_requests where name = 'Req A'), 'Una historia de dragones',
  'tagline: control and zero-width characters stripped, trimmed');
select is((select accent_color from public.campaign_requests where name = 'Req A'), '#aabbcc',
  'accent colour is stored lower-case');
select is((select logo_url from public.campaign_requests where name = 'Req A'), 'https://cdn.test/logo.png',
  'logo url is trimmed');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000002');
insert into public.campaign_requests (name, slug_wanted, tagline, accent_color, logo_url)
values ('Req B', 'brand-b', '   ', '', '');
select tests.as_postgres();
select is((select tagline from public.campaign_requests where name = 'Req B'), null, 'a blank tagline becomes null');
select is((select accent_color from public.campaign_requests where name = 'Req B'), null, 'an empty accent colour becomes null');
select is((select logo_url from public.campaign_requests where name = 'Req B'), null, 'an empty logo url becomes null');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000002');
select throws_ok($$insert into public.campaign_requests (name, accent_color) values ('Bad 1', 'red')$$, '23514', 'invalid_accent_color',
  'accent colour: a named colour is rejected');
select throws_ok($$insert into public.campaign_requests (name, accent_color) values ('Bad 2', '#fff')$$, '23514', 'invalid_accent_color',
  'accent colour: a 3-digit hex is rejected');
select throws_ok($$insert into public.campaign_requests (name, accent_color) values ('Bad 3', 'url(x)')$$, '23514', 'invalid_accent_color',
  'accent colour: css functions are rejected');
select throws_ok($$insert into public.campaign_requests (name, logo_url) values ('Bad 4', 'http://x.test/a.png')$$, '23514', 'invalid_logo_url',
  'logo: http is rejected');
select throws_ok($$insert into public.campaign_requests (name, logo_url) values ('Bad 5', 'javascript:alert(1)')$$, '23514', 'invalid_logo_url',
  'logo: javascript: is rejected');
select throws_ok(format($$insert into public.campaign_requests (name, logo_url) values ('Bad 6', %L)$$, 'https://x.test/' || repeat('a', 500)), '23514', 'invalid_logo_url',
  'logo: longer than 500 characters is rejected');
select throws_ok($$insert into public.campaign_requests (name, logo_url) values ('Bad 7', 'https://x.test/a b.png')$$, '23514', 'invalid_logo_url',
  'logo: whitespace inside the url is rejected');
select throws_ok(format($$insert into public.campaign_requests (name, tagline) values ('Bad 8', %L)$$, repeat('t', 141)), '23514', 'invalid_tagline',
  'tagline: longer than 140 characters is rejected');

------------------------------------------------------------------------------
-- Privileges
------------------------------------------------------------------------------
select throws_ok(
  $$update public.campaign_requests set tagline = 'x' where name = 'Req A'$$, '42501', null,
  'a requester cannot UPDATE the branding columns afterwards');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000003');
select is((select count(*) from public.campaign_requests where name = 'Req A'), 0::bigint,
  'a stranger cannot see another user''s request');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000002');
select is((select tagline from public.campaign_requests where name = 'Req A'), 'Una historia de dragones',
  'the requester reads the branding columns of their own request');

select tests.as_anon();
select throws_ok($$insert into public.campaign_requests (name, tagline) values ('Anon', 'x')$$, '42501', null,
  'anon cannot insert a request');

------------------------------------------------------------------------------
-- Approval carries the branding into the campaign
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-4444-4000-8000-000000000001');
select public.approve_campaign_request(tests.rid('Req A'));
select tests.as_postgres();
select is((select branding from public.campaigns where slug = 'brand-a'),
  '{"tagline": "Una historia de dragones", "accent_color": "#aabbcc", "logo_url": "https://cdn.test/logo.png"}'::jsonb,
  'approving a request stores its branding in campaigns.branding');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000001');
select public.approve_campaign_request(tests.rid('Req B'));
select tests.as_postgres();
select is((select branding from public.campaigns where slug = 'brand-b'), '{}'::jsonb,
  'a request without branding leaves branding empty (no null keys)');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000002');
insert into public.campaign_requests (name, slug_wanted, accent_color) values ('Req O', 'brand-o', '#010203');
select tests.as_user('aaaaaaaa-4444-4000-8000-000000000001');
select public.approve_campaign_request(tests.rid('Req O'), 'brand-o2', 'Renamed');
select tests.as_postgres();
select is((select branding from public.campaigns where slug = 'brand-o2'), '{"accent_color": "#010203"}'::jsonb,
  'an approval with overrides keeps the request branding');

------------------------------------------------------------------------------
-- Direct creation by a hub owner
------------------------------------------------------------------------------
select tests.as_user('aaaaaaaa-4444-4000-8000-000000000001');
select public.create_campaign('brand-c', 'Camp C', 'Mi lema', '#102030', 'https://cdn.test/c.png');
select tests.as_postgres();
select is((select branding from public.campaigns where slug = 'brand-c'),
  '{"tagline": "Mi lema", "accent_color": "#102030", "logo_url": "https://cdn.test/c.png"}'::jsonb,
  'create_campaign stores the branding it receives');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000001');
select public.create_campaign('brand-d', 'Camp D');
select tests.as_postgres();
select is((select branding from public.campaigns where slug = 'brand-d'), '{}'::jsonb,
  'the previous two-argument call shape still works and leaves branding empty');

select tests.as_user('aaaaaaaa-4444-4000-8000-000000000001');
select throws_ok($$select public.create_campaign('brand-e', 'Camp E', null, 'red', null)$$, '23514', 'invalid_accent_color',
  'create_campaign validates the accent colour');
select throws_ok($$select public.create_campaign('brand-f', 'Camp F', null, null, 'http://x.test/a.png')$$, '23514', 'invalid_logo_url',
  'create_campaign validates the logo url');
select throws_ok(format($$select public.create_campaign('brand-g', 'Camp G', %L)$$, repeat('t', 141)), '23514', 'invalid_tagline',
  'create_campaign validates the tagline length');
select public.create_campaign('brand-n', 'Camp N', null, '#AABBCC' || chr(10));
select public.create_campaign('brand-u', 'Camp U', null, null, 'https://x.test/a' || chr(8238) || 'b.png');
select tests.as_postgres();
select is((select branding ->> 'accent_color' from public.campaigns where slug = 'brand-n'), '#aabbcc',
  'a trailing newline and upper case in the accent are cleaned on the direct path (never stored as is)');
select is((select branding ->> 'logo_url' from public.campaigns where slug = 'brand-u'), 'https://x.test/ab.png',
  'a bidi override in a logo url is stripped on the direct path, like on the request path');

------------------------------------------------------------------------------
-- Function surface
------------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.create_campaign_for(uuid, text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.create_campaign_for(uuid, text, text, jsonb)', 'execute'),
  'the internal creator is still not callable through the API');
select hasnt_function('public', 'create_campaign', array['text', 'text'],
  'the old two-argument create_campaign overload is gone');
select hasnt_function('public', 'create_campaign_for', array['uuid', 'text', 'text'],
  'the old three-argument internal creator is gone (no unchecked path around the branding validation)');
select ok(
  has_function_privilege('authenticated', 'public.create_campaign(text, text, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.create_campaign(text, text, text, text, text)', 'execute'),
  'create_campaign is callable by authenticated only');

select * from finish();
rollback;
