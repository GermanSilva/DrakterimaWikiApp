import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { btnPrimary, btnSecondary, inputCls, labelCls } from '../../../constants'
import { ModalShell } from '../../calendar/ModalShell'
import { describeDataError } from '../../entities/errorMessages'

export const SYSTEM_NAME_MAX = 120

export interface SystemNameDialogProps {
  title: string
  initial?: string
  /** What to say when the failure is not one the system messages know. */
  fallback: string
  /** Resolves when the name was stored; rejects with the data-layer error (the dialog stays open and shows it). */
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
}

/** Asks for the name of a system (a homebrew being saved, a template being renamed, an origin being created). */
export function SystemNameDialog({ title, initial = '', fallback, onSubmit, onClose }: SystemNameDialogProps) {
  const nameId = useId()
  const [name, setName] = useState(initial)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    const trimmed = name.trim()
    if (trimmed === '' || trimmed.length > SYSTEM_NAME_MAX) {
      setFailure(`Ingresá un nombre (hasta ${SYSTEM_NAME_MAX} caracteres).`)
      return
    }
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      await onSubmit(trimmed)
      if (mounted.current) onClose()
    } catch (error) {
      if (!mounted.current) return
      setFailure(describeDataError(error, fallback))
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <ModalShell title={title} onClose={pending ? () => undefined : onClose}>
      <form onSubmit={submit} noValidate>
        <label htmlFor={nameId} className={labelCls}>
          Nombre
        </label>
        <input id={nameId} className={inputCls} value={name} maxLength={SYSTEM_NAME_MAX * 2} onChange={(e) => setName(e.target.value)} aria-invalid={failure ? true : undefined} />
        {failure && (
          <p role="alert" className="mt-3 text-[13px] text-red-400">
            {failure}
          </p>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary} disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
