import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { inputCls } from '../../../constants'
import type { Campaign } from '../../../data'
import { accentStyle, parseAccentColor, parseLogoUrl } from '../../branding'
import { campaignFormInput, validateCampaignForm, LOGO_MAX, TAGLINE_MAX, type CampaignFormErrors, type CampaignFormInput } from './campaignForm'
import { countChanges } from './tabSave/dirty'
import { BlockSaveError } from './tabSave/tabSaveContext'
import { useTabSaveBlock } from './tabSave/useTabSaveBlock'
import { useCampaignSave, type Notice } from './useCampaignSave'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'
const FALLBACK_ACCENT = '#dc2626'

function Field({ id, label, hint, error, wide, children }: { id: string; label: string; hint?: string; error?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
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
    <div role="group" aria-label="Vista previa" style={accentStyle({ accent_color: accent })} className="md:col-span-2 bg-bg-mid border border-border-base px-4 py-3 flex flex-col gap-2">
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

/** `onSave` returns the field errors of a rejected draft, or throws a `BlockSaveError` (after showing its notice) when the write fails. */
function CampaignForm({ campaign, notice, onSave }: { campaign: Campaign; notice: Notice | null; onSave: (input: CampaignFormInput) => Promise<CampaignFormErrors | null> }) {
  const initial = useMemo(() => campaignFormInput(campaign), [campaign])
  const [values, setValues] = useState<CampaignFormInput>(initial)
  const [errors, setErrors] = useState<CampaignFormErrors>({})
  const set = (key: keyof CampaignFormInput) => (value: string) => setValues((v) => ({ ...v, [key]: value }))

  useTabSaveBlock({
    key: 'identidad',
    label: 'Identidad y marca',
    order: 10,
    dirtyCount: countChanges(initial, values),
    async save() {
      const found = await onSave(values)
      setErrors(found ?? {})
      if (found) throw new BlockSaveError('Revisá los campos marcados.')
    },
    discard() {
      setValues(initial)
      setErrors({})
    },
  })

  // The tab's save bar saves; Enter in a field must not submit anything by itself.
  const submit = (e: FormEvent) => e.preventDefault()

  const described = (id: string, hasHint: boolean, error?: string) => [hasHint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  const colorPickerValue = parseAccentColor(values.accentColor.trim()) ?? parseAccentColor(campaign.branding?.accent_color) ?? FALLBACK_ACCENT

  return (
    <form noValidate onSubmit={submit} aria-label="Datos de la campaña" className="bg-bg-card border border-border-base px-5 py-4 grid grid-cols-1 md:grid-cols-2 items-start gap-4">
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

      <Field id="campaign-tagline" label="Pre-título (opcional)" hint={`Hasta ${TAGLINE_MAX} caracteres. Se muestra sobre el nombre en la barra superior.`} error={errors.tagline}>
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

      <Field id="campaign-logo" label="Logo (URL https, opcional)" hint={`Hasta ${LOGO_MAX} caracteres. Dejalo vacío para usar el ícono de RPG Quester.`} error={errors.logoUrl}>
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

      <Field id="campaign-banner" label="Banner (URL https, opcional)" hint={`Hasta ${LOGO_MAX} caracteres. Imagen de fondo del encabezado del panel.`} error={errors.bannerUrl}>
        <input
          id="campaign-banner"
          type="url"
          inputMode="url"
          value={values.bannerUrl}
          onChange={(e) => set('bannerUrl')(e.target.value)}
          aria-invalid={errors.bannerUrl ? true : undefined}
          aria-describedby={described('campaign-banner', true, errors.bannerUrl)}
          className={inputCls}
        />
      </Field>

      <Field id="campaign-accent" wide label="Color de acento (opcional)" hint="Formato #rrggbb. Dejalo vacío para usar el color por defecto." error={errors.accentColor}>
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
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`md:col-span-2 text-[13px] ${notice.kind === 'error' ? 'text-red-400' : 'text-accent-bright'}`}>
          {notice.text}
        </p>
      )}
    </form>
  )
}

/**
 * Name, logo, accent colour and tagline of the campaign (DM only). The slug is shown but locked. The tab's save bar writes
 * through `campaigns.updateCampaign` against the version the form was built from, then reloads the campaign context
 * so the header, logo and accent refresh without a page reload. The draft survives a save of another block of the
 * campaign row (the regions): the form is rebuilt only when the values it edits change in the stored campaign.
 */
export function CampaignSettings() {
  const { campaign, notice, setNotice, saves, save } = useCampaignSave()

  async function onSave(input: CampaignFormInput): Promise<CampaignFormErrors | null> {
    setNotice(null)
    const result = validateCampaignForm(input)
    if (!result.ok) {
      setNotice({ kind: 'error', text: 'Revisá los campos marcados.' })
      return result.errors
    }
    await save({ name: result.values.name, branding: result.values.branding }, 'Campaña guardada.', 'No se pudo guardar la campaña. Intentá de nuevo.')
    return null
  }

  return <CampaignForm key={`${saves}:${JSON.stringify(campaignFormInput(campaign))}`} campaign={campaign} notice={notice} onSave={onSave} />
}
