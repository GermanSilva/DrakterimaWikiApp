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
