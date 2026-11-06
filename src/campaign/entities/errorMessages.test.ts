import { describe, expect, it } from 'vitest'
import { toDataError } from '../../data/errors'
import { describeGameError } from '../games/gameErrors'
import { describeDataError } from './errorMessages'

/** What PostgREST hands us for `raise exception '<reason>'` in the reward RPCs (P0001). */
const raised = (message: string) => toDataError({ message, code: 'P0001' })

describe('reward destination errors (G5b)', () => {
  it('keeps the three reason codes the RPCs raise, as business errors', () => {
    for (const code of ['no_reward_destination', 'pot_denominations_unsupported', 'invalid_coins']) {
      const err = raised(code)
      expect(err.kind, code).toBe('business')
      expect(err.reason, code).toBe(code)
    }
  })

  it('explains each one in Spanish, for the lottery and for any other caller', () => {
    expect(describeDataError(raised('no_reward_destination'))).toBe(
      'La lotería no está disponible: la hoja de la campaña no define denominaciones y un destino de recompensa.',
    )
    expect(describeDataError(raised('pot_denominations_unsupported'))).toBe('El pozo todavía no admite las denominaciones de la hoja de esta campaña.')
    expect(describeDataError(raised('invalid_coins'))).toBe('Las monedas indicadas no coinciden con las denominaciones de la hoja de la campaña.')
    expect(describeGameError(raised('no_reward_destination'))).toBe(describeDataError(raised('no_reward_destination')))
    expect(describeGameError(raised('pot_denominations_unsupported'))).toBe(describeDataError(raised('pot_denominations_unsupported')))
  })

  it('leaves every other business error on the fallback, as before', () => {
    expect(describeDataError(raised('request_not_pending'), 'otra cosa')).toBe('otra cosa')
    expect(describeDataError(toDataError({ message: 'boom', code: 'P0001' }), 'otra cosa')).toBe('otra cosa')
    expect(describeGameError(raised('insufficient_pot'))).toBe('El pozo no tiene monedas suficientes.')
  })
})

describe('stale lottery configuration (G5b, S12)', () => {
  it('is a whitelisted business reason with a Spanish explanation, for the lottery and for any other caller', () => {
    const err = raised('lottery_config_stale')
    expect(err.kind).toBe('business')
    expect(err.reason).toBe('lottery_config_stale')
    const message = 'La lotería no está disponible: los premios usan monedas que ya no existen en la hoja. El DM tiene que volver a guardarlos en Ajustes.'
    expect(describeDataError(err)).toBe(message)
    expect(describeGameError(err)).toBe(message)
  })
})

describe('action collection errors (G6a)', () => {
  const trigger = (message: string, code: string) => toDataError({ message, code })

  it('keeps the entry reasons as validation errors and the closed state as a permission error', () => {
    for (const reason of ['action_not_in_sheet', 'invalid_action_category', 'invalid_action_extras', 'action_private_to_other_character', 'invalid_link_state']) {
      const err = trigger(reason, '23514')
      expect(err.kind, reason).toBe('validation')
      expect(err.reason, reason).toBe(reason)
    }
    const closed = trigger('link_state_not_writable', '42501')
    expect(closed.kind).toBe('permission')
    expect(closed.reason).toBe('link_state_not_writable')
  })

  it('explains each one in Spanish', () => {
    expect(describeDataError(trigger('action_not_in_sheet', '23514'))).toBe('La tabla de la acción ya no existe en la hoja de la campaña.')
    expect(describeDataError(trigger('invalid_action_category', '23514'))).toBe('La categoría no es una de las que define la tabla de la hoja.')
    expect(describeDataError(trigger('invalid_action_extras', '23514'))).toBe('Los datos extra de la acción no coinciden con las columnas de la hoja.')
    expect(describeDataError(trigger('action_private_to_other_character', '23514'))).toBe('Esa acción es privada de otro personaje.')
    expect(describeDataError(trigger('invalid_link_state', '23514'))).toBe('El valor no es válido para esa columna de la hoja.')
    expect(describeDataError(trigger('link_state_not_writable', '42501'))).toBe('Esa tabla de la hoja no se puede editar con tu rol.')
  })

  it('leaves the other validation and permission errors as before', () => {
    expect(describeDataError(trigger('check violated', '23514'))).toBe('Hay datos inválidos. Revisá el formulario.')
    expect(describeDataError(trigger('permission denied', '42501'))).toBe('No tenés permiso para hacer esto.')
    expect(describeDataError(trigger('dm_only', '42501'))).toBe('Solo el DM puede hacer esto.')
  })
})

describe('discarded sheet items (G7b)', () => {
  it('explains each refusal of the purge and restore RPCs in Spanish', () => {
    expect(describeDataError(raised('discarded_item_not_found'))).toBe('Ese campo descartado ya no está en la plantilla. Recargá y revisá la lista.')
    expect(describeDataError(raised('discarded_key_live'))).toBe('Un campo de la plantilla usa de nuevo esa clave: restaurá el campo descartado con otra clave en lugar de eliminarlo.')
    expect(describeDataError(raised('discarded_rekey_invalid'))).toBe('No se pudo restaurar el campo con la clave nueva. Recargá y volvé a intentar.')
    expect(describeDataError(raised('discarded_key_taken'))).toBe('Algún personaje ya tiene datos guardados con la clave nueva, así que no se restauró. Probá con otra clave.')
  })

  it('keeps them business errors, and dm_only a permission error', () => {
    expect(raised('discarded_key_live').kind).toBe('business')
    expect(describeDataError(toDataError({ message: 'dm_only', code: '42501' }))).toBe('Solo el DM puede hacer esto.')
  })
})

describe('systems (G8a)', () => {
  it('explains each system reason in Spanish', () => {
    expect(describeDataError(raised('system_not_found'))).toBe('Ese sistema ya no existe o no tenés acceso a él.')
    expect(describeDataError(raised('system_not_available'))).toBe('Ese sistema base ya no está disponible. Elegí otro o pedí la campaña sin base.')
    expect(describeDataError(raised('invalid_system_kind'))).toBe('Ese sistema ya es un Sistema Origen.')
    expect(describeDataError(raised('systems_limit_reached'))).toBe('Llegaste al máximo de sistemas propios. Renombrá o reutilizá alguno en lugar de crear otro.')
    expect(describeDataError(toDataError({ message: 'system_owner_only', code: '42501' }))).toBe('Solo quien creó este sistema puede cambiarlo.')
  })

  it('keeps the previous permission messages', () => {
    expect(describeDataError(toDataError({ message: 'hub_owner_only', code: '42501' }))).toBe('No tenés permiso para hacer esto.')
    expect(describeDataError(toDataError({ message: 'dm_only', code: '42501' }))).toBe('Solo el DM puede hacer esto.')
  })
})

describe('invalid system name (G8b)', () => {
  it('explains a refused name in Spanish and leaves other validation errors alone', () => {
    expect(describeDataError(toDataError({ message: 'invalid_name', code: '23514' }))).toBe('El nombre del sistema no es válido (1 a 120 caracteres).')
    expect(describeDataError(toDataError({ message: 'new row violates check constraint', code: '23514' }))).toBe('Hay datos inválidos. Revisá el formulario.')
  })
})
