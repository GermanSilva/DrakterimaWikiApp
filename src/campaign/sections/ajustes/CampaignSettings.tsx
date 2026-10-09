import { useState, type FormEvent, type ReactNode } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { ConflictError, type Campaign } from '../../../data'
import { accentStyle, parseAccentColor, parseLogoUrl } from '../../branding'
import { useCampaign } from '../../CampaignContext'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { describeDataError } from '../../entities/errorMessages'
import { freshestCampaign, useSavedCampaign } from './savedCampaignContext'
import { campaignFormInput, validateCampaignForm, LOGO_MAX, TAGLINE_MAX, type CampaignFormErrors, type CampaignFormInput } from './campaignForm'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'
const FALLBACK_ACCENT = '#dc2626'

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-txt-muted mt-1">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-red-400 mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

/** What the header and the accent will look like with the values currently typed (only valid values apply). */
function Preview({ values }: { values: CampaignFormInput }) {
  const accent = parseAccentColor(values.accentColor.trim())
  const logo = parseLogoUrl(values.logoUrl.trim())
  const name = values.name.trim()
  const tagline = values.tagline.trim()
  return (
    <div role="group" aria-label="Vista previa" style={accentStyle({ accent_color: accent })} className="bg-bg-mid border border-border-base px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        {logo && <img src={logo} alt="" referrerPolicy="no-referrer" className="w-7 h-7 object-contain shrink-0" />}
        <span className="font-exo text-[17px] font-bold text-accent-bright tracking-[0.08em] uppercase truncate">{name || 'Nombre de la campaña'}</span>
      </div>
      {tagline && <p className="text-[13px] text-txt-secondary">{tagline}</p>}
      <div>
        <span data-testid="accent-swatch" className="inline-block px-3 py-1 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase bg-accent text-white">
          Color de acento
        </span>
      </div>
    </div>
  )
}

function CampaignForm({ campaign, notice, onSave }: { campaign: Campaign; notice: Notice | null; onSave: (input: CampaignFormInput) => Promise<CampaignFormErrors | null> }) {
  const [values, setValues] = useState<CampaignFormInput>(() => campaignFormInput(campaign))
  const [errors, setErrors] = useState<CampaignFormErrors>({})
  const [saving, setSaving] = useState(false)
  const set = (key: keyof CampaignFormInput) => (value: string) => setValues((v) => ({ ...v, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      setErrors((await onSave(values)) ?? {})
    } finally {
      setSaving(false)
    }
  }

  const described = (id: string, hasHint: boolean, error?: string) => [hasHint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  const colorPickerValue = parseAccentColor(values.accentColor.trim()) ?? parseAccentColor(campaign.branding?.accent_color) ?? FALLBACK_ACCENT

  return (
    <form noValidate onSubmit={submit} aria-label="Datos de la campaña" className="bg-bg-card border border-border-base px-5 py-4 flex flex-col gap-4">
      <Field id="campaign-slug" label="Identificador (slug)" hint="Es parte de la dirección de la campaña y no se puede cambiar.">
        <input id="campaign-slug" type="text" readOnly aria-readonly="true" aria-describedby="campaign-slug-hint" value={campaign.slug} className={inputCls + ' opacity-70 cursor-not-allowed'} />
      </Field>

      <Field id="campaign-name" label="Nombre" error={errors.name}>
        <input
          id="campaign-name"
          type="text"
          value={values.name}
          onChange={(e) => set('name')(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={described('campaign-name', false, errors.name)}
          className={inputCls}
        />
      </Field>

      <Field id="campaign-tagline" label="Lema (opcional)" hint={`Hasta ${TAGLINE_MAX} caracteres. Se muestra en el panel de la campaña.`} error={errors.tagline}>
        <input
          id="campaign-tagline"
          type="text"
          value={values.tagline}
          onChange={(e) => set('tagline')(e.target.value)}
          aria-invalid={errors.tagline ? true : undefined}
          aria-describedby={described('campaign-tagline', true, errors.tagline)}
          className={inputCls}
        />
      </Field>

      <Field id="campaign-logo" label="Logo (URL https, opcional)" hint={`Hasta ${LOGO_MAX} caracteres. Dejalo vacío para usar el dragón por defecto.`} error={errors.logoUrl}>
        <input
          id="campaign-logo"
          type="url"
          inputMode="url"
          value={values.logoUrl}
          onChange={(e) => set('logoUrl')(e.target.value)}
          aria-invalid={errors.logoUrl ? true : undefined}
          aria-describedby={described('campaign-logo', true, errors.logoUrl)}
          className={inputCls}
        />
      </Field>

      <Field id="campaign-accent" label="Color de acento (opcional)" hint="Formato #rrggbb. Dejalo vacío para usar el color por defecto." error={errors.accentColor}>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Elegir color de acento"
            value={colorPickerValue}
            onChange={(e) => set('accentColor')(e.target.value)}
            className="h-9 w-12 p-0 bg-transparent border border-border-base cursor-pointer"
          />
          <input
            id="campaign-accent"
            type="text"
            value={values.accentColor}
            onChange={(e) => set('accentColor')(e.target.value)}
            placeholder="#dc2626"
            aria-invalid={errors.accentColor ? true : undefined}
            aria-describedby={described('campaign-accent', true, errors.accentColor)}
            className={inputCls + ' !w-32'}
          />
        </div>
      </Field>

      <Preview values={values} />

      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
      <div>
        <button type="submit" className={btnSecondary} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar campaña'}
        </button>
      </div>
    </form>
  )
}

/**
 * Name, logo, accent colour and tagline of the campaign (DM only). The slug is shown but locked. A save writes
 * through `campaigns.updateCampaign` against the version the form was built from, then reloads the campaign context
 * so the header, logo and accent refresh without a page reload.
 */
export function CampaignSettings() {
  const { layer, campaignId } = useCampaignServices()
  const { campaign: loaded, reload } = useCampaign()
  // The freshest row any Ajustes section saved (shared), so a save elsewhere is this form's base version.
  const { saved, setSaved } = useSavedCampaign()
  const [notice, setNotice] = useState<Notice | null>(null)
  const campaign = freshestCampaign(loaded, saved)

  async function save(input: CampaignFormInput): Promise<CampaignFormErrors | null> {
    setNotice(null)
    const result = validateCampaignForm(input)
    if (!result.ok) {
      setNotice({ kind: 'error', text: 'Revisá los campos marcados.' })
      return result.errors
    }
    try {
      const row = await layer.campaigns.updateCampaign(campaignId, { name: result.values.name, branding: result.values.branding }, campaign.updated_at)
      setSaved({ row, over: loaded })
      setNotice({ kind: 'ok', text: 'Campaña guardada.' })
      reload()
    } catch (e) {
      if (e instanceof ConflictError) {
        setSaved(null)
        setNotice({ kind: 'error', text: 'La campaña cambió mientras la editabas. Cargamos los valores actuales: revisalos y guardá de nuevo.' })
        reload()
      } else {
        setNotice({ kind: 'error', text: describeDataError(e, 'No se pudo guardar la campaña. Intentá de nuevo.') })
      }
    }
    return null
  }

  return <CampaignForm key={campaign.updated_at} campaign={campaign} notice={notice} onSave={save} />
}
