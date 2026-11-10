/** How a bounded number is drawn (odd/tasks/ficha-indice-lateral.md S15): dots for a value out of a max, boxes for a track. */
import type { TrackState } from './resolveSheet'

const clampDots = (value: unknown, max: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0)

/** "●●●○○": the value filled out of `max`, read as "{label}: {v} de {max}" (S15). */
export function Dots({ label, value, max, className = '' }: { label: string; value: unknown; max: number; className?: string }) {
  const filled = clampDots(value, max)
  return (
    <span role="img" aria-label={`${label}: ${filled} de ${max}`} className={`whitespace-nowrap tracking-[0.1em] text-accent-bright ${className}`}>
      {'●'.repeat(filled)}
      <span className="text-txt-muted">{'○'.repeat(max - filled)}</span>
    </span>
  )
}

/** Boxes of a track: aggravated (✕) first, then superficial (/), then free (S15). */
export function TrackBoxes({ label, track }: { label: string; track: TrackState }) {
  const free = track.max - track.superficial - track.aggravated
  return (
    <span role="img" aria-label={`${label}: ${track.max} casillas, ${track.superficial} daño leve, ${track.aggravated} agravado, ${free} libres`} className="inline-flex flex-wrap gap-[3px] align-middle">
      {Array.from({ length: track.max }, (_, i) => {
        const kind = i < track.aggravated ? 'agg' : i < track.aggravated + track.superficial ? 'sup' : 'free'
        return (
          <span
            key={i}
            data-box={kind}
            aria-hidden="true"
            className={`inline-grid place-items-center w-[15px] h-[15px] border text-[10px] leading-none text-txt-primary ${kind === 'agg' ? 'bg-accent-dim border-accent' : kind === 'sup' ? 'bg-accent-subtle border-accent-dim' : 'border-border-light'}`}
          >
            {kind === 'agg' ? '✕' : kind === 'sup' ? '/' : ''}
          </span>
        )
      })}
    </span>
  )
}

