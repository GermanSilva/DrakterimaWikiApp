import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOTERIA_CONFIG, EMPTY_COINS, formatAmounts, formatCoins, formatTotal, hasAmounts, hasCoins, normalizeCoins, parseLoteriaConfig, parseSheetLoteriaConfig, readAmounts, totalValue,
} from './coins'

describe('formatCoins', () => {
  it('lists the non-zero denominations, most valuable first', () => {
    expect(formatCoins({ cp: 3, sp: 0, ep: 0, gp: 2, pp: 1 })).toBe('1 platino, 2 oro, 3 bronce')
    expect(formatCoins({ ep: 5, sp: 1 })).toBe('5 electrum, 1 plata')
  })
  it('returns the placeholder when nothing is left', () => {
    expect(formatCoins(EMPTY_COINS)).toBe('nada')
    expect(formatCoins(null, 'Vacío')).toBe('Vacío')
    expect(formatCoins(undefined)).toBe('nada')
  })
  it('ignores negative, fractional-only and non-numeric amounts', () => {
    expect(formatCoins({ cp: -4, sp: 0.4, gp: Number.NaN, pp: 2.9 })).toBe('2 platino')
  })
})

describe('hasCoins / normalizeCoins', () => {
  it('detects any positive denomination', () => {
    expect(hasCoins({ gp: 1 })).toBe(true)
    expect(hasCoins(EMPTY_COINS)).toBe(false)
    expect(hasCoins(null)).toBe(false)
  })
  it('coerces untrusted json into a full coins object', () => {
    expect(normalizeCoins({ cp: '4', sp: 2.7, gp: -1, pp: 'x', extra: 9 })).toEqual({ cp: 4, sp: 2, ep: 0, gp: 0, pp: 0 })
    expect(normalizeCoins('nope')).toEqual(EMPTY_COINS)
    expect(normalizeCoins(null)).toEqual(EMPTY_COINS)
  })
})

describe('parseLoteriaConfig', () => {
  it('falls back to the server defaults (17, 3 cp, 1 sp)', () => {
    for (const bad of [null, undefined, 'x', 7, []]) expect(parseLoteriaConfig(bad)).toEqual(DEFAULT_LOTERIA_CONFIG)
    expect(parseLoteriaConfig({})).toEqual(DEFAULT_LOTERIA_CONFIG)
  })
  it('reads a stored document and defaults only the missing or malformed parts', () => {
    expect(parseLoteriaConfig({ commonMinRoll: 15, commonPrize: { gp: 2 }, specialPrize: { pp: 1, cp: 5 } })).toEqual({
      commonMinRoll: 15,
      commonPrize: { cp: 0, sp: 0, ep: 0, gp: 2, pp: 0 },
      specialPrize: { cp: 5, sp: 0, ep: 0, gp: 0, pp: 1 },
    })
    expect(parseLoteriaConfig({ commonMinRoll: 'abc', commonPrize: { gp: 2 } }).commonMinRoll).toBe(17)
    expect(parseLoteriaConfig({ commonMinRoll: 1.5 }).commonMinRoll).toBe(17)
    expect(parseLoteriaConfig({ commonMinRoll: '18' }).commonMinRoll).toBe(18)
    expect(parseLoteriaConfig({ commonMinRoll: 18 }).specialPrize).toEqual(DEFAULT_LOTERIA_CONFIG.specialPrize)
  })
  it('does not share mutable defaults between calls', () => {
    const a = parseLoteriaConfig(null)
    a.commonPrize.cp = 99
    expect(parseLoteriaConfig(null).commonPrize.cp).toBe(3)
    expect(DEFAULT_LOTERIA_CONFIG.commonPrize.cp).toBe(3)
  })
})

// --- sheet denominations (G5b, S12, S14, S28): the same helpers with the denominations of the sheet coin table ------------------

const ROWS = [{ key: 'cobre', label: 'cobre', value: 1 }, { key: 'plata', label: 'plata', value: 10 }, { key: 'oro', label: 'oro', value: 100 }]

describe('formatAmounts', () => {
  it('lists the non-zero denominations of the sheet, most valuable first, with the sheet labels', () => {
    expect(formatAmounts({ cobre: 3, plata: 0, oro: 2 }, ROWS)).toBe('2 oro, 3 cobre')
    expect(formatAmounts({ cobre: 0 }, ROWS)).toBe('nada')
    expect(formatAmounts(null, ROWS, 'Vacío')).toBe('Vacío')
  })
  it('never hides an amount of a key the sheet does not know (old logs, a renamed denomination)', () => {
    expect(formatAmounts({ oro: 1, gp: 4 }, ROWS)).toBe('1 oro, 4 gp')
  })
  it('without denominations it is formatCoins, byte for byte', () => {
    for (const c of [{ cp: 3, sp: 0, ep: 0, gp: 2, pp: 1 }, { ep: 5, sp: 1 }, { cp: -4, sp: 0.4, gp: Number.NaN, pp: 2.9 }, {}, null, undefined])
      expect(formatAmounts(c, null)).toBe(formatCoins(c))
    expect(formatAmounts({}, null, 'Vacío')).toBe('Vacío')
  })
})

describe('hasAmounts / readAmounts', () => {
  it('detects any positive amount, whatever the key', () => {
    expect(hasAmounts({ oro: 1 })).toBe(true)
    expect(hasAmounts({ oro: 0 })).toBe(false)
    expect(hasAmounts(null)).toBe(false)
  })
  it('reads untrusted json as one amount per denomination, in schema order', () => {
    const read = readAmounts({ oro: '4', cobre: 2.7, plata: -1, extra: 9 }, ROWS)
    expect(read).toEqual({ cobre: 2, plata: 0, oro: 4 })
    expect(Object.keys(read)).toEqual(['cobre', 'plata', 'oro'])
    expect(readAmounts('nope', ROWS)).toEqual({ cobre: 0, plata: 0, oro: 0 })
  })
})

describe('totals with the equivalences of the DM', () => {
  it('adds the amounts at the value of each denomination, not at the D&D rates', () => {
    expect(totalValue({ oro: 2, plata: 1, cobre: 3 }, ROWS)).toBe(213)
    const odd = [{ key: 'a', label: 'a', value: 1 }, { key: 'b', label: 'b', value: 7 }]
    expect(totalValue({ b: 2, a: 1 }, odd)).toBe(15)
    expect(formatTotal(15, odd)).toBe('2 b 1 a')
    expect(formatTotal(213, ROWS)).toBe('2 oro 1 plata 3 cobre')
  })
  it('is null for nothing, and ignores keys without a value', () => {
    expect(formatTotal(0, ROWS)).toBeNull()
    expect(formatTotal(-5, ROWS)).toBeNull()
    expect(totalValue({ zz: 4 }, ROWS)).toBe(0)
  })
})

describe('parseSheetLoteriaConfig', () => {
  it('keeps only the denominations of the sheet, in schema order', () => {
    const c = parseSheetLoteriaConfig({ commonMinRoll: 12, commonPrize: { oro: 2, cp: 5 }, specialPrize: { cobre: '7' } }, ROWS)
    expect(c).toEqual({ commonMinRoll: 12, commonPrize: { cobre: 0, plata: 0, oro: 2 }, specialPrize: { cobre: 7, plata: 0, oro: 0 } })
    expect(Object.keys(c.commonPrize)).toEqual(['cobre', 'plata', 'oro'])
  })
  it('defaults like the server: 17, and the legacy default prizes only where their denomination exists', () => {
    expect(parseSheetLoteriaConfig(null, ROWS)).toEqual({ commonMinRoll: 17, commonPrize: { cobre: 0, plata: 0, oro: 0 }, specialPrize: { cobre: 0, plata: 0, oro: 0 } })
    const legacyKeys = [{ key: 'cp', label: 'cobre', value: 1 }, { key: 'sp', label: 'plata', value: 10 }]
    expect(parseSheetLoteriaConfig({}, legacyKeys)).toEqual({ commonMinRoll: 17, commonPrize: { cp: 3, sp: 0 }, specialPrize: { cp: 0, sp: 1 } })
  })
})

describe('legacy helpers are untouched by the sheet branch', () => {
  it('parseLoteriaConfig still returns the five fixed keys', () => {
    expect(Object.keys(parseLoteriaConfig(null).commonPrize)).toEqual(['cp', 'sp', 'ep', 'gp', 'pp'])
  })
})
