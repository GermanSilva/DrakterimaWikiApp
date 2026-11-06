import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { btnPrimary, btnSecondary, inputCls, labelCls } from '../../../constants'
import type { LinkedAction } from '../../../data'
import type { ParamStep } from '../../../campaign/system/actions/function/model'
import type { ParamValue } from '../../../campaign/system/actions/function/run'
import useBackdropClose from '../../../hooks/useBackdropClose'
import useDialogFocus from '../../../hooks/useDialogFocus'
import { useSessionActions, type ActionSource } from './sessionActions'

type Phase =
  | { name: 'loading' }
  | { name: 'failed'; message: string }
  | { name: 'ready'; source: ActionSource }
  | { name: 'saving'; source: ActionSource }
  | { name: 'conflict'; source: ActionSource }
  /** The character was written but the link state was not: final, the dialog only closes. */
  | { name: 'partial'; message: string }
type Inputs = Record<string, string | boolean>

/** What the DM typed, as the parameters of the run; `complete` is false while a number or an option is still unanswered. */
function paramsOf(steps: ParamStep[], inputs: Inputs): { params: Record<string, ParamValue>; complete: boolean } {
  const params: Record<string, ParamValue> = {}
  let complete = true
  for (const step of steps) {
    const raw = inputs[step.key]
    if (step.input.type === 'checkbox') params[step.key] = raw === true
    else if (typeof raw !== 'string' || raw.trim() === '') complete = false
    else if (step.input.type === 'number') params[step.key] = Number(raw)
    else params[step.key] = step.input.options[Number(raw)].value
  }
  return { params, complete }
}

interface Props {
  pj: { id: number; nombre: string }
  linked: LinkedAction
  onClose: () => void
}

/**
 * Runs the function of one linked action for the DM (S22): asks the parameters in step order, previews what changes
 * (before -> after, warnings), and writes only after an explicit Aplicar, or Forzar when a resource is exhausted. The character
 * is READ when the dialog opens; a conflict offers Sobrescribir (read again, run again, preview again) or Cancelar.
 */
export function ActionRunDialog({ pj, linked, onClose }: Props) {
  const api = useSessionActions()
  const { action } = linked
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const [inputs, setInputs] = useState<Inputs>({})
  const [problem, setProblem] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const busy = phase.name === 'saving'
  // a read (the api may change identity mid-session) must never move the dialog while it saves, nor after a partial save
  const partialRef = useRef(false)
  const savingRef = useRef(false)
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

  const parsed = useMemo(() => api.parse(action), [api, action])
  const steps = useMemo(() => (parsed.ok ? parsed.fn.steps.filter((s): s is ParamStep => s.kind === 'param') : []), [parsed])

  const load = useCallback(async () => {
    if (partialRef.current || savingRef.current) return
    setPhase({ name: 'loading' })
    try {
      const fresh = await api.read(pj.id, action.id)
      if (!partialRef.current && !savingRef.current) setPhase({ name: 'ready', source: fresh })
    } catch (err) {
      console.error('No se pudo leer el personaje', err)
      if (!partialRef.current && !savingRef.current) setPhase({ name: 'failed', message: 'No se pudo leer el personaje ni su acción. Cerrá y volvé a intentar.' })
    }
  }, [api, pj.id, action.id])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const source = phase.name === 'ready' || phase.name === 'saving' || phase.name === 'conflict' ? phase.source : null
  const { params, complete } = useMemo(() => paramsOf(steps, inputs), [steps, inputs])
  const result = useMemo(() => (parsed.ok && source && complete ? api.run(parsed.fn, source, params) : null), [api, parsed, source, complete, params])
  const exhausted = !!result?.warnings.some((w) => w.kind === 'exhausted')
  const blocked = !result || result.applied.length === 0 || result.warnings.some((w) => w.kind !== 'exhausted')

  async function submit() {
    if (!source || !result || blocked) return
    setProblem(null)
    setPhase({ name: 'saving', source })
    savingRef.current = true
    const outcome = await api.apply(source, result).finally(() => {
      savingRef.current = false
    })
    if (outcome.status === 'ok') return onClose()
    if (outcome.status === 'conflict') return setPhase({ name: 'conflict', source })
    if (outcome.status === 'partial') {
      partialRef.current = true
      return setPhase({ name: 'partial', message: outcome.message })
    }
    setProblem(outcome.message)
    setPhase({ name: 'ready', source })
  }

  const setInput = (key: string, value: string | boolean) => setInputs((prev) => ({ ...prev, [key]: value }))
  const text = (key: string) => (typeof inputs[key] === 'string' ? (inputs[key] as string) : '')

  return (
    <div className="fixed inset-0 bg-black/[.75] z-[1001] flex items-center justify-center" {...backdropProps}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Usar ${action.name}`}
        tabIndex={-1}
        className="w-[min(480px,94vw)] max-h-[85vh] overflow-y-auto bg-bg-card border border-border-light p-5 space-y-4 animate-fade-in outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div id={titleId}>
          <div className="font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary">{action.name}</div>
          <div className="text-[12px] text-txt-muted">{pj.nombre}</div>
        </div>

        {!parsed.ok && (
          <p role="alert" className="text-[13px] text-accent-bright">
            La función de esta acción no es válida: {parsed.errors.join(' ')} Corregila en el catálogo de Acciones.
          </p>
        )}
        {phase.name === 'loading' && <p className="text-[13px] text-txt-muted">Leyendo el personaje…</p>}
        {phase.name === 'failed' && (
          <p role="alert" className="text-[13px] text-accent-bright">
            {phase.message}
          </p>
        )}

        {parsed.ok && source && (
          <>
            {steps.map((step) =>
              step.input.type === 'checkbox' ? (
                <label key={step.key} className="flex items-center gap-2 text-[13px] text-txt-primary">
                  <input type="checkbox" checked={inputs[step.key] === true} onChange={(e) => setInput(step.key, e.target.checked)} />
                  {step.label}
                </label>
              ) : (
                <label key={step.key} className="block">
                  <span className={labelCls}>{step.label}</span>
                  {step.input.type === 'number' ? (
                    <input type="number" className={inputCls} value={text(step.key)} onChange={(e) => setInput(step.key, e.target.value)} />
                  ) : (
                    <select className={inputCls} value={text(step.key)} onChange={(e) => setInput(step.key, e.target.value)}>
                      <option value="">Elegí una opción…</option>
                      {step.input.options.map((option, at) => (
                        <option key={at} value={String(at)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              ),
            )}
            {!complete && <p className="text-[12px] text-txt-muted">Completá los parámetros para ver los cambios.</p>}
            {result && result.applied.length > 0 && (
              <ul aria-label="Cambios" className="text-[13px] text-txt-primary space-y-1">
                {result.applied.map((a) => (
                  <li key={a.step}>
                    {a.label}: {a.before} → {a.after}
                  </li>
                ))}
              </ul>
            )}
            {result && result.warnings.length > 0 && (
              <ul aria-label="Avisos" className="text-[12px] text-accent-bright space-y-1 list-disc pl-5">
                {result.warnings.map((w, at) => (
                  <li key={at}>{w.message}</li>
                ))}
              </ul>
            )}
          </>
        )}

        {phase.name === 'partial' && (
          <p role="alert" className="text-[13px] text-accent-bright">
            {phase.message}
          </p>
        )}
        {phase.name === 'conflict' && (
          <p role="alert" className="text-[13px] text-accent-bright">
            Alguien más modificó este personaje. Sobrescribir vuelve a leerlo y a calcular la acción con sus datos actuales.
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
          {phase.name === 'partial' ? null : phase.name === 'conflict' ? (
            <button type="button" className={btnPrimary} onClick={() => void load()}>
              Sobrescribir
            </button>
          ) : (
            parsed.ok && (
              <button type="button" className={btnPrimary} disabled={blocked || busy || phase.name !== 'ready'} onClick={() => void submit()}>
                {exhausted ? 'Forzar' : 'Aplicar'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
