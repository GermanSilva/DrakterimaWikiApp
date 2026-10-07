import { useMemo } from 'react'
import { useApp } from '../AppContext'
import {
  FormPortContext,
  PlayerNotesPortContext,
  UnreadPortContext,
  WikiPortContext,
} from '../ports'
import { createLegacyFormPort, createLegacyPlayerNotesPort, createLegacyUnreadPort, createLegacyWikiPort } from './legacyPorts'

/**
 * Installs the ports the shared components read, backed by the Firebase app state (`useApp()`).
 * Mounted once inside App.jsx so the legacy app at /legacy behaves exactly as before the ports existed.
 */
export default function LegacyPortsProvider({ children }) {
  const app = useApp()
  const { db, goToDetail, isDM, currentPlayer, markRead, markSectionRead, savePlayerNote, deletePlayerNote } = app
  const wiki = useMemo(() => createLegacyWikiPort({ db, goToDetail }), [db, goToDetail])
  const unread = useMemo(
    () => createLegacyUnreadPort({ db, isDM, currentPlayer, markRead, markSectionRead }),
    [db, isDM, currentPlayer, markRead, markSectionRead],
  )
  const notes = useMemo(
    () => createLegacyPlayerNotesPort({ db, isDM, currentPlayer, savePlayerNote, deletePlayerNote }),
    [db, isDM, currentPlayer, savePlayerNote, deletePlayerNote],
  )
  const form = useMemo(() => createLegacyFormPort({ db, isDM, currentPlayer }), [db, isDM, currentPlayer])
  return (
    <WikiPortContext.Provider value={wiki}>
      <UnreadPortContext.Provider value={unread}>
        <PlayerNotesPortContext.Provider value={notes}>
          <FormPortContext.Provider value={form}>{children}</FormPortContext.Provider>
        </PlayerNotesPortContext.Provider>
      </UnreadPortContext.Provider>
    </WikiPortContext.Provider>
  )
}
