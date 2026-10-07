import { DateTimeFormat } from '../../helpers'

/** Entity fields are `unknown` (flat promoted columns + `data` keys): text fields default to ''. */
export const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** `dd/mm/yyyy - hh:mm`, or an em dash when the row carries no (or an unparsable) timestamp. */
export function formatStamp(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return '—'
  return DateTimeFormat(value)
}
