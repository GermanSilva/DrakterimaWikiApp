import { describe, expect, it } from 'vitest'
import { DND5E_SHEET } from './dnd5eSheet'
import { LEGACY_ROLE_KEYS, roleKeys, roleValues, roleWriteKey } from './roles'
import { validateSheet, type Sheet } from './sheetModel'

const field = (key: string, type: string, extra: Record<string, unknown> = {}) => ({ kind: 'field', key, label: key, type, editableBy: 'dm', ...extra })
const sheetOf = (items: unknown[], roles: Record<string, string>): Sheet => {
  const r = validateSheet({ categories: [{ key: 'g', label: 'G', sections: [{ key: 's', label: 'S', items, blocks: [] }] }], roles })
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.sheet
}

const CUSTOM = sheetOf(
  [field('vida', 'number'), field('vida_ahora', 'number'), field('guardia', 'number', { formula: '{vida} / 2' }), field('rapidez', 'number')],
  { hp: 'vida', hp_current: 'vida_ahora', ac: 'guardia' },
)

describe('sheet roles for the readers outside the sheet (G5c, S5)', () => {
  it('without a sheet the keys are the fixed D&D ones and the values are read raw', () => {
    expect(roleKeys(null)).toEqual(LEGACY_ROLE_KEYS)
    expect(roleValues(null, { stat_hp: 40, stat_ac: 0, stat_speed: undefined })).toEqual({ hp: 40, ac: 0 })
  })

  it('the D&D preset binds the same keys as the fixed ones', () => {
    expect(roleKeys(DND5E_SHEET)).toEqual(LEGACY_ROLE_KEYS)
    const pj = { stat_hp: 40, stat_hp_current: 31, stat_ac: 18, stat_speed: 30, stat_initiative: 2 }
    expect(roleValues(DND5E_SHEET, pj)).toEqual({ hp: 40, hp_current: 31, ac: 18, speed: 30, initiative: 2 })
  })

  it('resolves each bound role through the sheet, formulas included', () => {
    expect(roleValues(CUSTOM, { vida: 40, vida_ahora: 31 })).toEqual({ hp: 40, hp_current: 31, ac: 20 })
  })

  it('an unbound role is absent, even when the character stores the fixed key', () => {
    const values = roleValues(CUSTOM, { vida: 40, stat_speed: 30, rapidez: 9 })
    expect('speed' in values).toBe(false)
    expect('initiative' in values).toBe(false)
  })

  it('an empty bound role is absent, a stored zero is a value', () => {
    expect(roleValues(CUSTOM, { vida: 0 })).toEqual({ hp: 0, ac: 0 })
    expect('hp_current' in roleValues(CUSTOM, { vida: 5 })).toBe(false)
  })

  it('only a stored (not computed) bound field is writable', () => {
    expect(roleWriteKey(CUSTOM, 'hp_current')).toBe('vida_ahora')
    expect(roleWriteKey(CUSTOM, 'ac')).toBeUndefined() // formula
    expect(roleWriteKey(CUSTOM, 'speed')).toBeUndefined() // unbound
    expect(roleWriteKey(null, 'hp_current')).toBe('stat_hp_current')
  })
})
