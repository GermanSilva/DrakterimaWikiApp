import { describe, expect, it } from 'vitest'
import { decodePrize, encodePrize, PrizeCodeError } from './prizeCode'

const DENOMS = [{ key: 'oro' }, { key: 'plata' }, { key: 'cobre' }]

describe('prize code probe (S16)', () => {
  it('round-trips "20_14_0"', () => {
    const amounts = decodePrize('20_14_0', DENOMS)
    expect(amounts).toEqual({ oro: 20, plata: 14, cobre: 0 })
    expect(encodePrize(amounts, DENOMS)).toBe('20_14_0')
  })

  it.each([
    ['too few amounts', '20_14'],
    ['too many amounts', '20_14_0_1'],
    ['empty text', ''],
    ['an empty part', '20__0'],
    ['a trailing separator', '20_14_'],
    ['a plus sign', '+20_14_0'],
    ['a minus sign', '20_-14_0'],
    ['a decimal', '20_1.5_0'],
    ['a decimal comma', '20_1,5_0'],
    ['an exponent', '1e3_14_0'],
    ['a hexadecimal', '0x14_14_0'],
    ['full-width digits', '２０_14_0'],
    ['an unsafe integer', '9007199254740992_14_0'],
    ['text', 'a_b_c'],
    ['spaces', ' 20_14_0'],
  ])('decode rejects %s', (_name, text) => {
    expect(() => decodePrize(text, DENOMS)).toThrow(PrizeCodeError)
  })

  it('encode rejects unknown keys, NaN, Infinity, signs, decimals, unsafe integers and string amounts', () => {
    expect(() => encodePrize({ oro: 1, gp: 1 }, DENOMS)).toThrow(PrizeCodeError)
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 1.5, 2 ** 53, '5' as unknown as number]) {
      expect(() => encodePrize({ oro: bad }, DENOMS), String(bad)).toThrow(PrizeCodeError)
    }
  })

  it('encodes a missing denomination as 0', () => {
    expect(encodePrize({ plata: 3 }, DENOMS)).toBe('0_3_0')
  })
})
