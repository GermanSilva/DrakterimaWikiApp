import { describe, expect, it } from 'vitest'
import { DM_NOTES_TYPES as TS_DM_NOTES_TYPES, DM_NOTE_FIELDS as TS_DM_NOTE_FIELDS, ENTITY_TABLES as TS_ENTITY_TABLES, NULLABLE_COLUMNS as TS_NULLABLE, PROMOTED_COLUMNS as TS_PROMOTED } from '../../src/data/columns'
import { DM_NOTES_TYPES, DM_NOTE_FIELDS, ENTITY_TABLES, LETTER_TABLE, NULLABLE_COLUMNS, PROMOTED_COLUMNS } from './schema.mjs'

// The import scripts cannot import columns.ts from plain Node, so they carry a copy. These tests
// fail when the copy and the application drift apart.
describe('schema drift', () => {
  it('uses the same entity tables as src/data/columns.ts', () => {
    expect(ENTITY_TABLES).toEqual([...TS_ENTITY_TABLES])
  })

  it('uses the same promoted column lists as src/data/columns.ts', () => {
    expect(PROMOTED_COLUMNS).toEqual(TS_PROMOTED)
  })

  it('uses the same nullable columns, DM note fields and DM note tables', () => {
    expect(NULLABLE_COLUMNS).toEqual(TS_NULLABLE)
    expect(DM_NOTE_FIELDS).toEqual([...TS_DM_NOTE_FIELDS])
    expect(DM_NOTES_TYPES).toEqual([...TS_DM_NOTES_TYPES])
  })

  it('knows the nine wiki-link letters', () => {
    expect(Object.keys(LETTER_TABLE).sort().join('')).toBe('FGHILMNPS')
  })
})
