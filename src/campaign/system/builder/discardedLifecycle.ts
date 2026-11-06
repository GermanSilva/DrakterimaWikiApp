/**
 * Discarded fields lifecycle (S26, S32). A discarded entry is deleted automatically 60 days after its `at` (the daily database job,
 * `_discarded_retention_days()` in migration 20261106180000: keep both numbers equal); the DM is warned in the last 7 days.
 */
export const DISCARDED_RETENTION_DAYS = 60
export const DISCARDED_WARNING_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** When the entry discarded at `at` is deleted. An invalid date when `at` is not a date. */
export const deletionDate = (at: string): Date => new Date(Date.parse(at) + DISCARDED_RETENTION_DAYS * DAY_MS)

/** DD/MM/AAAA (UTC, like the discard date), `null` when `at` is not a date. */
export function formatDeletionDate(at: string): string | null {
  const date = deletionDate(at)
  if (Number.isNaN(date.getTime())) return null
  const iso = date.toISOString()
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** Within 7 days of the deletion, or already past it (the job has not run yet). */
export function isNearDeletion(at: string, now: Date): boolean {
  const left = deletionDate(at).getTime() - now.getTime()
  return !Number.isNaN(left) && left <= DISCARDED_WARNING_DAYS * DAY_MS
}

export const expiringSoon = <T extends { at: string }>(entries: readonly T[], now: Date): T[] => entries.filter((e) => isNearDeletion(e.at, now))
