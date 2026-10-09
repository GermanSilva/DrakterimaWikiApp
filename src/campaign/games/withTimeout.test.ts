import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from './withTimeout'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('resolves with the value when the promise settles first, and clears the timer', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves null when the promise has not settled by the deadline', async () => {
    const result = withTimeout(new Promise<string>(() => undefined), 8000)
    await vi.advanceTimersByTimeAsync(7999)
    let settled = false
    void result.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBeNull()
  })

  it('ignores a value that arrives after the deadline', async () => {
    let resolve!: (v: string) => void
    const result = withTimeout(new Promise<string>((r) => { resolve = r }), 100)
    await vi.advanceTimersByTimeAsync(100)
    resolve('late')
    await expect(result).resolves.toBeNull()
  })

  it('propagates a rejection that happens before the deadline and clears the timer', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
    expect(vi.getTimerCount()).toBe(0)
  })
})
