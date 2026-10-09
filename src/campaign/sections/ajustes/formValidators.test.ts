import { describe, expect, it } from 'vitest'
import { FIELD_LABEL_MAX, MAX_CUSTOM_FIELDS, fieldDrafts, newFieldDraft, validateCustomFields, type FieldDraft } from './customFieldsForm'
import { KEY_MAX, newKeyError } from './fieldKey'
import { countRegionUsage, describeUsage } from './regionUsage'
import { MAX_REGIONS, REGION_LABEL_MAX, newRegionDraft, regionDrafts, validateRegions, type RegionDraft } from './regionsForm'

const region = (over: Partial<RegionDraft> = {}): RegionDraft => ({ uid: 0, key: 'norte', label: 'Norte', color: '', persisted: true, ...over })
const field = (over: Partial<FieldDraft> = {}): FieldDraft => ({ uid: 0, key: 'lema', label: 'Lema', persisted: true, ...over })

describe('newKeyError', () => {
  it('accepts slug-like keys and normalises case/whitespace', () => {
    expect(newKeyError('  Costa-Norte_2 ', new Set())).toBeNull()
  })
  it.each([
    ['', 'obligatoria'],
    ['   ', 'obligatoria'],
    ['con espacio', 'minúsculas'],
    ['ñandú', 'minúsculas'],
    ['-guion', 'minúsculas'],
    ['__proto__', 'minúsculas'],
    ['constructor', 'reservada'],
    ['prototype', 'reservada'],
    ['a'.repeat(KEY_MAX + 1), String(KEY_MAX)],
  ])('rejects %j', (raw, fragment) => {
    expect(newKeyError(raw, new Set())).toContain(fragment)
  })
  it('rejects a key that is already taken', () => {
    expect(newKeyError('NORTE', new Set(['norte']))).toContain('Ya hay otro')
  })
})

describe('validateRegions', () => {
  it('maps drafts to stored regions: trimmed label, normalised colour, empty colour omitted', () => {
    const out = validateRegions([region({ label: '  Norte ', color: ' #AABBCC ' }), region({ uid: 1, key: 'sur', label: 'Sur' })])
    expect(out).toEqual({ ok: true, regions: [{ key: 'norte', label: 'Norte', color: '#aabbcc' }, { key: 'sur', label: 'Sur' }] })
  })

  it('keeps the order of the rows', () => {
    const out = validateRegions([region({ uid: 1, key: 'b', label: 'B' }), region({ uid: 0, key: 'a', label: 'A' })])
    expect(out.ok && out.regions.map((r) => r.key)).toEqual(['b', 'a'])
  })

  it('never rewrites the key of a persisted row, even if it predates the key rules', () => {
    const out = validateRegions([region({ key: 'Costa Vieja', label: 'Costa' })])
    expect(out).toEqual({ ok: true, regions: [{ key: 'Costa Vieja', label: 'Costa' }] })
  })

  it('requires at least one region and at most the limit', () => {
    expect(validateRegions([])).toMatchObject({ ok: false, list: expect.stringContaining('al menos una') })
    const many = Array.from({ length: MAX_REGIONS + 1 }, (_, i) => region({ uid: i, key: `r${i}`, label: `R${i}` }))
    expect(validateRegions(many)).toMatchObject({ ok: false, list: expect.stringContaining(String(MAX_REGIONS)) })
  })

  it('flags per-row problems by uid: label, colour, key format, duplicates (also among new rows) and reserved keys', () => {
    const out = validateRegions([
      region({ uid: 0, key: 'norte', label: '' }),
      region({ uid: 1, key: 'sur', label: 'S'.repeat(REGION_LABEL_MAX + 1), color: 'red' }),
      region({ uid: 2, key: 'Norte', label: 'Otra', persisted: false }),
      region({ uid: 3, key: 'nueva', label: 'N1', persisted: false }),
      region({ uid: 4, key: ' NUEVA ', label: 'N2', persisted: false }),
      region({ uid: 5, key: 'constructor', label: 'C', persisted: false }),
    ])
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.errors[0].label).toContain('obligatorio')
    expect(out.errors[1].label).toContain(String(REGION_LABEL_MAX))
    expect(out.errors[1].color).toContain('#rrggbb')
    expect(out.errors[2].key).toContain('Ya hay otro')
    expect(out.errors[3].key).toContain('Ya hay otro')
    expect(out.errors[4].key).toContain('Ya hay otro')
    expect(out.errors[5].key).toContain('reservada')
  })

  it('builds drafts from stored regions (persisted) and new rows get a fresh uid', () => {
    const drafts = regionDrafts([{ key: 'a', label: 'A', color: '#112233' }, { key: 'b', label: 'B' }])
    expect(drafts.map((d) => [d.key, d.color, d.persisted])).toEqual([['a', '#112233', true], ['b', '', true]])
    expect(newRegionDraft(drafts)).toMatchObject({ uid: 2, persisted: false, key: '' })
  })
})

describe('validateCustomFields', () => {
  it('stores text fields only, trimmed, in order', () => {
    const out = validateCustomFields([field({ label: ' Lema ' }), field({ uid: 1, key: 'Magralita', label: 'M', persisted: false })])
    expect(out).toEqual({ ok: true, fields: [{ key: 'lema', label: 'Lema', type: 'text' }, { key: 'magralita', label: 'M', type: 'text' }] })
  })

  it('allows an empty list (no custom fields)', () => {
    expect(validateCustomFields([])).toEqual({ ok: true, fields: [] })
  })

  it('limits the count to 10', () => {
    const rows = Array.from({ length: MAX_CUSTOM_FIELDS + 1 }, (_, i) => field({ uid: i, key: `k${i}`, label: `L${i}` }))
    expect(validateCustomFields(rows)).toMatchObject({ ok: false, list: expect.stringContaining('10') })
    expect(validateCustomFields(rows.slice(0, MAX_CUSTOM_FIELDS)).ok).toBe(true)
  })

  it('flags label limits, duplicate keys against persisted ones, and reserved keys', () => {
    const out = validateCustomFields([
      field({ uid: 0, label: 'x'.repeat(FIELD_LABEL_MAX + 1) }),
      field({ uid: 1, key: 'lema', label: 'Dup', persisted: false }),
      field({ uid: 2, key: 'prototype', label: 'P', persisted: false }),
    ])
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.errors[0].label).toContain(String(FIELD_LABEL_MAX))
    expect(out.errors[1].key).toContain('Ya hay otro')
    expect(out.errors[2].key).toContain('reservada')
  })

  it('builds drafts from stored fields', () => {
    const drafts = fieldDrafts([{ key: 'lema', label: 'Lema' }])
    expect(drafts).toEqual([{ uid: 0, key: 'lema', label: 'Lema', persisted: true }])
    expect(newFieldDraft(drafts).uid).toBe(1)
  })
})

describe('region usage', () => {
  const rows = {
    lugares: [{ region: 'norte' }, { region: 'norte' }, { region: '' }, {}],
    pnjs: [{ region: 'norte' }, { region: 'sur' }],
    pjs: [{ region: 123 }],
    facciones: [],
  }
  it('counts rows per region key and table, ignoring empty or non-string regions', () => {
    const usage = countRegionUsage(rows)
    expect(usage.get('norte')).toEqual({ lugares: 2, pnjs: 1 })
    expect(usage.get('sur')).toEqual({ pnjs: 1 })
    expect(usage.size).toBe(2)
  })
  it('describes the use with Spanish singular/plural nouns, empty when unused', () => {
    expect(describeUsage({ lugares: 2, pnjs: 1, pjs: 1, facciones: 3 })).toBe('2 lugares, 1 PNJ, 1 personaje, 3 facciones')
    expect(describeUsage(undefined)).toBe('')
    expect(describeUsage({})).toBe('')
  })
})
