import { getViewerId, readStateMap, regionLabel, regionOptions } from '../helpers'
import { REGION_COLOR } from '../constants'
import { COLLECTION_DISPLAY, COLLECTION_LETTER, LETTER_COLLECTION } from '../components/wikiHelpers'
import { searchWikiItems } from '../ports/wikiSearch'

const entityTitle = (e) => e.nombre ?? e.titulo ?? ''

/** WikiPort over the Firebase app state: everything is already in `db`, nothing is filtered (as before). */
export function createLegacyWikiPort({ db, goToDetail }) {
  return {
    pending: () => false,
    resolve(letter, id) {
      const table = LETTER_COLLECTION[letter]
      const entity = table ? (db[table] || []).find((e) => e.id === id) : null
      if (!entity) return null
      return {
        title: entity.nombre || entity.titulo || `#${id}`,
        section: COLLECTION_DISPLAY[table] || letter,
        imagenUrl: entity.imagen_url,
        table,
      }
    },
    navigate: (table, id) => goToDetail(table, id),
    search(query) {
      const items = Object.keys(COLLECTION_LETTER).flatMap((table) =>
        (db[table] || []).map((entity) => ({
          table,
          letter: COLLECTION_LETTER[table],
          id: entity.id,
          title: entityTitle(entity),
        })),
      )
      return searchWikiItems(items, query)
    },
  }
}

/** Same rule as the old `isUnread` / `isSectionUnread` helpers: read_state doc `${viewer}_${type}_${id}[_${section}]`. */
export function createLegacyUnreadPort({ db, isDM, currentPlayer, markRead, markSectionRead }) {
  const viewerId = getViewerId(isDM, currentPlayer)
  const readState = readStateMap(db.read_state)
  return {
    isUnread(type, id, updatedAt, section) {
      if (!viewerId || !updatedAt) return false
      const entry = readState[`${viewerId}_${type}_${id}${section ? `_${section}` : ''}`]
      if (!entry) return true
      return new Date(updatedAt) > new Date(entry.seenAt)
    },
    markRead(type, id, _updatedAt, section) {
      if (section) markSectionRead(id, section)
      else markRead(type, id)
    },
  }
}

export function createLegacyPlayerNotesPort({ db, isDM, currentPlayer, savePlayerNote, deletePlayerNote }) {
  const notes = db.player_notes || []
  return {
    role: isDM ? 'dm' : currentPlayer ? 'player' : 'none',
    loading: false,
    entriesFor: (type, id) =>
      notes
        .filter((n) => n.type === type && n.entity_id === id)
        .map((n) => ({
          key: String(n.pj_id),
          label: (db.pjs || []).find((p) => p.id === n.pj_id)?.nombre || 'Jugador',
          text: n.text,
        })),
    mine: (type, id) =>
      notes.find((n) => n.pj_id === currentPlayer?.id && n.type === type && n.entity_id === id)?.text || '',
    save: (type, id, text, key) => savePlayerNote(isDM ? Number(key) : currentPlayer.id, type, id, text),
    remove: (type, id, key) => deletePlayerNote(`${isDM ? key : currentPlayer.id}_${type}_${id}`),
  }
}

export function createLegacyFormPort({ db, isDM }) {
  return {
    isDM,
    regions: regionOptions.map((key) => ({ key, label: regionLabel[key], color: REGION_COLOR[key] })),
    characters: (db.pjs || []).map((p) => ({ id: p.id, nombre: p.nombre, jugador: p.jugador })),
    sesiones: db.sesiones || [],
  }
}
