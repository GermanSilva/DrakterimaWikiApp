-- Local development seed. Loaded by `supabase db reset` (see [db.seed] in config.toml).
-- NEVER run this against a hosted project: it inserts fake auth users.
--
-- DRAFT: not executed yet (no Docker). Verify with `supabase db reset`.
--
-- Users (magic-link only: no password is set; read the link in the local Mailpit inbox,
-- http://127.0.0.1:54324, after requesting a sign-in link for the address):
--   dm@example.test        DM of campaign A ("Drakterima Demo")  and PLAYER in campaign B
--   player1@example.test   player in A (owns Maisie)             and DM of campaign B ("Port Azure")
--   player2@example.test   player in A (owns Eldric)
--   outsider@example.test  member of nothing
--
-- Roles cross between the two campaigns on purpose, to exercise multi-campaign behaviour.

------------------------------------------------------------------------------
-- Auth users + identities (the on_auth_user_created trigger creates the profiles)
------------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'dm@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Demo DM"}',
   now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'player1@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Player One"}',
   now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'player2@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Player Two"}',
   now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'outsider@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Outsider"}',
   now(), now(), '', '', '', '', '', '', '', '');

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(), now(), now()
from auth.users u
where u.email in ('dm@example.test', 'player1@example.test', 'player2@example.test', 'outsider@example.test');

------------------------------------------------------------------------------
-- Campaigns, members, config
------------------------------------------------------------------------------

insert into public.campaigns (id, slug, name, branding, regions, character_custom_fields, created_by) values
  ('cccccccc-0000-4000-8000-00000000000a', 'drakterima-demo', 'Drakterima Demo',
   '{"accent_color": "#dc2626", "tagline": "Local demo campaign"}',
   '[{"key":"magral","label":"Magral","color":"#dc2626"},{"key":"nezor","label":"Nezor","color":"#f59e0b"},{"key":"otro","label":"Otro","color":"#9ca3af"}]',
   '[{"key":"magralita","label":"Relación con la Magralita","type":"text"}]',
   'aaaaaaaa-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-00000000000b', 'port-azure', 'Port Azure',
   '{"accent_color": "#0ea5e9", "tagline": "Second demo campaign"}',
   '[{"key":"harbor","label":"Harbor","color":"#0ea5e9"},{"key":"reef","label":"Reef","color":"#22c55e"}]',
   '[]',
   'aaaaaaaa-0000-4000-8000-000000000002');

insert into public.campaign_members (campaign_id, user_id, role) values
  ('cccccccc-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001', 'dm'),
  ('cccccccc-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000002', 'player'),
  ('cccccccc-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000003', 'player'),
  ('cccccccc-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-000000000002', 'dm'),
  ('cccccccc-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-000000000001', 'player');

insert into public.game_pot (campaign_id, gp) values
  ('cccccccc-0000-4000-8000-00000000000a', 5),
  ('cccccccc-0000-4000-8000-00000000000b', 0);

insert into public.campaign_config (campaign_id, key, value, visibility) values
  ('cccccccc-0000-4000-8000-00000000000a', 'loteria',
   '{"commonMinRoll":17,"commonPrize":{"cp":3,"sp":0,"ep":0,"gp":0,"pp":0},"specialPrize":{"cp":0,"sp":1,"ep":0,"gp":0,"pp":0}}', 'members'),
  ('cccccccc-0000-4000-8000-00000000000a', 'session_screen', '{"cards":[]}', 'dm'),
  ('cccccccc-0000-4000-8000-00000000000b', 'loteria',
   '{"commonMinRoll":15,"commonPrize":{"cp":0,"sp":2,"ep":0,"gp":0,"pp":0},"specialPrize":{"cp":0,"sp":0,"ep":0,"gp":1,"pp":0}}', 'members');

------------------------------------------------------------------------------
-- Characters (explicit ids, like the Firestore import will do)
------------------------------------------------------------------------------

insert into public.pjs (id, campaign_id, owner_id, nombre, jugador, clase, raza, region, nivel, monedas, data) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000002',
   'Maisie Moonwhisper', 'Demo Player One', 'Druida', 'Por definir', 'magral', 1, '{"cp": 0, "sp": 0, "ep": 0, "gp": 10, "pp": 0}',
   '{"stat_hp": 8, "ataques": [], "equipo": [], "custom_fields": {"magralita": "Siente su pulso."}}'),
  (2, 'cccccccc-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000003',
   'Eldric Vaelis', 'Demo Player Two', 'Paladín', 'Humano', 'magral', 1, '{"cp": 0, "sp": 5, "ep": 0, "gp": 0, "pp": 0}',
   '{"stat_hp": 12}'),
  -- unclaimed: claimable with the demo invite below
  (3, 'cccccccc-0000-4000-8000-00000000000a', null,
   'Kaylinx Echoryn', '', 'Hechicero', 'Changeling', 'nezor', 1, default, '{"stat_hp": 6}'),
  -- dm@example.test is a PLAYER in campaign B
  (4, 'cccccccc-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-000000000001',
   'Brann Stonefist', 'Demo DM', 'Guerrero', 'Enano', 'harbor', 2, default, '{"stat_hp": 20}');

------------------------------------------------------------------------------
-- Entities in every estado, campaign A
------------------------------------------------------------------------------

insert into public.lugares (id, campaign_id, nombre, region, tipo, estado, visible_to, data) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 'Kardevir',      'magral', 'ciudad',    'publicado', '{}',  '{"subtitulo": "Ciudad del Paso", "descripcion": "Public city."}'),
  (2, 'cccccccc-0000-4000-8000-00000000000a', 'Hidden Vault',  'magral', 'dungeon',   'borrador',  '{}',  '{"descripcion": "Draft, DM only."}'),
  -- secret, visible only to character 1 (Maisie, owned by player1)
  (3, 'cccccccc-0000-4000-8000-00000000000a', 'Moonlit Grove', 'magral', 'región',    'secreto',   '{1}', '{"descripcion": "Only Maisie knows this place."}'),
  -- secret, visible to nobody but the DM
  (4, 'cccccccc-0000-4000-8000-00000000000a', 'Sealed Crypt',  'nezor',  'dungeon',   'secreto',   '{}',  '{"descripcion": "Secret with an empty audience."}');

insert into public.pnjs (id, campaign_id, nombre, region, relacion, estado, visible_to, data) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 'Maelis Dornavar', 'magral', 'aliado',  'publicado', '{}',  '{"rol": "Coordinadora del Gremio", "faccion": "Gremio de Aventureros"}'),
  (2, 'cccccccc-0000-4000-8000-00000000000a', 'The Veiled One',  'nezor',  'enemigo', 'secreto',   '{2}', '{"rol": "Unknown"}');

insert into public.facciones (id, campaign_id, nombre, tipo, region, relacion, data) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 'Gremio de Aventureros', 'gremio', 'magral', 'aliado', '{"descripcion": "Independent guild."}');

insert into public.lore (id, campaign_id, titulo, categoria, data) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 'La Guerra de los Dragones', 'historia', '{"descripcion": "Ancient conflict."}');

insert into public.items (id, campaign_id, nombre, tipo, rareza, estado, visible_to, data) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 'Moonstone Amulet', 'objeto maravilloso', 'raro', 'secreto', '{2}', '{"requiere_sintonia": true, "descripcion": "Visible to Eldric only."}');

insert into public.sesiones (id, campaign_id, tipo, numero, orden, titulo, fecha, estado, data) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 'sesion', 1, 100, 'El Escuadrón Incompleto', current_date, 'publicado', '{"resumen": "First session.", "logros": "Met the guild."}'),
  (2, 'cccccccc-0000-4000-8000-00000000000a', 'sesion', 2, 200, 'Draft session',           null,         'borrador',  '{"resumen": "Not announced yet."}'),
  (3, 'cccccccc-0000-4000-8000-00000000000a', 'avance', null, 150, 'Something approaches', null,        'publicado', '{"texto": "A rumour spreads."}');

insert into public.mapas (id, campaign_id, nombre, imagen_url, is_default, data) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 'Drakterima', 'https://example.test/map.png', true, '{"descripcion": "Continent map."}');

insert into public.map_points (id, campaign_id, map_id, nombre, x, y, link_type, link_id, estado) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 1, 'Kardevir',      0.45, 0.60, 'lugar', 1, 'publicado'),
  (2, 'cccccccc-0000-4000-8000-00000000000a', 1, 'Hidden Vault',  0.20, 0.30, 'lugar', 2, 'borrador');

insert into public.homebrew_rules (id, campaign_id, nombre, texto) values
  (1, 'cccccccc-0000-4000-8000-00000000000a', 'Critical fumbles', 'Roll a d20 on every natural 1.');

------------------------------------------------------------------------------
-- Entities, campaign B (dm@ is only a player here)
------------------------------------------------------------------------------

insert into public.lugares (id, campaign_id, nombre, region, tipo, estado, data) values
  (5, 'cccccccc-0000-4000-8000-00000000000b', 'Port Azure',     'harbor', 'ciudad',  'publicado', '{"descripcion": "Public harbour."}'),
  (6, 'cccccccc-0000-4000-8000-00000000000b', 'Smugglers Cove', 'reef',   'dungeon', 'borrador',  '{"descripcion": "Draft, DM (player1) only."}');

insert into public.pnjs (id, campaign_id, nombre, region, relacion, data) values
  (3, 'cccccccc-0000-4000-8000-00000000000b', 'Harbourmaster Lyra', 'harbor', 'neutral', '{"rol": "Harbourmaster"}');

------------------------------------------------------------------------------
-- DM-private notes
------------------------------------------------------------------------------

insert into public.entity_dm_notes (campaign_id, entity_type, entity_id, notas, secreto, ganchos) values
  ('cccccccc-0000-4000-8000-00000000000a', 'pnjs',     1, 'Plays both sides.',            'Secretly reports to the Legion.', ''),
  ('cccccccc-0000-4000-8000-00000000000a', 'sesiones', 1, '',                             '',                                'Follow up on the audit.'),
  ('cccccccc-0000-4000-8000-00000000000a', 'pjs',      1, 'Her patron is not who she thinks.', '',                           ''),
  ('cccccccc-0000-4000-8000-00000000000b', 'lugares',  6, 'Treasure is under the third barrel.', '',                         '');

------------------------------------------------------------------------------
-- Player notes, read state, calendar
------------------------------------------------------------------------------

insert into public.player_notes (campaign_id, user_id, entity_type, entity_id, character_id, text) values
  ('cccccccc-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000002', 'lugares', 1, 1, 'Maisie: great harbour views.'),
  ('cccccccc-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-000000000001', 'lugares', 5, 4, 'Brann: need a ship.');

insert into public.read_state (user_id, campaign_id, entity_type, entity_id, section, seen_at) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-00000000000a', 'lugares', 1, '', now());

insert into public.disponibilidad (campaign_id, tipo, character_id, fecha_inicio, fecha_fin, hora_inicio, hora_fin) values
  ('cccccccc-0000-4000-8000-00000000000a', 'sesion',   null, current_date + 7, current_date + 7, '19:00', '23:00'),
  ('cccccccc-0000-4000-8000-00000000000a', 'personal', 1,    current_date + 7, current_date + 7, '18:00', '23:30');

------------------------------------------------------------------------------
-- Invite: whoever redeems it joins campaign A as a player and takes over Kaylinx (character 3)
------------------------------------------------------------------------------

insert into public.campaign_invites (campaign_id, code, role, character_id, max_uses, created_by) values
  ('cccccccc-0000-4000-8000-00000000000a', 'devinvite0000000000000000000000a1', 'player', 3, 1,
   'aaaaaaaa-0000-4000-8000-000000000001');

------------------------------------------------------------------------------
-- Advance identity sequences past the explicit ids used above
------------------------------------------------------------------------------

select setval(pg_get_serial_sequence('public.sesiones', 'id'),        (select coalesce(max(id), 1) from public.sesiones));
select setval(pg_get_serial_sequence('public.pjs', 'id'),             (select coalesce(max(id), 1) from public.pjs));
select setval(pg_get_serial_sequence('public.pnjs', 'id'),            (select coalesce(max(id), 1) from public.pnjs));
select setval(pg_get_serial_sequence('public.lugares', 'id'),         (select coalesce(max(id), 1) from public.lugares));
select setval(pg_get_serial_sequence('public.facciones', 'id'),       (select coalesce(max(id), 1) from public.facciones));
select setval(pg_get_serial_sequence('public.lore', 'id'),            (select coalesce(max(id), 1) from public.lore));
select setval(pg_get_serial_sequence('public.items', 'id'),           (select coalesce(max(id), 1) from public.items));
select setval(pg_get_serial_sequence('public.mapas', 'id'),           (select coalesce(max(id), 1) from public.mapas));
select setval(pg_get_serial_sequence('public.map_points', 'id'),      (select coalesce(max(id), 1) from public.map_points));
select setval(pg_get_serial_sequence('public.homebrew_rules', 'id'),  (select coalesce(max(id), 1) from public.homebrew_rules));
