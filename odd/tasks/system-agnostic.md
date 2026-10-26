# System-agnostic campaigns

Let a campaign use any game system, including derived or heavily modified ones, without code changes. Branch: feat/campaign-hub
(follow-up work units). Classification: large and HIGH RISK (item 1/3: the character table, its guard triggers and the stored
campaign data change shape). Status: design agreed, nothing implemented yet.

## Specs

- S1: "Quiero lograr que la página sea realmente agnostica de sistema, para que pueda albergar campañas de cualquier sistema"
- S2: "Me interesa poder albergar rápidamente campañas de otros sistemas, sin ningúno particular en mente."
- S3: "Me interesa tambien poder contener sistemas derivados o intensamente modificados de un sistema original."
- S4 (decision, user): "copia al crear": a template is copied into the campaign when it is created; changing a template later never alters existing campaigns (no inheritance).
- S6 (decision, user): E2 keeps `clase`, `raza` and `nivel` as built-in columns that the profile can disable, rename, and (nivel) give a range; they are not moved into `data`.
- S5 (design): the system is a document (jsonb) stored in the campaign: character fields, currency, vocabulary, active modules. Templates are the same document at hub level ("D&D 5e", "Genérico"); "basado en" is informational only; a campaign can be saved as a new template.

## Stages (each its own reviewable unit; the DB ones are high risk: own commit, pgTAP, independent verify)

| ID | Specs | Scope | Commit | Done |
|----|-------|-------|--------|------|
| E1 | S1, S5 | Schema of the system document + migration: existing campaigns get the D&D 5e preset; drop the `system in ('dnd5e')` check. No visible change. | | [ ] |
| E2a | S1-S3, S6 | HIGH RISK DB unit: profile gains `character.sections` (which sheet blocks exist: stats, habilidades, ataques, hechizos, recursos, equipo, rasgos, narrativa, apariencia; default all on, backfilled), `pjs.nivel` check relaxed 1..20 -> 0..1000, `validate_system_profile()` + the DM-only RPC `set_system_profile(campaign, profile, base)` (optimistic concurrency). | 870e55c, 16fc08b, 4a37a79 | [x] |
| E2b | S1-S3, S6 | Client: "Sistema" section in Ajustes (enable/rename clase, raza, nivel + range, toggle sheet blocks) and the form, detail, list and search honouring the document. | 05a622d, 2747550 | [x] |
| E2c | S1-S3 | Typed custom fields (text, long text, number, choice) and more than 10 per campaign. | | [ ] |
| E3 | S1-S3 | Configurable currency (or none) and vocabulary (labels for level, region, relations, roles). | | [ ] |
| E4 | S1-S5 | Optional modules (Juegos/d20, Sesión en vivo, Mapas, Calendario) and templates (create from template, save as template). | | [ ] |

Finding while scoping E2 (2026-10-26): the character sheet is far more D&D-specific than the three built-in columns: the form has Mecánicas (abilities str/dex/con/int/wis/cha, HP, skills, attacks, spells, resources) and Equipo & Rasgos tabs, the detail page has nine sections (stats, habilidades, ataques, hechizos, recursos, equipo, rasgos, narrativa, apariencia) and the identity tab has "Trasfondo D&D", "Alineamiento" and XP. Making the page agnostic therefore needs those blocks to be switchable per system, which is why E2 is split in E2a/E2b/E2c and the document gets `character.sections`.

## Open decisions

None.

## Log

- L1 (user, 2026-10-26): "Quiero lograr que la página sea realmente agnostica de sistema, para que pueda albergar campañas de cualquier sistema ¿Qué podría necesitar la página?"
- L2 (user, 2026-10-26): "Me interesa poder albergar rápidamente campañas de otros sistemas, sin ningúno particular en mente. Me interesa tambien poder contener sistemas derivados o intensamente modificados de un sistema original."
- L3 (user, 2026-10-26): chose "copia al crear" (no inheritance) when asked whether template improvements must propagate to campaigns that use them.
- L4 (user, 2026-10-26): "si" to keeping clase/raza/nivel as optional, renamable built-ins (S6). E1 started: `campaigns.system_profile` jsonb with the D&D 5e document as default, `system` relaxed to a format-checked identifier, no API write path yet.

## Evidence

- E1 (2026-10-26): pgTAP 17_system_profile 37 assertions (RED first: the column did not exist), full `supabase test db` 17 files / 648 PASS, integration 92/92, vitest 1704, tsc clean, eslint 0 errors. Independent read-only verification (gentle-ai-verify): no blocker; the API cannot write `system_profile` (no insert/update grant, checked live), the SQL default equals DND5E_PROFILE field by field, the `system` regex is anchored/bounded. Applied: the parser no longer hands out the shared default (deep-frozen constant + fresh copy per call, test written first), pgTAP gained the full-document backfill, 40-char/newline/edge identifiers and a document just under 64 KB.
- Carry-overs for E2: the pjs.nivel CHECK (1..20) must be relaxed before a profile can use another range; "currency on with an empty list" falls back to the five D&D coins (decide in E3 whether "on, no coins" is a state); labels are measured in UTF-16 units.
- E2a (2026-10-26): migration 20261027120000 (character.sections default + backfill, pjs.nivel 0..1000, validate_system_profile, set_system_profile) with pgTAP 18 (52 assertions, RED first) and the full suite 18 files / 700 PASS, integration 92/92. Independent verification found F1 (labels with bidi/zero-width/blank-looking characters passed): fixed in the migration (labels are trimmed of white space, NBSP and U+3000 and rejected when they differ from public.strip_control_chars) plus missing authorization/conflict tests. Client plumbing: parser reads the sections and applies the SAME label rules (code points, hidden characters), repository `setSystemProfile` (base string passed through untouched; campaign_conflict -> ConflictError; reasons invalid_system_profile, campaign_not_found).
- Carry-over for E2b (from the verifier): send `updated_at` back as the string PostgREST returned (never through a JS Date: milliseconds would make every save a conflict); a save by another DM edit (name, settings, regions) also bumps updated_at and conflicts harmlessly.
- E2b (2026-10-26): Ajustes "Sistema" section (rename/switch clase, raza, nivel, level range, nine sheet blocks) writes the whole document through set_system_profile with the version guard; the form port carries the document (`FormPort.system`, default D&D 5e) and the character form (identity, mechanics, equipment tabs), the detail sections, the list cards and the search follow it (sections off disappear, stored data is kept; the stats block also governs XP, "Trasfondo D&D" and "Alineamiento"; the stock labels keep their wording). vitest src 1747 passing, tsc clean, eslint 0 errors; checked in the browser against the local database (saved a customised document, the list shows "RANGO 1" without class, the search placeholder drops "clase", the detail has no spells block).
- Open for E2c/E3: typed custom fields and more than 10 of them; the narrative/appearance fields of the form are still fixed D&D-style text boxes (only switchable as a block); the detail "Stats" block still labels HP/AC/abilities in D&D terms.
