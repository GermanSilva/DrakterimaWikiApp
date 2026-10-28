import { describe, expect, it } from 'vitest'
import { DND5E_PROFILE, SECTION_KEYS, dnd5eProfile } from '../../system/systemProfile'
import { systemDraft, validateSystem } from './systemForm'

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
