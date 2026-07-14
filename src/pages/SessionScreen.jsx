import { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext'
import { CARD_REGISTRY } from './session/cards/cardRegistry'
import SessionTabs from './session/SessionTabs'
import SessionCardPicker from './session/SessionCardPicker'
import SessionEditModal from './session/SessionEditModal'
import { btnPrimary } from '../constants'

const HEADER_H = 60

// Full-screen DM shell. `layout.cards[]` (Firestore `game_config/session_screen`,
// already onSnapshot-subscribed via `db.game_config`) is the single ordered
// source of truth driving both the tab header and the stacked card list — no
// separate tabs state, so reorder/add/remove can never desync the two.
export default function SessionScreen() {
  const { db, saveSessionScreen } = useApp()
  const layout = (db.game_config || []).find(c => c.id === 'session_screen')
  const cards = layout?.cards ?? []

  const tabsBarRef = useRef(null)
  const [activeId, setActiveId] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editing, setEditing] = useState(null) // { pj, cardType }

  // Keep activeId valid whenever the card list changes (first load, or a
  // card was added/removed elsewhere/another device).
  useEffect(() => {
    if (cards.length === 0) { setActiveId(null); return }
    if (!cards.some(c => c.id === activeId)) setActiveId(cards[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.map(c => c.id).join(',')])

  function scrollToCard(id) {
    const el = document.getElementById(`session-card-${id}`)
    if (!el) return
    const barH = tabsBarRef.current?.offsetHeight ?? 0
    const offset = HEADER_H + barH + 12
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top, behavior: 'smooth' })
    setActiveId(id)
  }

  function addCard(tipo) {
    const base = layout ?? { id: 'session_screen', cards: [] }
    const entry = { id: Date.now(), tipo }
    saveSessionScreen({ ...base, cards: [...(base.cards ?? []), entry] })
    setPickerOpen(false)
    setActiveId(entry.id)
  }

  // Removing the active card reassigns activeId to the nearest remaining
  // card (the one right after it, else the one right before it), else none.
  function removeCard(id) {
    const idx = cards.findIndex(c => c.id === id)
    if (idx === -1) return
    const nextCards = cards.filter(c => c.id !== id)
    saveSessionScreen({ ...layout, cards: nextCards })
    if (activeId === id) {
      const fallback = cards[idx + 1] ?? cards[idx - 1] ?? null
      setActiveId(fallback ? fallback.id : null)
    }
  }

  return (
    <div>
      <SessionTabs
        ref={tabsBarRef}
        cards={cards}
        activeId={activeId}
        onActiveChange={setActiveId}
        onTabClick={scrollToCard}
        onAddClick={() => setPickerOpen(true)}
      />

      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 min-h-[calc(100vh-160px)] text-center px-10">
          <p className="text-txt-muted text-sm max-w-sm">
            Todavía no agregaste ninguna pestaña a la pantalla de sesión.
          </p>
          <button type="button" className={btnPrimary} onClick={() => setPickerOpen(true)}>
            + Agregar pestaña
          </button>
        </div>
      ) : (
        <div className="max-w-[900px] mx-auto py-6 px-10 max-md:px-5">
          {cards.map(entry => {
            const reg = CARD_REGISTRY[entry.tipo]
            if (!reg) return null
            const Component = reg.Component
            return (
              <div key={entry.id} id={`session-card-${entry.id}`} data-card-id={entry.id}>
                <Component
                  db={db}
                  layout={layout}
                  entry={entry}
                  onEdit={pj => setEditing({ pj, cardType: entry.tipo })}
                  onRemove={() => removeCard(entry.id)}
                />
              </div>
            )
          })}
        </div>
      )}

      {pickerOpen && (
        <SessionCardPicker
          existingTypes={cards.map(c => c.tipo)}
          onSelect={addCard}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {editing && (
        <SessionEditModal
          pj={editing.pj}
          cardType={editing.cardType}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
