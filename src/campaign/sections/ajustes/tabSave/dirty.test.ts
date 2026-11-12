import { describe, expect, it } from 'vitest'
import { countChanges, countRowChanges } from './dirty'

describe('countChanges', () => {
  it('is 0 for equal drafts and counts every differing leaf', () => {
    expect(countChanges({ a: '1', b: { c: true } }, { a: '1', b: { c: true } })).toBe(0)
    expect(countChanges({ a: '1', b: { c: true } }, { a: '2', b: { c: false } })).toBe(2)
  })

  it('counts added and removed array entries one each', () => {
    expect(countChanges([{ x: 1 }], [{ x: 1 }, { x: 2 }, { x: 3 }])).toBe(2)
    expect(countChanges([{ x: 1 }, { x: 2 }], [{ x: 5 }])).toBe(2)
  })
})

describe('countRowChanges', () => {
  const rows = [{ uid: 0, label: 'A' }, { uid: 1, label: 'B' }]

  it('counts added, removed and edited rows, and a pure reorder once', () => {
    expect(countRowChanges(rows, rows)).toBe(0)
    expect(countRowChanges(rows, [...rows, { uid: 2, label: 'C' }])).toBe(1)
    expect(countRowChanges(rows, [rows[0]])).toBe(1)
    expect(countRowChanges(rows, [{ uid: 0, label: 'A2' }, rows[1]])).toBe(1)
    expect(countRowChanges(rows, [rows[1], rows[0]])).toBe(1)
  })
})
