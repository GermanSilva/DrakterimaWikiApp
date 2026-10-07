import type { ReactNode, RefObject } from 'react'
import { Link } from 'react-router'
import { btnSecondary } from '../../constants'

/**
 * Sticky "← Volver" bar of a detail view. "Volver" is a real link to the list URL (so the browser's
 * back/forward and "open in new tab" work); the name fades in once the title scrolls out of view.
 * The faded name only repeats the page's h1, so it is hidden from assistive tech.
 */
export function DetailBackBar({
  to,
  barRef,
  name,
  showName,
  children,
}: {
  to: string
  barRef: RefObject<HTMLDivElement>
  name: ReactNode
  showName: boolean
  children?: ReactNode
}) {
  return (
    <div
      ref={barRef}
      className="flex justify-between items-center mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5"
    >
      <Link to={to} className={btnSecondary}>
        ← Volver
      </Link>
      <span
        aria-hidden="true"
        className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary leading-none truncate px-4 pointer-events-none"
        style={{ opacity: showName ? 1 : 0, transition: 'opacity 0.2s ease' }}
      >
        {name}
      </span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
