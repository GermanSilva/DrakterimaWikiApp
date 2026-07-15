import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

// Drag handle wrapper for one card in the session-screen stack. Only the
// grip icon is a drag source (`listeners` scoped to the handle button, not
// the whole card) so clicks on card content (Editar, Quitar, inputs) never
// trigger a drag. `id` MUST be the card's stable `entry.id` — matches the
// `items` array passed to the parent `SortableContext` — never the array
// index, since the index changes on every reorder.
export default function SortableCardItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 ${isDragging ? 'opacity-50 relative z-10' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 mt-5 text-txt-muted hover:text-accent-bright cursor-grab active:cursor-grabbing bg-transparent border-none p-1 touch-none"
        title="Arrastrar para reordenar"
      >
        <GripVertical size={16} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
