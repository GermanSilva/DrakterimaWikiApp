const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const ABSOLUTE = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export interface LastSeen {
  /** "hace 5 minutos", "ayer"... or the date itself after a month. */
  relative: string
  /** Full local date and time, for the tooltip. */
  absolute: string
}

/** Describes when someone was last seen; `null` for an unparsable value (shown as never). */
export function describeLastSeen(iso: string, now: Date): LastSeen | null {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  const absolute = ABSOLUTE.format(at)
  const elapsed = Math.max(0, now.getTime() - at) // a clock a little ahead of the server must not read as the future
  if (elapsed < MINUTE) return { relative: 'hace instantes', absolute }
  if (elapsed < HOUR) return { relative: RELATIVE.format(-Math.floor(elapsed / MINUTE), 'minute'), absolute }
  if (elapsed < DAY) return { relative: RELATIVE.format(-Math.floor(elapsed / HOUR), 'hour'), absolute }
  if (elapsed < 30 * DAY) return { relative: RELATIVE.format(-Math.floor(elapsed / DAY), 'day'), absolute }
  return { relative: absolute, absolute }
}
