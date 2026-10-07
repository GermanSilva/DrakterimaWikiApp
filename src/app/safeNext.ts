const LOOP_PATHS = new Set(['/login', '/auth/callback'])
const BASE = 'http://same-origin.invalid'
const MAX_LENGTH = 2048

function hasControlOrBackslash(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f || code === 0x5c) return true
  }
  return false
}

/** True when a path would be read by a browser as protocol-relative (`//host`, `/\host`). */
function isProtocolRelative(path: string): boolean {
  return path.startsWith('//') || path.startsWith('/\\')
}

/**
 * Validates a caller-supplied post-login target. Only same-origin relative paths pass: it must
 * start with a single '/', carry no control characters or backslashes (browsers normalise `\` to
 * `/`), and resolve to the same origin. The result is re-validated AFTER normalisation, because
 * dot segments collapse `/.//evil.com` or `/a/..//evil.com` into `//evil.com`. Encoded backslashes
 * (`%5C`) are refused too. Auth pages themselves (which would loop) yield the fallback.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || raw.length > MAX_LENGTH) return fallback
  if (!raw.startsWith('/') || isProtocolRelative(raw)) return fallback
  if (hasControlOrBackslash(raw)) return fallback
  let url: URL
  try {
    url = new URL(raw, BASE)
  } catch {
    return fallback
  }
  if (url.origin !== BASE) return fallback
  // Case and trailing slashes do not make an auth page a different page (/Login/, /AUTH/CALLBACK/).
  if (LOOP_PATHS.has(url.pathname.toLowerCase().replace(/\/+$/, ''))) return fallback
  const normalised = `${url.pathname}${url.search}${url.hash}`
  if (!normalised.startsWith('/') || isProtocolRelative(normalised)) return fallback
  if (/%5c/i.test(normalised) || hasControlOrBackslash(normalised)) return fallback
  return normalised
}

/** `/login?next=<current location>` for a signed-out visitor. */
export function loginPathFor(location: { pathname: string; search: string; hash: string }): string {
  const here = `${location.pathname}${location.search}${location.hash}`
  return `/login?next=${encodeURIComponent(here)}`
}
