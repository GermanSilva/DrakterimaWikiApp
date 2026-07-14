import { forwardRef, useEffect } from 'react'
import { CARD_REGISTRY } from './cards/cardRegistry'

const HEADER_H = 60

// Header tab bar: one tab per card in `cards[]` order, plus a persistent
// "Agregar pestaña" button. `overflow-x-auto` lives on the tabs container
// only (not the button) so the add button never scrolls out of view even
// with many tabs. Tabs act only as scroll anchors — clicking one scrolls to
// the matching card via `onTabClick`, it never hides other cards.
//
// Active-tab tracking (PJDetail sticky-name pattern, adapted for multiple
// scroll anchors instead of one): one IntersectionObserver watches every
// `#session-card-{id}` element (rendered by SessionScreen), with a top
// rootMargin offset of HEADER_H + this bar's own height so a card only
// counts as "in view" once it has scrolled past the sticky tab bar. Among
// the currently-intersecting cards, the first one in `cards[]` order is
// reported as active via `onActiveChange`.
const SessionTabs = forwardRef(function SessionTabs(
  { cards, activeId, onActiveChange, onTabClick, onAddClick },
  ref
) {
  useEffect(() => {
    if (cards.length === 0) return
    const barH = ref?.current?.offsetHeight ?? 0
    const topOffset = HEADER_H + barH
    const visible = new Set()

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const id = Number(entry.target.dataset.cardId)
          if (entry.isIntersecting) visible.add(id)
          else visible.delete(id)
        })
        const topmost = cards.find(c => visible.has(c.id))
        if (topmost) onActiveChange(topmost.id)
      },
      { rootMargin: `-${topOffset}px 0px -70% 0px`, threshold: 0 }
    )

    cards.forEach(c => {
      const el = document.getElementById(`session-card-${c.id}`)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [cards.map(c => c.id).join(','), onActiveChange, ref])

  return (
    <div
      ref={ref}
      className="sticky top-[60px] z-10 bg-[#060606] border-b border-border-base flex items-stretch px-10 max-md:px-5"
    >
      <div className="flex-1 overflow-x-auto flex gap-1">
        {cards.map(c => {
          const label = CARD_REGISTRY[c.tipo]?.label ?? c.tipo
          const isActive = c.id === activeId
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onTabClick(c.id)}
              className={`font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-3 whitespace-nowrap border-b-2 transition-colors cursor-pointer bg-transparent ${
                isActive
                  ? 'text-accent-bright border-accent'
                  : 'text-txt-muted border-transparent hover:text-txt-primary'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onAddClick}
        className="shrink-0 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-3 text-accent-dim hover:text-accent-bright bg-transparent border-none cursor-pointer whitespace-nowrap"
      >
        + Agregar pestaña
      </button>
    </div>
  )
})

export default SessionTabs
