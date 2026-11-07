import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DND5E_SHEET } from '../dnd5eSheet'
import { migrateDnd5eV2, type MigrationInput } from './migrateDnd5eV2'
import expected from './dnd5eV2.fixture.expected.json'
import input from './dnd5eV2.fixture.input.json'

const ROOT = join(__dirname, '../../../../..')
const SQL_MIGRATION = readFileSync(join(ROOT, 'supabase/migrations/20261107120000_dnd5e_v2_data.sql'), 'utf8')
const PGTAP = readFileSync(join(ROOT, 'supabase/tests/database/35_dnd5e_v2_data.test.sql'), 'utf8')

const literal = (text: string, tag: string): unknown => {
  const open = `$${tag}$`
  const start = text.indexOf(open)
  const end = text.indexOf(open, start + open.length)
  if (start < 0 || end < 0) throw new Error(`no ${open} literal`)
  return JSON.parse(text.slice(start + open.length, end))
}

const run = () =>
  migrateDnd5eV2({
    campaign: { sheet: DND5E_SHEET as unknown as Record<string, unknown>, character_custom_fields: input.campaign.character_custom_fields },
    pjs: input.pjs as MigrationInput['pjs'],
  })

describe('TypeScript twin on the shared fixture (the pgTAP test runs the same files through the SQL)', () => {
  it('produces exactly the expected characters, entries, links and campaign section', () => {
    const out = run()
    expect({
      counts: {
        pjs_changed: out.report.counts.pjs_changed,
        entries_created: out.actions.length,
        links_created: out.links.length,
        warnings: out.report.warnings.length,
      },
      pjs: out.pjs.map((p) => ({ id: p.id, data: p.newData, jugador: p.jugador })),
      actions: out.actions,
      links: out.links,
      custom_section: out.sheet.categories && (out.sheet.categories as { sections: { key: string }[] }[]).flatMap((c) => c.sections).find((s) => s.key === 'campos_campana'),
    }).toEqual(expected)
  })

  it('covers the cases the real data has', () => {
    const out = run()
    const kinds = out.actions.map((a) => (a.private_to_pj === null ? 'shared' : 'private'))
    expect(kinds.filter((k) => k === 'private')).toHaveLength(2)
    expect(out.links.some((l) => l.action.category === 'rasgos')).toBe(true)
    expect(out.pjs.some((p) => (p.newData.espacios_conjuro as unknown[] | undefined)?.length === 9)).toBe(true)
    expect(out.pjs.some((p) => !p.changed)).toBe(true)
  })
})

describe('the SQL migration and its pgTAP test', () => {
  it('embeds the same fixture files', () => {
    expect(literal(PGTAP, 'fixture_in')).toEqual(input)
    expect(literal(PGTAP, 'fixture_out')).toEqual(expected)
  })

  it('carries the v2 preset literal that is exactly the TypeScript preset', () => {
    expect(literal(SQL_MIGRATION, 'sheet_v2')).toEqual(DND5E_SHEET)
  })

  it('carries a different v1 preset literal (hit dice still a plain field)', () => {
    const v1 = literal(SQL_MIGRATION, 'sheet_v1') as { categories: unknown }
    expect(v1).not.toEqual(DND5E_SHEET)
    expect(JSON.stringify(v1)).toContain('"stat_hit_dice"')
    expect(JSON.stringify(v1)).not.toContain('"dado_golpe"')
  })

  it('writes its backup before it changes anything and documents rollback and dry run', () => {
    expect(SQL_MIGRATION.indexOf('insert into public.migration_backup_dnd5e_v2')).toBeLessThan(SQL_MIGRATION.indexOf('update public.campaigns set system_profile'))
    expect(SQL_MIGRATION).toContain('-- ROLLBACK')
    expect(SQL_MIGRATION).toContain('-- DRY RUN')
    expect(SQL_MIGRATION).toContain('revoke all on public.migration_backup_dnd5e_v2 from anon, authenticated')
  })
})
