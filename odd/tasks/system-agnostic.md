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

- S7 (user, 2026-10-26, verbatim in Log L5): the sheet structure is built freely by the DM: Categories (tabs of the character editor, not shown in the sheet) > Sections (groups of fields/tables) > display blocks. Fixed Identity category (Visibilidad, Nombre, Jugador, URL de imagen: not deletable). Data types: short text, paragraph, number, boolean; each datum custom or formula (formulas may reference compatible fields); per-field "editable por" (DM only / the character's player). Table types: Stat, Capacidades (linked to a Stat), Habilidad (Nombre, Categoría, free columns), Libre. Block display modes: Stat, Tile, Capacidades, Plano, Modal (Habilidad tables; the block names the categories to filter).
- S8 (consequence): this supersedes the E2 approach of switching D&D blocks on and off and the old E2c (typed custom fields): typed fields become part of the builder. E2a/E2b stay valid for campaigns that keep the legacy D&D sheet.

- S9 (decision, user, 2026-10-27): "No, vamos con la segunda opción": the D&D 5e sheet is REBUILT with the builder (no legacy mode) and the existing character data is MIGRATED to the new structure. Consequence: parity with today's sheet (equipment subtotals and coins, passive perception, spell slots, suggested proficiency bonus, skills grid, attacks, resources, narrative, appearance) is a requirement of the preset, and the migration is a high-risk unit (reversible, dry-run first, own commit, independent verify).

- S10 (design, 2026-10-27): the builder design lives in odd/design/sheet-builder.md (stages F1-F8 replace E2c/E3-sheet parts; E3 currency/vocabulary and E4 templates are folded in). Key idea: keys are identifiers, the D&D preset reuses today's data keys, so existing characters need no data rewrite beyond item id backfill.

- S11 (decision, user, 2026-10-28, verbatim in Log L7): rows of Stat and Capacidades tables are defined by the DM in the sheet template (same rows for every character). The DM chooses whether the player may edit the non-structural values of those rows. Structural parts are editable ONLY from the sheet template, never on a character: Stat = "Nombre" and the modifier formula; Capacidades = "Stat asociado" and the capability name.

- S12 (decision, user, 2026-10-28, verbatim in Log L8): coins are a SPECIAL TABLE that comes built in by default in every template; its rows define the denominations (for example oro/plata/bronce or Galeon/sickle/knut). Until the denominations are defined, lottery prizes cannot be defined and therefore the lottery game does not appear until the configuration is complete.

- S13 (decision, user, 2026-10-28, verbatim in Log L8): the unread dot is per Section.

- S14 (decision, user, 2026-10-28, verbatim in Log L9): denominations have conversion equivalences between them (for example 1 oro = 10 plata = 100 bronce), and the DM defines those equivalences too when configuring the campaign.

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
- L5 (user, 2026-10-26):
  Para que sea realmente agnóstico, la estructura de la ficha debe construirse libremente. El DM debe poder configurar "Categorías" (No visibles en la ficha) que funcionen como bloques que determinan las pestañas de la edición de personaje. Las Categorías contienen "Secciones", que son grupos de campos de información que pueden configurarse según cada necesidad, definiendo tipo de dato, tipo de visualización, Personalizable o de formula (Permitiendo incluir otros campos compatibles en la fórmula), y "editable por" para definir si el jugador del personaje puede editarlo.
  La categoría por defecto y no eliminable debe ser identidad, con "Visibilidad", "Nombre", "Jugador" (Automático al asignar usuario) y "URL de imagen" como campos no eliminables.
  Los tipos de Dato pueden ser Texto corto, Parrafo, Número, Verdadero/Falso (Boolean).
  Cada dato puede ser: Personalizado o Formula.
  Las tablas pueden ser de tipo:
  - Stat: Nombre (Texto), Valor (Número), Modificador (Número o Formula).
  - Capacidades: Nombre (Texto), Vinculado a Stat (Selector de stat para vincular Valor o Modificador), Valores (Columnas libres)
  - Habilidad: Nombre (Texto), Categoría (Texto), Valores (columnas libres)
  - Libre: Columnas con nombre y tipo de dato libre.
  
  Cada Sección puede ser configurada para determinar cómo se mostrarán sus datos:
  - Se pueden configurar bloques para agrupar campos o títulos bajo una misma modalidad de visualización.
  - Cada bloque puede tener los siguientes modos de visualización:
   - Stat: (Para tablas) Tiles con orden vertical de contenido (como se ven actualmente los stats)
   - Tile: (Para campos) Tiles con orden horizontal de contenido (como los tiles de Apariencia)
   - Capacidades: (para tablas) Tiles con encabezado y lista vertical de filas (como actualmente se ven las Habilidades)
   - Plano: Tabla o campo sin estilo especial
   - Modal: (Para tablas Habilidad) Botón que abre un modal con sus datos ordenados según su tipo (Como funciona actualmente la visualización de hechizos). Un bloque con este tipo debe indicar qué categorias filtrar.
- L6 (user, 2026-10-27): "No, vamos con la segunda opción." (in answer to: legacy mode + builder for new campaigns vs. rebuild D&D with the builder and migrate the data).
- L7 (user, 2026-10-28, answer to design CONFIRM 1): "Las filas de tablas de stats y habilidades las define el DM, pero puede definir si el jugador puede editar sus valores no estructurales (\"Nombre\" y \"formula de modificador\" en Stats, y \"Stat asociado\" y \"Nombre de capacidad\" en Capacidades son estructurales y deben ser solo editables desde la plantilla de hoja de personaje)"
- L8 (user, 2026-10-28, answer to design CONFIRM 2 and 3): "Creo que las monedas deben ser una tabla especial que viene integrada por defecto en las plantillas, y que esta pueda tener filas que definan sus diferentes denominaciones (por ejemplo: oro, plata, y bronce, o Galeon, sickle, y knut). Hasta no definir esto, que no se pueda definir los premios de la lotería, y por ende, que no figure el juego hasta completar la configuración. Para lo no leido, el punto puede ir por sección"
- L9 (user, 2026-10-28, answer to design CONFIRM 4): "Si, pero esas equivalencias deben ser definidas tambien por el DM al configurar la campaña."

## Builder stages (odd/design/sheet-builder.md section 6)

- F1 (formula engine, pure TS, src/campaign/system/formula): done, commit 610df93. 44 tests written first (RED: module missing), vitest 141 files / 1943 PASS, tsc and eslint clean. Reserved reference segments (__proto__, constructor, prototype) are rejected at parse time; cycles are found with an iterative DFS. Risk: none (new unused module).
- F2a (TS model + validator + D&D preset, src/campaign/system/sheet): done, commits 5e1c755 and 929f8fa. 62 + 11 tests written first (RED: modules missing; a defect found by the preset, column keys wrongly checked against app-owned names, fixed with a test first). The preset reuses today data keys and today unread section keys; parity tests compare it with pjConstants and pjOwnerFields (player-editable keys equal the owner guard list). Risk: none (unused module, nothing stored).
- F2b (SQL validator + backfill) DEFERRED on purpose: nothing writes a sheet until the builder UI (F7) and the preset has known gaps the model must still absorb (spell slots keyed by level, equipment price/coin conversion, spell category derived from level). Freezing the stored shape now would force a migration per model change. It moves just before F3, when the shape is stable. Known gaps are listed in DND5E_SHEET_GAPS.
