import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { deferred } from '../auth/testing/deferred'
import { useLoaded } from './useLoaded'

describe('useLoaded', () => {
  it('starts loading with the initial value and exposes the loaded one', async () => {
    const d = deferred<string>()
    const { result } = renderHook(() => useLoaded('u1', () => d.promise, 'initial'))
    expect(result.current).toMatchObject({ status: 'loading', value: 'initial' })
    await act(async () => d.resolve('loaded'))
    expect(result.current).toMatchObject({ status: 'ready', value: 'loaded' })
  })

  it('does not load without a key', () => {
    let calls = 0
    const { result } = renderHook(() =>
      useLoaded(null, async () => {
        calls += 1
        return 'x'
      }, 'initial'),
    )
    expect(result.current).toMatchObject({ status: 'loading', value: 'initial' })
    expect(calls).toBe(0)
  })

  it('keeps the previous value when a reload fails, and recovers on the next reload', async () => {
    const results: Array<() => Promise<string>> = [async () => 'first', async () => Promise.reject(new Error('boom')), async () => 'third']
    let i = 0
    const { result } = renderHook(() => useLoaded('u1', () => results[i++](), 'initial'))
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', value: 'first' }))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.value).toBe('first')
    act(() => result.current.reload())
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', value: 'third' }))
  })

  it('uses the initial value when the very first load fails', async () => {
    const { result } = renderHook(() => useLoaded('u1', () => Promise.reject(new Error('boom')), 'initial'))
    await waitFor(() => expect(result.current).toMatchObject({ status: 'error', value: 'initial' }))
  })

  it('never shows one key\'s value under another key, nor lets a late response of the old key win', async () => {
    const byKey: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred<string>(), b: deferred<string>() }
    const { result, rerender } = renderHook(({ k }) => useLoaded(k, () => byKey[k].promise, 'initial'), { initialProps: { k: 'a' } })
    await act(async () => byKey.a.resolve('value-a'))
    expect(result.current).toMatchObject({ status: 'ready', value: 'value-a' })

    rerender({ k: 'b' })
    expect(result.current).toMatchObject({ status: 'loading', value: 'initial' })

    await act(async () => byKey.b.resolve('value-b'))
    expect(result.current).toMatchObject({ status: 'ready', value: 'value-b' })

    // key a again, then back to b before a answers: the late answer of a must be dropped
    const late = deferred<string>()
    byKey.a = late
    rerender({ k: 'a' })
    rerender({ k: 'b' })
    await act(async () => late.resolve('stale-a'))
    expect(result.current.value).not.toBe('stale-a')
  })

  it('a failed load for a new key does not carry over the previous key\'s value', async () => {
    const { result, rerender } = renderHook(({ k }) => useLoaded(k, () => (k === 'a' ? Promise.resolve('value-a') : Promise.reject(new Error('boom'))), 'initial'), {
      initialProps: { k: 'a' },
    })
    await waitFor(() => expect(result.current.value).toBe('value-a'))
    rerender({ k: 'b' })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.value).toBe('initial')
  })
})
