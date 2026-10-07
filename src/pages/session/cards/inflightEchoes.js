/**
 * Bookkeeping of the values a session card handed to its host whose echo (the layout carrying them) has not been seen
 * yet. A card ignores the echo of its OWN send so it never rolls a newer local value back; but a send the host accepted
 * and that never comes back (another writer overwrote it, the row was reset) must not linger and swallow a later,
 * genuinely foreign value that happens to be equal. So the list is bounded (newest INFLIGHT_MAX) and expires (TTL).
 */
export const INFLIGHT_MAX = 8
export const INFLIGHT_TTL_MS = 30_000

const live = (list, now) => list.filter(entry => now - entry.at <= INFLIGHT_TTL_MS)

/** The list after sending `value` (expired entries dropped, only the newest INFLIGHT_MAX kept). */
export function trackSent(list, value, now = Date.now()) {
  return [...live(list, now), { value, at: now }].slice(-INFLIGHT_MAX)
}

/**
 * Looks `incoming` up among the live sends. `echo`: it is (the echo of) one of our sends; `rest`: what is still waiting
 * (everything up to and including the echo is confirmed, so it is dropped).
 */
export function consumeEcho(list, incoming, now = Date.now()) {
  const alive = live(list, now)
  const at = alive.findIndex(entry => entry.value === incoming)
  return at >= 0 ? { echo: true, rest: alive.slice(at + 1) } : { echo: false, rest: alive }
}
