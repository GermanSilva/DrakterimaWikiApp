/** Pure timing/math of the dismiss animation of the d20 overlay: fade-out combined with a zoom-in. */

/** How long the fade-out + zoom-in lasts, in milliseconds. */
export const DISMISS_MS = 500
/** Scale reached by the end of the zoom-in (1 = untouched). */
export const DISMISS_ZOOM = 1.8

export interface DismissFrame {
  /** 1 -> 0 */
  opacity: number
  /** 1 -> `zoom` */
  scale: number
  /** True once the animation reached its end. */
  done: boolean
}

/** Smoothstep: slow start and end, so the die eases away instead of popping. */
const ease = (t: number): number => t * t * (3 - 2 * t)

/** The style of the overlay `elapsedMs` after the dismissal started. Out-of-range times are clamped. */
export function dismissFrame(elapsedMs: number, durationMs: number = DISMISS_MS, zoom: number = DISMISS_ZOOM): DismissFrame {
  const raw = durationMs > 0 ? elapsedMs / durationMs : 1
  const t = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1
  const e = ease(t)
  return { opacity: 1 - e, scale: 1 + (zoom - 1) * e, done: t >= 1 }
}
