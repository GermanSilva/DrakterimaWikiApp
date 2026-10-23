import { useState } from 'react'
import { parseAccentColor, parseHttpsUrl } from '../campaign/branding'

/** Mirrors the database check (campaign_requests.tagline / branding.tagline). */
export const TAGLINE_MAX = 140
/** The brand indigo: the colour a new campaign starts with until the requester picks another. */
export const DEFAULT_ACCENT = '#4a32ac'

export interface BrandingErrors {
  tagline?: string
  logo?: string
}

/** What the form sends: optional fields are null, the accent is always a strict lower-case #rrggbb. */
export interface BrandingValues {
  tagline: string | null
  accent_color: string
  logo_url: string | null
}

export function validateBranding(input: { tagline: string; accent: string; logo: string }): { errors: BrandingErrors; values: BrandingValues } {
  const errors: BrandingErrors = {}
  const tagline = input.tagline.trim()
  if (tagline.length > TAGLINE_MAX) errors.tagline = `El pre-título admite hasta ${TAGLINE_MAX} caracteres.`

  const logoText = input.logo.trim()
  // The href of the parsed URL is what is sent (scheme and host lower-cased, spaces encoded), like the database expects.
  const logo = logoText === '' ? null : parseHttpsUrl(logoText)
  if (logoText !== '' && logo === null) errors.logo = 'Ingresá una dirección https:// válida para el logo.'

  return {
    errors,
    values: { tagline: tagline === '' ? null : tagline, accent_color: parseAccentColor(input.accent) ?? DEFAULT_ACCENT, logo_url: logo },
  }
}

/** State of the optional branding fields shared by the request and the create forms. */
export function useBrandingFields() {
  const [tagline, setTagline] = useState('')
  const [accent, setAccent] = useState(DEFAULT_ACCENT)
  const [logo, setLogo] = useState('')
  const [errors, setErrors] = useState<BrandingErrors>({})

  return {
    tagline,
    accent,
    logo,
    errors,
    changeTagline: setTagline,
    changeAccent: setAccent,
    changeLogo: setLogo,
    /** Validates; stores the errors to show and returns the values to send, or null when something is invalid. */
    validate(): BrandingValues | null {
      const result = validateBranding({ tagline, accent, logo })
      setErrors(result.errors)
      return result.errors.tagline || result.errors.logo ? null : result.values
    },
    reset() {
      setTagline('')
      setAccent(DEFAULT_ACCENT)
      setLogo('')
      setErrors({})
    },
  }
}

export type BrandingFieldsState = ReturnType<typeof useBrandingFields>
