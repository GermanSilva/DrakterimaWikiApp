import { Trash2 } from 'lucide-react'
import { sectionTitleCls } from '../../../constants'

export default function SessionCardShell({ title, onRemove, children }) {
  return (
    <section className="border border-border-base bg-bg-card p-5 mb-5">
      <div className="flex items-center justify-between gap-3">
        <div className={sectionTitleCls}>{title}</div>
        {onRemove && (
          <button
            type="button"
            className="shrink-0 text-txt-muted hover:text-accent transition-colors p-1 bg-transparent border-none cursor-pointer"
            title="Quitar pestaña"
            onClick={onRemove}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
