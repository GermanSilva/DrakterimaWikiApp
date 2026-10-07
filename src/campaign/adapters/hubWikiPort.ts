import { COLLECTION_DISPLAY, COLLECTION_LETTER, LETTER_COLLECTION } from '../../components/wikiHelpers'
import { WIKI_INDEX_TABLES, type WikiIndexItem, type WikiIndexTable } from '../../data'
import type { WikiPort, WikiSearchItem } from '../../ports'
import { searchWikiItems } from '../../ports/wikiSearch'
import type { WikiIndex } from '../entities/useWikiIndex'

const isIndexTable = (t: string | undefined): t is WikiIndexTable => (WIKI_INDEX_TABLES as readonly string[]).includes(t ?? '')

export interface HubWikiPortDeps {
  index: WikiIndex
  navigate: (table: string, id: number) => void
}

/**
 * WikiPort over the campaign wiki index. A link resolves only when the viewer's index (already
 * RLS-filtered) has the row: a secret or draft article the viewer cannot see renders as "not found",
 * exactly like a typo, and never leaks its title.
 */
export function createHubWikiPort({ index, navigate }: HubWikiPortDeps): WikiPort {
  const byId = new Map<string, Map<number, WikiIndexItem>>()
  for (const table of WIKI_INDEX_TABLES) byId.set(table, new Map(index.byTable[table].map((item) => [item.id, item])))

  return {
    pending(letter) {
      const table = LETTER_COLLECTION[letter]
      return isIndexTable(table) && index.status[table] !== 'ready'
    },
    resolve(letter, id) {
      const table = LETTER_COLLECTION[letter]
      if (!isIndexTable(table)) return null
      const item = byId.get(table)?.get(id)
      if (!item) return null
      return {
        title: item.title || `#${id}`,
        section: COLLECTION_DISPLAY[table] || letter,
        imagenUrl: item.imagen_url,
        table,
      }
    },
    navigate,
    search(query) {
      const items: WikiSearchItem[] = Object.keys(COLLECTION_LETTER)
        .filter(isIndexTable)
        .flatMap((table) =>
          index.byTable[table].map((item) => ({ table, letter: COLLECTION_LETTER[table], id: item.id, title: item.title })),
        )
      return searchWikiItems(items, query)
    },
  }
}
