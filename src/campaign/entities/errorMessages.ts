import { ConflictError, DataError } from '../../data'

/** The coin RPCs refuse a credit when the sheet of the campaign cannot receive it (G5b, S12, S28). */
const REWARD_MESSAGES: Partial<Record<string, string>> = {
  no_reward_destination: 'La lotería no está disponible: la hoja de la campaña no define denominaciones y un destino de recompensa.',
  lottery_config_stale: 'La lotería no está disponible: los premios usan monedas que ya no existen en la hoja. El DM tiene que volver a guardarlos en Ajustes.',
  pot_denominations_unsupported: 'El pozo todavía no admite las denominaciones de la hoja de esta campaña.',
  invalid_coins: 'Las monedas indicadas no coinciden con las denominaciones de la hoja de la campaña.',
}

/** Shared action collection (G6a, S35-S37): reasons raised by the entry and link triggers. */
const COLLECTION_MESSAGES: Partial<Record<string, string>> = {
  action_not_in_sheet: 'La tabla de la acción ya no existe en la hoja de la campaña.',
  invalid_action_category: 'La categoría no es una de las que define la tabla de la hoja.',
  invalid_action_extras: 'Los datos extra de la acción no coinciden con las columnas de la hoja.',
  action_private_to_other_character: 'Esa acción es privada de otro personaje.',
  invalid_link_state: 'El valor no es válido para esa columna de la hoja.',
  link_state_not_writable: 'Esa tabla de la hoja no se puede editar con tu rol.',
}

/** Discarded sheet items (G7b, S26, S32): reasons raised by the purge and restore RPCs. */
const DISCARD_MESSAGES: Partial<Record<string, string>> = {
  discarded_item_not_found: 'Ese campo descartado ya no está en la plantilla. Recargá y revisá la lista.',
  discarded_key_live: 'Un campo de la plantilla usa de nuevo esa clave: restaurá el campo descartado con otra clave en lugar de eliminarlo.',
  discarded_rekey_invalid: 'No se pudo restaurar el campo con la clave nueva. Recargá y volvé a intentar.',
  discarded_key_taken: 'Algún personaje ya tiene datos guardados con la clave nueva, así que no se restauró. Probá con otra clave.',
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
      return err.reason === 'dm_only' ? 'Solo el DM puede hacer esto.' : (err.reason && COLLECTION_MESSAGES[err.reason]) || 'No tenés permiso para hacer esto.'
    case 'not_found':
      return 'Ese registro ya no existe.'
    case 'validation':
      return (err.reason && COLLECTION_MESSAGES[err.reason]) || 'Hay datos inválidos. Revisá el formulario.'
    case 'auth':
      return 'Tu sesión expiró. Iniciá sesión de nuevo.'
    case 'business':
      return (err.reason && (REWARD_MESSAGES[err.reason] ?? DISCARD_MESSAGES[err.reason])) || fallback
    case 'written_not_visible':
      return 'Se guardó, pero con tu rol no podés verlo. Recargá antes de volver a intentar.'
    default:
      return fallback
  }
}
