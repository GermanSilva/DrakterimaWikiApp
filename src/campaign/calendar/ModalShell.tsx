import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import useBackdropClose from '../../hooks/useBackdropClose'
import useDialogFocus from '../../hooks/useDialogFocus'

/**
 * Local modal of the calendar: backdrop click (press AND release on it), Escape and a visible close
 * button dismiss it; focus moves in on open and returns to the opener on close. Only one is ever
 * mounted at a time (the day view is replaced by the form, not stacked), so Escape closes exactly one.
 */
export function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogFocus(dialogRef)
  const backdropProps = useBackdropClose(onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/[.82] z-[250] backdrop-blur-[4px] flex items-center justify-center" {...backdropProps}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-[min(760px,92vw)] max-h-[85vh] overflow-y-auto bg-bg-card border border-border-light p-6 outline-none"
      >
        <div className="flex items-center justify-between mb-5 gap-3">
          <h2 id={titleId} className="font-exo text-[16px] font-bold text-txt-primary uppercase tracking-[0.05em]">
            {title}
          </h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-txt-muted hover:text-txt-primary transition-colors cursor-pointer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
