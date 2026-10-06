import { useEffect } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Moves focus into a dialog when it mounts (unless something inside already
 * has focus) and restores focus to the previously focused element on unmount.
 * The dialog element should carry tabIndex={-1} so it can receive focus itself.
 *
 * `preferred` is an optional selector tried first (e.g. a form field selector
 * to land on the first input rather than a header button).
 */
export default function useDialogFocus(ref, preferred) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const previous = document.activeElement
    if (!el.contains(document.activeElement)) {
      const target = (preferred && el.querySelector(preferred)) ?? el.querySelector(FOCUSABLE) ?? el
      target.focus({ preventScroll: true })
    }
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  }, [ref, preferred])
}
