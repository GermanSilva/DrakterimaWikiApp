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
| E2 | S1-S3 | Configurable character sheet read from the document (types beyond text, more than 10 fields, built-in `clase`/`raza`/`nivel` become optional/renamable). | | [ ] |
| E3 | S1-S3 | Configurable currency (or none) and vocabulary (labels for level, region, relations, roles). | | [ ] |
| E4 | S1-S5 | Optional modules (Juegos/d20, Sesión en vivo, Mapas, Calendario) and templates (create from template, save as template). | | [ ] |

## Open decisions

None.

## Log

- L1 (user, 2026-10-26): "Quiero lograr que la página sea realmente agnostica de sistema, para que pueda albergar campañas de cualquier sistema ¿Qué podría necesitar la página?"
- L2 (user, 2026-10-26): "Me interesa poder albergar rápidamente campañas de otros sistemas, sin ningúno particular en mente. Me interesa tambien poder contener sistemas derivados o intensamente modificados de un sistema original."
- L3 (user, 2026-10-26): chose "copia al crear" (no inheritance) when asked whether template improvements must propagate to campaigns that use them.
- L4 (user, 2026-10-26): "si" to keeping clase/raza/nivel as optional, renamable built-ins (S6). E1 started: `campaigns.system_profile` jsonb with the D&D 5e document as default, `system` relaxed to a format-checked identifier, no API write path yet.
