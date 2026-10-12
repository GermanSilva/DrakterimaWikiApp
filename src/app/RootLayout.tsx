import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { hubTitleForPath, useDocumentTitle } from './documentTitle'

/** Give up waiting for a lazy section's heading after this long. */
export const FOCUS_WAIT_MS = 5000

const HEADING = '#main-content h1:not([data-loading])'

function focusElement(target: HTMLElement) {
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus()
}

/**
 * After a client-side navigation focus the page's h1. When the heading is not rendered yet (a lazy
 * route or section is still loading) focus the main landmark right away and watch the page
 * for the heading: it is focused once, and only if focus is still on the landmark or the body, so
 * neither re-renders nor a user who already moved on lose their place. Keyed on pathname only.
 */
function useFocusMainOnNavigation() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    // Not on the initial load: the browser already places focus at the top of the document.
    if (first.current) {
      first.current = false
      return
    }
    const heading = document.querySelector<HTMLElement>(HEADING)
    if (heading) {
      focusElement(heading)
      return
    }
    const main = document.getElementById('main-content')
    if (main) focusElement(main)
    const observer = new MutationObserver(() => {
      const late = document.querySelector<HTMLElement>(HEADING)
      if (!late) return
      observer.disconnect()
      const active = document.activeElement
      if (active === document.body || active === null || active.id === 'main-content') focusElement(late)
    })
    // The landmark itself can be replaced (loading screen, then the real shell), so watch the body.
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = setTimeout(() => observer.disconnect(), FOCUS_WAIT_MS)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [pathname])
}

export function RootLayout() {
  useFocusMainOnNavigation()
  useDocumentTitle(hubTitleForPath(useLocation().pathname))
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[500] focus:bg-bg-card focus:text-txt-primary focus:px-3 focus:py-2 focus:border focus:border-accent"
        onClick={(e) => {
          // A hash href would be resolved against the router's location; focus the landmark instead.
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        Saltar al contenido
      </a>
      <Outlet />
    </>
  )
}
