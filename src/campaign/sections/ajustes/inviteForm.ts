import { DataError, type Invite, type NewInvite } from '../../../data'

/** The three kinds of invitation the DM can create. */
export type InviteKind = 'player' | 'character' | 'dm'

export interface InviteDraft {
  kind: InviteKind
  /** Expiry in days from now. */
  days: number
  /** Raw text of the "max uses" field (plain player invites only). */
  maxUses: string
  /** pjs.id (as text) of the character to hand over, for a claim invite. */
  characterId: string
}

export const EXPIRY_DAYS = [1, 3, 7, 14, 30] as const
export const DEFAULT_EXPIRY_DAYS = 7
/** The database clamps a DM invite to 7 days (and makes it single-use) whatever is sent. */
export const DM_MAX_DAYS = 7
export const MAX_USES_LIMIT = 100

export const EMPTY_DRAFT: InviteDraft = { kind: 'player', days: DEFAULT_EXPIRY_DAYS, maxUses: '1', characterId: '' }

const DAY_MS = 24 * 60 * 60 * 1000

/** Expiry options valid for the kind (a DM invite is capped by the database at 7 days). */
export function expiryOptions(kind: InviteKind): readonly number[] {
  return kind === 'dm' ? EXPIRY_DAYS.filter((d) => d <= DM_MAX_DAYS) : EXPIRY_DAYS
}

export type InviteValidation = { ok: true; invite: NewInvite } | { ok: false; error: string }

/** Turns the form into the row to insert, or the first thing the DM has to fix. */
export function buildInvite(campaignId: string, draft: InviteDraft, now: Date): InviteValidation {
  if (!expiryOptions(draft.kind).includes(draft.days)) return { ok: false, error: 'Elegí cuándo vence la invitación.' }
  const expires_at = new Date(now.getTime() + draft.days * DAY_MS).toISOString()

  if (draft.kind === 'dm') return { ok: true, invite: { campaign_id: campaignId, role: 'dm', max_uses: 1, expires_at } }

  if (draft.kind === 'character') {
    const id = Number(draft.characterId)
    if (draft.characterId === '' || !Number.isInteger(id)) return { ok: false, error: 'Elegí el personaje que va a recibir el jugador.' }
    return { ok: true, invite: { campaign_id: campaignId, role: 'player', character_id: id, max_uses: 1, expires_at } }
  }

  const text = draft.maxUses.trim()
  const uses = Number(text)
  if (!/^\d+$/.test(text) || uses < 1 || uses > MAX_USES_LIMIT) {
    return { ok: false, error: `Los usos deben ser un número entero entre 1 y ${MAX_USES_LIMIT}.` }
  }
  return { ok: true, invite: { campaign_id: campaignId, role: 'player', max_uses: uses, expires_at } }
}

export type InviteStatus = 'active' | 'expired' | 'used'

/** Used up wins over expired: it is the more final of the two. */
export function inviteStatus(invite: Pick<Invite, 'uses' | 'max_uses' | 'expires_at'>, now: Date): InviteStatus {
  if (invite.uses >= invite.max_uses) return 'used'
  if (invite.expires_at !== null && Date.parse(invite.expires_at) <= now.getTime()) return 'expired'
  return 'active'
}

export const STATUS_LABEL: Record<InviteStatus, string> = { active: 'Activa', expired: 'Vencida', used: 'Agotada' }

/** Whether the invite still holds its character for someone (so it cannot be offered again). */
export const isLive = (invite: Invite, now: Date) => inviteStatus(invite, now) === 'active'

/** The shareable address of an invitation. */
export function inviteUrl(origin: string, code: string): string {
  return `${origin}/invite/${encodeURIComponent(code)}`
}

/** Spanish message for a failed createInvite. Never shows raw database text. */
export function createInviteErrorMessage(error: unknown): string {
  if (error instanceof DataError) {
    if (error.reason === 'character_already_owned') return 'Ese personaje ya tiene jugador. Quitale el jugador antes de invitar a otra persona.'
    if (error.reason === 'character_already_has_pending_invite') return 'Ese personaje ya tiene una invitación vigente. Revocala para crear otra.'
    if (error.kind === 'permission') return 'Solo el DM puede crear invitaciones.'
    if (error.kind === 'validation') return 'La invitación no es válida. Revisá los datos.'
    if (error.kind === 'auth') return 'Tu sesión expiró. Iniciá sesión de nuevo.'
    if (error.kind === 'written_not_visible') return 'Se creó la invitación, pero no pudimos mostrarla. Actualizá la lista antes de volver a intentar.'
  }
  return 'No pudimos crear la invitación. Volvé a intentar.'
}
