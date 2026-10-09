/** Tables whose rows carry a `region` key, with the Spanish noun used to tell the DM where a region is in use. */
export const REGION_TABLES = ['lugares', 'pnjs', 'pjs', 'facciones'] as const
export type RegionTable = (typeof REGION_TABLES)[number]

const NOUNS: Record<RegionTable, [string, string]> = {
  lugares: ['lugar', 'lugares'],
  pnjs: ['PNJ', 'PNJs'],
  pjs: ['personaje', 'personajes'],
  facciones: ['facción', 'facciones'],
}

export type RegionUsage = Map<string, Partial<Record<RegionTable, number>>>

/** How many rows of each table use each region key. Rows without a region are ignored. */
export function countRegionUsage(rows: Record<RegionTable, readonly { region?: unknown }[]>): RegionUsage {
  const usage: RegionUsage = new Map()
  for (const table of REGION_TABLES) {
    for (const row of rows[table]) {
      if (typeof row.region !== 'string' || row.region === '') continue
      const counts = usage.get(row.region) ?? {}
      counts[table] = (counts[table] ?? 0) + 1
      usage.set(row.region, counts)
    }
  }
  return usage
}

/** "2 lugares, 1 PNJ" (empty string when the region is not used). */
export function describeUsage(counts: Partial<Record<RegionTable, number>> | undefined): string {
  if (!counts) return ''
  return REGION_TABLES.filter((t) => (counts[t] ?? 0) > 0)
    .map((t) => `${counts[t]} ${NOUNS[t][counts[t] === 1 ? 0 : 1]}`)
    .join(', ')
}
