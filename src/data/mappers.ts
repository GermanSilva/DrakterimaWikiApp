import {
  DM_NOTE_FIELDS,
  NULLABLE_COLUMNS,
  PROMOTED_COLUMNS,
  type DmNoteField,
  type EntityTable,
} from './columns'
import { DataError } from './errors'
import type { FlatEntity } from './types'

/** Raw row as returned by PostgREST / Realtime for an entity table (never contains visible_to). */
export type EntityRow = Record<string, unknown>

export type DmNotesFields = Partial<Record<DmNoteField, string>>

/** Flat keys that are never written: server-managed, tenant key, or visibility (RPC-only). */
const RESERVED_KEYS = new Set([
  'id',
  'campaign_id',
  'created_by',
  'created_at',
  'updated_at',
  'visible_to',
  'visibilidad', // legacy Firestore name of visible_to
])

const DM_FIELDS = new Set<string>(DM_NOTE_FIELDS)

const META_READ_KEYS = ['id', 'campaign_id', 'created_by', 'created_at', 'updated_at'] as const

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** `data` without reserved keys or DM-private fields (defense against legacy imported data). */
function cleanData(data: unknown): Record<string, unknown> {
  if (!isPlainObject(data)) return {}
  return Object.fromEntries(Object.entries(data).filter(([k]) => !RESERVED_KEYS.has(k) && !DM_FIELDS.has(k)))
}

/**
 * Row -> flat entity. `data` keys are spread first so a promoted column always wins on a name
 * clash. Absent columns are skipped (Realtime payloads may omit some), so the result can be
 * merged onto a previous copy.
 */
export function fromRow(table: EntityTable, row: EntityRow): FlatEntity {
  const flat: Record<string, unknown> = cleanData(row.data)
  for (const key of PROMOTED_COLUMNS[table]) {
    if (key in row) flat[key] = row[key]
  }
  for (const key of META_READ_KEYS) {
    if (key in row) flat[key] = row[key]
  }
  // The UI represents "no date" as '' (Firestore); the column is a nullable date.
  if (table === 'sesiones' && 'fecha' in row && row.fecha == null) flat.fecha = ''
  return flat as FlatEntity
}

export interface SplitFlat {
  /** Promoted columns present in the input, ready to send. */
  columns: Record<string, unknown>
  /** Everything else (stored in `data`). */
  data: Record<string, unknown>
  /** DM-private fields that belong in `entity_dm_notes`, never in the entity row. */
  dmNotes: DmNotesFields
}

/**
 * Splits a flat entity (or a patch of one) into promoted columns, `data` keys and DM notes.
 * `undefined` values mean "not provided" and are skipped. Reserved keys are dropped. '' is
 * written as NULL for the nullable promoted columns.
 */
export function splitFlat(table: EntityTable, flat: Record<string, unknown>): SplitFlat {
  const promoted = new Set(PROMOTED_COLUMNS[table])
  const nullable = new Set(NULLABLE_COLUMNS[table] ?? [])
  const columns: Record<string, unknown> = {}
  const data: Record<string, unknown> = {}
  const dmNotes: DmNotesFields = {}

  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined || RESERVED_KEYS.has(key)) continue
    if (DM_FIELDS.has(key)) {
      dmNotes[key as DmNoteField] = typeof value === 'string' ? value : String(value ?? '')
    } else if (promoted.has(key)) {
      columns[key] = nullable.has(key) && value === '' ? null : value
    } else {
      data[key] = value
    }
  }
  return { columns, data, dmNotes }
}

/**
 * Entity writes must not carry DM-private fields: silently dropping them would lose the DM's
 * text. Callers use `saveEntityWithDmNotes` (or `dmNotes.upsert`) for those.
 */
export function assertNoDmNotes(flat: Record<string, unknown>): void {
  const present = DM_NOTE_FIELDS.filter((k) => flat[k] !== undefined)
  if (present.length > 0) {
    throw new DataError(
      'validation',
      `DM-private fields (${present.join(', ')}) are stored in entity_dm_notes: use saveEntityWithDmNotes or dmNotes.upsert`,
    )
  }
}

/** Payload for INSERT. `id` and server-managed fields are never sent. */
export function toInsertRow(
  table: EntityTable,
  campaignId: string,
  flat: Record<string, unknown>,
): Record<string, unknown> {
  assertNoDmNotes(flat)
  const { columns, data } = splitFlat(table, flat)
  return { ...columns, data, campaign_id: campaignId }
}

/** DM-only fields of a flat entity (kept apart from the entity row). */
export function extractDmNotes(flat: Record<string, unknown>): DmNotesFields {
  const dmNotes: DmNotesFields = {}
  for (const key of DM_NOTE_FIELDS) {
    const value = flat[key]
    if (value !== undefined) dmNotes[key] = typeof value === 'string' ? value : String(value ?? '')
  }
  return dmNotes
}

/** The flat entity without its DM-private fields. */
export function withoutDmNotes(flat: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(flat).filter(([k]) => !DM_FIELDS.has(k)))
}
