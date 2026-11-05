/**
 * Distance units of a campaign (odd/tasks/system-agnostic.md S19, S32): the optional `distance` key of the system
 * document, the conversion between units and the `[[{D:key}amount]]` markup that text uses to reference a distance.
 *
 * `value` is the size of one unit in a common base (ft 1, m 3.28084, squares 5): the DM fills it. Every conversion
 * rounds DOWN at the precision (`decimals`) of the target unit. Rendering never throws and never hides text: whatever
 * cannot be formatted comes back as the original markup.
 */
import { cleanLabel } from '../systemProfile'

export interface DistanceUnit {
  key: string
  label: string
  /** Size of one unit in the common base: positive, finite. */
  value: number
  /** Digits kept after the decimal separator, 0..2. */
  decimals: 0 | 1 | 2
}

export interface DistanceConfig {
  /** Key of the main unit. */
  main: string
  units: DistanceUnit[]
}

export const UNIT_MAX = 8
export const VALUE_MIN = 1e-6
export const VALUE_MAX = 1e12

/** Same charset as the sheet keys. */
const UNIT_KEY = /^[a-z][a-z0-9_]{0,39}$/
const RESERVED = new Set(['constructor', 'prototype'])
const AMOUNT = /^\d{1,12}(?:[.,]\d{1,6})?$/
const MARKUP = /^\[\[\{D:([a-z][a-z0-9_]{0,39})\}([^\]]*)\]\]$/

/** Absorbs binary float error before flooring (0.3 / 0.1 is 2.9999999999999996). */
const EPSILON = 1e-9

export type DistanceResult = { ok: true; distance: DistanceConfig } | { ok: false; path: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const fail = (path: string): DistanceResult => ({ ok: false, path })

/**
 * Validates a `distance` value with the rules the database applies (same paths in the error) and returns it normalised:
 * labels trimmed, unknown properties dropped. `path` is the first offending property, e.g. `distance.units[1].key`.
 */
export function validateDistance(raw: unknown): DistanceResult {
  if (!isRecord(raw)) return fail('distance')
  if (!Array.isArray(raw.units) || raw.units.length < 1 || raw.units.length > UNIT_MAX) return fail('distance.units')
  const units: DistanceUnit[] = []
  const seen = new Set<string>()
  for (const [i, item] of raw.units.entries()) {
    const at = `distance.units[${i}]`
    if (!isRecord(item)) return fail(at)
    const { key, value, decimals } = item
    if (typeof key !== 'string' || !UNIT_KEY.test(key) || RESERVED.has(key) || seen.has(key)) return fail(`${at}.key`)
    seen.add(key)
    const label = cleanLabel(item.label)
    if (label === null) return fail(`${at}.label`)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < VALUE_MIN || value > VALUE_MAX) return fail(`${at}.value`)
    if (decimals !== 0 && decimals !== 1 && decimals !== 2) return fail(`${at}.decimals`)
    units.push({ key, label, value, decimals })
  }
  if (typeof raw.main !== 'string' || !seen.has(raw.main)) return fail('distance.main')
  return { ok: true, distance: { main: raw.main, units } }
}

/** The normalised config, or undefined when the value is absent or invalid. Never throws. */
export function readDistance(raw: unknown): DistanceConfig | undefined {
  const result = validateDistance(raw)
  return result.ok ? result.distance : undefined
}

/** `amount` of unit `from` expressed in unit `to`, floored to the precision of `to`. NaN for a negative or non-finite amount. */
export function convert(amount: number, from: DistanceUnit, to: DistanceUnit): number {
  if (!Number.isFinite(amount) || amount < 0) return Number.NaN
  const scale = 10 ** to.decimals
  const scaled = ((amount * from.value) / to.value) * scale
  if (!Number.isFinite(scaled)) return Number.NaN
  return Math.floor(scaled + EPSILON) / scale
}

const separator = (locale: string): string => (/^es(-|$)/i.test(locale) ? ',' : '.')

function show(n: number, decimals: number, sep: string): string {
  const text = n.toFixed(decimals)
  return (text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text).replace('.', sep)
}

/**
 * "[15ft|4,5m|3c]": the amount of unit `unitKey` as written, followed by every unit in declared order (the referenced
 * unit shows the amount as written, the others the floored conversion). The decimal separator follows `locale`
 * (Spanish: comma). null when the text cannot be formatted (unknown unit, no config, malformed amount): the caller
 * keeps the original text.
 */
export function formatDistance(amount: string | number, unitKey: string, distance: DistanceConfig | null | undefined, locale: string): string | null {
  if (!distance) return null
  const from = distance.units.find((u) => u.key === unitKey)
  if (!from) return null
  const written = typeof amount === 'number' ? String(amount) : amount
  if (!AMOUNT.test(written)) return null
  const number = Number(written.replace(',', '.'))
  const sep = separator(locale)
  const parts: string[] = []
  for (const unit of distance.units) {
    if (unit === from) {
      parts.push(`${written.replace(/[.,]/, sep)}${unit.key}`)
      continue
    }
    const converted = convert(number, from, unit)
    if (!Number.isFinite(converted)) return null
    parts.push(`${show(converted, unit.decimals, sep)}${unit.key}`)
  }
  return `[${parts.join('|')}]`
}

/** Reads `[[{D:key}amount]]`; amounts are `15`, `4.5` or `4,5`. null for anything else. */
export function parseDistanceMarkup(text: string): { unitKey: string; amount: string } | null {
  const match = MARKUP.exec(text)
  if (!match || !AMOUNT.test(match[2])) return null
  return { unitKey: match[1], amount: match[2] }
}

/** The formatted distance of a `[[{D:...}...]]` markup, or `text` itself when it cannot be formatted. */
export function renderDistanceMarkup(text: string, distance: DistanceConfig | null | undefined, locale: string): string {
  const parsed = parseDistanceMarkup(text)
  return (parsed && formatDistance(parsed.amount, parsed.unitKey, distance, locale)) ?? text
}
