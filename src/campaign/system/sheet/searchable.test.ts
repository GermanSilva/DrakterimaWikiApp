import { describe, expect, it } from 'vitest'
import { searchableLabels, searchableTags, storedSheet } from './searchable'
import { validateSheet, type Sheet } from './sheetModel'

const RAW = {
  categories: [
    {
      key: 'general', label: 'General',
      sections: [
        {
          key: 'perfil', label: 'Perfil',
          items: [
            { kind: 'field', key: 'arma', label: 'Arma', type: 'short', editableBy: 'player', searchable: true },
            { kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'player' },
            { kind: 'field', key: 'suerte', label: 'Suerte', type: 'number', editableBy: 'dm', searchable: true },
            { kind: 'field', key: 'doble', label: 'Doble', type: 'number', editableBy: 'dm', formula: '{suerte} * 2', searchable: true, format: 'signed' },
            { kind: 'field', key: 'oculto', label: 'Oculto', type: 'number', editableBy: 'dm', formula: '{suerte} + 100', hidden: true, searchable: true },
            { kind: 'field', key: 'bio', label: 'Bio', type: 'paragraph', editableBy: 'player' },
          ],
          blocks: [],
        },
      ],
    },
  ],
  roles: {},
}
const sheet = (): Sheet => {
  const r = validateSheet(RAW)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.sheet
}

describe('searchableTags (S27, S32)', () => {
  it('lists the searchable fields with a value, in sheet order, computed ones included', () => {
    expect(searchableTags(sheet(), { arma: 'Espada', edad: '30', suerte: 3 })).toEqual([
      { key: 'arma', label: 'Arma', text: 'Espada' },
      { key: 'suerte', label: 'Suerte', text: '3' },
      { key: 'doble', label: 'Doble', text: '+6' },
    ])
  })

  it('skips empty values, fields not marked searchable and hidden formula fields', () => {
    const tags = searchableTags(sheet(), { arma: '', suerte: 3 })
    expect(tags.map((t) => t.key)).toEqual(['suerte', 'doble'])
    expect(tags.some((t) => t.key === 'oculto' || t.key === 'edad')).toBe(false)
  })

  it('shows a stored zero', () => {
    expect(searchableTags(sheet(), { suerte: 0 }).find((t) => t.key === 'suerte')?.text).toBe('0')
  })

  it('names the searchable fields a viewer can see', () => {
    expect(searchableLabels(sheet())).toEqual(['Arma', 'Suerte', 'Doble'])
  })
})

describe('storedSheet', () => {
  it('returns the validated sheet, or null when absent or invalid', () => {
    expect(storedSheet({ sheet: RAW })?.categories).toHaveLength(1)
    expect(storedSheet({ sheet: undefined })).toBeNull()
    expect(storedSheet({ sheet: { categories: 'x' } })).toBeNull()
  })
})
