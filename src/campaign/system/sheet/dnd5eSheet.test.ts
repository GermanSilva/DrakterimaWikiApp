import { describe, expect, it } from 'vitest'
import { ABILITY_SCORES, SECTION_FIELDS, SKILLS_BY_ABILITY } from '../../../pages/pj/pjConstants'
import { OWNER_DATA_KEYS, STAMPABLE_SECTIONS } from '../../pjOwnerFields'
import { DND5E_SHEET, DND5E_SHEET_GAPS } from './dnd5eSheet'
import { playerWritableKeys } from './sheetAccess'
import { validateSheet, type Item, type Sheet } from './sheetModel'

/** Every key the sheet can store a value under: fields, tables, and the rows of Stat and Capacidades tables. */
function storedKeys(sheet: Sheet): Set<string> {
  const keys = new Set<string>()
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        keys.add(item.key)
        if (item.kind === 'table' && 'rows' in item) for (const row of item.rows) keys.add(row.key)
      }
    }
  }
  return keys
}

const items = (sheet: Sheet): Item[] => sheet.categories.flatMap((c) => c.sections.flatMap((s) => s.items))

describe('the D&D 5e sheet preset', () => {
  it('is a valid sheet', () => {
    const result = validateSheet(DND5E_SHEET)
    expect(result.ok, JSON.stringify(result.ok ? [] : result.errors)).toBe(true)
  })

  it('is stable under validation (nothing is dropped or rewritten)', () => {
    const result = validateSheet(DND5E_SHEET)
    expect(result.ok && result.sheet).toEqual(DND5E_SHEET)
  })

  it('has one section per unread key the application stamps today, with the same key', () => {
    const sectionKeys = DND5E_SHEET.categories.flatMap((c) => c.sections.map((s) => s.key))
    const legacy = Object.keys(SECTION_FIELDS).filter((k) => k !== 'dm')
    for (const key of legacy) expect(sectionKeys, key).toContain(key)
    for (const key of sectionKeys) expect(STAMPABLE_SECTIONS, key).toContain(key)
  })

  it('keeps every data key of today sheet, except the documented gaps', () => {
    const keys = storedKeys(DND5E_SHEET)
    const today = Object.entries(SECTION_FIELDS)
      .filter(([section]) => section !== 'dm')
      .flatMap(([, fields]) => fields)
    const missing = [...new Set(today)].filter((key) => !keys.has(key) && !DND5E_SHEET_GAPS.includes(key))
    expect(missing).toEqual([])
  })

  it('documents only gaps that really are absent', () => {
    const keys = storedKeys(DND5E_SHEET)
    for (const gap of DND5E_SHEET_GAPS) expect(keys.has(gap), gap).toBe(false)
  })

  it('has the six abilities, six saves and eighteen skills under today keys', () => {
    const keys = storedKeys(DND5E_SHEET)
    for (const ability of ABILITY_SCORES) {
      expect(keys.has(ability.key), ability.key).toBe(true)
      expect(keys.has(ability.saveKey), ability.saveKey).toBe(true)
    }
    for (const group of SKILLS_BY_ABILITY) for (const skill of group.skills) expect(keys.has(skill.key), skill.key).toBe(true)
  })

  it('links each skill and save to the same ability it belongs to today', () => {
    const links = new Map<string, string>()
    for (const item of items(DND5E_SHEET)) {
      if (item.kind === 'table' && item.type === 'capacidades') for (const row of item.rows) links.set(row.key, row.stat)
    }
    for (const group of SKILLS_BY_ABILITY) {
      expect(links.get(group.saveKey), group.saveKey).toBe(group.key)
      for (const skill of group.skills) expect(links.get(skill.key), skill.key).toBe(group.key)
    }
  })

  it('lets players write exactly the data keys the owner guard allows today (no table, no coin, no stat)', () => {
    const wanted = OWNER_DATA_KEYS.filter((key) => key !== 'custom_fields')
    expect(playerWritableKeys(DND5E_SHEET)).toEqual([...wanted].sort())
  })

  it('computes the ability modifier the way the application does', () => {
    const table = items(DND5E_SHEET).find((item) => item.kind === 'table' && item.type === 'stat')
    expect(table && table.kind === 'table' && table.type === 'stat' && table.rows.map((r) => r.modifier)).toEqual(
      ABILITY_SCORES.map(() => 'floor(({valor} - 10) / 2)'),
    )
  })

  it('defines the five D&D denominations with copper as the base', () => {
    const coins = items(DND5E_SHEET).find((item) => item.kind === 'table' && item.type === 'monedas')
    expect(coins && coins.kind === 'table' && coins.type === 'monedas' && Object.fromEntries(coins.rows.map((r) => [r.key, r.value]))).toEqual({
      cp: 1,
      sp: 10,
      ep: 50,
      gp: 100,
      pp: 1000,
    })
  })

  it('keeps spell slots as a free table with one row per spell level (level, total, spent)', () => {
    const slots = items(DND5E_SHEET).find((item) => item.key === 'espacios_conjuro')
    expect(slots).toMatchObject({ kind: 'table', type: 'libre', editableBy: 'dm' })
    expect(slots && slots.kind === 'table' && 'columns' in slots && slots.columns.map((c) => c.key)).toEqual(['nivel', 'total', 'gastados'])
    const section = DND5E_SHEET.categories.flatMap((c) => c.sections).find((s) => s.key === 'hechizos')
    expect(section?.blocks.some((b) => b.mode === 'plano' && b.items.includes('espacios_conjuro'))).toBe(true)
  })

  it('shows the spell list as a modal filtered by spell level', () => {
    const section = DND5E_SHEET.categories.flatMap((c) => c.sections).find((s) => s.key === 'hechizos')
    const modal = section?.blocks.find((b) => b.mode === 'modal')
    expect(modal?.items).toEqual(['hechizos'])
    expect(modal?.filterCategories).toHaveLength(10)
  })
})
