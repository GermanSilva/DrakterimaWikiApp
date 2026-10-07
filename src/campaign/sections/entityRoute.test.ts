import { describe, expect, it } from 'vitest'
import { parseEntityRoute } from './entityRoute'

describe('parseEntityRoute', () => {
  it('no segment is the list; a plain positive integer is a detail', () => {
    expect(parseEntityRoute(undefined)).toEqual({ kind: 'list' })
    expect(parseEntityRoute('7')).toEqual({ kind: 'detail', id: 7 })
    expect(parseEntityRoute('007')).toEqual({ kind: 'detail', id: 7 })
  })

  it.each(['', 'abc', '12abc', '-1', '1.5', '0x10', '1e3', ' 3', '3 ', '0', '00', '9999999999999999', "1' or '1'='1", '３'])(
    'treats %j as invalid (never reaches a query)',
    (segment) => {
      expect(parseEntityRoute(segment)).toEqual({ kind: 'invalid' })
    },
  )
})
