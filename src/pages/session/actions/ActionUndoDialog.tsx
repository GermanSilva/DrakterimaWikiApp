import { useCallback, useEffect, useRef, useState } from 'react'
import { btnPrimary, btnSecondary } from '../../../constants'
import useBackdropClose from '../../../hooks/useBackdropClose'
import useDialogFocus from '../../../hooks/useDialogFocus'
import { useSessionActions, type HistoryItem, type UndoPlan } from './sessionActions'

type Phase = { name: 'loading' } | { name: 'failed'; message: string } | { name: 'ready'; plan: UndoPlan } | { name: 'saving'; plan: UndoPlan } | { name: 'conflict'; plan: UndoPlan }
  /** The character part was undone but the link state was not: final, the dialog only closes. */
  | { name: 'partial'; message: string }

/**
 * Undoes one applied action (S22, S32): plans the undo on the character as it is now and shows what is subtracted. A value that
 * changed after the action is a warning that must be confirmed ("Deshacer igual"); a conflict offers Sobrescribir (plan again
 * on the fresh data) or Cancelar.
 */
export function ActionUndoDialog({ item, onClose }: { item: HistoryItem; onClose: () => void }) {
  const api = useSessionActions()
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const [problem, setProblem] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const busy = phase.name === 'saving'
  const close = useCallback(() => {
    if (!busy) onClose()
  }, [busy, onClose])
  useDialogFocus(dialogRef)
  const backdropProps = useBackdropClose(close)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  const load = useCallback(async () => {
    setPhase({ name: 'loading' })
    try {
      setPhase({ name: 'ready', plan: await api.planUndo(item) })
    } catch (err) {
      console.error('No se pudo leer el personaje', err)
      setPhase({ name: 'failed', message: 'No se pudo leer el personaje. Cerrá y volvé a intentar.' })
    }
  }, [api, item])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const plan = phase.name === 'ready' || phase.name === 'saving' || phase.name === 'conflict' ? phase.plan : null
  const nothing = !!plan && Object.keys(plan.patch.pj).length === 0 && !plan.patch.linkState
  const warned = !!plan && plan.warnings.length > 0
  // a stored value that is not a number cannot be subtracted from: undoing the rest would lose that part for good
  const blocked = !!plan && plan.warnings.some((w) => w.kind === 'invalid_value')

  async function submit() {
    if (!plan || nothing || blocked) return
    setProblem(null)
    setPhase({ name: 'saving', plan })
    const outcome = await api.undo(item, plan)
    if (outcome.status === 'ok') return onClose()
    if (outcome.status === 'conflict') return setPhase({ name: 'conflict', plan })
    if (outcome.status === 'partial') return setPhase({ name: 'partial', message: outcome.message })
    setProblem(outcome.message)
    setPhase({ name: 'ready', plan })
  }

  return (
    <div className="fixed inset-0 bg-black/[.75] z-[1001] flex items-center justify-center" {...backdropProps}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Deshacer ${item.actionName}`}
        tabIndex={-1}
        className="w-[min(480px,94vw)] max-h-[85vh] overflow-y-auto bg-bg-card border border-border-light p-5 space-y-4 animate-fade-in outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary">Deshacer {item.actionName}</div>
          <div className="text-[12px] text-txt-muted">{item.pjName}</div>
        </div>

        {phase.name !== 'partial' && (
          <ul aria-label="Cambios" className="text-[13px] text-txt-primary space-y-1">
            {item.entry.effects
              .filter((e) => e.delta !== 0)
              .map((e) => (
                <li key={e.step}>
                  {e.label}: {e.delta > 0 ? 'se resta' : 'se suma'} {Math.abs(e.delta)}
                </li>
              ))}
          </ul>
        )}

        {phase.name === 'loading' && <p className="text-[13px] text-txt-muted">Leyendo el personaje…</p>}
        {phase.name === 'failed' && (
          <p role="alert" className="text-[13px] text-accent-bright">
            {phase.message}
          </p>
        )}
        {phase.name === 'partial' && (
          <p role="alert" className="text-[13px] text-accent-bright">
            {phase.message}
          </p>
        )}
        {warned && (
          <ul aria-label="Avisos" className="text-[12px] text-accent-bright space-y-1 list-disc pl-5">
            {plan.warnings.map((w, at) => (
              <li key={at}>{w.message}</li>
            ))}
          </ul>
        )}
        {nothing && <p className="text-[12px] text-txt-muted">No hay nada que deshacer en la ficha actual.</p>}
        {phase.name === 'conflict' && (
          <p role="alert" className="text-[13px] text-accent-bright">
            Alguien más modificó este personaje. Sobrescribir vuelve a leerlo y a calcular el deshacer con sus datos actuales.
          </p>
        )}
        {problem && (
          <p role="alert" className="text-[13px] text-accent-bright">
            {problem}
          </p>
        )}

        <div className="flex flex-wrap gap-2.5 justify-end">
          <button type="button" className={btnSecondary} disabled={busy} onClick={close}>
            {phase.name === 'partial' ? 'Cerrar' : 'Cancelar'}
          </button>
          {(phase.name === 'failed' || (phase.name === 'ready' && nothing)) && (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                api.discard(item)
                onClose()
              }}
            >
              Quitar de la lista
            </button>
          )}
          {phase.name === 'partial' || phase.name === 'failed' || (blocked && phase.name !== 'conflict') ? null : phase.name === 'conflict' ? (
            <button type="button" className={btnPrimary} onClick={() => void load()}>
              Sobrescribir
            </button>
          ) : (
            <button type="button" className={btnPrimary} disabled={!plan || nothing || busy || phase.name !== 'ready'} onClick={() => void submit()}>
              {warned ? 'Deshacer igual' : 'Deshacer'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
