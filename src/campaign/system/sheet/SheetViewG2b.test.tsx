/** G2b: how SheetView draws option fields and columns, table calculations and sorted tables. */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { resolveSheet } from './resolveSheet'
import type { Sheet } from './sheetModel'
import SheetView from './SheetView'

type Loose = Record<string, unknown>
const opts = (...pairs: [string, string, string?][]) => pairs.map(([key, label, formula]) => ({ key, label, ...(formula ? { formula } : {}) }))
const section = (key: string, mode: string, items: Loose[], extra: Loose = {}) => ({
  key,
  label: key.toUpperCase(),
  items,
  blocks: [{ key: `b_${key}`, mode, items: items.map((i) => i.key), ...extra }],
})
const draw = (sections: Loose[], pj: Loose) => {
  const sheet = { categories: [{ key: 'c', label: 'C', sections }], roles: {} } as unknown as Sheet
  return render(<SheetView resolved={resolveSheet(sheet, pj)} unread={{}} />)
}
const num = (key: string, label: string, extra: Loose = {}) => ({ kind: 'field', key, label, type: 'number', editableBy: 'dm', ...extra })
const choice = (key: string, label: string, extra: Loose = {}) => ({ kind: 'field', key, label, type: 'options', display: 'select', editableBy: 'player', ...extra })

describe('SheetView: option fields', () => {
  const fields = [
    num('bonus', 'Bono', { default: 2 }),
    choice('estilo', 'Estilo', { options: opts(['a', 'Agresivo'], ['b', 'Boxeador', '{bonus} * 2']) }),
    choice('firmado', 'Firmado', { format: 'signed', options: opts(['x', 'X', '{bonus} * 1'], ['y', 'Y']) }),
    choice('vacio', 'Sin elegir', { options: opts(['a', 'A'], ['b', 'B']) }),
    choice('roto', 'Roto', { options: opts(['a', 'A', '{ghost}'], ['b', 'B']) }),
    choice('interruptor', 'Interruptor', { display: 'checkbox', options: opts(['no', 'Apagado'], ['si', 'Encendido']) }),
  ]
  const view = (pj: Loose) => draw([section('tiles', 'tile', fields)], pj)

  it('shows the label of an option with no formula and the result text of one with a formula', () => {
    view({ estilo: 'a', firmado: 'y', interruptor: 'si' })
    expect(screen.getByText('Agresivo')).toBeTruthy()
    expect(screen.getByText('Encendido')).toBeTruthy()
    expect(screen.getByText('Y')).toBeTruthy()
  })

  it('shows a numeric result as a number, with a leading + when the format is signed', () => {
    view({ estilo: 'b', firmado: 'x' })
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy()
    expect(screen.queryByText('Boxeador')).toBeNull()
  })

  it('does not draw a field with nothing selected, and draws a failing one as a dash', () => {
    view({ roto: 'a' })
    expect(screen.queryByText('Sin elegir')).toBeNull()
    const broken = screen.getByTitle('No se pudo calcular')
    expect(within(broken).getByText('Roto')).toBeTruthy()
    expect(within(broken).getByText('—')).toBeTruthy()
  })
})

describe('SheetView: table calculations', () => {
  const equipo = {
    kind: 'table',
    type: 'libre',
    key: 'equipo',
    label: 'Equipo',
    editableBy: 'player',
    columns: [{ key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'player' }, { key: 'peso', label: 'Peso', type: 'number', editableBy: 'player' }],
  }
  const calc = (key: string, label: string, spec: Loose, extra: Loose = {}) => ({ kind: 'field', key, label, type: 'number', editableBy: 'dm', calc: spec, ...extra })
  const rows = [{ nombre: 'Cuerda', peso: 10 }, { nombre: 'Cuerda', peso: 3 }, { nombre: 'Antorcha', peso: 1 }]
  const items = [
    calc('total', 'Peso total', { table: 'equipo', column: 'peso', op: 'suma' }),
    calc('oculto', 'Peso oculto', { table: 'equipo', column: 'peso', op: 'suma' }, { hidden: true }),
    calc('comun', 'Más común', { table: 'equipo', column: 'nombre', op: 'mas_frecuente' }, { type: 'short' }),
    calc('mayor', 'Más pesado', { table: 'equipo', column: 'peso', op: 'mayor' }),
    calc('promedio', 'Peso medio', { table: 'equipo', column: 'peso', op: 'promedio' }),
  ]
  const view = (pj: Loose) => draw([section('calcs', 'tile', items), section('tabla', 'plano', [equipo])], pj)

  it('draws each calculation with its computed value, numbers rounded to two decimals', () => {
    view({ equipo: rows })
    for (const [label, value] of [['Peso total', '14'], ['Más común', 'Cuerda'], ['Más pesado', '10'], ['Peso medio', '4.67']]) {
      const tile = screen.getByText(label).parentElement as HTMLElement
      expect(within(tile).getByText(value), label).toBeTruthy()
    }
  })

  it('does not draw a hidden calculation', () => {
    view({ equipo: rows })
    expect(screen.queryByText('Peso oculto')).toBeNull()
  })

  it('draws a calculation that cannot be computed as a dash (an average of nothing), not as nothing', () => {
    view({})
    expect(screen.getAllByTitle('No se pudo calcular').map((tile) => tile.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Más común')]))
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(within(screen.getByText('Peso total').parentElement as HTMLElement).getByText('0')).toBeTruthy()
  })
})

describe('SheetView: option columns', () => {
  const stats = { kind: 'table', type: 'stat', key: 'tabla_stats', label: 'Stats', rows: [{ key: 'stat_car', label: 'CAR', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'dm' }] }
  const habilidades = {
    kind: 'table',
    type: 'capacidades',
    key: 'habilidades',
    label: 'Habilidades',
    columns: [
      {
        key: 'competencia',
        label: 'Competencia',
        type: 'options',
        display: 'select',
        format: 'signed',
        editableBy: 'player',
        options: opts(['no', 'No competente', '{modificador} + {bonus} * 0'], ['si', 'Competente', '{modificador} + {bonus} * 1'], ['ex', 'Experto', '{modificador} + {bonus} * 2']),
      },
    ],
    rows: [
      { key: 'sk_a', label: 'Persuasión', stat: 'stat_car', use: 'modificador', editableBy: 'player' },
      { key: 'sk_b', label: 'Engaño', stat: 'stat_car', use: 'modificador', editableBy: 'player' },
      { key: 'sk_c', label: 'Intimidar', stat: 'stat_car', use: 'modificador', editableBy: 'player' },
    ],
  }

  it('draws the option result of each row in the Capacidades tile (S20: +3, +5, +7)', () => {
    draw([section('base', 'tile', [num('bonus', 'Bono', { default: 2 })]), section('caps', 'capacidades', [stats, habilidades])], { stat_car: 16, sk_a: 'no', sk_b: 'si', sk_c: 'ex' })
    const tile = screen.getByTestId('capacidades-stat_car')
    const line = (label: string) => (within(tile).getByText(label).parentElement as HTMLElement).textContent
    expect(line('Persuasión')).toContain('+3')
    expect(line('Engaño')).toContain('+5')
    expect(line('Intimidar')).toContain('+7')
  })
})

describe('SheetView: tables with options columns and a default sort', () => {
  const table = (extra: Loose = {}) => ({
    kind: 'table',
    type: 'libre',
    key: 'equipo',
    label: 'Inventario',
    editableBy: 'player',
    columns: [
      { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'player' },
      { key: 'peso', label: 'Peso', type: 'number', editableBy: 'player' },
      { key: 'calidad', label: 'Calidad', type: 'options', display: 'select', format: 'signed', editableBy: 'player', options: opts(['mala', 'Mala', '{peso} * 1'], ['rara', 'Rara']) },
      { key: 'vacia', label: 'Columna vacía', type: 'short', editableBy: 'player' },
    ],
    ...extra,
  })
  const pj = {
    equipo: [
      { nombre: 'Soga', peso: 10, calidad: 'mala' },
      { nombre: 'Antorcha', peso: 1, calidad: 'rara' },
      { nombre: 'Pico', peso: 5 },
    ],
  }
  const names = () => screen.getAllByRole('row').slice(1).map((tr) => within(tr).getAllByRole('cell')[0].textContent)

  it('draws the display text of an options cell, and no cell for a column nobody filled in', () => {
    draw([section('inv', 'plano', [table()])], pj)
    expect(screen.getByText('+10')).toBeTruthy()
    expect(screen.getByText('Rara')).toBeTruthy()
    expect(screen.queryByText('Columna vacía')).toBeNull()
    expect(names()).toEqual(['Soga', 'Antorcha', 'Pico'])
  })

  it('draws the rows in the default order of the table', () => {
    draw([section('inv', 'plano', [table({ sortBy: { column: 'peso', direction: 'asc' } })])], pj)
    expect(names()).toEqual(['Antorcha', 'Pico', 'Soga'])
  })

  it('does not draw an options column whose cells are all empty, and an empty options cell is blank', () => {
    draw([section('inv', 'plano', [table()])], { equipo: [{ nombre: 'Pico', peso: 5 }] })
    expect(screen.queryByText('Calidad')).toBeNull()
  })

  it('shows the display text of an options column in the modal of a habilidad row', () => {
    const habilidad = {
      kind: 'table',
      type: 'habilidad',
      key: 'hechizos',
      label: 'Hechizos',
      editableBy: 'dm',
      sortBy: { column: 'nombre', direction: 'asc' },
      columns: [
        { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' },
        { key: 'categoria', label: 'Categoría', type: 'short', editableBy: 'dm' },
        { key: 'escuela', label: 'Escuela', type: 'options', display: 'select', editableBy: 'dm', options: opts(['evo', 'Evocación'], ['abj', 'Abjuración']) },
      ],
    }
    draw([section('magia', 'modal', [habilidad], { filterCategories: ['Trucos'] })], {
      hechizos: [{ nombre: 'Zap', categoria: 'Trucos', escuela: 'evo' }, { nombre: 'Aura', categoria: 'Trucos', escuela: 'abj' }],
    })
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Aura', 'Zap'])
    fireEvent.click(screen.getByText('Zap'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Escuela')).toBeTruthy()
    expect(within(dialog).getByText('Evocación')).toBeTruthy()
  })
})
