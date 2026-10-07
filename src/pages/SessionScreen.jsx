import { useEffect, useMemo, useRef } from 'react'
import { useApp } from '../AppContext'
import SessionScreenView from './session/SessionScreenView'

// Legacy host of the DM session screen: `layout.cards[]` lives in Firestore `game_config/session_screen` (already
// onSnapshot-subscribed via `db.game_config`) and every write goes through the app's `save` / `remove` /
// `saveSessionScreen`, exactly as before the screen became host-agnostic (see SessionScreenView).
export default function SessionScreen() {
  const { db, isDM, saveSessionScreen, save, remove } = useApp()
  const layout = (db.game_config || []).find(c => c.id === 'session_screen')
  const cards = useMemo(() => layout?.cards ?? [], [layout])

  // The port always reads the LATEST layout, so two quick actions compose even before the snapshot echoes back. The
  // optimistic copy is replaced by the props only when the persisted layout itself changed (a new snapshot): a plain
  // re-render with the old layout must not roll it back.
  const latest = useRef({ layout, cards })
  useEffect(() => {
    latest.current = { layout, cards }
  }, [layout, cards])

  const port = useMemo(() => {
    const write = (nextCards) => {
      const base = latest.current.layout ?? { id: 'session_screen' }
      // optimistic echo for the next call; the snapshot replaces it
      latest.current = { layout: { ...base, cards: nextCards }, cards: nextCards }
      return saveSessionScreen({ ...base, cards: nextCards })
    }
    return {
      setCards: (updater) => { write(updater(latest.current.cards)); return true },
      patchCard: (entryId, patch) => {
        write(latest.current.cards.map(c => (c.id === entryId ? { ...c, ...patch } : c)))
        return true
      },
      // Legacy persistence is whole-document by nature (it also stamps the unread sections itself).
      savePj: async (pj, patch) => (await save('pjs', { ...pj, ...patch })) !== false,
      createRule: async (rule) => (await save('homebrew_rules', rule)) !== false,
      deleteRule: async (id) => (await remove('homebrew_rules', id)) !== false,
    }
  }, [saveSessionScreen, save, remove])

  // DM-only: the screen renders db.pjs in full, with no visibility filter (by design — the DM needs to see every
  // PJ regardless of `estado`/`visibilidad`). Hooks run unconditionally above, the gate before any card data.
  if (!isDM) return null
  return <SessionScreenView db={db} cards={cards} port={port} />
}
