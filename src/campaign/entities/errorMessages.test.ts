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
