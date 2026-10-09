export const KEY_MAX = 32

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/
/** Names that would collide with Object.prototype when a key is used as a property name. */
const RESERVED_KEYS = new Set(['constructor', 'prototype', 'hasownproperty', 'tostring', 'valueof', 'tolocalestring', 'isprototypeof', 'propertyisenumerable'])

/** The key as it will be stored: trimmed and lower-cased (keys are immutable once saved). */
export const normalizeKey = (raw: string): string => raw.trim().toLowerCase()

/** Spanish error for a NEW key (slug-like, unique among `taken`, not reserved), or null when it is fine. */
export function newKeyError(raw: string, taken: ReadonlySet<string>): string | null {
  const key = normalizeKey(raw)
  if (key.length === 0) return 'La clave es obligatoria.'
  if (key.length > KEY_MAX) return `La clave puede tener hasta ${KEY_MAX} caracteres.`
  if (!KEY_PATTERN.test(key)) return 'La clave solo admite letras minúsculas sin tildes, números, guion y guion bajo (por ejemplo "costa-norte").'
  if (RESERVED_KEYS.has(key)) return 'Esa clave está reservada. Elegí otra.'
  if (taken.has(key)) return 'Ya hay otro elemento con esa clave.'
  return null
}

// eslint-disable-next-line no-control-regex -- the point is to reject control characters
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** Spanish error for a label (trimmed, 1..max characters, no control characters), or null. */
export function labelError(raw: string, max: number): string | null {
  const label = raw.trim()
  if (label.length === 0) return 'El nombre es obligatorio.'
  if (label.length > max) return `El nombre puede tener hasta ${max} caracteres.`
  if (CONTROL_CHARS.test(label)) return 'El nombre no puede tener saltos de línea ni caracteres de control.'
  return null
}
