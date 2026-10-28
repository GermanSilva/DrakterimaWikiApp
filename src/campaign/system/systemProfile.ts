/**
 * The system document of a campaign (`campaigns.system_profile`, version 1). The database only guarantees "an object
 * whose version is 1"; everything the application reads goes through `parseSystemProfile`, which rebuilds a fully
 * typed profile and falls back to the D&D 5e document (what the app hard-coded before the document existed) for any
 * part that is missing or has the wrong type. A malformed document therefore degrades to a working campaign.
 */

/** The coin columns of `pjs.monedas` / `game_pot`: the only denominations a document can use. */
export const COIN_KEYS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const
export type CoinKey = (typeof COIN_KEYS)[number]

export interface BuiltinField {
  enabled: boolean
  label: string
}

export interface LevelField extends BuiltinField {
  min: number
  max: number
}

/** The blocks of the character sheet a system can switch on or off (order = display order). */
export const SECTION_KEYS = ['stats', 'habilidades', 'ataques', 'hechizos', 'recursos', 'equipo', 'rasgos', 'narrativa', 'apariencia'] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

export interface Denomination {
  key: CoinKey
  label: string
}

export interface SystemProfile {
  version: 1
  character: { builtins: { clase: BuiltinField; raza: BuiltinField; nivel: LevelField }; sections: Record<SectionKey, boolean> }
  currency: { enabled: boolean; denominations: Denomination[] }
  modules: { juegos: boolean; sesion_en_vivo: boolean; mapas: boolean; calendario: boolean }
  /**
   * The character sheet as data (odd/design/sheet-builder.md), optional. Carried verbatim: the database validates it and
   * rebuilds the document on every write, so a client that dropped it here would erase it on the next save. Read it
   * through `validateSheet` (system/sheet/sheetModel.ts).
   */
  sheet?: Record<string, unknown>
}

export const LABEL_MAX = 60
const LEVEL_LIMIT = 1000

const DND5E: SystemProfile = {
  version: 1,
  character: {
    builtins: {
      clase: { enabled: true, label: 'Clase' },
      raza: { enabled: true, label: 'Raza' },
      nivel: { enabled: true, label: 'Nivel', min: 1, max: 20 },
    },
    sections: { stats: true, habilidades: true, ataques: true, hechizos: true, recursos: true, equipo: true, rasgos: true, narrativa: true, apariencia: true },
  },
  currency: {
    enabled: true,
    denominations: [
      { key: 'pp', label: 'platino' },
      { key: 'gp', label: 'oro' },
      { key: 'ep', label: 'electrum' },
      { key: 'sp', label: 'plata' },
      { key: 'cp', label: 'bronce' },
    ],
  },
  modules: { juegos: true, sesion_en_vivo: true, mapas: true, calendario: true },
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

/** The D&D 5e document, deeply frozen: a reference to compare against, never something to hand out or edit. */
export const DND5E_PROFILE: Readonly<SystemProfile> = deepFreeze(DND5E)

/** A fresh, editable copy of the D&D 5e document. */
export const dnd5eProfile = (): SystemProfile => JSON.parse(JSON.stringify(DND5E)) as SystemProfile

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

// Same set the database refuses in labels (public.strip_control_chars): controls, soft hyphen, bidi and zero-width marks.
// eslint-disable-next-line no-control-regex -- the point is to detect control characters
const HIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/
// What the database trims (white space, no-break and ideographic spaces); NOT the BOM, which it then rejects as hidden.
const EDGE_BLANKS = /^[\t\n\v\f\r \u00a0\u3000]+|[\t\n\v\f\r \u00a0\u3000]+$/g

/** A label as the database accepts it: trimmed, 1..60 characters (code points), no hidden characters. null when not valid. */
export function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(EDGE_BLANKS, '')
  if (text === '' || HIDDEN_CHARS.test(text) || Array.from(text).length > LABEL_MAX) return null
  return text
}

const label = (value: unknown, fallback: string): string => cleanLabel(value) ?? fallback

const isLevel = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= LEVEL_LIMIT

function builtin(raw: unknown, fallback: BuiltinField): BuiltinField {
  const source = isRecord(raw) ? raw : {}
  return { enabled: bool(source.enabled, fallback.enabled), label: label(source.label, fallback.label) }
}

function level(raw: unknown, fallback: LevelField): LevelField {
  const source = isRecord(raw) ? raw : {}
  const base = builtin(raw, fallback)
  const min = isLevel(source.min) ? source.min : fallback.min
  const max = isLevel(source.max) ? source.max : fallback.max
  return min <= max ? { ...base, min, max } : { ...base, min: fallback.min, max: fallback.max }
}

function denominations(raw: unknown, fallback: Denomination[]): Denomination[] {
  if (!Array.isArray(raw)) return fallback
  const seen = new Set<string>()
  const out: Denomination[] = []
  for (const item of raw) {
    if (!isRecord(item) || typeof item.key !== 'string' || !(COIN_KEYS as readonly string[]).includes(item.key) || seen.has(item.key)) continue
    const text = cleanLabel(item.label)
    if (text === null) continue
    seen.add(item.key)
    out.push({ key: item.key as CoinKey, label: text })
  }
  return out
}

export function parseSystemProfile(raw: unknown): SystemProfile {
  const defaults = dnd5eProfile()
  if (!isRecord(raw) || raw.version !== 1) return defaults
  const builtins = isRecord(raw.character) && isRecord(raw.character.builtins) ? raw.character.builtins : {}
  const currency = isRecord(raw.currency) ? raw.currency : {}
  const modules = isRecord(raw.modules) ? raw.modules : {}
  const sections = isRecord(raw.character) && isRecord(raw.character.sections) ? raw.character.sections : {}
  const enabled = bool(currency.enabled, defaults.currency.enabled)
  const parsed = denominations(currency.denominations, defaults.currency.denominations)
  return {
    version: 1,
    character: {
      builtins: {
        clase: builtin(builtins.clase, defaults.character.builtins.clase),
        raza: builtin(builtins.raza, defaults.character.builtins.raza),
        nivel: level(builtins.nivel, defaults.character.builtins.nivel),
      },
      sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, bool(sections[key], defaults.character.sections[key])])) as Record<SectionKey, boolean>,
    },
    currency: { enabled, denominations: enabled && parsed.length === 0 ? defaults.currency.denominations : parsed },
    ...(isRecord(raw.sheet) ? { sheet: raw.sheet } : {}),
    modules: {
      juegos: bool(modules.juegos, defaults.modules.juegos),
      sesion_en_vivo: bool(modules.sesion_en_vivo, defaults.modules.sesion_en_vivo),
      mapas: bool(modules.mapas, defaults.modules.mapas),
      calendario: bool(modules.calendario, defaults.modules.calendario),
    },
  }
}
