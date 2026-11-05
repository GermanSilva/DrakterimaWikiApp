import { ConflictError, DataError } from '../../data'

/** The coin RPCs refuse a credit when the sheet of the campaign cannot receive it (G5b, S12, S28). */
const REWARD_MESSAGES: Partial<Record<string, string>> = {
  no_reward_destination: 'La lotería no está disponible: la hoja de la campaña no define denominaciones y un destino de recompensa.',
  pot_denominations_unsupported: 'El pozo todavía no admite las denominaciones de la hoja de esta campaña.',
  invalid_coins: 'Las monedas indicadas no coinciden con las denominaciones de la hoja de la campaña.',
}

/**
 * User-facing (Spanish, voseo) message for a failed data operation. Never shows raw database text:
 * the typed kind / stable reason decides, everything else is logged by the caller.
 */
export function describeDataError(err: unknown, fallback = 'No se pudo completar la operación. Intentá de nuevo.'): string {
  if (err instanceof ConflictError) return 'Alguien más modificó este registro. Recargá y volvé a intentar.'
  if (!(err instanceof DataError)) return fallback
  switch (err.kind) {
    case 'conflict':
      return 'Ya existe un registro con esos datos.'
    case 'permission':
      return err.reason === 'dm_only' ? 'Solo el DM puede hacer esto.' : 'No tenés permiso para hacer esto.'
    case 'not_found':
      return 'Ese registro ya no existe.'
    case 'validation':
      return 'Hay datos inválidos. Revisá el formulario.'
    case 'auth':
      return 'Tu sesión expiró. Iniciá sesión de nuevo.'
    case 'business':
      return (err.reason && REWARD_MESSAGES[err.reason]) || fallback
    case 'written_not_visible':
      return 'Se guardó, pero con tu rol no podés verlo. Recargá antes de volver a intentar.'
    default:
      return fallback
  }
}
