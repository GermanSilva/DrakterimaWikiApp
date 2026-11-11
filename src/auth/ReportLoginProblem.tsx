import { useEffect, useId, useRef, useState } from 'react'
import { btnPrimary, btnSecondary, inputCls, labelCls } from '../constants'
import type { LoginFailureKind, LoginFailureReportInput, LoginFailureReportResult } from '../data'

export const REPORT_MESSAGE_MAX = 1000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ERROR_TEXT: Record<Exclude<LoginFailureReportResult, 'ok'>, string> = {
  rate_limited: 'Ya recibimos varios reportes recientes. Probá de nuevo más tarde.',
  invalid_input: 'Revisá el email: no parece válido.',
  unavailable: 'No pudimos enviar el reporte. Probá de nuevo en unos minutos.',
}

export interface ReportLoginProblemProps {
  kind: LoginFailureKind
  /** AuthFlowError kind of the failed Google attempt, when there is one. */
  errorKind?: string
  onReport: (input: LoginFailureReportInput) => Promise<LoginFailureReportResult>
}

type Status = 'idle' | 'sending' | 'sent' | Exclude<LoginFailureReportResult, 'ok'>

/** Presentational: inline "report the problem" form of the login card. Works signed out. */
export function ReportLoginProblem({ kind, errorKind, onReport }: ReportLoginProblemProps) {
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const sending = status === 'sending'

  useEffect(() => {
    if (open) messageRef.current?.focus()
  }, [open])

  if (status === 'sent') {
    return (
      <p role="status" className="mt-4 border border-border-light px-3.5 py-3 text-[13px] leading-normal">
        Gracias. Ya le avisamos al administrador y lo va a revisar.
      </p>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    const email = contact.trim()
    if (email && !EMAIL_RE.test(email)) {
      setStatus('invalid_input')
      return
    }
    const text = message.trim()
    // Honeypot: humans never see it, bots that fill every field do; its live value goes to the server,
    // which accepts but silently drops the report when it is not empty.
    const website = String(new FormData(e.currentTarget as HTMLFormElement).get('website') ?? '')
    const input: LoginFailureReportInput = { kind, website }
    if (errorKind) input.errorKind = errorKind
    if (text) input.message = text
    if (email) input.contact = email
    // Pathname only: the query may carry an invite code (?next=/invite/…).
    const path = window.location.pathname
    if (path.startsWith('/')) input.path = path
    setStatus('sending')
    let result: LoginFailureReportResult
    try {
      result = await onReport(input)
    } catch {
      result = 'unavailable'
    }
    setStatus(result === 'ok' ? 'sent' : result)
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => setOpen((o) => !o)}
        className="font-exo text-xs underline underline-offset-4 text-txt-secondary hover:text-txt-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-txt-primary"
      >
        Reportar el problema
      </button>
      {open && (
        <form id={formId} onSubmit={submit} noValidate className="mt-3 grid gap-3">
          <div>
            <label htmlFor={`${formId}-message`} className={labelCls}>
              ¿Qué pasó? (opcional)
            </label>
            <textarea
              id={`${formId}-message`}
              ref={messageRef}
              value={message}
              maxLength={REPORT_MESSAGE_MAX}
              rows={4}
              onChange={(e) => setMessage(e.target.value)}
              className={`${inputCls} focus-visible:outline focus-visible:outline-2 focus-visible:outline-txt-primary`}
            />
            <p className="mt-1 text-[11px] text-txt-muted">{REPORT_MESSAGE_MAX - message.length} caracteres restantes</p>
          </div>
          <div>
            <label htmlFor={`${formId}-contact`} className={labelCls}>
              Tu email para avisarte (opcional)
            </label>
            <input
              id={`${formId}-contact`}
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className={`${inputCls} focus-visible:outline focus-visible:outline-2 focus-visible:outline-txt-primary`}
            />
          </div>
          {/* Honeypot: invisible to people and assistive tech; bots that fill every field get dropped by the server. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <input type="text" name="website" aria-hidden="true" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
          {status !== 'idle' && status !== 'sending' && (
            <p role="alert" className="border border-accent-dim bg-accent-subtle px-3.5 py-3 text-[13px] leading-normal">
              {ERROR_TEXT[status]}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={sending} className={`${btnPrimary} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-txt-primary disabled:cursor-progress disabled:opacity-70`}>
              {sending ? 'Enviando…' : 'Enviar reporte'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={`${btnSecondary} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-txt-primary`}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
