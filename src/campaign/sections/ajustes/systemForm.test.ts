import { describe, expect, it } from 'vitest'
import { DND5E_PROFILE, SECTION_KEYS, dnd5eProfile } from '../../system/systemProfile'
import { newUnit, systemDraft, validateSystem, type SystemDraft, type UnitDraft } from './systemForm'

describe('systemDraft', () => {
  it('turns the stored profile into editable text', () => {
    const draft = systemDraft(DND5E_PROFILE)
    expect(draft.nivel).toEqual({ enabled: true, label: 'Nivel', min: '1', max: '20' })
    expect(draft.clase).toEqual({ enabled: true, label: 'Clase' })
    expect(Object.keys(draft.sections)).toEqual([...SECTION_KEYS])
  })
})

describe('validateSystem', () => {
  const base = () => dnd5eProfile()

  it('keeps the untouched parts of the stored document (currency and modules are not edited here)', () => {
    const stored = base()
    stored.currency = { enabled: false, denominations: [] }
    stored.modules.juegos = false
    const result = validateSystem(systemDraft(stored), stored)
    expect(result).toEqual({ ok: true, profile: stored })
  })

  it('builds the profile from the draft: trimmed labels, switches, a numeric range', () => {
    const draft = systemDraft(DND5E_PROFILE)
    draft.clase.enabled = false
    draft.raza.label = '  Ocupación  '
    draft.nivel = { enabled: true, label: ' Rango ', min: '0', max: '5' }
    draft.sections.hechizos = false
    const result = validateSystem(draft, base())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.character.builtins.clase.enabled).toBe(false)
    expect(result.profile.character.builtins.raza.label).toBe('Ocupación')
    expect(result.profile.character.builtins.nivel).toEqual({ enabled: true, label: 'Rango', min: 0, max: 5 })
    expect(result.profile.character.sections.hechizos).toBe(false)
    expect(result.profile.character.sections.stats).toBe(true)
  })

  it.each([
    ['clase', ''],
    ['raza', '   '],
    ['nivel', 'x'.repeat(61)],
    ['clase', 'a\u200Bb'],
    ['raza', 'ab\u202Ecd'],
  ] as const)('rejects the %s label %j with a message', (key, label) => {
    const draft = systemDraft(DND5E_PROFILE)
    draft[key].label = label
    const result = validateSystem(draft, base())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[key]).toMatch(/1 y 60/)
  })

  it.each([
    ['', '5'],
    ['1', ''],
    ['1.5', '5'],
    ['a', '5'],
    ['-1', '5'],
    ['1', '1001'],
    ['9', '3'],
  ])('rejects the level range %j..%j', (min, max) => {
    const draft = systemDraft(DND5E_PROFILE)
    draft.nivel.min = min
    draft.nivel.max = max
    const result = validateSystem(draft, base())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.range).toMatch(/enteros/)
  })

  it('accepts min equal to max and the limits 0 and 1000', () => {
    const draft = systemDraft(DND5E_PROFILE)
    draft.nivel.min = '0'
    draft.nivel.max = '1000'
    expect(validateSystem(draft, base()).ok).toBe(true)
    draft.nivel.min = '7'
    draft.nivel.max = '7'
    expect(validateSystem(draft, base()).ok).toBe(true)
  })

  it('reports every problem at once', () => {
    const draft = systemDraft(DND5E_PROFILE)
    draft.clase.label = ''
    draft.nivel.max = 'x'
    const result = validateSystem(draft, base())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['clase', 'range'])
  })

  it('sends the stored sheet back untouched, so saving the Sistema section never erases it', () => {
    const stored = { ...base(), sheet: { categories: [], roles: {} } }
    const result = validateSystem(systemDraft(stored), stored)
    expect(result.ok && result.profile.sheet).toEqual({ categories: [], roles: {} })
  })
})

describe('distance units', () => {
  const DISTANCE = {
    main: 'm',
    units: [
      { key: 'ft', label: 'Pies', value: 1, decimals: 0 },
      { key: 'm', label: 'Metros', value: 3.28084, decimals: 1 },
      { key: 'c', label: 'Casilleros', value: 5, decimals: 0 },
    ],
  }
  const withDistance = () => ({ ...dnd5eProfile(), distance: JSON.parse(JSON.stringify(DISTANCE)) as Record<string, unknown> })
  const unit = (over: Partial<UnitDraft> = {}): UnitDraft => ({ key: 'ft', label: 'Pies', value: '1', decimals: '0', main: true, saved: false, ...over })
  const draftWith = (units: UnitDraft[] | null): SystemDraft => ({ ...systemDraft(dnd5eProfile()), distance: units })
  const errorsOf = (units: UnitDraft[]) => {
    const result = validateSystem(draftWith(units), dnd5eProfile())
    return result.ok ? null : result.errors.distance
  }

  it('turns the stored units into editable rows (values as text, saved keys, the main flagged)', () => {
    expect(systemDraft(withDistance()).distance).toEqual([
      { key: 'ft', label: 'Pies', value: '1', decimals: '0', main: false, saved: true },
      { key: 'm', label: 'Metros', value: '3.28084', decimals: '1', main: true, saved: true },
      { key: 'c', label: 'Casilleros', value: '5', decimals: '0', main: false, saved: true },
    ])
  })

  it('has no rows when the campaign defines no units, and null when the stored value cannot be read', () => {
    expect(systemDraft(dnd5eProfile()).distance).toEqual([])
    expect(systemDraft({ ...dnd5eProfile(), distance: { main: 'x' } }).distance).toBeNull()
  })

  it('a new row is empty, editable and not the main', () => {
    expect(newUnit()).toEqual({ key: '', label: '', value: '', decimals: '0', main: false, saved: false })
  })

  it('sends the stored distance back unchanged when nothing was edited', () => {
    const stored = withDistance()
    const result = validateSystem(systemDraft(stored), stored)
    expect(result).toEqual({ ok: true, profile: stored })
  })

  it('builds the distance from the rows: order kept, comma or point values, trimmed label, numeric precision, main key', () => {
    const rows = [
      unit({ key: 'ft', label: 'Pies', value: '1', decimals: '0', main: false }),
      unit({ key: 'm', label: '  Metros ', value: '3,28084', decimals: '2', main: true }),
      unit({ key: 'c', label: 'Casilleros', value: '5.5', decimals: '1', main: false }),
    ]
    const result = validateSystem(draftWith(rows), dnd5eProfile())
    expect(result.ok && result.profile.distance).toEqual({
      main: 'm',
      units: [
        { key: 'ft', label: 'Pies', value: 1, decimals: 0 },
        { key: 'm', label: 'Metros', value: 3.28084, decimals: 2 },
        { key: 'c', label: 'Casilleros', value: 5.5, decimals: 1 },
      ],
    })
  })

  it('keeps the other parts of the document when the units change', () => {
    const stored = { ...withDistance(), sheet: { categories: [], roles: {} } }
    const result = validateSystem(draftWith([unit()]), stored)
    expect(result.ok && result.profile.sheet).toEqual({ categories: [], roles: {} })
    expect(result.ok && result.profile.currency).toEqual(stored.currency)
  })

  it('removes the key when every row was removed (and only then)', () => {
    const result = validateSystem(draftWith([]), withDistance())
    expect(result.ok).toBe(true)
    expect(result.ok && 'distance' in result.profile).toBe(false)
  })

  it('sends a distance the client cannot read back untouched', () => {
    const stored = { ...dnd5eProfile(), distance: { main: 'x' } }
    const result = validateSystem(draftWith(null), stored)
    expect(result.ok && result.profile.distance).toEqual({ main: 'x' })
  })

  it('rejects a bad key, naming the unit', () => {
    for (const key of ['', 'Ft', '1a', 'a-b', 'a'.repeat(41), 'constructor']) {
      expect(errorsOf([unit({ key })])?.units[0].key, key).toMatch(/clave/i)
    }
  })

  it('rejects a repeated key at the second row, and a bad label', () => {
    expect(errorsOf([unit(), unit({ key: 'ft', main: false })])?.units[1].key).toMatch(/otra unidad/)
    expect(errorsOf([unit({ label: ' ' })])?.units[0].label).toMatch(/entre 1 y 60/)
  })

  it('rejects values that are not a positive number in range', () => {
    for (const value of ['', 'x', '0', '-1', '1e3', '1,2,3', '.5', '0,0000001', '10000000000000']) {
      expect(errorsOf([unit({ value })])?.units[0].value, value).toMatch(/número mayor que 0/)
    }
    expect(errorsOf([unit({ value: '0,000001' })])).toBeNull()
    expect(errorsOf([unit({ value: '1000000000000' })])).toBeNull()
  })

  it('requires exactly one main unit', () => {
    expect(errorsOf([unit({ main: false })])?.main).toMatch(/principal/)
    expect(errorsOf([unit(), unit({ key: 'm' })])?.main).toMatch(/principal/)
  })

  it('accepts 1 and 8 rows, rejects 9', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => unit({ key: `u${i + 1}`, main: i === 0 }))
    expect(errorsOf(rows(1))).toBeNull()
    expect(errorsOf(rows(8))).toBeNull()
    expect(errorsOf(rows(9))?.list).toMatch(/hasta 8/)
  })

  it('does not build a profile while any row is wrong, and reports all the rows at once', () => {
    const result = validateSystem(draftWith([unit({ key: 'Bad' }), unit({ key: 'm', label: '', main: false })]), dnd5eProfile())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.distance?.units[0].key).toBeDefined()
      expect(result.errors.distance?.units[1].label).toBeDefined()
    }
  })
})
