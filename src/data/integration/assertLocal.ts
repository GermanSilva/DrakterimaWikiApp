/** Integration tests create and delete users and mail: only ever against a local stack. */
export function assertLocal(label: string, url: string): void {
  let parsed: URL | null = null
  try {
    parsed = new URL(url)
  } catch {
    // falls through to the refusal below
  }
  const ok =
    parsed !== null &&
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
    parsed.username === '' &&
    parsed.password === ''
  if (!ok) {
    // Report only the host: the string may carry credentials (user:pass@host).
    throw new Error(`Refusing to run integration tests against a non-local ${label} (host: ${parsed?.hostname ?? 'unparseable'})`)
  }
}
