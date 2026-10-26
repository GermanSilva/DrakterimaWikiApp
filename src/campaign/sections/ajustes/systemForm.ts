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

/** The editable text of the "Sistema" section: the character built-ins and the sheet blocks. */
export interface SystemDraft {
  clase: BuiltinDraft
  raza: BuiltinDraft
  nivel: LevelDraft
  sections: Record<SectionKey, boolean>
}

export interface SystemErrors {
  clase?: string
  raza?: string
  nivel?: string
  range?: string
}

export type SystemResult = { ok: true; profile: SystemProfile } | { ok: false; errors: SystemErrors }

const LABEL_ERROR = `El nombre debe tener entre 1 y ${LABEL_MAX} caracteres y no puede incluir caracteres de control ni invisibles.`
const RANGE_ERROR = `El rango del nivel debe ser de números enteros entre 0 y ${LEVEL_MAX}, con el mínimo menor o igual al máximo.`

export function systemDraft(profile: Readonly<SystemProfile>): SystemDraft {
  const { clase, raza, nivel } = profile.character.builtins
  return {
    clase: { enabled: clase.enabled, label: clase.label },
    raza: { enabled: raza.enabled, label: raza.label },
    nivel: { enabled: nivel.enabled, label: nivel.label, min: String(nivel.min), max: String(nivel.max) },
    sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, profile.character.sections[key]])) as Record<SectionKey, boolean>,
  }
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

  if (Object.keys(errors).length > 0 || labels.clase === null || labels.raza === null || labels.nivel === null || min === null || max === null) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    profile: {
      ...stored,
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
