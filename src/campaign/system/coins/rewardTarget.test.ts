import { describe, expect, it } from 'vitest'
import { DND5E_SHEET } from '../sheet/dnd5eSheet'
import { potSupports, rewardTarget } from './rewardTarget'

/** The same cases pgTAP 28 pins for public._reward_target, over the raw stored document. */
const sheet = (items: unknown[], more: unknown[] = []) => ({
  categories: [
    { key: 'c', label: 'C', sections: [{ key: 'alpha', label: 'Alpha', items, blocks: [] }, ...more] },
  ],
  roles: {},
})
const coins = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero', rows, ...extra })
const ROWS = [{ key: 'cobre', label: 'Cobre', value: 1 }, { key: 'plata', label: 'Plata', value: 10 }, { key: 'oro', label: 'Oro', value: 100 }]
const bolsa = (extra: Record<string, unknown> = {}) => ({ kind: 'table', type: 'economia', key: 'bolsa', label: 'Bolsa', editableBy: 'dm', ...extra })

describe('rewardTarget', () => {
  it('is legacy without a stored sheet or without a coin table', () => {
    for (const none of [undefined, null, 'x', 5, [], {}, { categories: 'no' }]) expect(rewardTarget(none)).toEqual({ mode: 'legacy' })
    expect(rewardTarget(sheet([{ kind: 'field', key: 'f', label: 'F', type: 'short', editableBy: 'dm' }]))).toEqual({ mode: 'legacy' })
  })

  it('credits the coin table when it is the marked destination, with denominations in schema order', () => {
    const t = rewardTarget(sheet([coins(ROWS, { rewardDestination: true })]))
    expect(t).toEqual({ mode: 'monedas', key: 'dinero', section: 'alpha', denominations: ROWS })
  })

  it('credits an economy table when that one is marked', () => {
    const t = rewardTarget(sheet([coins(ROWS), bolsa({ rewardDestination: true })]))
    expect(t).toMatchObject({ mode: 'economia', key: 'bolsa', section: 'alpha' })
    expect(t.mode === 'economia' && t.denominations.map((d) => d.key)).toEqual(['cobre', 'plata', 'oro'])
  })

  it('has no destination when nothing is marked, or the coin table has no denominations', () => {
    expect(rewardTarget(sheet([coins(ROWS)]))).toEqual({ mode: 'none' })
    expect(rewardTarget(sheet([coins(ROWS), bolsa()]))).toEqual({ mode: 'none' })
    expect(rewardTarget(sheet([coins([], { rewardDestination: true })]))).toEqual({ mode: 'none' })
  })

  it('reports the section that holds the destination', () => {
    const t = rewardTarget(sheet([coins(ROWS)], [{ key: 'beta', label: 'Beta', items: [bolsa({ rewardDestination: true })], blocks: [] }]))
    expect(t).toMatchObject({ mode: 'economia', section: 'beta' })
  })

  it('reads the D&D preset as the coin table with the five legacy keys', () => {
    const t = rewardTarget(DND5E_SHEET)
    expect(t.mode).toBe('monedas')
    expect(t.mode === 'monedas' && t.denominations.map((d) => d.key)).toEqual(['cp', 'sp', 'ep', 'gp', 'pp'])
    expect(t.mode === 'monedas' && t.section).toBe('equipo')
  })
})

describe('potSupports', () => {
  it('holds only the five fixed pot columns', () => {
    expect(potSupports({ mode: 'legacy' })).toBe(true)
    expect(potSupports(rewardTarget(DND5E_SHEET))).toBe(true)
    expect(potSupports(rewardTarget(sheet([coins([{ key: 'cp', label: 'C', value: 1 }, { key: 'gp', label: 'G', value: 100 }], { rewardDestination: true })])))).toBe(true)
    expect(potSupports(rewardTarget(sheet([coins(ROWS, { rewardDestination: true })])))).toBe(false)
    expect(potSupports({ mode: 'none' })).toBe(false)
  })
})
