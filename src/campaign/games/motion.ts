/** True when the OS/browser asks for reduced motion (no matchMedia, e.g. old browsers or jsdom: false). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
