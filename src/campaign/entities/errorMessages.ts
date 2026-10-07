import { ConflictError, DataError } from '../../data'

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
    case 'written_not_visible':
      return 'Se guardó, pero con tu rol no podés verlo. Recargá antes de volver a intentar.'
    default:
      return fallback
  }
}
