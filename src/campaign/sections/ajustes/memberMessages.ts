import { DataError, type Member } from '../../../data'
import { describeDataError } from '../../entities/errorMessages'

/** Spanish message for a failed member / character-owner / deletion operation. */
export function memberErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof DataError) {
    if (err.reason === 'last_dm') {
      return 'La campaña tiene que tener al menos un DM, y esta persona es el único. Nombrá DM a otro integrante antes de quitarle el rol o sacarla.'
    }
    if (err.reason === 'owner_not_member') return 'Esa persona ya no es parte de la campaña. Actualizá la lista de jugadores.'
    if (err.reason === 'slug_mismatch') return 'El texto escrito no coincide con el identificador de la campaña.'
    if (err.reason === 'dm_only') return 'Solo un DM puede hacer esto.'
    if (err.kind === 'not_found') return 'Esa persona o ese personaje ya no existe. Actualizá la lista.'
  }
  return describeDataError(err, fallback)
}

/** A member's display name, with a placeholder for a profile that has none. */
export const memberName = (m: Member) => m.profile?.display_name || 'Sin nombre'
