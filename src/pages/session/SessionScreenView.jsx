import { useState, useRef, useEffect } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { SessionScreenPortContext } from '../../ports'
import { CARD_REGISTRY } from './cards/cardRegistry'
import SessionTabs from './SessionTabs'
import SessionCardPicker from './SessionCardPicker'
import SessionEditModal from './SessionEditModal'
import SortableCardItem from './SortableCardItem'
import { toTabId, fromTabId } from './SortableTab'
import { btnPrimary } from '../../constants'

const HEADER_H = 60

// Full-screen DM shell, host-agnostic: it renders `cards` (the ordered `layout.cards[]`, the single source of
// truth driving both the tab header and the stacked card list — no separate tabs state, so reorder/add/remove can
// never desync the two) and every write goes through `port`. The legacy app and the hub each provide their own.
// The caller owns the DM gate: this component renders character data without any visibility filter by design.
export default function SessionScreenView({ db, cards, port }) {
  // Defensive filter: drop any persisted entry whose `tipo` is no longer a
  // CARD_REGISTRY key (e.g. a leftover `hp-ac` entry) before it reaches
  // drag-and-drop index math, the empty-state check, or any child that
  // trusts the array to only contain renderable cards. The array is never
  // written back here — it self-heals the next time `port.setCards`
  // runs (e.g. on reorder), which persists this filtered shape.
  const visibleCards = cards.filter(c => CARD_REGISTRY[c.tipo])

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
    if (visibleCards.length === 0) { setActiveId(null); return }
    if (!visibleCards.some(c => c.id === activeId)) setActiveId(visibleCards[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCards.map(c => c.id).join(',')])

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
    const entry = { id: Date.now(), tipo }
    port.setCards(latest => [...latest, entry])
    setPickerOpen(false)
    setActiveId(entry.id)
  }

  // Removing the active card reassigns activeId to the nearest remaining
  // card (the one right after it, else the one right before it), else none.
  function removeCard(id) {
    const idx = visibleCards.findIndex(c => c.id === id)
    if (idx === -1) return
    port.setCards(latest => latest.filter(c => c.id !== id))
    if (activeId === id) {
      const fallback = visibleCards[idx + 1] ?? visibleCards[idx - 1] ?? null
      setActiveId(fallback ? fallback.id : null)
    }
  }

  // Reorders the SAME `visibleCards` array that drives both the tab bar
  // and the card stack — there is no separate order/state to keep in sync
  // (SessionTabs renders tabs directly from the `cards` prop it's given, in
  // array order), so persisting the reordered array here is the only step
  // needed for the tab order to update too. Reordering off `visibleCards`
  // (not the raw `cards`) also means an orphan entry (e.g. a leftover
  // `hp-ac` tipo) is dropped from the persisted doc the next time a reorder
  // happens — a drag-driven self-heal, no explicit migration needed.
  //
  // Tab ids come from the `toTabId`/`fromTabId` namespace (see
  // SortableTab.jsx) so the tab bar's `useSortable` calls never collide with
  // the card stack's within the single shared `DndContext`. `fromTabId` is a
  // no-op passthrough for plain numeric card ids, so this one handler works
  // for drags started from either the tab bar or the stack.
  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = fromTabId(active.id)
    const overId = fromTabId(over.id)
    if (!visibleCards.some(c => c.id === activeId) || !visibleCards.some(c => c.id === overId)) return
    // The move is applied to the host's LATEST list (not this render's snapshot), so it composes with a note/combat
    // write that landed in between; obsolete entries are dropped here (the self-heal).
    port.setCards(latest => {
      const known = latest.filter(c => CARD_REGISTRY[c.tipo])
      const oldIndex = known.findIndex(c => c.id === activeId)
      const newIndex = known.findIndex(c => c.id === overId)
      return oldIndex === -1 || newIndex === -1 ? latest : arrayMove(known, oldIndex, newIndex)
    })
  }

  return (
    <SessionScreenPortContext.Provider value={port}>
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleCards.map(c => toTabId(c.id))} strategy={horizontalListSortingStrategy}>
          <SessionTabs
            ref={tabsBarRef}
            cards={visibleCards}
            activeId={activeId}
            onActiveChange={setActiveId}
            onTabClick={scrollToCard}
            onAddClick={() => setPickerOpen(true)}
          />
        </SortableContext>

        {visibleCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 min-h-[calc(100vh-160px)] text-center px-10">
            <p className="text-txt-muted text-sm max-w-sm">
              Todavía no agregaste ninguna pestaña a la pantalla de sesión.
            </p>
            <button type="button" className={btnPrimary} onClick={() => setPickerOpen(true)}>
              + Agregar pestaña
            </button>
          </div>
        ) : (
          <SortableContext items={visibleCards.map(c => c.id)} strategy={rectSortingStrategy}>
            {/*
              Fixed-width (720px) cards in a centered wrapping row: one column on narrow viewports, and as many
              columns as fit beside the sidebar on wide ones (two from ~1906px). `rectSortingStrategy` makes the
              drag work in every layout.
            */}
            <div className="flex flex-wrap justify-center">
              {visibleCards.map(entry => {
                const reg = CARD_REGISTRY[entry.tipo]
                if (!reg) return null
                const Component = reg.Component
                return (
                  <div key={entry.id} className="w-[720px]">
                    <SortableCardItem id={entry.id}>
                      <div id={`session-card-${entry.id}`} data-card-id={entry.id}>
                        <Component
                          db={db}
                          entry={entry}
                          onEdit={pj => setEditing({ pj, cardType: entry.tipo })}
                          onRemove={() => removeCard(entry.id)}
                        />
                      </div>
                    </SortableCardItem>
                  </div>
                )
              })}
            </div>
          </SortableContext>
        )}
      </DndContext>

      {pickerOpen && (
        <SessionCardPicker
          existingTypes={visibleCards.map(c => c.tipo)}
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
    </SessionScreenPortContext.Provider>
  )
}
