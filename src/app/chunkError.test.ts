import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  isChunkLoadError,
  reloadGuardTripped,
  reloadOnceForChunkError,
} from './chunkError'

const chunkError = () => new TypeError('Failed to fetch dynamically imported module: /assets/x.js')

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('isChunkLoadError', () => {
  it.each([
    new TypeError('Failed to fetch dynamically imported module: /assets/x.js'),
    new TypeError('error loading dynamically imported module'),
    new Error('Importing a module script failed.'),
    new Error('Loading chunk 12 failed.'),
    new Error('Loading CSS chunk 3 failed.'),
    Object.assign(new Error('x'), { name: 'ChunkLoadError' }),
  ])('is true for %s', (error) => {
    expect(isChunkLoadError(error)).toBe(true)
  })

  it.each([new Error('boom'), 'dynamically imported module', null, undefined, { message: 'dynamically imported module' }])(
    'is false for %j',
    (error) => {
      expect(isChunkLoadError(error)).toBe(false)
    },
  )
})

describe('reloadOnceForChunkError', () => {
  it('reloads, records the time and returns true', () => {
    const reload = vi.fn()
    expect(reloadOnceForChunkError(chunkError(), reload, 5000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('5000')
  })

  it('returns false and does not reload for other errors', () => {
    const reload = vi.fn()
    expect(reloadOnceForChunkError(new Error('boom'), reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull()
  })

  it('refuses inside the window and allows again after it', () => {
    const reload = vi.fn()
    expect(reloadOnceForChunkError(chunkError(), reload, 1000)).toBe(true)
    expect(reloadOnceForChunkError(chunkError(), reload, 1000 + CHUNK_RELOAD_WINDOW_MS - 1)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadOnceForChunkError(chunkError(), reload, 1000 + CHUNK_RELOAD_WINDOW_MS)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('ignores a corrupt stored value', () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, 'not-a-number')
    const reload = vi.fn()
    expect(reloadOnceForChunkError(chunkError(), reload, 1000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when storage cannot be written (no guard means a possible loop)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const reload = vi.fn()
    expect(reloadOnceForChunkError(chunkError(), reload, 1000)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const reload = vi.fn()
    expect(reloadOnceForChunkError(chunkError(), reload, 1000)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('reloadGuardTripped', () => {
  it('is false with nothing stored, true inside the window, false after it', () => {
    expect(reloadGuardTripped(1000)).toBe(false)
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1000')
    expect(reloadGuardTripped(1000 + CHUNK_RELOAD_WINDOW_MS - 1)).toBe(true)
    expect(reloadGuardTripped(1000 + CHUNK_RELOAD_WINDOW_MS)).toBe(false)
  })

  it('is true when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(reloadGuardTripped()).toBe(true)
  })
})
