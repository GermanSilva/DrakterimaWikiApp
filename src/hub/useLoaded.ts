import { useCallback, useEffect, useRef, useState } from 'react'

export interface Loaded<T> {
  status: 'loading' | 'ready' | 'error'
  value: T
  reload: () => void
}

interface Owned<T> {
  key: string
  status: 'ready' | 'error'
  value: T
}

/**
 * Loads a value for `key` (normally the signed-in user's id; `null` = nothing to load). State is tagged with its key,
 * so a different user never sees the previous one's value, and only the latest effect run may write state. On an
 * error the previous value for the same key is kept (a failed refresh must not blank the screen); `initial` is used
 * before the first success.
 */
export function useLoaded<T>(key: string | null, load: () => Promise<T>, initial: T): Loaded<T> {
  const [state, setState] = useState<Owned<T> | null>(null)
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  // Effects run in order: the ref is current before the loading effect below reads it.
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    loadRef.current().then(
      (value) => {
        if (!cancelled) setState({ key, status: 'ready', value })
      },
      () => {
        if (!cancelled) setState((prev) => ({ key, status: 'error', value: prev?.key === key ? prev.value : initial }))
      },
    )
    return () => {
      cancelled = true
    }
    // `initial` is a constant per call site; reloading is driven by the key and the nonce only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const mine = state && state.key === key ? state : null
  return { status: mine ? mine.status : 'loading', value: mine ? mine.value : initial, reload }
}
