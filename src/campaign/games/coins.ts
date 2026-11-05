import type { Coins } from '../../data'

export type CoinType = keyof Coins

/** Display order: most valuable first (pp, gp, ep, sp, cp), like the character sheet. */
export const COIN_TYPES: readonly CoinType[] = ['pp', 'gp', 'ep', 'sp', 'cp']

export const COIN_LABELS: Record<CoinType, string> = {
  pp: 'platino',
  gp: 'oro',
  ep: 'electrum',
  sp: 'plata',
  cp: 'bronce',
}

export const EMPTY_COINS: Readonly<Coins> = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }

/** Reads a coin amount defensively: only non-negative whole numbers count, anything else is 0. */
function amount(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** Coerces untrusted JSON (config document, prize) into a full `Coins` object. */
export function normalizeCoins(value: unknown): Coins {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    cp: amount(source.cp),
    sp: amount(source.sp),
    ep: amount(source.ep),
    gp: amount(source.gp),
    pp: amount(source.pp),
  }
}

export function hasCoins(coins: Partial<Coins> | null | undefined): boolean {
  return COIN_TYPES.some((c) => amount(coins?.[c]) > 0)
}

/** "2 oro, 3 bronce": only the non-zero denominations, most valuable first; `empty` when there are none. */
export function formatCoins(coins: Partial<Coins> | null | undefined, empty = 'nada'): string {
  const parts = COIN_TYPES.filter((c) => amount(coins?.[c]) > 0).map((c) => `${amount(coins?.[c])} ${COIN_LABELS[c]}`)
  return parts.length > 0 ? parts.join(', ') : empty
}

// --- lottery configuration -------------------------------------------------------------------------

/** `campaign_config` key 'loteria' (readable by members; the DM edits it in Ajustes). */
export interface LoteriaConfig {
  commonMinRoll: number
  commonPrize: Coins
  specialPrize: Coins
}

export const DEFAULT_LOTERIA_CONFIG: Readonly<LoteriaConfig> = {
  commonMinRoll: 17,
  commonPrize: { ...EMPTY_COINS, cp: 3 },
  specialPrize: { ...EMPTY_COINS, sp: 1 },
}

/**
 * The config document with the server's defaults for whatever is missing or malformed (the same
 * fallbacks `play_loteria` uses), so the prizes shown match the ones awarded.
 */
export function parseLoteriaConfig(value: unknown): LoteriaConfig {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_LOTERIA_CONFIG)
  const v = value as Record<string, unknown>
  const min = typeof v.commonMinRoll === 'number' || typeof v.commonMinRoll === 'string' ? Number(v.commonMinRoll) : NaN
  return {
    commonMinRoll: Number.isInteger(min) && min >= 0 && min <= 99 ? min : DEFAULT_LOTERIA_CONFIG.commonMinRoll,
    commonPrize: v.commonPrize ? normalizeCoins(v.commonPrize) : { ...DEFAULT_LOTERIA_CONFIG.commonPrize },
    specialPrize: v.specialPrize ? normalizeCoins(v.specialPrize) : { ...DEFAULT_LOTERIA_CONFIG.specialPrize },
  }
}

// --- sheet denominations (G5b, S12, S14, S28) ---------------------------------------------------------------------------------
// A campaign whose sheet has a coin table is not tied to cp/sp/ep/gp/pp: its denominations are the rows of that table, in
// schema order, each worth `value` of the smallest one (the DM's equivalences). Every helper below takes those rows; the
// legacy helpers above stay exactly as they were and are what a campaign without a sheet keeps using.

/** One amount per denomination key (the shape of a prize, a pot payout or a log of a sheet campaign). */
export type Amounts = Readonly<Record<string, number>>

/** A denomination of the sheet coin table. */
export interface Denomination {
  key: string
  label: string
  value: number
}

const byValueDesc = (denominations: readonly Denomination[]) => [...denominations].sort((a, b) => b.value - a.value)

/** True when any amount, whatever its key, is positive. */
export function hasAmounts(amounts: Readonly<Record<string, unknown>> | null | undefined): boolean {
  return Object.values(amounts ?? {}).some((v) => amount(v) > 0)
}

/** Untrusted json as one non-negative whole amount per denomination, in schema order; keys that are not denominations are left out. */
export function readAmounts(value: unknown, denominations: readonly Denomination[]): Record<string, number> {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return Object.fromEntries(denominations.map((d) => [d.key, amount(source[d.key])]))
}

/**
 * "2 oro, 3 cobre": the non-zero denominations, most valuable first, with the labels of the sheet. An amount under a key the
 * sheet does not know (an old log, a renamed denomination) is still shown, under its key, after the known ones. Without
 * denominations (a campaign with no sheet) this is `formatCoins`.
 */
export function formatAmounts(
  amounts: Readonly<Record<string, unknown>> | null | undefined,
  denominations: readonly Denomination[] | null,
  empty = 'nada',
): string {
  if (denominations === null) return formatCoins(amounts as Partial<Coins> | null | undefined, empty)
  const known = new Set(denominations.map((d) => d.key))
  const parts = [
    ...byValueDesc(denominations).map((d) => ({ n: amount(amounts?.[d.key]), label: d.label })),
    ...Object.keys(amounts ?? {}).filter((k) => !known.has(k)).map((k) => ({ n: amount(amounts?.[k]), label: k })),
  ].filter((p) => p.n > 0)
  return parts.length > 0 ? parts.map((p) => `${p.n} ${p.label}`).join(', ') : empty
}

/** The value of the amounts in the smallest denomination, at the DM's equivalences (not the D&D rates of `TO_CP`). */
export function totalValue(amounts: Readonly<Record<string, unknown>> | null | undefined, denominations: readonly Denomination[]): number {
  return denominations.reduce((sum, d) => sum + amount(amounts?.[d.key]) * d.value, 0)
}

/** "2 oro 1 plata 3 cobre" from a total in the smallest denomination (greedy, most valuable first), or null for nothing. */
export function formatTotal(total: number, denominations: readonly Denomination[]): string | null {
  if (!(total > 0)) return null
  const parts: string[] = []
  let rest = Math.floor(total)
  for (const d of byValueDesc(denominations)) {
    const n = Math.floor(rest / d.value)
    if (n > 0) {
      parts.push(`${n} ${d.label}`)
      rest -= n * d.value
    }
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/** The lottery document of a sheet campaign: prizes keyed by the denominations of the sheet. */
export interface SheetLoteriaConfig {
  commonMinRoll: number
  commonPrize: Record<string, number>
  specialPrize: Record<string, number>
}

/**
 * The config document with the server's fallbacks (17; the legacy default prizes only where their denomination exists), so
 * the prizes shown match the ones awarded. Only the denominations of the sheet are read.
 */
export function parseSheetLoteriaConfig(value: unknown, denominations: readonly Denomination[]): SheetLoteriaConfig {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const min = typeof v.commonMinRoll === 'number' || typeof v.commonMinRoll === 'string' ? Number(v.commonMinRoll) : NaN
  const has = (key: string) => denominations.some((d) => d.key === key)
  const fallback = (key: string, n: number) => readAmounts(has(key) ? { [key]: n } : {}, denominations)
  return {
    commonMinRoll: Number.isInteger(min) && min >= 0 && min <= 99 ? min : DEFAULT_LOTERIA_CONFIG.commonMinRoll,
    commonPrize: v.commonPrize ? readAmounts(v.commonPrize, denominations) : fallback('cp', 3),
    specialPrize: v.specialPrize ? readAmounts(v.specialPrize, denominations) : fallback('sp', 1),
  }
}
