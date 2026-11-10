/** sheet.card (odd/tasks/ficha-indice-lateral.md S12-S14): validateSheet and resolveCard. */
import { describe, expect, it } from 'vitest'
import { resolveCard } from './card'
import { validateSheet, type Sheet } from './sheetModel'

const f = (key: string, label: string, type = 'number', extra: Record<string, unknown> = {}) => ({ kind: 'field', key, label, type, editableBy: 'dm', ...extra })

const base = (card?: unknown): Record<string, unknown> => ({
  categories: [
    {
      key: 'c',
      label: 'C',
      sections: [
        {
          key: 's',
          label: 'S',
          items: [
            { kind: 'table', type: 'stat', key: 'atributos', label: 'Atributos', rows: [{ key: 'int', label: 'INT', modifier: '{valor}', editableBy: 'dm' }, { key: 'fue', label: 'FUE', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'dm' }] },
            f('humanidad', 'Humanidad'),
            f('humanidad_max', 'Humanidad máx.'),
            f('trauma', 'Trauma', 'short'),
            f('trasfondo', 'Trasfondo', 'paragraph'),
            f('marcado', 'Marcado', 'boolean'),
            { kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero', rows: [{ key: 'corona', label: 'Corona', value: 100 }, { key: 'obolo', label: 'Óbolo', value: 1 }] },
          ],
          blocks: [{ key: 'b', mode: 'tile', items: ['humanidad'] }],
        },
      ],
    },
  ],
  roles: {},
  ...(card === undefined ? {} : { card }),
})

const errorsOf = (sheet: unknown) => {
  const result = validateSheet(sheet)
  return result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`)
}
const valid = (raw: unknown): Sheet => {
  const result = validateSheet(raw)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.sheet
}

describe('validateSheet: card', () => {
  it('keeps a valid card: pinned fields with max and dmOnly, a stat line and an excerpt', () => {
    const card = { pinned: [{ key: 'humanidad', max: 'humanidad_max' }, { key: 'trauma', dmOnly: true }, { key: 'dinero' }], statline: 'atributos', excerpt: 'trasfondo' }
    expect(valid(base(card)).card).toEqual(card)
  })

  it('has no card when none is given (today: identity and roles only)', () => {
    expect(valid(base())).not.toHaveProperty('card')
  })

  it('drops dmOnly false and accepts an empty pinned list', () => {
    expect(valid(base({ pinned: [{ key: 'trauma', dmOnly: false }] })).card).toEqual({ pinned: [{ key: 'trauma' }] })
    expect(valid(base({ pinned: [] })).card).toEqual({ pinned: [] })
  })

  it('rejects more than 6 pinned, unknown or repeated keys, a max on a non-number and a max that is not a number field', () => {
    const seven = Array.from({ length: 7 }, () => ({ key: 'trauma' }))
    expect(errorsOf(base({ pinned: seven }))).toContain('card.pinned: at most 6 pinned fields')
    expect(errorsOf(base({ pinned: [{ key: 'nada' }] }))).toContain('card.pinned[0].key: a pinned key is a field or a coin table')
    expect(errorsOf(base({ pinned: [{ key: 'atributos' }] }))).toContain('card.pinned[0].key: a pinned key is a field or a coin table')
    expect(errorsOf(base({ pinned: [{ key: 'trauma' }, { key: 'trauma' }] }))).toContain('card.pinned[1].key: pinned twice')
    expect(errorsOf(base({ pinned: [{ key: 'trauma', max: 'humanidad_max' }] }))).toContain('card.pinned[0].max: a max needs a number field and a number max')
    expect(errorsOf(base({ pinned: [{ key: 'humanidad', max: 'trauma' }] }))).toContain('card.pinned[0].max: a max needs a number field and a number max')
    expect(errorsOf(base({ pinned: [{ key: 'trauma', dmOnly: 'si' }] }))).toContain('card.pinned[0].dmOnly: dmOnly is true or false')
  })

  it('rejects a stat line that is not a stat table and an excerpt that is not a text field, and a card that is not an object', () => {
    expect(errorsOf(base({ pinned: [], statline: 'dinero' }))).toContain('card.statline: the stat line is a stat table')
    expect(errorsOf(base({ pinned: [], excerpt: 'humanidad' }))).toContain('card.excerpt: the excerpt is a text field')
    expect(errorsOf(base('x'))).toContain('card: card must be an object')
    expect(errorsOf(base({}))).toContain('card.pinned: at most 6 pinned fields')
  })
})

describe('resolveCard', () => {
  const sheet = valid(base({ pinned: [{ key: 'humanidad', max: 'humanidad_max' }, { key: 'trauma', dmOnly: true }, { key: 'dinero' }, { key: 'marcado' }], statline: 'atributos', excerpt: 'trasfondo' }))
  const pj = { humanidad: 42, humanidad_max: 60, trauma: 'Paranoico', trasfondo: 'Ex seguridad.', int: 6, fue: 14, marcado: true, monedas: { corona: 4, obolo: 7 }, monedas_guardado: { corona: 30 } }

  it('resolves the pinned fields in order: number with max as a bar, text, coin total in the base unit', () => {
    expect(resolveCard(sheet, pj).pinned).toEqual([
      { key: 'humanidad', label: 'Humanidad', value: '42', max: '60', ratio: 0.7 },
      { key: 'trauma', label: 'Trauma', value: 'Paranoico', dmOnly: true },
      { key: 'dinero', label: 'Dinero', value: '3407', unit: 'Óbolo' },
      { key: 'marcado', label: 'Marcado', value: 'Sí' },
    ])
  })

  it('leaves no gap for a pinned field without value', () => {
    expect(resolveCard(sheet, { ...pj, trauma: '' }).pinned.map((p) => p.key)).toEqual(['humanidad', 'dinero', 'marcado'])
  })

  it('resolves the stat line (value alone when the modifier is the value) and the excerpt', () => {
    const card = resolveCard(sheet, pj)
    expect(card.statline).toEqual([{ key: 'int', label: 'INT', text: '6' }, { key: 'fue', label: 'FUE', text: '+2' }])
    expect(card.excerpt).toBe('Ex seguridad.')
  })

  it('is empty for a sheet without card', () => {
    expect(resolveCard(valid(base()), pj)).toEqual({ pinned: [], statline: null, excerpt: null })
  })
})
