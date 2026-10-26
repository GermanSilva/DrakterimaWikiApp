-- E1 of the system-agnostic campaigns (odd/tasks/system-agnostic.md): the system of a campaign becomes DATA.
--
--   * campaigns.system_profile (jsonb, NOT NULL): the "system document" of the campaign. Version 1 holds
--       character.builtins  which of the built-in character columns (clase, raza, nivel) are used, their label and the
--                           nivel range;
--       currency            the denominations (key = a key of pjs.monedas / game_pot, label, display order) or disabled;
--       modules             which optional sections the campaign offers.
--     The default is the D&D 5e document, i.e. exactly what the application hard-codes today, so every existing campaign
--     is backfilled with it by ADD COLUMN and NOTHING changes for anybody. Later stages (E2 character sheet, E3 currency
--     and vocabulary, E4 modules and templates) read the document; E3 adds a "vocabulary" section additively.
--   * "Copy on create" (decision, user 2026-10-26): a template is copied into the campaign; there is no inheritance, so
--     the document is self-contained and a campaign never depends on another row to be understood.
--   * Nobody can write the document through the API yet: there is NO insert/update grant on the column. E2 adds the
--     validated write path (a SECURITY DEFINER RPC) together with the editor. Until then only migrations and
--     service_role touch it.
--   * campaigns.system stops being limited to 'dnd5e'. It becomes the informational "based on" identifier of the
--     campaign (a derived or heavily modified system keeps pointing at its origin); it has no technical effect. It stays
--     DM-updatable as before, now with a format check instead of a one-value list.
--
-- Shape guard: the CHECK only enforces the minimum a reader can rely on (an object, "version" = the number 1, at most
-- 64 KB). The content is validated where it is written (E2), not here, so a later stage can extend version 1
-- additively without a table rewrite.

alter table public.campaigns
  add column system_profile jsonb not null default $profile${
    "version": 1,
    "character": {
      "builtins": {
        "clase": {"enabled": true, "label": "Clase"},
        "raza": {"enabled": true, "label": "Raza"},
        "nivel": {"enabled": true, "label": "Nivel", "min": 1, "max": 20}
      }
    },
    "currency": {
      "enabled": true,
      "denominations": [
        {"key": "pp", "label": "platino"},
        {"key": "gp", "label": "oro"},
        {"key": "ep", "label": "electrum"},
        {"key": "sp", "label": "plata"},
        {"key": "cp", "label": "bronce"}
      ]
    },
    "modules": {"juegos": true, "sesion_en_vivo": true, "mapas": true, "calendario": true}
  }$profile$::jsonb;

alter table public.campaigns
  add constraint campaigns_system_profile_check check (
    jsonb_typeof(system_profile) = 'object'
    and coalesce(system_profile -> 'version' = '1'::jsonb, false)
    and octet_length(system_profile::text) <= 65536
  );

comment on column public.campaigns.system_profile is
  'System document of the campaign (version 1): character built-ins, currency, modules. Copied from a template at creation; not writable through the API until E2.';

-- `system`: from the single value 'dnd5e' to a format-checked "based on" identifier.
alter table public.campaigns drop constraint campaigns_system_check;
alter table public.campaigns
  add constraint campaigns_system_check check (system ~ '^[a-z0-9]([a-z0-9_-]{0,38}[a-z0-9])?$');

comment on column public.campaigns.system is
  'Informational "based on" identifier of the game system (lower-case letters, digits, dash, underscore; 1..40). No technical effect.';
