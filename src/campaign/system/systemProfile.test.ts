import { describe, expect, it } from 'vitest'
import { DND5E_PROFILE, parseSystemProfile } from './systemProfile'

describe('DND5E_PROFILE', () => {
  it('is exactly what the application hard-codes today', () => {
    expect(DND5E_PROFILE.character.builtins.nivel).toEqual({ enabled: true, label: 'Nivel', min: 1, max: 20 })
    expect(DND5E_PROFILE.character.builtins.clase).toEqual({ enabled: true, label: 'Clase' })
    expect(DND5E_PROFILE.character.builtins.raza).toEqual({ enabled: true, label: 'Raza' })
    expect(DND5E_PROFILE.currency.denominations.map((d) => d.key)).toEqual(['pp', 'gp', 'ep', 'sp', 'cp'])
    expect(DND5E_PROFILE.modules).toEqual({ juegos: true, sesion_en_vivo: true, mapas: true, calendario: true })
  })
})

describe('parseSystemProfile', () => {
  it('returns the D&D 5e document for anything that is not a version 1 object', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}, { version: 2 }, { version: '1' }]) {
      expect(parseSystemProfile(raw)).toEqual(DND5E_PROFILE)
    }
  })

  it('round-trips the stored D&D 5e document', () => {
    expect(parseSystemProfile(JSON.parse(JSON.stringify(DND5E_PROFILE)))).toEqual(DND5E_PROFILE)
  })

  it('reads a customised document', () => {
    const profile = parseSystemProfile({
      version: 1,
      character: { builtins: { clase: { enabled: false, label: 'Clase' }, raza: { enabled: true, label: 'Ocupación' }, nivel: { enabled: true, label: 'Rango', min: 0, max: 5 } } },
      currency: { enabled: true, denominations: [{ key: 'gp', label: 'créditos' }] },
      modules: { juegos: false, sesion_en_vivo: true, mapas: true, calendario: false },
    })
    expect(profile.character.builtins.clase.enabled).toBe(false)
    expect(profile.character.builtins.raza.label).toBe('Ocupación')
    expect(profile.character.builtins.nivel).toEqual({ enabled: true, label: 'Rango', min: 0, max: 5 })
    expect(profile.currency.denominations).toEqual([{ key: 'gp', label: 'créditos' }])
    expect(profile.modules).toEqual({ juegos: false, sesion_en_vivo: true, mapas: true, calendario: false })
  })

  it('can switch the currency off', () => {
    expect(parseSystemProfile({ version: 1, currency: { enabled: false } }).currency.enabled).toBe(false)
  })

  it('fills every missing part from the D&D 5e document', () => {
    expect(parseSystemProfile({ version: 1 })).toEqual(DND5E_PROFILE)
    const partial = parseSystemProfile({ version: 1, character: { builtins: { nivel: { max: 10 } } } })
    expect(partial.character.builtins.nivel).toEqual({ enabled: true, label: 'Nivel', min: 1, max: 10 })
    expect(partial.character.builtins.clase).toEqual(DND5E_PROFILE.character.builtins.clase)
  })

  it('ignores values of the wrong type instead of trusting them', () => {
    const profile = parseSystemProfile({
      version: 1,
      character: { builtins: { clase: { enabled: 'yes', label: 42 }, nivel: { min: 'a', max: {} } } },
      currency: { enabled: 'no', denominations: 'oro' },
      modules: { juegos: 'false', mapas: null },
    })
    expect(profile).toEqual(DND5E_PROFILE)
  })

  it('trims labels, falls back on empty or over-long ones, and keeps the nivel range sane', () => {
    const profile = parseSystemProfile({
      version: 1,
      character: { builtins: { clase: { label: '  Oficio  ' }, raza: { label: '   ' }, nivel: { label: 'x'.repeat(61), min: 9, max: 3 } } },
    })
    expect(profile.character.builtins.clase.label).toBe('Oficio')
    expect(profile.character.builtins.raza.label).toBe('Raza')
    expect(profile.character.builtins.nivel.label).toBe('Nivel')
    expect(profile.character.builtins.nivel).toMatchObject({ min: 1, max: 20 })
  })

  it('drops malformed or duplicated denominations and keeps the rest in order', () => {
    const profile = parseSystemProfile({
      version: 1,
      currency: {
        enabled: true,
        denominations: [{ key: 'gp', label: 'oro' }, { key: 'gp', label: 'otra' }, { key: 5, label: 'x' }, { key: 'sp' }, null, { key: 'cp', label: ' cobre ' }],
      },
    })
    expect(profile.currency.denominations).toEqual([{ key: 'gp', label: 'oro' }, { key: 'cp', label: 'cobre' }])
  })

  it('falls back to the default denominations when the list ends up empty while the currency is on', () => {
    expect(parseSystemProfile({ version: 1, currency: { enabled: true, denominations: [{ key: 7 }] } }).currency.denominations).toEqual(DND5E_PROFILE.currency.denominations)
  })

  it('only keeps the five coin keys the character and pot columns can store', () => {
    const profile = parseSystemProfile({ version: 1, currency: { enabled: true, denominations: [{ key: 'zz', label: 'x' }, { key: 'ep', label: 'e' }] } })
    expect(profile.currency.denominations).toEqual([{ key: 'ep', label: 'e' }])
  })
})
