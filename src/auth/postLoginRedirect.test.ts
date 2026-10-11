import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNext, consumeNext, NEXT_STORAGE_KEY, NEXT_TTL_MS, rememberNext } from './postLoginRedirect'

const stored = () => window.localStorage.getItem(NEXT_STORAGE_KEY)

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('rememberNext / consumeNext', () => {
  it('stores a safe path with a 30 minute expiry and returns it once', () => {
    rememberNext('/invite/abc')
    expect(JSON.parse(stored()!)).toEqual({ path: '/invite/abc', expiresAt: Date.now() + 30 * 60 * 1000 })
    expect(consumeNext()).toBe('/invite/abc')
    expect(stored()).toBeNull()
  })

  it('keeps the query and hash of a safe path', () => {
    rememberNext('/c/demo/pnjs/3?tab=a#x')
    expect(consumeNext()).toBe('/c/demo/pnjs/3?tab=a#x')
  })

  it('is one-shot: a second consume goes to /', () => {
    rememberNext('/invite/abc')
    expect(consumeNext()).toBe('/invite/abc')
    expect(consumeNext()).toBe('/')
  })

  it('goes to / when nothing was stored', () => {
    expect(consumeNext()).toBe('/')
  })

  it.each([
    ['protocol-relative', '//evil.com'],
    ['backslash', '/\\evil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['absolute URL', 'https://evil.com/x'],
    ['dot-segment collapse', '/.//evil.com'],
    ['auth loop', '/login'],
    ['over-long', `/${'a'.repeat(3000)}`],
    ['empty', ''],
    ['non-string', 42],
    ['null', null],
    ['undefined', undefined],
    ['object', { path: '/x' }],
  ])('rejects %s and clears a previously stored value', (_name, bad) => {
    rememberNext('/invite/old')
    expect(stored()).not.toBeNull()
    rememberNext(bad)
    expect(stored()).toBeNull()
    expect(consumeNext()).toBe('/')
  })

  it('re-validates on read: a tampered stored value cannot redirect off-origin, and is still deleted', () => {
    for (const path of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', 42, null]) {
      window.localStorage.setItem(NEXT_STORAGE_KEY, JSON.stringify({ path, expiresAt: Date.now() + 1000 }))
      expect(consumeNext()).toBe('/')
      expect(stored()).toBeNull()
    }
  })

  it('ignores malformed stored values and deletes them', () => {
    for (const raw of ['not json', 'null', '"/invite/abc"', '[]', '{}', JSON.stringify({ path: '/x' }), JSON.stringify({ path: '/x', expiresAt: 'soon' })]) {
      window.localStorage.setItem(NEXT_STORAGE_KEY, raw)
      expect(consumeNext()).toBe('/')
      expect(stored()).toBeNull()
    }
  })

  it('expires after the TTL', () => {
    rememberNext('/invite/abc')
    vi.setSystemTime(Date.now() + NEXT_TTL_MS + 1)
    expect(consumeNext()).toBe('/')
    expect(stored()).toBeNull()
  })

  it('is still valid just before the TTL', () => {
    rememberNext('/invite/abc')
    vi.setSystemTime(Date.now() + NEXT_TTL_MS - 1000)
    expect(consumeNext()).toBe('/invite/abc')
  })

  it('rejects an expiry further away than the TTL (not written by rememberNext)', () => {
    window.localStorage.setItem(NEXT_STORAGE_KEY, JSON.stringify({ path: '/invite/abc', expiresAt: Date.now() + NEXT_TTL_MS * 100 }))
    expect(consumeNext()).toBe('/')
  })

  it('clearNext removes the value', () => {
    rememberNext('/invite/abc')
    clearNext()
    expect(consumeNext()).toBe('/')
  })

  it('a newer valid next replaces the older one', () => {
    rememberNext('/invite/one')
    rememberNext('/invite/two')
    expect(consumeNext()).toBe('/invite/two')
  })
})

describe('blocked or failing storage', () => {
  it('never throws and falls back to /', () => {
    const boom = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)
    expect(() => rememberNext('/invite/abc')).not.toThrow()
    expect(() => rememberNext('//evil.com')).not.toThrow()
    expect(() => clearNext()).not.toThrow()
    expect(consumeNext()).toBe('/')
  })

  it('never throws when the localStorage accessor itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => rememberNext('/invite/abc')).not.toThrow()
    expect(() => clearNext()).not.toThrow()
    expect(consumeNext()).toBe('/')
  })
})
