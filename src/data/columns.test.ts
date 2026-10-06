import { readdirSync, readFileSync } from 'node:fs'
import { join as pathJoin } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_COLUMN_LISTS, ENTITY_SELECT, ENTITY_TABLES, PROMOTED_COLUMNS } from './columns'

describe('column lists', () => {
  it('never contain visible_to or a wildcard', () => {
    for (const [name, cols] of Object.entries(ALL_COLUMN_LISTS)) {
      expect(cols.length, name).toBeGreaterThan(0)
      for (const col of cols) {
        expect(col, `${name}: ${col}`).not.toBe('*')
        expect(col, `${name}: ${col}`).not.toContain('*')
        expect(col, `${name}: ${col}`).not.toBe('visible_to')
        expect(col, `${name}: ${col}`).toMatch(/^[a-z_]+$/)
      }
    }
    for (const select of Object.values(ENTITY_SELECT)) {
      expect(select).not.toContain('*')
      expect(select).not.toContain('visible_to')
    }
  })

  it('covers all 10 entity tables with id, campaign_id and data in every select', () => {
    expect(ENTITY_TABLES).toHaveLength(10)
    for (const table of ENTITY_TABLES) {
      const cols = ENTITY_SELECT[table].split(', ')
      expect(cols).toEqual(expect.arrayContaining(['id', 'campaign_id', 'data', ...PROMOTED_COLUMNS[table]]))
    }
  })

  it('promoted lists never contain server-managed columns', () => {
    for (const table of ENTITY_TABLES) {
      for (const col of ['id', 'campaign_id', 'created_by', 'created_at', 'updated_at', 'data']) {
        expect(PROMOTED_COLUMNS[table], table).not.toContain(col)
      }
    }
  })
})

describe('data layer source guard', () => {
  const dir = process.cwd() + "/src/data"
  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'database.types.ts',
  )
  // Files that may name visible_to: the RPC wrappers and the code that strips it.
  const allowVisibleTo = new Set(['visibilityRepository.ts', 'mappers.ts', 'columns.ts', 'realtime.ts', 'entityRepository.ts'])

  it('has no select(*) and no empty select()', () => {
    for (const file of files) {
      const src = readFileSync(pathJoin(dir, file), 'utf8')
      expect(src, file).not.toMatch(/\.select\(\s*\)/)
      expect(src, file).not.toMatch(/\.select\(\s*['"`]\s*\*/)
    }
  })

  it('names visible_to only where it is intentionally dropped or documented', () => {
    for (const file of files) {
      const src = readFileSync(pathJoin(dir, file), 'utf8')
      if (!allowVisibleTo.has(file)) expect(src, file).not.toContain('visible_to')
    }
  })
})
