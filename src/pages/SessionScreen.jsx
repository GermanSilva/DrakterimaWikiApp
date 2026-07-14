import { useState, useRef, useEffect } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useApp } from '../AppContext'
import { CARD_REGISTRY } from './session/cards/cardRegistry'
import SessionTabs from './session/SessionTabs'
import SessionCardPicker from './session/SessionCardPicker'
import SessionEditModal from './session/SessionEditModal'
import SortableCardItem from './session/SortableCardItem'
import { toTabId, fromTabId } from './session/SortableTab'
import { btnPrimary } from '../constants'

const HEADER_H = 60

// Full-screen DM shell. `layout.cards[]` (Firestore `game_config/session_screen`,
// already onSnapshot-subscribed via `db.game_config`) is the single ordered
// source of truth driving both the tab header and the stacked card list — no
// separate tabs state, so reorder/add/remove can never desync the two.
export default function SessionScreen() {
  const { db, isDM, saveSessionScreen } = useApp()
  const layout = (db.game_config || []).find(c => c.id === 'session_screen')
  const cards = layout?.cards ?? []
  // Defensive filter: drop any persisted entry whose `tipo` is no longer a
  // CARD_REGISTRY key (e.g. a leftover `hp-ac` entry) before it reaches
  // drag-and-drop index math, the empty-state check, or any child that
  // trusts the array to only contain renderable cards. The array is never
  // written back here — it self-heals the next time `saveSessionScreen`
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

  // DM-only: this screen renders db.pjs in full, with no visibility filter
  // (by design — the DM needs to see every PJ regardless of `estado`/
  // `visibilidad`). Same gate pattern as ZonaDM.jsx: hooks run
  // unconditionally above, the gate is checked after them and before any
  // card data is rendered.
  if (!isDM) return null

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
    const oldIndex = visibleCards.findIndex(c => c.id === activeId)
    const newIndex = visibleCards.findIndex(c => c.id === overId)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(visibleCards, oldIndex, newIndex)
    saveSessionScreen({ ...layout, cards: reordered })
  }

  return (
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
              Single column below the breakpoint (unchanged max-w-[900px] stack),
              2-column grid of two fixed 750px tracks + 6px gap at/above it. The
              breakpoint is expressed in VIEWPORT width (Tailwind media query),
              so it must add back everything between the viewport edge and this
              container's own content box on desktop: Sidebar `ml-[240px]`
              (App.jsx) + main's `px-10` (80px) + this container's own `px-10`
              (80px) = 400px of non-card chrome. Target available-card-width is
              750*2 + 6 = 1506px, so viewport threshold = 1506 + 400 = 1906px.
              Row-major fill order (1-2 / 3-4 / ...) is CSS Grid's default
              `grid-auto-flow: row` — no reordering of `visibleCards` needed.
            */}
            <div className="max-w-[900px] mx-auto py-6 px-10 max-md:px-5 min-[1906px]:max-w-none min-[1906px]:grid min-[1906px]:grid-cols-[750px_750px] min-[1906px]:gap-1.5 min-[1906px]:justify-center">
              {visibleCards.map(entry => {
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
  )
}
