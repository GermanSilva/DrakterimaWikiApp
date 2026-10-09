import { describe, expect, it } from 'vitest'
import { coinText, EMPTY_COIN_TEXT, parseCoinText } from './coinInput'

describe('coin inputs', () => {
  it('turns a (partial) coin object into the text of the five inputs', () => {
    expect(coinText({ gp: 2, cp: 7 })).toEqual({ pp: '0', gp: '2', ep: '0', sp: '0', cp: '7' })
    expect(coinText(null)).toEqual(EMPTY_COIN_TEXT)
  })

  it('parses whole numbers and treats an empty input as zero', () => {
    expect(parseCoinText({ ...EMPTY_COIN_TEXT, gp: '12', sp: ' 3 ', cp: '' })).toEqual({ cp: 0, sp: 3, ep: 0, gp: 12, pp: 0 })
  })

  it.each(['-1', '1.5', '1e3', 'abc', '0x10', '1234567890'])('rejects %s', (bad) => {
    expect(parseCoinText({ ...EMPTY_COIN_TEXT, gp: bad })).toBeNull()
  })
})
