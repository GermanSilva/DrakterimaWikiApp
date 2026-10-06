import { useEffect, useRef, useState } from 'react'

// Height of the global Header (px). Sticky bars sit right below it.
export const HEADER_H = 60

/**
 * Sticky name-in-header pattern for inline detail views.
 *
 * Attach `backBarRef` to the sticky "← Volver" bar and `nameRef` to the main
 * title element. `showNameInHeader` becomes true once the title has scrolled
 * out of view beneath the header + back bar, so the bar can fade the name in.
 */
export default function useStickyTitle() {
  const backBarRef = useRef(null)
  const nameRef = useRef(null)
  const [showNameInHeader, setShowNameInHeader] = useState(false)

  useEffect(() => {
    if (!nameRef.current) return undefined
    const backBarH = backBarRef.current?.offsetHeight ?? 0
    const observer = new IntersectionObserver(
      ([entry]) => setShowNameInHeader(!entry.isIntersecting),
      { threshold: 0, rootMargin: `-${HEADER_H + backBarH}px 0px 0px 0px` }
    )
    observer.observe(nameRef.current)
    return () => observer.disconnect()
  }, [])

  return { backBarRef, nameRef, showNameInHeader }
}
