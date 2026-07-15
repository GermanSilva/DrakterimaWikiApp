import { useEffect } from 'react'
import { CARD_REGISTRY } from './cards/cardRegistry'

// WikiLinkPicker-style modal. Lists only card types not already present in
// `layout.cards[]` — this is what prevents duplicate cards/tabs of the same
// type, including `notes` and `rules`, which the design/spec treat as
// singleton entries per screen just like every other card type.
export default function SessionCardPicker({ existingTypes, onSelect, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const available = Object.entries(CARD_REGISTRY).filter(([tipo]) => !existingTypes.includes(tipo))

  return (
    <div
      className="fixed inset-0 bg-black/[.75] z-[1001] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[min(420px,92vw)] max-h-[72vh] bg-bg-card border border-border-light flex flex-col animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border-base shrink-0">
          <div className="font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary">Agregar pestaña</div>
        </div>

        <div className="overflow-y-auto flex-1">
          {available.length === 0 ? (
            <div className="px-5 py-10 text-center font-barlow text-sm text-txt-muted">
              Ya agregaste todas las pestañas disponibles.
            </div>
          ) : (
            available.map(([tipo, { label }]) => (
              <button
                key={tipo}
                type="button"
                className="w-full text-left px-5 py-3 font-barlow text-sm text-txt-primary hover:bg-bg-mid transition-colors border-b border-border-base last:border-b-0"
                onClick={() => onSelect(tipo)}
              >
                {label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
