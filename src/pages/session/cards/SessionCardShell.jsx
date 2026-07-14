import { X, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { sectionTitleCls } from '../../../constants'

export default function SessionCardShell({ title, onRemove, onToggleAll, allExpanded, children }) {
  return (
    <section className="border border-border-base bg-bg-card p-3 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className={sectionTitleCls}>{title}</div>
        <div className="flex items-center gap-1 shrink-0">
          {onRemove && (
            <button
              type="button"
              className="shrink-0 text-txt-muted hover:text-accent transition-colors p-1 bg-transparent border-none cursor-pointer"
              title="Quitar pestaña"
              onClick={onRemove}
            >
              <X size={14} />
            </button>
          )}
          {onToggleAll && (
            <button
              type="button"
              className="shrink-0 text-txt-muted hover:text-accent transition-colors p-1 bg-transparent border-none cursor-pointer"
              title={allExpanded ? 'Contraer todo' : 'Expandir todo'}
              onClick={onToggleAll}
            >
              {allExpanded ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}
