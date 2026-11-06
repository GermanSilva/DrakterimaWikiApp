/** What a character holds for a discarded item, as one short line for the review (formatted, truncated). */
import { discardedDataKeys } from '../sheet/discarded'
import type { DiscardedItem } from '../sheet/sheetModel'

export const MAX_VALUE_CHARS = 80

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim()
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) return value.length === 1 ? '1 fila' : `${value.length} filas`
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

const truncate = (text: string): string => (Array.from(text).length > MAX_VALUE_CHARS ? `${Array.from(text).slice(0, MAX_VALUE_CHARS).join('')}…` : text)

const isHeld = (value: unknown): boolean => value !== undefined && value !== null && value !== ''

/** The keys the item owns that the character holds a value for. */
export function heldKeys(item: DiscardedItem, values: Record<string, unknown>): string[] {
  return discardedDataKeys(item).filter((key) => isHeld(values[key]))
}

/** `null` when the character holds nothing for the item; the value for a one-key item, `key: value; ...` otherwise. */
export function describeHeld(item: DiscardedItem, values: Record<string, unknown>): string | null {
  const keys = heldKeys(item, values)
  if (keys.length === 0) return null
  const multi = discardedDataKeys(item).length > 1
  return keys.map((key) => (multi ? `${key}: ${truncate(formatValue(values[key]))}` : truncate(formatValue(values[key])))).join('; ')
}
