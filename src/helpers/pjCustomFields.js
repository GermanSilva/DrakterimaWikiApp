/**
 * Campaign-defined character fields. The hub stores their values in `data.custom_fields[key]` (the
 * campaign config lists them in `character_custom_fields`); the legacy app has the one hard-coded
 * `magralita` field stored flat on the document (`flat: true`).
 */
export const LEGACY_CHARACTER_FIELDS = [{ key: 'magralita', label: 'Relación con la Magralita', flat: true }]

const isPlainObject = v => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The text value of a custom field of a character ('' when it has none). Own properties only. */
export function customFieldValue(pj, field) {
  const source = field.flat ? pj : pj.custom_fields
  if (!isPlainObject(source) || !Object.hasOwn(source, field.key)) return ''
  const value = source[field.key]
  return typeof value === 'string' ? value : ''
}
