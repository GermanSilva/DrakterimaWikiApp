/** Cloudflare Turnstile script (explicit rendering: we call render() ourselves). */
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
export const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script'

export interface TurnstileRenderOptions {
  sitekey: string
  theme?: 'light' | 'dark' | 'auto'
  language?: string
  /** 'interaction-only' keeps the widget invisible unless Cloudflare needs the user to act. */
  appearance?: 'always' | 'execute' | 'interaction-only'
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: (errorCode?: string) => void
  'timeout-callback'?: () => void
}

/** The subset of the global `turnstile` object this app uses. */
export interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let pending: Promise<TurnstileApi> | null = null

/** How long the script may take to load (no load/error event) before the attempt is given up. */
export const TURNSTILE_LOAD_TIMEOUT_MS = 10_000

/**
 * Loads the Turnstile script once (a single async/defer tag, shared by every caller) and resolves with
 * the global API. A failed load removes the tag and forgets the result, so a later call retries
 * instead of being stuck on a rejected promise. Call it only from the login route.
 */
export function loadTurnstile(timeoutMs: number = TURNSTILE_LOAD_TIMEOUT_MS): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (pending) return pending
  const attempt: Promise<TurnstileApi> = new Promise<TurnstileApi>((resolve, reject) => {
    let settled = false
    const fail = (script: HTMLScriptElement) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      script.remove()
      if (pending === attempt) pending = null
      reject(new Error('turnstile_script_failed'))
    }
    // Adopt a tag left by something else (e.g. a previous module instance) instead of duplicating it.
    const script =
      (document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null) ?? document.createElement('script')
    script.addEventListener('load', () => {
      if (settled) return
      if (window.turnstile) {
        settled = true
        clearTimeout(timer)
        resolve(window.turnstile)
      } else fail(script)
    })
    script.addEventListener('error', () => fail(script))
    // A stalled request fires neither load nor error: give up after timeoutMs so the caller can retry.
    const timer = setTimeout(() => fail(script), timeoutMs)
    if (!script.isConnected) {
      script.id = TURNSTILE_SCRIPT_ID
      script.src = TURNSTILE_SCRIPT_URL
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })
  pending = attempt
  return attempt
}

/** Test seam: forget the cached load. */
export function resetTurnstileLoaderForTests(): void {
  pending = null
}
