import { useCallback, useEffect, useRef, useState } from 'react'

export interface LoadState<T> {
  /** `idle` = disabled (nothing was requested). */
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: T | null
  error: Error | null
}

const IDLE: LoadState<never> = { status: 'idle', data: null, error: null }
const LOADING: LoadState<never> = { status: 'loading', data: null, error: null }

/**
 * Loads one value on demand. `load === null` disables it: no request is made (used for "DM only"
 * reads, so a player never calls the DM RPCs). `signal` re-reads the same key while the previous value
 * stays visible (no flash). The value is keyed: a change of `key` discards the
 * previous result at once (no flash of another entity's data); `refresh()` re-reads the same key.
 */
export function useLoad<T>(
  load: (() => Promise<T>) | null,
  key: string,
  signal = 0,
): LoadState<T> & { refresh: () => void } {
  const [result, setResult] = useState<{ key: string; state: LoadState<T> } | null>(null)
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load // before the fetch effect below, which reads it
  })
  const enabled = load !== null

  useEffect(() => {
    const run = loadRef.current
    if (!enabled || !run) return undefined
    let cancelled = false
    run().then(
      (data) => {
        if (!cancelled) setResult({ key, state: { status: 'ready', data, error: null } })
      },
      (e: unknown) => {
        if (!cancelled) {
          setResult({ key, state: { status: 'error', data: null, error: e instanceof Error ? e : new Error(String(e)) } })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, key, nonce, signal])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  if (!enabled) return { ...(IDLE as LoadState<T>), refresh }
  if (!result || result.key !== key) return { ...(LOADING as LoadState<T>), refresh }
  return { ...result.state, refresh }
}
