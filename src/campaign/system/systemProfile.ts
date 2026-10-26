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

export interface Denomination {
  key: CoinKey
  label: string
}

export interface SystemProfile {
  version: 1
  character: { builtins: { clase: BuiltinField; raza: BuiltinField; nivel: LevelField } }
  currency: { enabled: boolean; denominations: Denomination[] }
  modules: { juegos: boolean; sesion_en_vivo: boolean; mapas: boolean; calendario: boolean }
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

function label(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return text === '' || text.length > LABEL_MAX ? fallback : text
}

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
    const text = typeof item.label === 'string' ? item.label.trim() : ''
    if (text === '' || text.length > LABEL_MAX) continue
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
    },
    currency: { enabled, denominations: enabled && parsed.length === 0 ? defaults.currency.denominations : parsed },
    modules: {
      juegos: bool(modules.juegos, defaults.modules.juegos),
      sesion_en_vivo: bool(modules.sesion_en_vivo, defaults.modules.sesion_en_vivo),
      mapas: bool(modules.mapas, defaults.modules.mapas),
      calendario: bool(modules.calendario, defaults.modules.calendario),
    },
  }
}
