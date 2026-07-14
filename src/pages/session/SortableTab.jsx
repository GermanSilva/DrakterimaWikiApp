import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Design (C9) calls for ONE lifted `DndContext` wrapping both the tab bar
// and the card stack, with the tab bar's `SortableContext` and the stack's
// `SortableContext` sharing the same `entry.id` id-space. In practice a
// single `DndContext` keeps ONE `draggableNodes` registry keyed strictly by
// id (see `@dnd-kit/core`'s `useDraggable`: `draggableNodes.set(id, ...)`),
// so a tab and its corresponding card CANNOT both register `useSortable({id:
// entry.id})` with the identical raw id inside that shared context — the
// second one to mount silently overwrites the first's registration, and
// `isDragging = active.id === id` would then make BOTH elements animate as
// "being dragged" together. `toTabId`/`fromTabId` give tabs a distinct id
// namespace (`tab-{id}`) so the two `useSortable` calls never collide, while
// `fromTabId` lets `handleDragEnd` map either id-space back to the shared
// `entry.id` used by `visibleCards`.
export const toTabId = id => `tab-${id}`
export const fromTabId = id => (typeof id === 'string' && id.startsWith('tab-') ? Number(id.slice(4)) : id)

// Drag-and-click tab wrapper for the session-screen header bar. Unlike
// `SortableCardItem` (which scopes drag listeners to a dedicated grip
// handle), the whole tab button is both the click target (scroll-to-card)
// and the drag source — `PointerSensor`'s shared `activationConstraint:
// { distance: 8 }` (set on the sensor in SessionScreen.jsx) disambiguates a
// plain click (no movement) from a drag (>8px movement) before `listeners`
// ever swallows the click. `id` MUST be `toTabId(entry.id)` — matches the
// `items` array passed to the horizontal `SortableContext` in
// SessionScreen.jsx; `handleDragEnd` unwraps it back to `entry.id` via
// `fromTabId` before reordering `visibleCards`.
export default function SortableTab({ id, isActive, onClick, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-3 whitespace-nowrap border-b-2 transition-colors cursor-pointer bg-transparent touch-none ${
        isDragging ? 'opacity-50 relative z-10' : ''
      } ${
        isActive
          ? 'text-accent-bright border-accent'
          : 'text-txt-muted border-transparent hover:text-txt-primary'
      }`}
    >
      {children}
    </button>
  )
}
