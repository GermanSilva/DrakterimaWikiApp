import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DND5E_SHEET } from './dnd5eSheet'

const MIGRATIONS = join(__dirname, '../../../../supabase/migrations')
const MARKER = /\$dnd5e_sheet\$([\s\S]*?)\$dnd5e_sheet\$/g

/** The D&D sheet literals the migrations seed (default for new campaigns, backfill for existing ones). */
function seededSheets(): { file: string; sheet: unknown }[] {
  const found: { file: string; sheet: unknown }[] = []
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const text = readFileSync(join(MIGRATIONS, file), 'utf8')
    for (const match of text.matchAll(MARKER)) found.push({ file, sheet: JSON.parse(match[1]) })
  }
  return found
}

describe('the D&D sheet the migrations seed', () => {
  it('is seeded in at least one migration', () => {
    expect(seededSheets().length).toBeGreaterThan(0)
  })

  it('is exactly the TypeScript preset, in every place it appears', () => {
    for (const { file, sheet } of seededSheets()) expect(sheet, file).toEqual(DND5E_SHEET)
  })
})
