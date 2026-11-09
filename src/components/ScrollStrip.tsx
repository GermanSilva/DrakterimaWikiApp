import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const CHEVRON = 'absolute top-0 bottom-0 z-[1] flex items-center px-1 bg-bg-card text-txt-muted hover:text-txt-primary border-none cursor-pointer'

/**
 * A horizontally scrolling strip (tabs, section nav) with a chevron on each side that still has content to scroll
 * to. Mark the active child with `data-active="true"` and pass `activeKey`: when it changes, that child is scrolled
 * into view.
 */
export default function ScrollStrip({ children, activeKey, className = '', stripClassName = '' }: { children: ReactNode; activeKey?: string; className?: string; stripClassName?: string }) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })

  const update = useCallback(() => {
    const el = stripRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    update()
    const el = stripRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [update, children])

  const lastKey = useRef(activeKey)
  useEffect(() => {
    if (lastKey.current === activeKey) return
    lastKey.current = activeKey
    stripRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeKey])

  const scroll = (direction: -1 | 1) => {
    const el = stripRef.current
    if (el) el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.9), behavior: 'smooth' })
  }

  return (
    <div className={`relative ${className}`}>
      {more.left && (
        <button type="button" aria-label="Desplazar a la izquierda" className={`${CHEVRON} left-0`} onClick={() => scroll(-1)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
      )}
      <div ref={stripRef} data-testid="scroll-strip" onScroll={update} className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${stripClassName}`}>
        {children}
      </div>
      {more.right && (
        <button type="button" aria-label="Desplazar a la derecha" className={`${CHEVRON} right-0`} onClick={() => scroll(1)}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
