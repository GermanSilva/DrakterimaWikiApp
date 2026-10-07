import type { ReadState, ReadStateType } from '../../data'

const READ_STATE_TYPES: readonly string[] = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items']
export const isReadStateType = (t: string): t is ReadStateType => READ_STATE_TYPES.includes(t)

const keyOf = (type: string, id: number, section: string) => `${type}:${id}:${section}`

/**
 * The viewer's read_state rows in memory, with the legacy `isUnread` semantics: unread when there is
 * no row, or the entity changed after `seen_at`. Until the first load nothing is unread (avoids a
 * page full of dots that clears itself a moment later).
 */
export class ReadStateCache {
  private seen = new Map<string, number>()
  loaded = false

  load(rows: readonly ReadState[]): void {
    for (const row of rows) {
      const key = keyOf(row.entity_type, row.entity_id, row.section)
      const at = Date.parse(row.seen_at)
      // a local mark made while the list was loading wins when it is newer
      if (!this.seen.has(key) || (this.seen.get(key) ?? 0) < at) this.seen.set(key, at)
    }
    this.loaded = true
  }

  isUnread(type: string, id: number, updatedAt: string | null | undefined, section = ''): boolean {
    if (!this.loaded || !updatedAt) return false
    const at = this.seen.get(keyOf(type, id, section))
    if (at === undefined) return true
    return Date.parse(updatedAt) > at
  }

  /** True when a row exists and already covers `updatedAt` (the write can be skipped). */
  isCovered(type: string, id: number, updatedAt: string | null | undefined, section = ''): boolean {
    const at = this.seen.get(keyOf(type, id, section))
    if (at === undefined) return false
    return !updatedAt || Date.parse(updatedAt) <= at
  }

  /** Raises the stored time; a mark older than what is stored is ignored (seen_at never goes back). */
  mark(type: string, id: number, section: string, seenAt: Date): boolean {
    const key = keyOf(type, id, section)
    const current = this.seen.get(key)
    if (current !== undefined && current >= seenAt.getTime()) return false
    this.seen.set(key, seenAt.getTime())
    return true
  }
}

/**
 * Time to store as `seen_at`: now, or the entity's own timestamp when the client clock is behind it
 * (updated_at is stamped by the server), so the dot is guaranteed to clear.
 */
export function seenAtFor(updatedAt: string | null | undefined, now: Date = new Date()): Date {
  const updated = updatedAt ? Date.parse(updatedAt) : NaN
  return Number.isFinite(updated) && updated > now.getTime() ? new Date(updated) : now
}
