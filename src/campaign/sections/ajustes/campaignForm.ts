import { parseAccentColor, parseLogoUrl } from '../../branding'

export const NAME_MAX = 120
export const TAGLINE_MAX = 140
export const LOGO_MAX = 500

export interface CampaignFormInput {
  name: string
  logoUrl: string
  accentColor: string
  tagline: string
}

export interface CampaignFormErrors {
  name?: string
  logoUrl?: string
  accentColor?: string
  tagline?: string
}

export interface CampaignFormValues {
  name: string
  /** Branding keys to set: a string sets the key, null removes it. */
  branding: { logo_url: string | null; accent_color: string | null; tagline: string | null }
}

export type CampaignFormResult = { ok: true; values: CampaignFormValues } | { ok: false; errors: CampaignFormErrors }

// eslint-disable-next-line no-control-regex -- the point is to reject control characters
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/**
 * Validates the campaign settings form. Everything is trimmed. Logo, accent and tagline are optional: an empty
 * value means "remove it". The logo and the accent go through the same strict parsers the shell renders with
 * (https URL only, #rrggbb only), so what is saved is exactly what will be accepted when displayed.
 */
export function validateCampaignForm(input: CampaignFormInput): CampaignFormResult {
  const errors: CampaignFormErrors = {}
  const name = input.name.trim()
  const logo = input.logoUrl.trim()
  const accent = input.accentColor.trim()
  const tagline = input.tagline.trim()

  if (name.length === 0) errors.name = 'El nombre es obligatorio.'
  else if (name.length > NAME_MAX) errors.name = `El nombre puede tener hasta ${NAME_MAX} caracteres.`
  else if (CONTROL_CHARS.test(name)) errors.name = 'El nombre no puede tener saltos de línea ni caracteres de control.'

  let logoUrl: string | null = null
  if (logo.length > 0) {
    logoUrl = parseLogoUrl(logo)
    if (logoUrl === null) {
      errors.logoUrl = logo.length > LOGO_MAX ? `La URL puede tener hasta ${LOGO_MAX} caracteres.` : 'El logo debe ser una URL https válida (https://…).'
    }
  }

  let accentColor: string | null = null
  if (accent.length > 0) {
    accentColor = parseAccentColor(accent)
    if (accentColor === null) errors.accentColor = 'El color debe tener el formato #rrggbb (por ejemplo #dc2626).'
  }

  if (tagline.length > TAGLINE_MAX) errors.tagline = `El lema puede tener hasta ${TAGLINE_MAX} caracteres.`
  else if (CONTROL_CHARS.test(tagline)) errors.tagline = 'El lema no puede tener saltos de línea ni caracteres de control.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    values: {
      name,
      branding: { logo_url: logoUrl, accent_color: accentColor, tagline: tagline.length > 0 ? tagline : null },
    },
  }
}

/** The form's initial text for a stored campaign (stored values are shown as-is, only strings). */
export function campaignFormInput(campaign: { name: string; branding: Record<string, unknown> }): CampaignFormInput {
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    name: campaign.name,
    logoUrl: text(campaign.branding?.logo_url),
    accentColor: text(campaign.branding?.accent_color),
    tagline: text(campaign.branding?.tagline),
  }
}
