import { COIN_TYPES, EMPTY_COINS, normalizeCoins, type CoinType } from '../../games/coins'
import type { Coins } from '../../../data'

/** Text of the five coin inputs of a form (strings, so a half-typed value is never rewritten under the cursor). */
export type CoinText = Record<CoinType, string>

export const coinText = (coins: Partial<Coins> | null | undefined): CoinText => {
  const normalized = normalizeCoins(coins ?? EMPTY_COINS)
  return Object.fromEntries(COIN_TYPES.map((c) => [c, String(normalized[c])])) as CoinText
}

export const EMPTY_COIN_TEXT: Readonly<CoinText> = coinText(EMPTY_COINS)

const WHOLE = /^\d{1,9}$/

/** Parses the inputs into coins; an empty input counts as 0. `null` when any input is not a whole number >= 0. */
export function parseCoinText(text: CoinText): Coins | null {
  const coins = { ...EMPTY_COINS }
  for (const c of COIN_TYPES) {
    const raw = text[c].trim()
    if (raw === '') continue
    if (!WHOLE.test(raw)) return null
    coins[c] = Number(raw)
  }
  return coins
}
