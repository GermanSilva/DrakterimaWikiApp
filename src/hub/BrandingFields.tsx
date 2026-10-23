import { useId } from 'react'
import { inputCls, labelCls } from '../constants'
import { TAGLINE_MAX, type BrandingFieldsState } from './campaignBranding'

/** The optional line shown above the campaign name. */
export function TaglineField({ fields }: { fields: BrandingFieldsState }) {
  const id = useId()
  const error = fields.errors.tagline
  return (
    <>
      <label htmlFor={id} className={`${labelCls} mt-3`}>
        Pre-título (opcional)
      </label>
      <input
        id={id}
        className={inputCls}
        value={fields.tagline}
        maxLength={TAGLINE_MAX + 20}
        onChange={(e) => fields.changeTagline(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        placeholder="RPG Quester presenta"
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-accent-bright">
          {error}
        </p>
      )}
    </>
  )
}

export function AccentField({ fields }: { fields: BrandingFieldsState }) {
  const id = useId()
  return (
    <>
      <label htmlFor={id} className={`${labelCls} mt-3`}>
        Color de acento
      </label>
      <input
        id={id}
        type="color"
        value={fields.accent}
        onChange={(e) => fields.changeAccent(e.target.value)}
        className="h-9 w-16 bg-bg-mid border border-border-base cursor-pointer p-0.5"
      />
    </>
  )
}

export function LogoField({ fields }: { fields: BrandingFieldsState }) {
  const id = useId()
  const error = fields.errors.logo
  return (
    <>
      <label htmlFor={id} className={`${labelCls} mt-3`}>
        URL del logo (opcional)
      </label>
      <input
        id={id}
        className={inputCls}
        value={fields.logo}
        autoCapitalize="none"
        spellCheck={false}
        onChange={(e) => fields.changeLogo(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : `${id}-hint`}
        placeholder="https://"
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-txt-muted">
        Una imagen pública con dirección https://. Si la dejás vacía se usa el ícono de RPG Quester.
      </p>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-accent-bright">
          {error}
        </p>
      )}
    </>
  )
}
