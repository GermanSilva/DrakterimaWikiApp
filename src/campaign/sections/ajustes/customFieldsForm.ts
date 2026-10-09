import type { CharacterField } from '../../../ports'
import { labelError, newKeyError, normalizeKey } from './fieldKey'
import { nextUid } from './regionsForm'

export const FIELD_LABEL_MAX = 60
export const MAX_CUSTOM_FIELDS = 10

export interface FieldDraft {
  uid: number
  key: string
  label: string
  persisted: boolean
}

export interface FieldRowErrors {
  key?: string
  label?: string
}

/** Shape stored in `campaigns.character_custom_fields` (text is the only supported type). */
export interface StoredCharacterField {
  key: string
  label: string
  type: 'text'
}

export type CustomFieldsResult = { ok: true; fields: StoredCharacterField[] } | { ok: false; errors: Record<number, FieldRowErrors>; list?: string }

export function fieldDrafts(fields: readonly CharacterField[]): FieldDraft[] {
  return fields.map((f, uid) => ({ uid, key: f.key, label: f.label, persisted: true }))
}

export const newFieldDraft = (rows: readonly FieldDraft[]): FieldDraft => ({ uid: nextUid(rows), key: '', label: '', persisted: false })

/** Validates the custom character fields editor: text only, at most 10, immutable unique keys, label 1..60. */
export function validateCustomFields(rows: readonly FieldDraft[]): CustomFieldsResult {
  const errors: Record<number, FieldRowErrors> = {}
  const list = rows.length > MAX_CUSTOM_FIELDS ? `Puede haber hasta ${MAX_CUSTOM_FIELDS} campos.` : undefined
  const taken = new Set(rows.filter((r) => r.persisted).map((r) => r.key))
  const fields: StoredCharacterField[] = []
  for (const row of rows) {
    const rowErrors: FieldRowErrors = {}
    const key = row.persisted ? row.key : normalizeKey(row.key)
    if (!row.persisted) {
      const duplicateOfNew = rows.some((o) => o !== row && !o.persisted && normalizeKey(o.key) === key)
      const keyError = duplicateOfNew ? 'Ya hay otro elemento con esa clave.' : newKeyError(row.key, taken)
      if (keyError) rowErrors.key = keyError
    }
    const label = labelError(row.label, FIELD_LABEL_MAX)
    if (label) rowErrors.label = label
    if (Object.keys(rowErrors).length > 0) errors[row.uid] = rowErrors
    fields.push({ key, label: row.label.trim(), type: 'text' })
  }
  if (list || Object.keys(errors).length > 0) return { ok: false, errors, list }
  return { ok: true, fields }
}
