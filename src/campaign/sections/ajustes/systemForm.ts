import { readDistance, UNIT_MAX, validateDistance, VALUE_MAX, VALUE_MIN } from '../../system/distance/distance'
import { cleanLabel, LABEL_MAX, SECTION_KEYS, type SectionKey, type SystemProfile } from '../../system/systemProfile'

export const LEVEL_MAX = 1000

export interface BuiltinDraft {
  enabled: boolean
  label: string
}

export interface LevelDraft extends BuiltinDraft {
  min: string
  max: string
}

/** One distance unit as typed. `saved`: it came from the stored document, so its key (used by texts) is fixed. */
export interface UnitDraft {
  key: string
  label: string
  value: string
  decimals: '0' | '1' | '2'
  main: boolean
  saved: boolean
}

/** The editable text of the "Sistema" section: the character built-ins, the sheet blocks and the distance units. */
export interface SystemDraft {
  clase: BuiltinDraft
  raza: BuiltinDraft
  nivel: LevelDraft
  sections: Record<SectionKey, boolean>
  /** Rows in declared order; null = the stored value is not readable here, so it travels untouched. */
  distance: UnitDraft[] | null
}

export interface UnitErrors {
  key?: string
  label?: string
  value?: string
}

export interface DistanceErrors {
  list?: string
  main?: string
  /** One entry per row (empty object = fine). */
  units: UnitErrors[]
}

export interface SystemErrors {
  distance?: DistanceErrors
  clase?: string
  raza?: string
  nivel?: string
  range?: string
}

export type SystemResult = { ok: true; profile: SystemProfile } | { ok: false; errors: SystemErrors }

const LABEL_ERROR = `El nombre debe tener entre 1 y ${LABEL_MAX} caracteres y no puede incluir caracteres de control ni invisibles.`
const UNIT_KEY_ERROR = 'La clave debe empezar con una letra minúscula y usar solo minúsculas sin tildes, números y guion bajo (hasta 40 caracteres), por ejemplo "ft".'
const UNIT_DUPLICATE_ERROR = 'Ya hay otra unidad con esa clave.'
const UNIT_VALUE_ERROR = 'El valor debe ser un número mayor que 0 (entre 0,000001 y 1.000.000.000.000), con punto o coma decimal.'
const UNIT_MAIN_ERROR = 'Elegí la unidad principal entre las definidas.'
const UNIT_LIST_ERROR = `Podés definir hasta ${UNIT_MAX} unidades.`
const RANGE_ERROR = `El rango del nivel debe ser de números enteros entre 0 y ${LEVEL_MAX}, con el mínimo menor o igual al máximo.`

export function systemDraft(profile: Readonly<SystemProfile>): SystemDraft {
  const { clase, raza, nivel } = profile.character.builtins
  return {
    clase: { enabled: clase.enabled, label: clase.label },
    raza: { enabled: raza.enabled, label: raza.label },
    nivel: { enabled: nivel.enabled, label: nivel.label, min: String(nivel.min), max: String(nivel.max) },
    sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, profile.character.sections[key]])) as Record<SectionKey, boolean>,
    distance: distanceDraft(profile),
  }
}

/** An empty row for a new unit. */
export const newUnit = (): UnitDraft => ({ key: '', label: '', value: '', decimals: '0', main: false, saved: false })

function distanceDraft(profile: Readonly<SystemProfile>): UnitDraft[] | null {
  if (profile.distance === undefined) return []
  const distance = readDistance(profile.distance)
  if (!distance) return null
  return distance.units.map((u) => ({
    key: u.key,
    label: u.label,
    value: String(u.value),
    decimals: String(u.decimals) as UnitDraft['decimals'],
    main: u.key === distance.main,
    saved: true,
  }))
}

const unitNumber = (text: string): number | null => {
  const t = text.trim()
  if (!/^\d+(?:[.,]\d+)?$/.test(t)) return null
  const n = Number(t.replace(',', '.'))
  return n >= VALUE_MIN && n <= VALUE_MAX ? n : null
}

/** Checks the rows with the database rules, row by row (so every wrong row is reported), and builds the distance. */
function validateUnits(rows: UnitDraft[]): { ok: true; distance: Record<string, unknown> } | { ok: false; errors: DistanceErrors } {
  const errors: DistanceErrors = { units: rows.map(() => ({})) }
  if (rows.length > UNIT_MAX) errors.list = UNIT_LIST_ERROR
  const seen = new Set<string>()
  const units = rows.map((row, i) => {
    const key = row.key.trim()
    const value = unitNumber(row.value)
    const label = cleanLabel(row.label)
    const unit = { key, label: label ?? row.label, value: value ?? 0, decimals: Number(row.decimals) }
    // each field is judged on its own, with the same rules the database applies, so every wrong field is reported at once
    if (!validateDistance({ main: key, units: [{ key, label: 'x', value: 1, decimals: 0 }] }).ok) errors.units[i].key = UNIT_KEY_ERROR
    if (label === null) errors.units[i].label = LABEL_ERROR
    if (value === null) errors.units[i].value = UNIT_VALUE_ERROR
    if (key !== '' && seen.has(key) && !errors.units[i].key) errors.units[i].key = UNIT_DUPLICATE_ERROR
    seen.add(key)
    return unit
  })
  const mains = rows.filter((r) => r.main)
  if (mains.length !== 1) errors.main = UNIT_MAIN_ERROR
  if (errors.list || errors.main || errors.units.some((e) => Object.keys(e).length > 0)) return { ok: false, errors }
  return { ok: true, distance: { main: mains[0].key.trim(), units } }
}

const wholeNumber = (text: string): number | null => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null)

/**
 * Validates the draft with the same rules the database applies and builds the whole document to send: the edited
 * character part over `stored`, whose currency and modules (edited elsewhere) travel unchanged.
 */
export function validateSystem(draft: SystemDraft, stored: SystemProfile): SystemResult {
  const errors: SystemErrors = {}
  const labels = {
    clase: cleanLabel(draft.clase.label),
    raza: cleanLabel(draft.raza.label),
    nivel: cleanLabel(draft.nivel.label),
  }
  for (const key of ['clase', 'raza', 'nivel'] as const) if (labels[key] === null) errors[key] = LABEL_ERROR

  const min = wholeNumber(draft.nivel.min)
  const max = wholeNumber(draft.nivel.max)
  if (min === null || max === null || max > LEVEL_MAX || min > max) errors.range = RANGE_ERROR

  const distance = draft.distance === null ? null : draft.distance.length === 0 ? null : validateUnits(draft.distance)
  if (distance && !distance.ok) errors.distance = distance.errors

  if (Object.keys(errors).length > 0 || labels.clase === null || labels.raza === null || labels.nivel === null || min === null || max === null) {
    return { ok: false, errors }
  }
  const { distance: storedDistance, ...rest } = stored
  const keptDistance = draft.distance === null ? storedDistance : distance?.ok ? distance.distance : undefined
  return {
    ok: true,
    profile: {
      ...rest,
      ...(keptDistance === undefined ? {} : { distance: keptDistance }),
      character: {
        builtins: {
          clase: { enabled: draft.clase.enabled, label: labels.clase },
          raza: { enabled: draft.raza.enabled, label: labels.raza },
          nivel: { enabled: draft.nivel.enabled, label: labels.nivel, min, max },
        },
        sections: { ...draft.sections },
      },
    },
  }
}
