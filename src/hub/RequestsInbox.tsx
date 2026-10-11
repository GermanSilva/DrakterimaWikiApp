import { useId, useRef, useState, type FormEvent } from 'react'
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from '../constants'
import { ModalShell } from '../campaign/calendar/ModalShell'
import type { CampaignRequestWithRequester } from '../data'
import {
  campaignRequestErrorMessage,
  DECISION_NOTE_MAX,
  NAME_MAX,
  SLUG_MAX,
  suggestSlug,
  validateCampaignForm,
  type CampaignFormErrors,
} from './campaignSlug'

export interface RequestsInboxProps {
  /** Pending requests only. */
  requests: CampaignRequestWithRequester[]
  /** Resolves with the new campaign's slug. */
  onApprove: (requestId: number, overrides: { slug: string; name: string }) => Promise<string>
  onReject: (requestId: number, note?: string) => Promise<void>
  /** Called after a decision, and when the server says the request was no longer pending, so the lists reload. */
  onChanged: () => void
}

type Dialog = { kind: 'approve' | 'reject'; request: CampaignRequestWithRequester } | null

const requesterName = (r: CampaignRequestWithRequester) => r.requester?.display_name?.trim() || 'Usuario sin nombre'

/** The hub owner's inbox: pending campaign requests with Approve (editable address and name) and Reject (optional note). */
export function RequestsInbox({ requests, onApprove, onReject, onChanged }: RequestsInboxProps) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <section aria-labelledby="requests-inbox-title" className="mt-10 pt-6 border-t border-border-base">
      <h2 id="requests-inbox-title" className="flex items-center gap-2 font-exo text-[13px] font-semibold tracking-[0.2em] uppercase text-accent-bright mb-3">
        Solicitudes pendientes
        <span aria-label={`${requests.length} pendientes`} className="bg-accent text-white text-[10px] px-2 py-0.5 tracking-normal">
          {requests.length}
        </span>
      </h2>
      {notice && (
        <p role="status" className="mb-3 text-sm text-txt-secondary">
          {notice}
        </p>
      )}
      {requests.length === 0 ? (
        <p className="text-sm text-txt-muted">No hay solicitudes pendientes.</p>
      ) : (
        <ul className="grid gap-3">
          {requests.map((request) => (
            <li key={request.id} className="bg-bg-card border border-border-base p-4">
              <p className="font-exo text-sm font-semibold tracking-[0.08em] uppercase text-txt-primary">{request.name}</p>
              <p className="text-xs text-txt-muted mt-1">
                Pide: {requesterName(request)} · {request.slug_wanted ? `/${request.slug_wanted}` : 'sin dirección preferida'} ·{' '}
                {new Date(request.created_at).toLocaleDateString('es-AR')}
              </p>
              {request.message && <p className="text-sm text-txt-secondary mt-2 whitespace-pre-wrap">{request.message}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" className={btnPrimary} onClick={() => setDialog({ kind: 'approve', request })}>
                  Aprobar
                </button>
                <button type="button" className={btnDanger} onClick={() => setDialog({ kind: 'reject', request })}>
                  Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'approve' && (
        <ApproveDialog
          request={dialog.request}
          onApprove={onApprove}
          onClose={() => setDialog(null)}
          onDone={(slug) => {
            setDialog(null)
            setNotice(`Campaña /${slug} creada. ${requesterName(dialog.request)} es su DM.`)
            onChanged()
          }}
          onStale={onChanged}
        />
      )}
      {dialog?.kind === 'reject' && (
        <RejectDialog
          request={dialog.request}
          onReject={onReject}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            setNotice('Solicitud rechazada.')
            onChanged()
          }}
          onStale={onChanged}
        />
      )}
    </section>
  )
}

function ApproveDialog({
  request,
  onApprove,
  onClose,
  onDone,
  onStale,
}: {
  request: CampaignRequestWithRequester
  onApprove: RequestsInboxProps['onApprove']
  onClose: () => void
  onDone: (slug: string) => void
  onStale: () => void
}) {
  const nameId = useId()
  const slugId = useId()
  const [name, setName] = useState(request.name)
  const [slug, setSlug] = useState(request.slug_wanted ?? suggestSlug(request.name))
  const [errors, setErrors] = useState<CampaignFormErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    const found = validateCampaignForm({ name, slug })
    setErrors(found)
    setFailure(null)
    if (found.name || found.slug) return
    inFlight.current = true
    setPending(true)
    try {
      const created = await onApprove(request.id, { slug, name: name.trim() })
      onDone(created)
    } catch (error) {
      setFailure(campaignRequestErrorMessage(error, 'approve'))
      if ((error as { reason?: string }).reason === 'request_not_pending' || (error as { reason?: string }).reason === 'request_not_found') onStale()
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <ModalShell title="Aprobar solicitud" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="text-sm text-txt-secondary mb-4">
          Se crea la campaña y {requesterName(request)} queda como su DM.
        </p>
        <label htmlFor={nameId} className={labelCls}>
          Nombre
        </label>
        <input id={nameId} className={inputCls} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
        {errors.name && (
          <p role="alert" className="mt-1 text-xs text-accent-bright">
            {errors.name}
          </p>
        )}
        <label htmlFor={slugId} className={`${labelCls} mt-3`}>
          Dirección
        </label>
        <input
          id={slugId}
          className={inputCls}
          value={slug}
          maxLength={SLUG_MAX}
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => setSlug(e.target.value)}
          aria-invalid={!!errors.slug}
        />
        {errors.slug && (
          <p role="alert" className="mt-1 text-xs text-accent-bright">
            {errors.slug}
          </p>
        )}
        {failure && (
          <p role="alert" className="mt-3 text-sm text-accent-bright">
            {failure}
          </p>
        )}
        <div className="flex gap-2 mt-5">
          <button type="submit" className={btnPrimary} disabled={pending}>
            {pending ? 'Creando…' : 'Aprobar y crear'}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={pending}>
            Cancelar
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function RejectDialog({
  request,
  onReject,
  onClose,
  onDone,
  onStale,
}: {
  request: CampaignRequestWithRequester
  onReject: RequestsInboxProps['onReject']
  onClose: () => void
  onDone: () => void
  onStale: () => void
}) {
  const noteId = useId()
  const [note, setNote] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      await onReject(request.id, note.trim() === '' ? undefined : note.trim())
      onDone()
    } catch (error) {
      setFailure(campaignRequestErrorMessage(error, 'reject'))
      if ((error as { reason?: string }).reason === 'request_not_pending' || (error as { reason?: string }).reason === 'request_not_found') onStale()
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <ModalShell title="Rechazar solicitud" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="text-sm text-txt-secondary mb-4">
          «{request.name}» de {requesterName(request)}. La persona verá el rechazo y tu nota en «Mis solicitudes».
        </p>
        <label htmlFor={noteId} className={labelCls}>
          Nota (opcional)
        </label>
        <textarea id={noteId} className={`${inputCls} min-h-[72px]`} value={note} maxLength={DECISION_NOTE_MAX} onChange={(e) => setNote(e.target.value)} />
        {failure && (
          <p role="alert" className="mt-3 text-sm text-accent-bright">
            {failure}
          </p>
        )}
        <div className="flex gap-2 mt-5">
          <button type="submit" className={btnDanger} disabled={pending}>
            {pending ? 'Rechazando…' : 'Rechazar solicitud'}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={pending}>
            Cancelar
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
