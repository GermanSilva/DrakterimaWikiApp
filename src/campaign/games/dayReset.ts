/**
 * The lottery allows one play per character per UTC day (server-side `play_date`), so the reset is
 * 00:00 UTC for everybody, not local midnight.
 */

/** `YYYY-MM-DD` of the UTC day containing `now`: the value of `game_logs.play_date`. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** The next 00:00 UTC after `now`. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

/** "3h 12m" until the reset (never less than "0h 1m": the minute is rounded up). */
export function formatTimeUntilReset(now: Date): string {
  const minutes = Math.max(1, Math.ceil((nextUtcMidnight(now).getTime() - now.getTime()) / 60_000))
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** The reset as a wall-clock time in `timeZone` (the viewer's by default), e.g. "21:00". */
export function formatLocalReset(now: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(nextUtcMidnight(now))
}

/** "Podés volver a jugar a las 00:00 UTC (en 3h 12m · 21:00 en tu zona horaria)." */
export function describeDailyReset(now: Date, timeZone?: string): string {
  return `Podés volver a jugar a las 00:00 UTC (en ${formatTimeUntilReset(now)} · ${formatLocalReset(now, timeZone)} en tu zona horaria).`
}
