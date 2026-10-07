import { DataError } from '../data'

/** Mirrors campaigns.slug check and create_campaign's reserved list (supabase migrations). */
export const SLUG_MIN = 3
export const SLUG_MAX = 40
export const NAME_MAX = 120
export const RESERVED_SLUGS: readonly string[] = [
  'admin', 'api', 'app', 'auth', 'login', 'logout', 'settings', 'new', 'c', 'www', 'help', 'static', 'assets',
]
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** URL-safe slug proposal from a display name (accents folded, runs of other characters → '-'). */
export function suggestSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
}

export interface CampaignFormErrors {
  name?: string
  slug?: string
}

export function validateCampaignForm(input: { name: string; slug: string }): CampaignFormErrors {
  const errors: CampaignFormErrors = {}
  const name = input.name.trim()
  if (name.length === 0) errors.name = 'Ingresá un nombre.'
  else if (name.length > NAME_MAX) errors.name = `El nombre admite hasta ${NAME_MAX} caracteres.`

  const slug = input.slug
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    errors.slug = `La dirección debe tener entre ${SLUG_MIN} y ${SLUG_MAX} caracteres.`
  } else if (!SLUG_PATTERN.test(slug)) {
    errors.slug = 'Usá solo minúsculas, números y guiones (sin guiones al inicio, al final ni repetidos).'
  } else if (RESERVED_SLUGS.includes(slug)) {
    errors.slug = 'Esa dirección está reservada. Elegí otra.'
  }
  return errors
}

/** Spanish message for a failed createCampaign. */
export function createCampaignErrorMessage(error: unknown): string {
  if (error instanceof DataError) {
    if (error.reason === 'reserved_slug') return 'Esa dirección está reservada. Elegí otra.'
    if (error.reason === 'campaign_limit_reached') return 'Llegaste al máximo de campañas que podés crear.'
    // unique violation on campaigns.slug
    if (error.kind === 'conflict') return 'Ya existe una campaña con esa dirección. Elegí otra.'
    if (error.kind === 'validation') return 'Revisá el nombre y la dirección: alguno no es válido.'
    if (error.kind === 'auth') return 'Tu sesión expiró. Iniciá sesión de nuevo.'
  }
  return 'No pudimos crear la campaña. Volvé a intentar.'
}

export const INVITE_MESSAGES: Record<string, string> = {
  invite_not_found: 'No encontramos esa invitación. Revisá el código.',
  invite_expired: 'Esta invitación venció. Pedile una nueva al DM.',
  invite_exhausted: 'Esta invitación ya se usó el máximo de veces.',
  character_already_claimed: 'El personaje de esta invitación ya fue reclamado por otra persona.',
  character_already_owned: 'Ya tenés ese personaje asignado.',
}

/** Spanish message for a failed acceptInvite. */
export function acceptInviteErrorMessage(error: unknown): string {
  if (error instanceof DataError) {
    if (error.reason && INVITE_MESSAGES[error.reason]) return INVITE_MESSAGES[error.reason]
    if (error.kind === 'auth') return 'Tu sesión expiró. Iniciá sesión de nuevo.'
  }
  return 'No pudimos aceptar la invitación. Volvé a intentar.'
}

/** Invite codes are opaque; reject anything that cannot be one before it reaches the backend. */
export function normalizeInviteCode(raw: string): string | null {
  const code = raw.trim()
  return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : null
}
