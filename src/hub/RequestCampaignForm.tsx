import { useId, useRef, useState, type FormEvent } from 'react'
import { btnPrimary, inputCls, labelCls } from '../constants'
import {
  campaignRequestErrorMessage,
  NAME_MAX,
  REQUEST_MESSAGE_MAX,
  SLUG_MAX,
  validateCampaignForm,
  type CampaignFormErrors,
} from './campaignSlug'
import { useNameAndSlug } from './useNameAndSlug'

export interface RequestCampaignFormProps {
  /** Resolves when the request was stored; rejects with the data-layer error. */
  onRequest: (request: { name: string; slug_wanted: string | null; message: string | null }) => Promise<void>
}

/** Ordinary users ask the hub owner for a campaign: name, preferred address (optional) and a note. */
export function RequestCampaignForm({ onRequest }: RequestCampaignFormProps) {
  const nameId = useId()
  const slugId = useId()
  const messageId = useId()
  const fields = useNameAndSlug()
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<CampaignFormErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  // Synchronous guard: two submits before React re-renders the disabled button must send one request.
  const inFlight = useRef(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    const slug = fields.slug.trim()
    const found = validateCampaignForm({ name: fields.name, slug })
    // The address is optional in a request: the owner can choose it when approving.
    if (slug === '') delete found.slug
    setFailure(null)
    setSent(false)
    setErrors(found)
    if (found.name || found.slug) return
    inFlight.current = true
    setPending(true)
    try {
      await onRequest({ name: fields.name.trim(), slug_wanted: slug === '' ? null : slug, message: message.trim() === '' ? null : message.trim() })
    } catch (error) {
      setFailure(campaignRequestErrorMessage(error, 'request'))
      inFlight.current = false
      setPending(false)
      return
    }
    fields.reset()
    setMessage('')
    setSent(true)
    inFlight.current = false
    setPending(false)
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Solicitar campaña">
      <p className="text-xs text-txt-muted mb-3">
        El administrador del sitio revisa cada solicitud. Si la aprueba, la campaña se crea y vos sos su DM. No te llega ningún mail: mirá el estado en «Mis solicitudes».
      </p>
      <label htmlFor={nameId} className={labelCls}>
        Nombre
      </label>
      <input
        id={nameId}
        className={inputCls}
        value={fields.name}
        maxLength={NAME_MAX}
        onChange={(e) => fields.changeName(e.target.value)}
        aria-invalid={!!errors.name}
        aria-describedby={errors.name ? `${nameId}-err` : undefined}
      />
      {errors.name && (
        <p id={`${nameId}-err`} role="alert" className="mt-1 text-xs text-accent-bright">
          {errors.name}
        </p>
      )}

      <label htmlFor={slugId} className={`${labelCls} mt-3`}>
        Dirección preferida (opcional)
      </label>
      <input
        id={slugId}
        className={inputCls}
        value={fields.slug}
        maxLength={SLUG_MAX}
        autoCapitalize="none"
        spellCheck={false}
        onChange={(e) => fields.changeSlug(e.target.value)}
        aria-invalid={!!errors.slug}
        aria-describedby={errors.slug ? `${slugId}-err` : `${slugId}-hint`}
      />
      <p id={`${slugId}-hint`} className="mt-1 text-xs text-txt-muted">
        Se usa en el link: /c/{fields.slug || 'mi-campania'}. El administrador puede cambiarla.
      </p>
      {errors.slug && (
        <p id={`${slugId}-err`} role="alert" className="mt-1 text-xs text-accent-bright">
          {errors.slug}
        </p>
      )}

      <label htmlFor={messageId} className={`${labelCls} mt-3`}>
        Mensaje (opcional)
      </label>
      <textarea
        id={messageId}
        className={`${inputCls} min-h-[72px]`}
        value={message}
        maxLength={REQUEST_MESSAGE_MAX}
        onChange={(e) => setMessage(e.target.value)}
      />

      <button type="submit" className={`${btnPrimary} mt-4`} disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar solicitud'}
      </button>
      {sent && (
        <p role="status" className="mt-3 text-sm text-txt-secondary">
          Solicitud enviada. Queda pendiente hasta que el administrador la resuelva.
        </p>
      )}
      {failure && (
        <p role="alert" className="mt-3 text-sm text-accent-bright">
          {failure}
        </p>
      )}
    </form>
  )
}
