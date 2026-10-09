import type { Region } from '../../../ports'
import { parseAccentColor } from '../../branding'
import { labelError, newKeyError, normalizeKey } from './fieldKey'

export const REGION_LABEL_MAX = 40
export const MAX_REGIONS = 30

/** One editable row. `persisted` rows were saved before: their key is immutable. `uid` is a stable row identity. */
export interface RegionDraft {
  uid: number
  key: string
  label: string
  color: string
  persisted: boolean
}

export interface RegionRowErrors {
  key?: string
  label?: string
  color?: string
}

export type RegionsResult = { ok: true; regions: Region[] } | { ok: false; errors: Record<number, RegionRowErrors>; list?: string }

export const nextUid = (rows: readonly { uid: number }[]): number => rows.reduce((max, r) => Math.max(max, r.uid), -1) + 1

export function regionDrafts(regions: readonly Region[]): RegionDraft[] {
  return regions.map((r, uid) => ({ uid, key: r.key, label: r.label, color: r.color ?? '', persisted: true }))
}

export const newRegionDraft = (rows: readonly RegionDraft[]): RegionDraft => ({ uid: nextUid(rows), key: '', label: '', color: '', persisted: false })

/**
 * Validates the regions editor. Persisted keys are kept as they are (they may predate the key rules) but still
 * count for uniqueness; new keys must be slug-like, unique and not reserved. Colour is optional and strict #rrggbb.
 */
export function validateRegions(rows: readonly RegionDraft[]): RegionsResult {
  const errors: Record<number, RegionRowErrors> = {}
  let list: string | undefined
  if (rows.length === 0) list = 'Tiene que quedar al menos una región.'
  else if (rows.length > MAX_REGIONS) list = `Puede haber hasta ${MAX_REGIONS} regiones.`

  const taken = new Set(rows.filter((r) => r.persisted).map((r) => r.key))
  const regions: Region[] = []
  for (const row of rows) {
    const rowErrors: RegionRowErrors = {}
    const key = row.persisted ? row.key : normalizeKey(row.key)
    if (!row.persisted) {
      const duplicateOfNew = rows.some((o) => o !== row && !o.persisted && normalizeKey(o.key) === key)
      const keyError = duplicateOfNew ? 'Ya hay otro elemento con esa clave.' : newKeyError(row.key, taken)
      if (keyError) rowErrors.key = keyError
    }
    const label = labelError(row.label, REGION_LABEL_MAX)
    if (label) rowErrors.label = label
    const color = row.color.trim()
    const parsedColor = color.length > 0 ? parseAccentColor(color) : null
    if (color.length > 0 && parsedColor === null) rowErrors.color = 'El color debe tener el formato #rrggbb (por ejemplo #dc2626).'
    if (Object.keys(rowErrors).length > 0) errors[row.uid] = rowErrors
    regions.push({ key, label: row.label.trim(), ...(parsedColor ? { color: parsedColor } : {}) })
  }
  if (list || Object.keys(errors).length > 0) return { ok: false, errors, list }
  return { ok: true, regions }
}
