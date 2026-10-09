import { describe, expect, it } from 'vitest'
import { DEFAULT_LOTERIA_CONFIG, EMPTY_COINS, formatCoins, hasCoins, normalizeCoins, parseLoteriaConfig } from './coins'

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
