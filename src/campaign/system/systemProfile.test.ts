import { describe, expect, it } from 'vitest'
import { DND5E_PROFILE, SECTION_KEYS, dnd5eProfile, parseSystemProfile } from './systemProfile'

describe('DND5E_PROFILE', () => {
  it('is exactly what the application hard-codes today', () => {
    expect(DND5E_PROFILE.character.builtins.nivel).toEqual({ enabled: true, label: 'Nivel', min: 1, max: 20 })
    expect(DND5E_PROFILE.character.builtins.clase).toEqual({ enabled: true, label: 'Clase' })
    expect(DND5E_PROFILE.character.builtins.raza).toEqual({ enabled: true, label: 'Raza' })
    expect(DND5E_PROFILE.currency.denominations.map((d) => d.key)).toEqual(['pp', 'gp', 'ep', 'sp', 'cp'])
    expect(DND5E_PROFILE.character.sections).toEqual(Object.fromEntries(SECTION_KEYS.map((key) => [key, true])))
    expect(SECTION_KEYS).toEqual(['stats', 'habilidades', 'ataques', 'hechizos', 'recursos', 'equipo', 'rasgos', 'narrativa', 'apariencia'])
    expect(DND5E_PROFILE.modules).toEqual({ juegos: true, sesion_en_vivo: true, mapas: true, calendario: true })
  })
})

describe('parseSystemProfile', () => {
  it('returns the D&D 5e document for anything that is not a version 1 object', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}, { version: 2 }, { version: '1' }]) {
      expect(parseSystemProfile(raw)).toEqual(DND5E_PROFILE)
    }
  })

  it('never hands out the shared default: mutating a result cannot change the next one', () => {
    const first = parseSystemProfile(null)
    first.currency.denominations.push({ key: 'gp', label: 'x' })
    first.character.builtins.nivel.max = 99
    expect(parseSystemProfile(null)).toEqual(DND5E_PROFILE)
    expect(parseSystemProfile({ version: 1 }).currency.denominations).toHaveLength(5)
    expect(parseSystemProfile(null)).not.toBe(parseSystemProfile(null))
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

  it('reads the sheet sections, defaulting every missing or mistyped one to on', () => {
    const profile = parseSystemProfile({ version: 1, character: { sections: { hechizos: false, stats: 'no', ataques: false } } })
    expect(profile.character.sections).toEqual({ ...DND5E_PROFILE.character.sections, hechizos: false, ataques: false })
  })

  it('rejects, like the database does, labels with control, bidi or zero-width characters and labels that are only blank-looking', () => {
    for (const label of ['ab\u202Ecd', '\u200B', 'a\u200Bb', 'a\nb', '\u3000\u00A0', 'x\uFEFF']) {
      expect(parseSystemProfile({ version: 1, character: { builtins: { raza: { label } } } }).character.builtins.raza.label).toBe('Raza')
    }
  })

  it('counts a label in characters, not in UTF-16 units (60 emoji are allowed, 61 are not)', () => {
    const sixty = '😀'.repeat(60)
    expect(parseSystemProfile({ version: 1, character: { builtins: { raza: { label: sixty } } } }).character.builtins.raza.label).toBe(sixty)
    expect(parseSystemProfile({ version: 1, character: { builtins: { raza: { label: sixty + '😀' } } } }).character.builtins.raza.label).toBe('Raza')
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

  describe('sheet passthrough', () => {
    const sheet = { categories: [{ key: 'c', label: 'C', sections: [] }], roles: {} }

    it('hands the stored sheet over untouched, because the database is who validates it', () => {
      expect(parseSystemProfile({ version: 1, sheet }).sheet).toEqual(sheet)
    })

    it('hands over a copy, so editing the profile never edits the stored document', () => {
      const stored = { version: 1, sheet: { categories: [], roles: {} } }
      const profile = parseSystemProfile(stored)
      expect(profile.sheet).not.toBe(stored.sheet)
      ;(profile.sheet as { roles: Record<string, string> }).roles.hp = 'x'
      expect(stored.sheet.roles).toEqual({})
    })

    it('keeps a sheet this client would not accept instead of silently dropping it', () => {
      const odd = { categories: 'nope' }
      expect(parseSystemProfile({ version: 1, sheet: odd }).sheet).toEqual(odd)
    })

    it('has no sheet when the document has none or it is not an object', () => {
      expect('sheet' in parseSystemProfile({ version: 1 })).toBe(false)
      expect('sheet' in parseSystemProfile({ version: 1, sheet: [] })).toBe(false)
      expect('sheet' in parseSystemProfile({ version: 1, sheet: null })).toBe(false)
      expect('sheet' in dnd5eProfile()).toBe(false)
    })
  })

  describe('distance passthrough', () => {
    const distance = { main: 'ft', units: [{ key: 'ft', label: 'Pies', value: 1, decimals: 0 }] }

    it('hands a stored distance over as a copy, so saving Ajustes never erases it', () => {
      const stored = { version: 1, distance }
      const profile = parseSystemProfile(stored)
      expect(profile.distance).toEqual(distance)
      expect(profile.distance).not.toBe(stored.distance)
    })

    it('keeps a distance this client would not accept (the database validates it)', () => {
      expect(parseSystemProfile({ version: 1, distance: { main: 'x' } }).distance).toEqual({ main: 'x' })
    })

    it('has no distance when the document has none or it is not an object', () => {
      for (const bad of [undefined, [], null, 'x', 3]) expect('distance' in parseSystemProfile({ version: 1, distance: bad })).toBe(false)
      expect('distance' in dnd5eProfile()).toBe(false)
    })
  })
})
