/**
 * Data migration of the D&D 5e preset v2 (G10c; S9, S17, S33, S35-S39): pure TypeScript twin of
 * supabase/migrations/20261107120000_dnd5e_v2_data.sql. No IO and no runtime imports, so plain `node` can load it (the dry-run
 * script and the legacy importer do) and so the SQL and this file stay comparable rule by rule (dnd5eV2Parity.test.ts).
 *
 * What changes (DND5E_V2_MIGRATION_MAP in ../dnd5eSheet.ts lists the shapes):
 *  - skill_* numbers 0/1/2 -> option keys no/competente/experto (anything else stays and warns)
 *  - stat_hit_dice "XdY (a/b)" -> dado_golpe "XdY" + dados_disponibles a (b is ignored: the total is the level);
 *    "XdY" alone -> dados_disponibles = level; unparseable text goes whole into dado_golpe and warns; the key is dropped
 *  - spell_slots / spell_slots_current -> espacios_conjuro rows { id, nivel, disponibles, maximo } (absent current = full,
 *    maximo 0 dropped, an existing non-empty espacios_conjuro is kept and warns)
 *  - hechizos rows -> collection entries + links (S39): grouped by category + lower(trim(name)); one holder, or identical
 *    content in every holder -> one SHARED entry linked by all; different content -> one entry PRIVATE to each holder
 *  - recursos.recuperacion text -> largo | corto (anything else: largo, warns)
 *  - the campaign custom fields -> paragraph fields of the sheet section `campos_campana`; their values move to data[newKey]
 *    (the key itself, or campo_<key> when the preset already uses it). A different value already stored under that key is kept
 *    and the custom value stays in data.custom_fields (warning custom_field_conflict): never lose a value
 *  - jugador -> display name of the assigned owner, '' when unowned (the legacy free text is discarded, S33)
 * Running it again on migrated data changes nothing.
 */

type Obj = Record<string, unknown>

export interface MigrationPjInput {
  id: number
  /** pjs.nivel, used for the dice total of "XdY" alone */
  nivel?: number | null
  /** profiles.display_name of pjs.owner_id, null when the character has no owner */
  owner_display_name: string | null
  /** pjs.jugador as stored */
  jugador?: string | null
  data: Obj
}

export interface ExistingAction {
  category: string
  name: string
  private_to_pj: number | null
  /** content of the stored entry; when given, a reused entry whose content differs from the character's is reported */
  description?: string
  extras?: Record<string, unknown>
}

export interface ExistingLink {
  pj_id: number
  category: string
  name: string
  private_to_pj: number | null
  /** the link state as stored: it is kept; a different legacy preparado is reported */
  state?: { preparado?: unknown }
}

export interface MigrationInput {
  campaign: {
    /** the campaign sheet already in preset v2 shape (the SQL swaps the stored v1 preset for the v2 literal itself) */
    sheet: Obj
    /** campaigns.character_custom_fields: [{ key, label, type }] */
    character_custom_fields?: unknown
    /** shared/private entries already in the collection: matching entries are linked instead of created */
    existing_actions?: ExistingAction[]
    /** links already in place: they are not written again and keep their state */
    existing_links?: ExistingLink[]
  }
  pjs: MigrationPjInput[]
}

export interface ActionRef {
  table_key: string
  category: string
  name: string
  private_to_pj: number | null
}

export interface MigrationAction extends ActionRef {
  description: string
  extras: Record<string, string | boolean>
}

export interface MigrationLink {
  pj_id: number
  action: ActionRef
  state: { preparado: boolean }
}

export interface MigrationPj {
  id: number
  newData: Obj
  removedKeys: string[]
  jugador: string
  changed: boolean
}

/** A warning carries a stable code and the character it is about, never any stored text. */
export interface MigrationWarning {
  code: string
  pj_id: number | null
}

export interface MigrationReport {
  counts: Record<string, number>
  warnings: MigrationWarning[]
}

export interface MigrationOutput {
  sheet: Obj
  pjs: MigrationPj[]
  actions: MigrationAction[]
  links: MigrationLink[]
  report: MigrationReport
}

export const SPELL_TABLE_KEY = 'hechizos'
export const CUSTOM_SECTION_KEY = 'campos_campana'
const CUSTOM_BLOCK_KEY = 'b_campos_campana'
const CUSTOM_SECTION_LABEL = 'Campos de la campaña'
const SKILL_OPTIONS: Readonly<Record<number, string>> = { 0: 'no', 1: 'competente', 2: 'experto' }
const SKILL_KEYS = new Set(Object.values(SKILL_OPTIONS))
const SHORT_MAX = 500
const PARAGRAPH_MAX = 20000
const NAME_MAX = 200
/** Item keys a sheet may never use (sheet validators); a custom field with one of these is renamed to campo_<key>. */
const RESERVED_KEYS = [
  'nombre', 'jugador', 'imagen_url', 'visible_to', 'monedas', 'monedas_guardado', 'notas', 'sections_updated', 'id', 'nivel',
  'clase', 'raza', 'region', 'estado', 'owner_id', 'campaign_id', 'created_by', 'created_at', 'updated_at', 'data',
  'valor', 'modificador', 'custom_fields',
]
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/
const SPELL_TEXT_EXTRAS: ReadonlyArray<readonly [string, string, number]> = [
  ['escuela', 'escuela', SHORT_MAX],
  ['tiempo_lanzamiento', 'casting_time', SHORT_MAX],
  ['alcance', 'alcance', SHORT_MAX],
  ['componentes', 'componentes', SHORT_MAX],
  ['duracion', 'duracion', SHORT_MAX],
  ['a_niveles_superiores', 'a_niveles_superiores', PARAGRAPH_MAX],
]
const SPELL_FLAG_EXTRAS = ['concentracion', 'ritual']
const SPELL_KNOWN_KEYS = new Set(['id', 'nombre', 'nivel', 'preparado', 'descripcion', 'tiempo_lanzamiento', ...SPELL_TEXT_EXTRAS.map((e) => e[1]), ...SPELL_FLAG_EXTRAS])

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const has = (o: Obj, k: string) => Object.prototype.hasOwnProperty.call(o, k)
/** Spaces only, like Postgres btrim: the SQL twin must trim exactly the same characters. */
const btrim = (s: string) => s.replace(/^ +| +$/g, '')
/** The name a spell is compared by (S39): case, surrounding and repeated whitespace ignored, accents kept. */
const norm = (s: string) => btrim(s.replace(/[ \t\n\r\f\v]+/g, ' ')).toLowerCase()
/** true/false, or "true"/"false" text (any case, surrounding spaces); null = not a flag value (absent and null count as false). */
function flag(v: unknown): boolean | null {
  if (v === undefined || v === null || typeof v === 'boolean') return v === true
  if (typeof v === 'string') {
    const t = btrim(v.toLowerCase())
    if (t === 'true') return true
    if (t === 'false') return false
  }
  return null
}
/** A value present in a text column that is not text (numbers are stringified, the rest dropped): it must be reported. */
const nonText = (v: unknown) => v !== undefined && v !== null && typeof v !== 'string'
const byCodepoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Whole numbers as a number, or a numeric string holding one; anything else is not a number for the migration. */
function whole(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v === 'string' && /^-?[0-9]{1,15}$/.test(btrim(v))) return Number(btrim(v))
  return null
}

const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (isObj(v)) return `{${Object.keys(v).sort(byCodepoint).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  return JSON.stringify(v)
}

const CATEGORY_BY_LEVEL = (n: number): string | null => (n === 0 ? 'trucos' : n >= 1 && n <= 9 ? `nivel_${n}` : n === 10 ? 'rasgos' : null)

function recoveryOption(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = btrim(v.toLowerCase()).replace(/^descanso +/, '')
  return t === 'largo' || t === 'corto' ? t : null
}

interface SpellRow {
  pjId: number
  ord: number
  category: string
  name: string
  description: string
  extras: Record<string, string | boolean>
  preparado: boolean
}

const spellKey = (r: { category: string; name: string }) => `${r.category}\u0000${norm(r.name)}`
const entryKey = (category: string, name: string, priv: number | null) => `${category}\u0000${norm(name)}\u0000${priv ?? 0}`

/** The sheet with the custom-field section added/extended; also the map of custom key -> data key. */
function withCustomFields(sheetIn: Obj, fieldsIn: unknown, warn: (code: string) => void): { sheet: Obj; keyMap: Map<string, string>; added: number } {
  const sheet = clone(sheetIn)
  const keyMap = new Map<string, string>()
  const fields: { key: string; label: string }[] = []
  if (Array.isArray(fieldsIn)) {
    for (const f of fieldsIn) {
      if (isObj(f) && typeof f.key === 'string' && KEY_PATTERN.test(f.key) && !f.key.includes('__') && typeof f.label === 'string') {
        if (!fields.some((o) => o.key === f.key)) fields.push({ key: f.key, label: f.label })
      } else warn('custom_field_invalid')
    }
  }
  const categories = Array.isArray(sheet.categories) ? (sheet.categories as Obj[]) : []
  const sections = (c: Obj): Obj[] => (Array.isArray(c.sections) ? (c.sections as Obj[]) : [])
  const items = (s: Obj): Obj[] => (Array.isArray(s.items) ? (s.items as Obj[]) : [])
  let existing: Obj | null = null
  for (const c of categories) for (const s of sections(c)) if (s.key === CUSTOM_SECTION_KEY) existing = s
  if (fields.length === 0 || categories.length === 0) return { sheet, keyMap, added: 0 }

  const used = new Set<string>(RESERVED_KEYS)
  const own = new Set<string>(existing ? items(existing).map((i) => String(i.key)) : [])
  for (const c of categories) for (const s of sections(c)) if (s !== existing) for (const i of items(s)) used.add(String(i.key))

  const toAdd: Obj[] = []
  for (const f of fields) {
    let target = f.key
    if (used.has(target)) {
      target = `campo_${f.key}`.slice(0, 40)
      warn('custom_field_key_collision')
    }
    if (used.has(target) || !KEY_PATTERN.test(target)) {
      warn('custom_field_unplaced')
      continue
    }
    used.add(target)
    keyMap.set(f.key, target)
    if (!own.has(target)) {
      own.add(target)
      toAdd.push({ kind: 'field', key: target, label: btrim(f.label).slice(0, 60) || f.key, type: 'paragraph', editableBy: 'dm' })
    }
  }
  if (toAdd.length === 0) return { sheet, keyMap, added: 0 }

  if (existing) {
    existing.items = [...items(existing), ...toAdd]
    const blocks = Array.isArray(existing.blocks) ? (existing.blocks as Obj[]) : []
    const block = blocks.find((b) => b.key === CUSTOM_BLOCK_KEY)
    if (block) block.items = [...(block.items as unknown[]), ...toAdd.map((i) => i.key)]
    else existing.blocks = [...blocks, { key: CUSTOM_BLOCK_KEY, mode: 'tile', items: toAdd.map((i) => i.key) }]
  } else {
    const home = categories.find((c) => c.key === 'historia') ?? categories[categories.length - 1]
    home.sections = [
      ...sections(home),
      { key: CUSTOM_SECTION_KEY, label: CUSTOM_SECTION_LABEL, items: toAdd, blocks: [{ key: CUSTOM_BLOCK_KEY, mode: 'tile', items: toAdd.map((i) => i.key) }] },
    ]
  }
  return { sheet, keyMap, added: toAdd.length }
}

export function migrateDnd5eV2(input: MigrationInput): MigrationOutput {
  const warnings: MigrationWarning[] = []
  const counts: Record<string, number> = {
    pjs: input.pjs.length,
    pjs_changed: 0,
    skills_converted: 0,
    hit_dice_parsed: 0,
    hit_dice_unparsed: 0,
    slot_rows: 0,
    resources_converted: 0,
    spell_rows: 0,
    entries_shared: 0,
    entries_private: 0,
    entries_reused: 0,
    links: 0,
    custom_fields_added: 0,
    custom_values_moved: 0,
    jugador_changed: 0,
  }
  const warnFor = (pjId: number | null) => (code: string) => void warnings.push({ code, pj_id: pjId })
  const bump = (k: string, n = 1) => void (counts[k] += n)

  const custom = withCustomFields(input.campaign.sheet, input.campaign.character_custom_fields, warnFor(null))
  counts.custom_fields_added = custom.added

  const spellRows: SpellRow[] = []
  const pjs: MigrationPj[] = []

  for (const pj of [...input.pjs].sort((a, b) => a.id - b.id)) {
    const warn = warnFor(pj.id)
    const data = clone(pj.data)
    const newData: Obj = clone(pj.data)
    const removed: string[] = []
    const drop = (k: string) => {
      if (has(newData, k)) {
        delete newData[k]
        removed.push(k)
      }
    }

    // skills
    for (const key of Object.keys(data)) {
      if (!key.startsWith('skill_')) continue
      const v = data[key]
      if (typeof v === 'number' && has(SKILL_OPTIONS, String(v))) {
        newData[key] = SKILL_OPTIONS[v]
        bump('skills_converted')
      } else if (v !== null && v !== undefined && !(typeof v === 'string' && SKILL_KEYS.has(v))) warn('skill_value_unknown')
    }

    // hit dice
    if (has(data, 'stat_hit_dice')) {
      const raw = data.stat_hit_dice
      drop('stat_hit_dice')
      if (typeof raw === 'string' && btrim(raw) !== '') {
        const m = /^([0-9]{1,6}d[0-9]{1,6})(?:[ \t]*\([ \t]*([0-9]{1,9})[ \t]*\/[ \t]*([0-9]{1,9})[ \t]*\))?$/.exec(btrim(raw.toLowerCase()))
        if (m) {
          bump('hit_dice_parsed')
          if (m[3] !== undefined && typeof pj.nivel === 'number' && Number(m[3]) !== pj.nivel) warn('hit_dice_total_differs')
          if (!has(data, 'dado_golpe')) newData.dado_golpe = m[1]
          if (!has(data, 'dados_disponibles')) {
            if (m[2] !== undefined) newData.dados_disponibles = Number(m[2])
            else if (typeof pj.nivel === 'number') newData.dados_disponibles = pj.nivel
            else warn('hit_dice_level_missing')
          }
        } else {
          bump('hit_dice_unparsed')
          warn('hit_dice_unparsed')
          if (!has(data, 'dado_golpe')) newData.dado_golpe = raw
        }
      } else if (raw !== null && raw !== undefined && raw !== '' && typeof raw !== 'string') warn('hit_dice_unparsed')
    }

    // spell slots
    if (has(data, 'spell_slots') || has(data, 'spell_slots_current')) {
      const max = isObj(data.spell_slots) ? data.spell_slots : {}
      const cur = isObj(data.spell_slots_current) ? data.spell_slots_current : {}
      const rows: { nivel: number; disponibles: number; maximo: number }[] = []
      const invalidLevels = new Set<string>()
      const withRow = new Set<string>()
      for (const key of Object.keys(max)) {
        const nivel = /^[0-9]{1,3}$/.test(key) ? Number(key) : null
        const maximo = whole(max[key])
        if (nivel === null || maximo === null) {
          warn('slots_invalid')
          invalidLevels.add(key)
          continue
        }
        if (maximo <= 0) continue
        const left = has(cur, key) ? whole(cur[key]) : maximo
        if (has(cur, key) && left === null) warn('slots_current_invalid')
        withRow.add(key)
        rows.push({ nivel, disponibles: left ?? maximo, maximo })
      }
      // a current value for a level that gets no row (no maximum, or a zero one) only survives in the backup
      for (const key of Object.keys(cur)) {
        if (!withRow.has(key) && !invalidLevels.has(key) && whole(cur[key]) !== 0) warn('slots_current_orphan')
      }
      rows.sort((a, b) => a.nivel - b.nivel)
      const existing = newData.espacios_conjuro
      if (rows.length > 0) {
        if (Array.isArray(existing) && existing.length > 0) warn('espacios_conjuro_exists')
        else {
          newData.espacios_conjuro = rows.map((r, i) => ({ id: i + 1, ...r }))
          bump('slot_rows', rows.length)
        }
      }
      drop('spell_slots')
      drop('spell_slots_current')
    }

    // resources
    if (Array.isArray(data.recursos)) {
      newData.recursos = (data.recursos as unknown[]).map((row) => {
        if (!isObj(row) || !has(row, 'recuperacion')) return row
        const v = row.recuperacion
        if (v === 'largo' || v === 'corto') return row
        let next = recoveryOption(v)
        if (next === null) {
          next = 'largo'
          if (!(v === null || (typeof v === 'string' && btrim(v) === ''))) warn('recuperacion_unknown')
        }
        bump('resources_converted')
        return { ...row, recuperacion: next }
      })
    }

    // custom field values
    if (custom.keyMap.size > 0 && isObj(data.custom_fields)) {
      const rest: Obj = { ...data.custom_fields }
      const conflicted = new Set<string>()
      for (const [oldKey, target] of custom.keyMap) {
        if (!has(rest, oldKey)) continue
        const v = rest[oldKey]
        const value = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null
        if (value === null) {
          if (v === null) delete rest[oldKey]
          else warn('custom_field_invalid')
          continue
        }
        if (value !== '') {
          const prior = data[target]
          const occupied = prior !== undefined && prior !== null && prior !== ''
          if (occupied && prior !== value) {
            // the character already holds a different value under the field key (a flat legacy key): the value that is already
            // there stays, and the custom value stays where it is, so nothing is lost
            warn('custom_field_conflict')
            conflicted.add(oldKey)
            continue
          }
          newData[target] = value
          if (!occupied) bump('custom_values_moved')
        }
        delete rest[oldKey]
      }
      if (Object.keys(rest).length === 0) drop('custom_fields')
      else {
        newData.custom_fields = rest
        if (Object.keys(rest).some((k) => !conflicted.has(k))) warn('custom_field_orphan')
      }
    }

    // spells (the entries are built across characters below)
    if (has(data, 'hechizos')) {
      drop('hechizos')
      if (Array.isArray(data.hechizos)) {
        const seen = new Set<string>()
        ;(data.hechizos as unknown[]).forEach((row, ord) => {
          if (!isObj(row)) return void warn('spell_row_invalid')
          const name = btrim(btrim(text(row.nombre)).slice(0, NAME_MAX))
          if (norm(name) === '') return void warn('spell_name_missing')
          const level = whole(row.nivel)
          let category = level === null ? null : CATEGORY_BY_LEVEL(level)
          if (category === null) {
            category = 'rasgos'
            warn('spell_nivel_invalid')
          }
          const key = spellKey({ category, name })
          if (seen.has(key)) return void warn('spell_duplicate_in_character')
          seen.add(key)
          const extras: Record<string, string | boolean> = {}
          let truncated = false
          let notText = nonText(row.nombre) || nonText(row.descripcion)
          for (const [extra, source, cap] of SPELL_TEXT_EXTRAS) {
            const value = has(row, source) ? row[source] : source === 'casting_time' ? row.tiempo_lanzamiento : undefined
            if (nonText(value)) notText = true
            const raw = text(value)
            if (raw.length > cap) truncated = true
            if (raw !== '') extras[extra] = raw.slice(0, cap)
          }
          const flagInvalid = [...SPELL_FLAG_EXTRAS, 'preparado'].some((k) => flag(row[k]) === null)
          for (const k of SPELL_FLAG_EXTRAS) if (flag(row[k]) === true) extras[k] = true
          const description = text(row.descripcion)
          if (description.length > PARAGRAPH_MAX) truncated = true
          if (truncated) warn('spell_value_truncated')
          if (Object.keys(row).some((k) => !SPELL_KNOWN_KEYS.has(k))) warn('spell_field_dropped')
          if (notText) warn('spell_value_not_text')
          if (flagInvalid) warn('spell_flag_invalid')
          spellRows.push({ pjId: pj.id, ord, category, name, description: description.slice(0, PARAGRAPH_MAX), extras, preparado: flag(row.preparado) === true })
          bump('spell_rows')
        })
      } else if (data.hechizos !== null) warn('spell_row_invalid')
    }

    // jugador (S33)
    const jugador = pj.owner_display_name ?? ''
    if (jugador !== (pj.jugador ?? '')) bump('jugador_changed')

    const changed = canonical(newData) !== canonical(pj.data) || jugador !== (pj.jugador ?? '')
    if (changed) bump('pjs_changed')
    pjs.push({ id: pj.id, newData, removedKeys: removed, jugador, changed })
  }

  // collection entries (S39)
  const groups = new Map<string, SpellRow[]>()
  for (const r of spellRows) groups.set(spellKey(r), [...(groups.get(spellKey(r)) ?? []), r])
  const existing = new Map((input.campaign.existing_actions ?? []).map((a) => [entryKey(a.category, a.name, a.private_to_pj), a]))
  const existingLinks = new Map((input.campaign.existing_links ?? []).map((l) => [`${l.pj_id}\u0000${entryKey(l.category, l.name, l.private_to_pj)}`, l]))
  const actions: MigrationAction[] = []
  const links: MigrationLink[] = []
  for (const rows of groups.values()) {
    const contents = new Set(rows.map((r) => canonical({ name: norm(r.name), description: r.description, extras: r.extras })))
    const priv = rows.length > 1 && contents.size > 1
    const owners = priv ? rows.map((r) => r.pjId) : [null]
    for (const owner of owners) {
      const source = priv ? rows.find((r) => r.pjId === owner)! : rows[0]
      const ref: ActionRef = { table_key: SPELL_TABLE_KEY, category: source.category, name: source.name, private_to_pj: owner }
      const stored = existing.get(entryKey(ref.category, ref.name, owner))
      if (stored) {
        bump('entries_reused')
        const differs =
          (stored.description !== undefined && stored.description !== source.description) ||
          (stored.extras !== undefined && canonical(stored.extras) !== canonical(source.extras))
        if (differs) warnFor(source.pjId)('existing_entry_differs')
      } else {
        actions.push({ ...ref, description: source.description, extras: source.extras })
        bump(priv ? 'entries_private' : 'entries_shared')
      }
      for (const r of priv ? [source] : rows) {
        const link = existingLinks.get(`${r.pjId}\u0000${entryKey(ref.category, ref.name, owner)}`)
        if (link) {
          if ((link.state?.preparado === true) !== r.preparado) warnFor(r.pjId)('existing_link_differs')
          continue
        }
        links.push({ pj_id: r.pjId, action: ref, state: { preparado: r.preparado } })
        bump('links')
      }
    }
  }
  const order = (r: ActionRef) => `${String(r.private_to_pj ?? 0).padStart(12, '0')}\u0000${r.category}\u0000${r.name.toLowerCase()}`
  actions.sort((a, b) => byCodepoint(order(a), order(b)))
  links.sort((a, b) => a.pj_id - b.pj_id || byCodepoint(order(a.action), order(b.action)))

  return { sheet: custom.sheet, pjs, actions, links, report: { counts, warnings } }
}
