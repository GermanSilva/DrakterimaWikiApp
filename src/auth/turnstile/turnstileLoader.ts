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

/**
 * Loads the Turnstile script once (a single async/defer tag, shared by every caller) and resolves with
 * the global API. A failed load removes the tag and forgets the result, so a later call retries
 * instead of being stuck on a rejected promise. Call it only from the login route.
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (pending) return pending
  const attempt = new Promise<TurnstileApi>((resolve, reject) => {
    const fail = (script: HTMLScriptElement) => {
      script.remove()
      pending = null
      reject(new Error('turnstile_script_failed'))
    }
    // Adopt a tag left by something else (e.g. a previous module instance) instead of duplicating it.
    const script =
      (document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null) ?? document.createElement('script')
    script.addEventListener('load', () => {
      if (window.turnstile) resolve(window.turnstile)
      else fail(script)
    })
    script.addEventListener('error', () => fail(script))
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
