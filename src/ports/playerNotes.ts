import { createContext, useContext } from 'react'

export interface PlayerNoteEntry {
  /** Opaque author key to pass back to `save`/`remove` (legacy: the PJ id, hub: the user id). */
  key: string
  /** Who wrote it, shown to the DM ("Eldric"). */
  label: string
  text: string
}

/**
 * Player notes on wiki entities. `dm` sees (and may correct) every author's note, `player` writes
 * their own, `none` is a viewer without an identity (no notes UI at all).
 */
export interface PlayerNotesPort {
  role: 'dm' | 'player' | 'none'
  /** True until the host loaded the notes: editors are not rendered before (they seed from the text). */
  loading: boolean
  /** DM: every existing non-empty-or-not note of the entity. Player: not used (see `mine`). */
  entriesFor(type: string, id: number): PlayerNoteEntry[]
  /** The signed-in player's own text ('' when none). */
  mine(type: string, id: number): string
  /** Player: saves their own note (`key` ignored). DM: saves the note of the author `key`. */
  save(type: string, id: number, text: string, key?: string): Promise<void>
  remove(type: string, id: number, key?: string): Promise<void>
}

export const PlayerNotesPortContext = createContext<PlayerNotesPort | null>(null)

export function usePlayerNotesPort(): PlayerNotesPort {
  const port = useContext(PlayerNotesPortContext)
  if (!port) throw new Error('usePlayerNotesPort must be used inside a PlayerNotesPortContext provider (legacy or hub adapter)')
  return port
}
