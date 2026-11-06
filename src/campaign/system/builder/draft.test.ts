import { describe, expect, it } from 'vitest'
import { appendAt, moveIn, parsePath, removeFrom, setAt, slugKey } from './draft'

describe('slugKey', () => {
  it('makes a validator key from a label: accents, case and symbols removed', () => {
    expect(slugKey('Puntos de Vida', new Set())).toBe('puntos_de_vida')
    expect(slugKey('  ¡Daño Ágil! ', new Set())).toBe('dano_agil')
    expect(slugKey('3 Ataques', new Set())).toBe('ataques')
    expect(slugKey('???', new Set())).toBe('nuevo')
  })

  it('keeps it within 40 characters and without a double underscore', () => {
    const key = slugKey('a'.repeat(80), new Set())
    expect(key).toMatch(/^[a-z][a-z0-9_]{0,39}$/)
    expect(slugKey('uno -- dos', new Set())).toBe('uno_dos')
  })

  it('avoids taken keys and, for global keys, the names the application owns', () => {
    expect(slugKey('Vida', new Set(['vida']))).toBe('vida_2')
    expect(slugKey('Vida', new Set(['vida', 'vida_2']))).toBe('vida_3')
    expect(slugKey('Nombre', new Set())).toBe('nombre_2')
    expect(slugKey('Nombre', new Set(), false)).toBe('nombre')
    expect(slugKey('dm', new Set(), false, ['dm'])).toBe('dm_2')
  })
})

describe('path helpers', () => {
  it('parses validator paths', () => {
    expect(parsePath('categories[0].sections[12].items[3].options[1].key')).toEqual(['categories', 0, 'sections', 12, 'items', 3, 'options', 1, 'key'])
    expect(parsePath('roles.hp')).toEqual(['roles', 'hp'])
    expect(parsePath('')).toEqual([])
  })

  it('edits copies and never the original', () => {
    const root = { a: [{ n: 1 }, { n: 2 }] }
    const next = setAt(root, ['a', 1, 'n'], 9)
    expect(next).toEqual({ a: [{ n: 1 }, { n: 9 }] })
    expect(root.a[1].n).toBe(2)
    expect(appendAt(root, ['a'], { n: 3 }).a).toHaveLength(3)
    expect(removeFrom(root, ['a'], 0).a).toEqual([{ n: 2 }])
    expect(moveIn(root, ['a'], 0, 1).a).toEqual([{ n: 2 }, { n: 1 }])
    expect(moveIn(root, ['a'], 0, -1)).toBe(root)
  })
})
