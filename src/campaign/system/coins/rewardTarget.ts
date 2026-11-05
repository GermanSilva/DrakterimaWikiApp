import type { CoinRow } from '../sheet/sheetModel'

/**
 * Where the coins of a campaign go (S12, S28): the client twin of `public._reward_target` (migration 20261105180000), read
 * over the RAW stored document exactly like the database does, so both sides agree even for a sheet the stricter client
 * validator would refuse.
 *   legacy   no stored sheet, or a sheet without a coin table: today's keys (cp..pp), pjs.monedas and game_pot columns;
 *   monedas  the coin table is marked `rewardDestination`: pjs.monedas, keyed by the sheet denominations;
 *   economia an economy table is marked: pjs.data[key], keyed by the same denominations;
 *   none     a coin table without denominations or without any marked destination: the lottery does not exist.
 */
export type RewardTarget =
  | { mode: 'legacy' }
  | { mode: 'none' }
  | { mode: 'monedas' | 'economia'; key: string; section: string; denominations: CoinRow[] }

/** The five fixed columns of `game_pot`. */
const POT_COLUMNS: readonly string[] = ['cp', 'sp', 'ep', 'gp', 'pp']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export function rewardTarget(rawSheet: unknown): RewardTarget {
  if (!isRecord(rawSheet)) return { mode: 'legacy' }
  const sections = list(rawSheet.categories).flatMap((c) => (isRecord(c) ? list(c.sections) : [])).filter(isRecord)
  const items = sections.flatMap((s) => list(s.items).filter(isRecord).map((item) => ({ item, section: String(s.key ?? '') })))
  const coin = items.find(({ item }) => item.kind === 'table' && item.type === 'monedas')?.item
  if (!coin) return { mode: 'legacy' }

  const denominations: CoinRow[] = list(coin.rows).filter(isRecord).map((r) => ({ key: String(r.key), label: String(r.label ?? r.key), value: Number(r.value) }))
  const dest = items.find(({ item }) => item.kind === 'table' && (item.type === 'monedas' || item.type === 'economia') && item.rewardDestination === true)
  if (!dest || denominations.length === 0) return { mode: 'none' }
  return { mode: dest.item.type === 'economia' ? 'economia' : 'monedas', key: String(dest.item.key), section: dest.section, denominations }
}

/** Can the shared pot hold this campaign's coins? Legacy yes; a sheet only when every denomination is a pot column. */
export function potSupports(target: RewardTarget): boolean {
  if (target.mode === 'legacy') return true
  if (target.mode === 'none') return false
  return target.denominations.every((d) => POT_COLUMNS.includes(d.key))
}
