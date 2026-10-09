import { describe, expect, it } from 'vitest'
import {
  filterNotes, groupByAuthor, highlightSegments, isChipActive, parseQuery, toggleChip, typesPresent, type NoteRow,
} from './notesSearch'

const note = (over: Partial<NoteRow>): NoteRow => ({ type: 'lore', id: 1, text: '', key: 'u1', label: '', ...over })
const names: Record<string, string> = { 'lore:1': 'El Cisma', 'pnjs:2': 'Ana la Bruja', 'sesiones:3': 'Inicio' }
const nameOf = (type: string, id: number) => names[`${type}:${id}`] ?? `#${id}`

const NOTES = [
  note({ type: 'lore', id: 1, text: 'Algo sobre la guerra' }),
  note({ type: 'pnjs', id: 2, text: 'Miente mucho' }),
  note({ type: 'sesiones', id: 3, text: 'Llegamos tarde' }),
]
const ids = (list: NoteRow[]) => list.map((n) => `${n.type}:${n.id}`)

describe('parseQuery', () => {
  it('splits the first [section] from the text and trims both', () => {
    expect(parseQuery('[pnj]  bruja ')).toEqual({ sectionFilter: 'pnj', textFilter: 'bruja' })
    expect(parseQuery('guerra')).toEqual({ sectionFilter: null, textFilter: 'guerra' })
    expect(parseQuery('[ lore ]')).toEqual({ sectionFilter: 'lore', textFilter: '' })
  })
})

describe('filterNotes', () => {
  it('matches the section by label or table key, ignoring case and accents', () => {
    expect(ids(filterNotes(NOTES, parseQuery('[SESIÓN]'), nameOf))).toEqual(['sesiones:3'])
    expect(ids(filterNotes(NOTES, parseQuery('[pnjs]'), nameOf))).toEqual(['pnjs:2'])
  })

  it('matches text against the entity name and the body, accent-insensitively', () => {
    expect(ids(filterNotes(NOTES, parseQuery('cisma'), nameOf))).toEqual(['lore:1'])
    expect(ids(filterNotes(NOTES, parseQuery('MIENTE'), nameOf))).toEqual(['pnjs:2'])
    expect(ids(filterNotes(NOTES, parseQuery('bruja'), nameOf))).toEqual(['pnjs:2'])
  })

  it('also matches the type label when there is no bracket, but not when a bracket is given', () => {
    expect(ids(filterNotes(NOTES, parseQuery('sesion'), nameOf))).toEqual(['sesiones:3'])
    expect(filterNotes(NOTES, parseQuery('[lore] sesion'), nameOf)).toEqual([])
  })

  it('combines section and text, and an empty query keeps everything', () => {
    expect(ids(filterNotes(NOTES, parseQuery('[lore] guerra'), nameOf))).toEqual(['lore:1'])
    expect(filterNotes(NOTES, parseQuery('[lore] miente'), nameOf)).toEqual([])
    expect(filterNotes(NOTES, parseQuery(''), nameOf)).toHaveLength(3)
  })
})

describe('chips', () => {
  it('lists present types in canonical order', () => {
    expect(typesPresent([note({ type: 'items' }), note({ type: 'pjs' }), note({ type: 'items' })])).toEqual(['pjs', 'items'])
  })

  it('toggles the bracket keeping the rest of the query', () => {
    expect(toggleChip('guerra', 'pnjs')).toBe('[pnj] guerra')
    expect(toggleChip('[lore] guerra', 'pnjs')).toBe('[pnj] guerra')
    expect(isChipActive('[pnj] guerra', 'pnjs')).toBe(true)
    expect(toggleChip('[pnj] guerra', 'pnjs')).toBe('guerra')
    expect(toggleChip('[pnj]', 'pnjs')).toBe('')
    expect(isChipActive('guerra', 'pnjs')).toBe(false)
  })
})

describe('groupByAuthor', () => {
  it('groups by author key, names by display name, characters as secondary info, sorted by name', () => {
    const groups = groupByAuthor([
      note({ key: 'u2', author: 'Zoe', label: 'Mara', id: 1 }),
      note({ key: 'u1', author: 'Ana', label: 'Eldric', id: 2 }),
      note({ key: 'u2', author: 'Zoe', label: 'Mara', id: 3 }),
      note({ key: 'u2', author: 'Zoe', label: 'Kel', id: 4 }),
    ])
    expect(groups.map((g) => [g.key, g.name, g.characters, g.notes.map((n) => n.id)])).toEqual([
      ['u1', 'Ana', ['Eldric'], [2]],
      ['u2', 'Zoe', ['Mara', 'Kel'], [1, 3, 4]],
    ])
  })

  it('keeps two authors with the same name apart and falls back to the character, then "Jugador"', () => {
    const groups = groupByAuthor([note({ key: 'a', author: 'Pepe' }), note({ key: 'b', author: 'Pepe' }), note({ key: 'c', label: 'Mara' }), note({ key: 'd' })])
    expect(groups.map((g) => g.name)).toEqual(['Jugador', 'Mara', 'Pepe', 'Pepe'])
    expect(groups).toHaveLength(4)
  })
})

describe('highlightSegments', () => {
  it('marks every match with the original characters, ignoring case and accents', () => {
    expect(highlightSegments('La Sesión de la sesion', 'SESIÓN')).toEqual([
      { text: 'La ', match: false },
      { text: 'Sesión', match: true },
      { text: ' de la ', match: false },
      { text: 'sesion', match: true },
    ])
  })

  it('returns the whole text when there is no term or no match', () => {
    expect(highlightSegments('hola', '')).toEqual([{ text: 'hola', match: false }])
    expect(highlightSegments('hola', 'zzz')).toEqual([{ text: 'hola', match: false }])
    expect(highlightSegments('', 'a')).toEqual([{ text: '', match: false }])
  })

  it('stays aligned when the text holds decomposed accents', () => {
    const decomposed = 'café bar'
    const segs = highlightSegments(decomposed, 'bar')
    expect(segs.filter((s) => s.match).map((s) => s.text)).toEqual(['bar'])
    expect(segs.map((s) => s.text).join('')).toBe(decomposed)
  })
})
