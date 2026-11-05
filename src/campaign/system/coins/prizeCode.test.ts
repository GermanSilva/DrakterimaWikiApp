import { describe, expect, it } from 'vitest'
import { decodePrize, encodePrize, PrizeCodeError } from './prizeCode'

const DENOMS = [{ key: 'oro' }, { key: 'plata' }, { key: 'bronce' }]

describe('encodePrize', () => {
  it('writes one amount per denomination in schema order, joined by underscores', () => {
    expect(encodePrize({ oro: 20, plata: 14, bronce: 0 }, DENOMS)).toBe('20_14_0')
    expect(encodePrize({ bronce: 3, oro: 1 }, DENOMS)).toBe('1_0_3') // missing denominations are 0, object order is irrelevant
  })

  it('handles a single denomination and none at all', () => {
    expect(encodePrize({ cp: 7 }, [{ key: 'cp' }])).toBe('7')
    expect(encodePrize({}, [])).toBe('')
  })

  it('refuses amounts it would have to drop or invent', () => {
    expect(() => encodePrize({ oro: 1, platino: 2 }, DENOMS)).toThrow(PrizeCodeError) // unknown denomination: no silent drop
    expect(() => encodePrize({ oro: -1 }, DENOMS)).toThrow(PrizeCodeError)
    expect(() => encodePrize({ oro: 1.5 }, DENOMS)).toThrow(PrizeCodeError)
    expect(() => encodePrize({ oro: Number.NaN }, DENOMS)).toThrow(PrizeCodeError)
    expect(() => encodePrize({ oro: Number.MAX_SAFE_INTEGER + 2 }, DENOMS)).toThrow(PrizeCodeError)
  })
})

describe('decodePrize', () => {
  it('reads the amounts back by denomination, in schema order', () => {
    expect(decodePrize('20_14_0', DENOMS)).toEqual({ oro: 20, plata: 14, bronce: 0 })
    expect(Object.keys(decodePrize('1_2_3', DENOMS))).toEqual(['oro', 'plata', 'bronce'])
    expect(decodePrize('', [])).toEqual({})
  })

  it('round-trips with encodePrize', () => {
    const amounts = { oro: 0, plata: 1234567, bronce: 9 }
    expect(decodePrize(encodePrize(amounts, DENOMS), DENOMS)).toEqual(amounts)
  })

  it('is strict: wrong count, empty parts, non-integers, negatives, signs and spaces are errors', () => {
    for (const bad of ['20_14', '20_14_0_1', '', '20__0', '20_-1_0', '20_1.5_0', '20_x_0', ' 20_14_0', '20_14_0 ', '+1_2_3', '1e3_1_1', '20,14,0', '99999999999999999999_1_1'])
      expect(() => decodePrize(bad, DENOMS), JSON.stringify(bad)).toThrow(PrizeCodeError)
    expect(() => decodePrize('1', [])).toThrow(PrizeCodeError)
  })

  it('reports why in the message', () => {
    expect(() => decodePrize('1_2', DENOMS)).toThrow(/3 amounts/)
    expect(() => decodePrize('1_x_3', DENOMS)).toThrow(/plata/)
  })
})
