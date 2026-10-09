import { DataError } from '../../data'
import { describeDataError } from '../entities/errorMessages'

/** User-facing message for a failed lottery play, from the stable reason codes of `play_loteria`. */
export function describeGameError(err: unknown): string {
  if (err instanceof DataError && err.reason) {
    switch (err.reason) {
      case 'already_played_today':
        return 'Este personaje ya jugó hoy. El día se reinicia a las 00:00 UTC.'
      case 'not_your_character':
        return 'Ese personaje no es tuyo.'
      case 'character_required':
        return 'Elegí un personaje para jugar.'
      case 'character_not_found':
        return 'No encontramos ese personaje.'
      case 'insufficient_pot':
        return 'El pozo no tiene monedas suficientes.'
      case 'not_a_member':
        return 'Ya no sos miembro de esta campaña.'
      case 'dm_only':
        return 'Solo el DM puede hacer esto.'
      default:
        break
    }
  }
  return describeDataError(err, 'No se pudo jugar. Intentá de nuevo.')
}
