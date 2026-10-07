import { formatStamp } from './format'

/** "Creado / Última modificación" line of every detail view (`created_at` / `updated_at` of the row). */
export function EntityTimestamps({ createdAt, updatedAt }: { createdAt: unknown; updatedAt: unknown }) {
  return (
    <div>
      <div className="text-txt-muted text-xs flex flex-wrap max-sm:flex-col">
        <div className="flex items-center gap-1">
          <span className="font-bold text-txt-secondary">Creado:</span>
          <span className="whitespace-nowrap">{formatStamp(createdAt)}</span>
        </div>
        <span className="mx-4 text-accent-dim max-sm:hidden" aria-hidden="true">♦</span>
        <div className="flex items-center gap-1">
          <span className="font-bold text-txt-secondary">Última modificación:</span>
          <span className="whitespace-nowrap">{formatStamp(updatedAt)}</span>
        </div>
      </div>
    </div>
  )
}
