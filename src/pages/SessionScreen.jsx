import { useState, useRef, useEffect } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useApp } from '../AppContext'
import { CARD_REGISTRY } from './session/cards/cardRegistry'
import SessionTabs from './session/SessionTabs'
import SessionCardPicker from './session/SessionCardPicker'
import SessionEditModal from './session/SessionEditModal'
import SortableCardItem from './session/SortableCardItem'
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

  // `distance: 8` activation constraint so a plain click on a card's inner
  // controls (Editar, Quitar, inputs) never gets misread as a drag start —
  // the pointer has to move 8px past the grip handle first.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

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

  // Reorders the SAME `layout.cards[]` array that drives both the tab bar
  // and the card stack — there is no separate order/state to keep in sync
  // (SessionTabs renders tabs directly from the `cards` prop it's given, in
  // array order), so persisting the reordered array here is the only step
  // needed for the tab order to update too.
  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = cards.findIndex(c => c.id === active.id)
    const newIndex = cards.findIndex(c => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(cards, oldIndex, newIndex)
    saveSessionScreen({ ...layout, cards: reordered })
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <div className="max-w-[900px] mx-auto py-6 px-10 max-md:px-5">
              {cards.map(entry => {
                const reg = CARD_REGISTRY[entry.tipo]
                if (!reg) return null
                const Component = reg.Component
                return (
                  <SortableCardItem key={entry.id} id={entry.id}>
                    <div id={`session-card-${entry.id}`} data-card-id={entry.id}>
                      <Component
                        db={db}
                        layout={layout}
                        entry={entry}
                        onEdit={pj => setEditing({ pj, cardType: entry.tipo })}
                        onRemove={() => removeCard(entry.id)}
                      />
                    </div>
                  </SortableCardItem>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
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
