import { useId, useRef, useState, type FormEvent } from 'react'
import { btnPrimary, inputCls, labelCls } from '../constants'
import { createCampaignErrorMessage, NAME_MAX, SLUG_MAX, validateCampaignForm, type CampaignFormErrors } from './campaignSlug'
import { useNameAndSlug } from './useNameAndSlug'

export interface CreateCampaignFormProps {
  /** Resolves with the created campaign's slug; rejects with the data-layer error. */
  onCreate: (slug: string, name: string) => Promise<string>
  /** Called with the created slug (the caller navigates). */
  onCreated: (slug: string) => void
}

export function CreateCampaignForm({ onCreate, onCreated }: CreateCampaignFormProps) {
  const nameId = useId()
  const slugId = useId()
  // Once the user edits the slug by hand it stops following the name.
  const { name, slug, changeName, changeSlug } = useNameAndSlug()
  const [errors, setErrors] = useState<CampaignFormErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // Synchronous guard: two submits before React re-renders the disabled button must create one campaign.
  const inFlight = useRef(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    const found = validateCampaignForm({ name, slug })
    setFailure(null)
    setErrors(found)
    if (found.name || found.slug) return
    inFlight.current = true
    setPending(true)
    let createdSlug: string
    try {
      createdSlug = await onCreate(slug, name.trim())
    } catch (error) {
      setFailure(createCampaignErrorMessage(error))
      inFlight.current = false
      setPending(false)
      return
    }
    // The campaign exists now: keep the guard on so a second submit cannot create a duplicate.
    onCreated(createdSlug)
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${nameId}-title`}>
      <h2 id={`${nameId}-title`} className="font-exo text-[13px] font-semibold tracking-[0.2em] uppercase text-accent-bright mb-3">
        Crear campaña
      </h2>
      <label htmlFor={nameId} className={labelCls}>
        Nombre
      </label>
      <input
        id={nameId}
        className={inputCls}
        value={name}
        maxLength={NAME_MAX}
        onChange={(e) => changeName(e.target.value)}
        aria-invalid={!!errors.name}
        aria-describedby={errors.name ? `${nameId}-err` : undefined}
      />
      {errors.name && (
        <p id={`${nameId}-err`} role="alert" className="mt-1 text-xs text-accent-bright">
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
        onChange={(e) => changeSlug(e.target.value)}
        aria-invalid={!!errors.slug}
        aria-describedby={errors.slug ? `${slugId}-err` : `${slugId}-hint`}
      />
      <p id={`${slugId}-hint`} className="mt-1 text-xs text-txt-muted">
        Se usa en el link: /c/{slug || 'mi-campania'}. Minúsculas, números y guiones.
      </p>
      {errors.slug && (
        <p id={`${slugId}-err`} role="alert" className="mt-1 text-xs text-accent-bright">
          {errors.slug}
        </p>
      )}

      <button type="submit" className={`${btnPrimary} mt-4`} disabled={pending}>
        {pending ? 'Creando…' : 'Crear campaña'}
      </button>
      {failure && (
        <p role="alert" className="mt-3 text-sm text-accent-bright">
          {failure}
        </p>
      )}
    </form>
  )
}
