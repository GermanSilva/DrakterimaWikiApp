import type { FlatEntity } from '../../data'
import { DateTimeFormat } from '../../helpers'

/** Entity fields are `unknown` (flat promoted columns + `data` keys): text fields default to ''. */
export const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Defense in depth: RLS already withholds drafts from players, but a draft that reached the client
 * (stale cache, misconfigured policy) is never rendered for a non-DM.
 */
export const canSee = (entity: FlatEntity, isDM: boolean): boolean => isDM || entity.estado !== 'borrador'

/** `dd/mm/yyyy - hh:mm`, or an em dash when the row carries no (or an unparsable) timestamp. */
export function formatStamp(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return '—'
  return DateTimeFormat(value)
}
