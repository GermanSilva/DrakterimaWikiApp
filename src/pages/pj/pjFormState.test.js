import { describe, expect, it } from 'vitest'
import { buildPjFormState, toPjPayload } from './pjFormState'

const fields = [{ key: 'lema', label: 'Lema' }]

describe('buildPjFormState custom_fields', () => {
  it('a corrupted custom_fields (string, array, null, number) becomes an empty object', () => {
    for (const bad of ['texto', ['a'], null, 5, undefined]) {
      expect(buildPjFormState({ custom_fields: bad }, { characterFields: fields }).custom_fields).toEqual({})
    }
  })

  it('keeps a real object and adds nothing when the campaign defines no fields', () => {
    expect(buildPjFormState({ custom_fields: { lema: 'x' } }, { characterFields: fields }).custom_fields).toEqual({ lema: 'x' })
    expect(buildPjFormState({ custom_fields: { lema: 'x' } }, {})).not.toHaveProperty('custom_fields')
  })
})

describe('toPjPayload', () => {
  it('coerces numbers the legacy way and defaults the proficiency bonus to 2', () => {
    const payload = toPjPayload({ ...buildPjFormState(null), nivel: '7', stat_hp: 'x', stat_proficiency_bonus: '' }, 3)
    expect(payload).toMatchObject({ id: 3, nivel: 7, stat_hp: 0, stat_proficiency_bonus: 2 })
  })
})
