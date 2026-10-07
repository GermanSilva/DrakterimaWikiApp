import { COLLECTION_LETTER } from '../components/wikiHelpers'
import type { WikiSearchItem } from './wiki'

/** Results shown for a non-empty query (the empty query lists everything, as the legacy picker did). */
export const WIKI_SEARCH_LIMIT = 50

/**
 * Shared `WikiPort.search` implementation: case-insensitive substring match on the title, capped at
 * WIKI_SEARCH_LIMIT for a non-empty query. `items` are expected in COLLECTION_LETTER order.
 */
export function searchWikiItems(items: WikiSearchItem[], query: string): WikiSearchItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((i) => i.title.toLowerCase().includes(q)).slice(0, WIKI_SEARCH_LIMIT)
}

/** Collection keys in picker order. */
export const WIKI_TABLES = Object.keys(COLLECTION_LETTER)
