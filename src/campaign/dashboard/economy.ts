import type { FlatEntity } from '../../data'
import { TO_CP } from '../../helpers/pjInventory'
import { readAmounts, totalValue, type Denomination } from '../games/coins'
import { rewardTarget } from '../system/coins/rewardTarget'
import type { SystemProfile } from '../system/systemProfile'

/** Amounts are expressed in the largest denomination of the campaign (`unit` is its label). */
export interface EconomySummary {
  total: number
  unit: string
  onHand: number
  /** null when the campaign has no "guardado" part (economy tables). */
  saved: number | null
}

interface CoinModel {
  denominations: Denomination[]
  onHand: (pj: FlatEntity) => unknown
  saved: ((pj: FlatEntity) => unknown) | null
}

/** Where the character's money lives and what each denomination is worth, per the campaign's coin model; null = no economy to show. */
function coinModel(system: SystemProfile): CoinModel | null {
  const target = rewardTarget(system.sheet)
  if (target.mode === 'none') return null
  if (target.mode === 'monedas') return { denominations: target.denominations, onHand: (pj) => pj.monedas, saved: (pj) => pj.monedas_guardado }
  if (target.mode === 'economia') return { denominations: target.denominations, onHand: (pj) => pj[target.key], saved: null }
  if (!system.currency.enabled) return null
  const rates: Record<string, number> = TO_CP
  const denominations = system.currency.denominations.filter((d) => d.key in rates).map((d) => ({ key: d.key, label: d.label, value: rates[d.key] }))
  return denominations.length > 0 ? { denominations, onHand: (pj) => pj.monedas, saved: (pj) => pj.monedas_guardado } : null
}

/** The character's total money (on hand + saved) converted to the largest denomination. */
export function economySummary(pj: FlatEntity, system: SystemProfile): EconomySummary | null {
  const model = coinModel(system)
  if (!model) return null
  const largest = model.denominations.reduce((best, d) => (d.value > best.value ? d : best))
  const inLargest = (source: unknown) => totalValue(readAmounts(source, model.denominations), model.denominations) / largest.value
  const onHand = inLargest(model.onHand(pj))
  const saved = model.saved ? inLargest(model.saved(pj)) : null
  return { total: onHand + (saved ?? 0), unit: largest.label, onHand, saved }
}

const NUMBER = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2, useGrouping: false })

export const formatEconomy = (value: number): string => NUMBER.format(value)
