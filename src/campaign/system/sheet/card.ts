/**
 * What the character card and the detail header show besides identity and roles (odd/tasks/ficha-indice-lateral.md
 * S12-S14): the fields the DM pinned in `sheet.card`, the stat line and the excerpt, resolved for one character.
 * A pinned field without a value is left out (no gap); a coin or economy table pins its total in the base unit.
 */
import { formatNumber, resolveSheetItems } from './resolveSheet'
import type { Sheet } from './sheetModel'

/**
 * One datum of the header or the card: a bound role, the level, or a pinned field. `max` makes it "current / max" with a
 * bar (`ratio` 0..1); `unit` follows the value; `dmOnly` facts are for the DM's eyes only.
 */
export interface KeyFact {
  key: string
  label: string
  value: string
  max?: string
  ratio?: number
  unit?: string
  dmOnly?: boolean
}

export interface ResolvedCard {
  pinned: KeyFact[]
  statline: { key: string; label: string; text: string }[] | null
  excerpt: string | null
}

/** How many pinned fields the card shows (the header shows all of them, up to SHEET_LIMITS.pinned). */
export const CARD_PINNED = 4

export function resolveCard(sheet: Sheet, pj: Record<string, unknown>): ResolvedCard {
  const card = sheet.card
  if (!card) return { pinned: [], statline: null, excerpt: null }
  const items = resolveSheetItems(sheet, pj)
  const pinned: KeyFact[] = []
  for (const pin of card.pinned) {
    const item = items[pin.key]
    const dm = pin.dmOnly ? { dmOnly: true } : {}
    if (!item) continue
    if (item.kind === 'field') {
      if (item.error || item.empty) continue
      const value = item.type === 'boolean' ? (item.value ? 'Sí' : 'No') : item.text
      const max = pin.max === undefined ? undefined : items[pin.max]
      if (max?.kind === 'field' && !max.error && !max.empty && typeof max.value === 'number' && typeof item.value === 'number') {
        const ratio = max.value > 0 ? Math.min(1, Math.max(0, item.value / max.value)) : 0
        pinned.push({ key: pin.key, label: item.label, value, max: max.text, ratio: Math.round(ratio * 100) / 100, ...dm })
      } else pinned.push({ key: pin.key, label: item.label, value, ...dm })
    } else if (item.kind === 'coins' || item.kind === 'economy') {
      const base = item.denominations[item.denominations.length - 1]
      const total = item.kind === 'coins' ? item.carriedTotal + item.storedTotal : item.total
      pinned.push({ key: pin.key, label: item.label, value: formatNumber(total), ...(base ? { unit: base.label } : {}), ...dm })
    }
  }
  const stat = card.statline === undefined ? undefined : items[card.statline]
  const statline =
    stat?.kind === 'stat'
      ? stat.rows.map((row) => ({ key: row.key, label: row.label, text: (row.modifier === null || row.modifier === row.value ? row.valueText : row.modifierText) || '—' }))
      : null
  const excerptItem = card.excerpt === undefined ? undefined : items[card.excerpt]
  const excerpt = excerptItem?.kind === 'field' && !excerptItem.empty && !excerptItem.error ? excerptItem.text : null
  return { pinned, statline, excerpt }
}
