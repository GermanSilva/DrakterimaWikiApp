import { Lock } from 'lucide-react'
import type { KeyFact } from './pjKeyFacts'
import { Dots, TrackBoxes } from '../../campaign/system/sheet/ValueFormats'

/**
 * The key facts as one strip of cells (header) or a tighter one (`compact`, card). Nothing to show draws nothing:
 * an unbound role leaves no gap (odd/tasks/ficha-indice-lateral.md S12-S13).
 */
export default function KeyFacts({ facts, compact = false, className = '' }: { facts: KeyFact[]; compact?: boolean; className?: string }) {
  if (facts.length === 0) return null
  return (
    <ul role="list" aria-label="Datos clave" className={`flex flex-wrap gap-px bg-border-base border border-border-base ${className}`}>
      {facts.map((fact) => (
        <li key={fact.key} className={`bg-bg-card flex-auto ${compact ? 'px-2 py-1.5 min-w-[60px]' : 'px-3 py-2 min-w-[76px]'}`}>
          <span className="flex items-center gap-1 font-exo text-[9px] tracking-[0.18em] uppercase text-txt-secondary">
            {fact.label}
            {fact.dmOnly && <Lock size={9} aria-label="Solo DM" />}
          </span>
          {fact.track ? (
            <span className="block mt-1"><TrackBoxes label={fact.label} track={fact.track} /></span>
          ) : fact.dots ? (
            <span className={`block ${compact ? 'text-[13px]' : 'text-[15px]'}`}><Dots label={fact.label} value={fact.dots.value} max={fact.dots.max} /></span>
          ) : (
          <span className={`block font-exo font-bold tabular-nums whitespace-nowrap ${compact ? 'text-[14px]' : 'text-[17px]'} ${fact.max !== undefined ? 'text-accent-bright' : 'text-txt-primary'}`}>
            {fact.value}
            {fact.max !== undefined && <small className="text-[12px] font-medium text-txt-secondary">/{fact.max}</small>}
            {fact.unit !== undefined && <small className="text-[12px] font-medium text-txt-secondary"> {fact.unit}</small>}
          </span>
          )}
          {fact.ratio !== undefined && !fact.track && (
            <span role="img" aria-label={`${fact.label} ${fact.value} de ${fact.max}`} className="block h-[3px] mt-1 bg-border-light">
              <span className="block h-full bg-accent" style={{ width: `${Math.round(fact.ratio * 100)}%` }} />
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
