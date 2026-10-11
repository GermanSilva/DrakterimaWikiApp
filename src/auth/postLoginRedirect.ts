import { safeNextPath } from '../app/safeNext'

/**
 * Remembers where a signed-out visitor wanted to go (e.g. /invite/<code>) across the sign-in round
 * trip. The destination is NEVER read from the callback URL: the login page stores it BEFORE
 * starting a sign-in and the callback reads it back once. localStorage (not sessionStorage)
 * because a magic link opens in a new tab. Every read re-validates with `safeNextPath`, so even a
 * tampered value can only ever be a same-origin path; every storage access is guarded (blocked or
 * private-mode storage degrades to "go to /").
 */
export const NEXT_STORAGE_KEY = 'drakterima:post-login-next'
/** How long a remembered destination stays usable. */
export const NEXT_TTL_MS = 30 * 60 * 1000

const NO_PATH = ''

interface Stored {
  path: string
  expiresAt: number
}

/** The validated path, or null for anything that is not a safe same-origin path. */
function validPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const path = safeNextPath(raw, NO_PATH)
  return path === NO_PATH ? null : path
}

function store(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Stores `next` when it is a safe path; otherwise REMOVES any stored value so a stale one cannot hijack a later login. */
export function rememberNext(next: unknown): void {
  const path = validPath(next)
  try {
    const storage = store()
    if (!storage) return
    if (path === null) storage.removeItem(NEXT_STORAGE_KEY)
    else storage.setItem(NEXT_STORAGE_KEY, JSON.stringify({ path, expiresAt: Date.now() + NEXT_TTL_MS } satisfies Stored))
  } catch {
    // storage full or blocked: the user simply lands on '/'
  }
}

/** Drops any remembered destination (sign-out, dismissed callback error). */
export function clearNext(): void {
  try {
    store()?.removeItem(NEXT_STORAGE_KEY)
  } catch {
    // nothing to clear
  }
}

/** One-shot: returns the remembered, still-valid path (and deletes it unconditionally), else '/'. */
export function consumeNext(): string {
  let raw: string | null = null
  try {
    const storage = store()
    if (!storage) return '/'
    raw = storage.getItem(NEXT_STORAGE_KEY)
    storage.removeItem(NEXT_STORAGE_KEY)
  } catch {
    return '/'
  }
  if (!raw) return '/'
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return '/'
    const { path, expiresAt } = parsed as Partial<Record<keyof Stored, unknown>>
    const now = Date.now()
    // An expiry further away than the TTL was not written by rememberNext.
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + NEXT_TTL_MS) return '/'
    return validPath(path) ?? '/'
  } catch {
    return '/'
  }
}
