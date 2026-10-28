# Character sheet builder: design (draft for review)

Source: odd/tasks/system-agnostic.md (S7-S9, L5-L6) and the read-only inventory of the current sheet (2026-10-27).
Status: DRAFT. Nothing here is implemented. Decisions marked **[CONFIRM]** need the user's answer before the stage that depends on them.

## 1. Principles

1. The sheet is DATA: `campaigns.system_profile.sheet` (document version 2). The code knows five kinds of thing (fields, tables, blocks, display modes, a formula language), never a game.
2. **A key is an identifier, not a convention.** Every field has a stable `key` that is also where its value lives in `pjs.data[key]`. The D&D preset reuses TODAY's keys (`stat_str`, `skill_acrobatics`, `hechizos`, `equipo`...), so existing characters need **no data rewrite**. The "migration" of the data is: backfill the missing `id` of table items and add the `sheet` to every campaign. This removes the riskiest part of option 2 while keeping its decision (D&D is rebuilt with the builder, no legacy mode).
3. Structure is validated twice (DB when written by the DM, client when read) and a malformed definition degrades to "show the identity category only", never to a crash.
4. Security first: who can write which `data` key is derived from the definition by the SQL guard (the owner-editable allow-list stops being a hard-coded list).

## 2. Model (sheet v2)

```
sheet: { version: 2, categories: [Category], roles: { hp?, hp_current?, ... } }
Category: { key, label, sections: [Section] }          // tab of the character EDITOR; not drawn in the detail
Section:  { key, label, items: [Field | Table], blocks: [Block] }
Field:    { key, label, type: 'short'|'paragraph'|'number'|'boolean',
            source: 'custom' | { formula: string }, editableBy: 'dm'|'player', default?, min?, max? }
Table:    { key, label, kind: 'stat'|'capacidades'|'habilidad'|'libre', editableBy,
            columns: [Column], rows?: [Row] }           // rows only for stat/capacidades (see CONFIRM 1)
Column:   { key, label, type, source: custom | formula, link?: { stat: tableRowKey, use: 'valor'|'modificador' } }
Block:    { key, title?, mode: 'stat'|'tile'|'capacidades'|'plano'|'modal', items: [itemKey], filterCategories?: [string] }
```

- **Identity** is the fixed first category: Visibilidad (`visible_to`, DM only), Nombre, Jugador (automatic from the assigned user), URL de imagen. Not deletable, not renamable in structure. They map to existing columns.
- **Table kinds** (from the spec): Stat (Nombre, Valor, Modificador number-or-formula), Capacidades (Nombre, linked Stat, free value columns), Habilidad (Nombre, Categoría, free columns), Libre (free named, typed columns).
- **Display modes** (from the spec): Stat (vertical tiles, today's stats), Tile (horizontal tiles, today's Apariencia), Capacidades (tile with header + vertical row list, today's Habilidades), Plano, Modal (Habilidad tables, filtered by category; today's spells).
- **Formulas** are display-only (never stored). Language: numbers, `+ - * / %`, parentheses, comparisons, `si(cond, a, b)`, `min max floor ceil round abs`, references by key (`{stat_str}`, `{nivel}`, `{row.col}`), booleans as 1/0. No loops, no assignment, no strings. Evaluation by a hand-written parser (no `eval`), dependency graph, cycles rejected when the DM saves the definition, an evaluation error shows "—". The DB checks size/charset/reference existence only; the parser is TypeScript.
- **Roles** bind semantic names to field keys for the features that need them outside the sheet (list card, live session screen, rests, passive displays): e.g. `hp`, `ac`, `speed`, `level`. Unbound roles simply hide that part of the feature.

## 3. D&D 5e preset (rebuilt with the builder)

Reproduces today's sheet: Identidad (+ Clase/Raza/Nivel/XP/Trasfondo/Alineamiento as ordinary fields, replacing the E2 built-in toggles); Mecánicas (stat table `stat_*` with modifier formula `floor(({valor}-10)/2)`, HP/AC/speed/initiative/hit dice/inspiration/proficiency bonus with default formula by level, saves as booleans, skills as a Capacidades table linked to the stats with proficiency 0/1/2 and bonus formulas, passive perception formula, spellcasting fields and slots); Habilidad table `hechizos` as a Modal block (levels = categories); Libre tables `ataques`, `equipo` (with value and quantity columns; subtotal formulas), `recursos`; narrative and appearance fields. Parity is checked by tests that render the same fixture characters through the old components and through the builder.

## 4. Things that are NOT plain data (kept as special items)

- **Coins** (`monedas`, `monedas_guardado`): columns written only by the DM or by the lottery/pot RPCs. A special item "Monedas" (from the currency config of the document) that a Section can place; it stays DM-write and server-credited. **[CONFIRM 2]**
- **Notas del DM** and **visibility** keep their own DM-only storage.
- **Unread dots**: one dot per Section (key = section key). `sections_updated` keys and the SQL stampable list become derived from the definition. **[CONFIRM 3]**

## 5. Security changes (HIGH RISK, own commits, pgTAP, independent verification)

- `guard_pj_player_update`: the owner may write identity columns (nombre, imagen_url...) and the `data` keys the definition marks `editableBy: 'player'`, validated by type, range and size (strings capped, numbers finite, arrays of known item shapes, total size cap). The DM bypass stays. The SQL, `pjOwnerFields.ts` and its sync test are replaced by a derived rule.
- The definition itself is DM-only through `set_system_profile` (already validated, optimistic concurrency); v2 validator in SQL checks structure, key uniqueness/format/reserved keys, references, cycles-free formulas (reference graph), limits (categories, sections, items, columns, formula length).

## 6. Stages (each reviewable; DB ones also independently verified)

| ID | Scope | Risk |
|----|-------|------|
| F1 | Formula engine (parser, evaluator, dependency graph, cycle detection) + exhaustive tests. Pure TS. | low |
| F2 | Sheet v2 model + TS parser + SQL validator; D&D preset definition added to every campaign (document v2). No UI change. | HIGH (stored shape) |
| F3 | Value storage rules and the guard trigger derived from the definition; type/size validation; unread keys; backfill item ids. | HIGH (security, data) |
| F4 | Renderer of the detail view from the definition (five display modes) with parity tests against today's sheet. | medium |
| F5 | Character editor from the definition (tabs per category, field widgets, table editors, formula-driven values). | medium |
| F6 | Roles: list card, search, live session screen, rests, importer/export, seed. | medium |
| F7 | Builder UI in Ajustes (categories, sections, fields, tables, blocks, formula editor, preview). | medium |
| F8 | Retire the old components, the E2 toggles and the hard-coded owner list; docs. Templates (E4) and the generic preset. | medium |

Order matters: F2/F3 do not change behaviour (the preset reproduces it); F4/F5 switch the UI over with parity tests; F7 comes last because by then the preset proves the model.

## 7. Open questions

- **[CONFIRM 1] RESOLVED (S11/L7, 2026-10-28)**: Stat and Capacidades rows are defined in the sheet template. Per row, the DM decides `editableBy` for the non-structural values (Stat: Valor; Capacidades: the free value columns). Structural parts (Stat name + modifier formula; Capacidades linked stat + name) are never written on a character, only by the DM through `set_system_profile`. Habilidad and Libre rows still belong to each character (not covered by the answer; reopen if that was not the intent).
- **[CONFIRM 2]** Coins as a special built-in item (proposal above) vs. dropping coins from the sheet and treating them as a Libre table (would lose the lottery/pot integration).
- **[CONFIRM 3]** Unread dots per Section (proposal) vs. per Category.
