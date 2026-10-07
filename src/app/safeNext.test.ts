import { describe, expect, it } from 'vitest'
import { loginPathFor, safeNextPath } from './safeNext'

describe('safeNextPath', () => {
  it.each([
    ['/c/demo', '/c/demo'],
    ['/c/demo/pnjs/3?x=1#top', '/c/demo/pnjs/3?x=1#top'],
    ['/', '/'],
    ['/invite/abc', '/invite/abc'],
  ])('accepts the same-origin path %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected)
  })

  it.each([
    'https://evil.com',
    'http://evil.com/x',
    '//evil.com',
    '///evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    'data:text/html,hi',
    'evil.com',
    'c/demo',
    '/\t/evil.com',
    '/ok\nsplit',
    '/.//evil.com',
    '/%2e%2e//evil.com',
    '/a/..//evil.com',
    '/%2e//evil.com',
    '/%5C%5Cevil.com',
    '/%5c/evil.com',
    '/.\\evil.com',
    '/login',
    '/login?next=/x',
    '/auth/callback',
    '',
  ])('rejects %j', (raw) => {
    expect(safeNextPath(raw)).toBe('/')
  })

  it('handles null/undefined, over-long values and a custom fallback', () => {
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath(undefined, '/home')).toBe('/home')
    expect(safeNextPath(`/${'a'.repeat(3000)}`)).toBe('/')
  })

  it('normalises dot segments instead of passing them through', () => {
    expect(safeNextPath('/c/../x')).toBe('/x')
  })
})

describe('loginPathFor', () => {
  it('encodes the full current location', () => {
    expect(loginPathFor({ pathname: '/c/demo/pnjs', search: '?q=a b', hash: '#x' })).toBe(
      `/login?next=${encodeURIComponent('/c/demo/pnjs?q=a b#x')}`,
    )
  })
})
