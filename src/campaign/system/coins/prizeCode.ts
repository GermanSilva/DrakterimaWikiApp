/**
 * Prize encoding (S16): the amount of every denomination in schema order (the rows of the sheet coin table), joined by
 * underscores, for example "20_14_0" = 20 of the first denomination, 14 of the second and 0 of the third. A text form of a
 * prize that does not depend on the keys, used when old prizes are migrated into the sheet (G10). Both directions are strict.
 */
export class PrizeCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrizeCodeError'
  }
}

const WHOLE = /^\d+$/

const isAmount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0

/** "20_14_0" from the amounts; a denomination without an amount is 0, an amount of an unknown denomination is an error. */
export function encodePrize(amounts: Readonly<Record<string, number>>, denominations: readonly { key: string }[]): string {
  const known = new Set(denominations.map((d) => d.key))
  for (const key of Object.keys(amounts)) if (!known.has(key)) throw new PrizeCodeError(`"${key}" is not a denomination`)
  return denominations
    .map((d) => {
      const amount = amounts[d.key] ?? 0
      if (!isAmount(amount)) throw new PrizeCodeError(`the amount of "${d.key}" must be a whole number of 0 or more`)
      return String(amount)
    })
    .join('_')
}

/** The amounts per denomination (schema order) from "20_14_0"; wrong count, empty parts, signs, decimals or text are errors. */
export function decodePrize(text: string, denominations: readonly { key: string }[]): Record<string, number> {
  const parts = denominations.length === 0 && text === '' ? [] : text.split('_')
  if (parts.length !== denominations.length) throw new PrizeCodeError(`expected ${denominations.length} amounts separated by "_", got ${parts.length}`)
  const out: Record<string, number> = {}
  denominations.forEach((d, i) => {
    const part = parts[i]
    const amount = WHOLE.test(part) ? Number(part) : Number.NaN
    if (!isAmount(amount)) throw new PrizeCodeError(`the amount of "${d.key}" must be a whole number of 0 or more`)
    out[d.key] = amount
  })
  return out
}
