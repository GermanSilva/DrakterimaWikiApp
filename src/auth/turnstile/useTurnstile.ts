import { useCallback, useEffect, useState } from 'react'
import { loadTurnstile, type TurnstileApi } from './turnstileLoader'

/**
 * disabled: no site key (captcha not configured, nothing is loaded or required).
 * loading: script or widget not ready yet. waiting: widget rendered, no token yet.
 * ready: a fresh token is available. expired / error: the token is gone, reset() restarts it.
 * load_failed: the Cloudflare script could not be loaded (blocked, offline or stalled); reset() loads it again.
 */
export type TurnstileStatus = 'disabled' | 'loading' | 'waiting' | 'ready' | 'expired' | 'error' | 'load_failed'

export interface UseTurnstileOptions {
  /** Public site key; absent/blank disables the captcha entirely. */
  siteKey?: string | null
  theme?: 'light' | 'dark' | 'auto'
  language?: string
}

export interface UseTurnstileResult {
  /** Pass as the `ref` of the element that should host the widget (its mount/unmount drives the widget). */
  attach: (el: HTMLElement | null) => void
  /** Single-use token, or null. Never log it. */
  token: string | null
  status: TurnstileStatus
  /** Discards the current token and asks for a new one (reloads the script after a load failure). */
  reset: () => void
}

/**
 * Renders a Turnstile widget into the element given to `attach` and exposes its token. The
 * widget is removed on unmount; the script is loaded lazily and only when a site key and a container exist.
 */
export function useTurnstile({ siteKey, theme = 'dark', language = 'es' }: UseTurnstileOptions): UseTurnstileResult {
  const key = siteKey?.trim() || null
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>(key ? 'loading' : 'disabled')
  // Bumped to re-run the effect (reload after a script failure, or a hard restart of the widget).
  const [generation, setGeneration] = useState(0)
  const [widget, setWidget] = useState<{ api: TurnstileApi; id: string } | null>(null)

  useEffect(() => {
    if (!key || !container) return
    let cancelled = false
    let rendered: { api: TurnstileApi; id: string } | null = null
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled) return
        let id: string | undefined
        try {
          id = turnstile.render(container, {
            sitekey: key,
            theme,
            language,
            appearance: 'interaction-only',
            callback: (t) => {
              if (cancelled) return
              setToken(t)
              setStatus('ready')
            },
            'expired-callback': () => {
              if (cancelled) return
              setToken(null)
              setStatus('expired')
            },
            'error-callback': () => {
              if (cancelled) return
              setToken(null)
              setStatus('error')
            },
            'timeout-callback': () => {
              if (cancelled) return
              setToken(null)
              setStatus('expired')
            },
          })
        } catch {
          // render() can throw (bad site key, detached container). Surface only the 'error' state:
          // the error payload is deliberately not logged.
          id = undefined
        }
        if (!id) {
          setStatus('error')
          return
        }
        rendered = { api: turnstile, id }
        setWidget(rendered)
        setStatus((s) => (s === 'loading' ? 'waiting' : s))
      },
      () => {
        if (!cancelled) setStatus('load_failed')
      },
    ).catch(() => {
      // Anything thrown by the fulfilment handler must not leave the status stuck on 'loading'.
      if (!cancelled) setStatus('error')
    })
    return () => {
      cancelled = true
      // Back to the initial state for the next run (or for a later remount of the container).
      setWidget(null)
      setToken(null)
      setStatus('loading')
      if (rendered) {
        try {
          rendered.api.remove(rendered.id)
        } catch {
          // already gone
        }
      }
    }
  }, [key, container, theme, language, generation])

  const reset = useCallback(() => {
    setToken(null)
    if (!key) return
    if (widget) {
      setStatus('waiting')
      try {
        widget.api.reset(widget.id)
      } catch {
        setGeneration((g) => g + 1)
      }
    } else {
      setGeneration((g) => g + 1)
    }
  }, [key, widget])

  // Without a key nothing is rendered or required, whatever state a previous key left behind.
  if (!key) return { attach: setContainer, token: null, status: 'disabled', reset }
  return { attach: setContainer, token, status, reset }
}
