/** Option marks (odd/tasks/ficha-indice-lateral.md S9): validateSheet, resolveSheet and the capacidades legend. */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { resolveSheet } from './resolveSheet'
import { validateSheet, type Sheet } from './sheetModel'
import SheetView from './SheetView'

const RANKS = [
  { key: 'u', label: 'sin entrenar', mark: '—', formula: '0' },
  { key: 'e', label: 'entrenado', mark: 'E', formula: '2' },
  { key: 'x', label: 'experto', mark: 'Ex', formula: '4' },
]
const UNMARKED = RANKS.map(({ key, label, formula }) => ({ key, label, formula }))

const sheetWith = (options: Record<string, unknown>[], rows = 2): Sheet =>
  ({
    categories: [
      {
        key: 'c',
        label: 'C',
        sections: [
          {
            key: 'habilidades',
            label: 'Habilidades',
            items: [
              { kind: 'table', type: 'stat', key: 'stats', label: 'Stats', rows: [{ key: 'sab', label: 'Sabiduría', modifier: '{valor}', editableBy: 'dm' }] },
              {
                kind: 'table',
                type: 'capacidades',
                key: 'skills',
                label: 'Habilidades',
                columns: [{ key: 'rango', label: 'Rango', type: 'options', display: 'select', default: 'u', options, editableBy: 'dm' }],
                rows: Array.from({ length: rows }, (_, i) => ({ key: `sk${i}`, label: i === 0 ? 'Medicina' : `Habilidad ${i}`, stat: 'sab', use: 'valor', editableBy: 'dm' })),
              },
            ],
            blocks: [{ key: 'b', mode: 'capacidades', items: ['skills'] }],
          },
        ],
      },
    ],
    roles: {},
  }) as unknown as Sheet

const errorsOf = (sheet: unknown) => {
  const result = validateSheet(sheet)
  return result.ok ? [] : result.errors.map((e) => e.path)
}
const optionsOf = (sheet: Sheet) => {
  const result = validateSheet(sheet)
  if (!result.ok) throw new Error('invalid')
  const table = result.sheet.categories[0].sections[0].items[1] as { columns: { options?: unknown[] }[] }
  return table.columns[0].options
}

describe('validateSheet: option marks', () => {
  it('keeps a mark of 1 to 3 characters, trimmed', () => {
    expect(optionsOf(sheetWith([{ ...RANKS[0], mark: ' — ' }, RANKS[1], RANKS[2]]))).toEqual(RANKS)
  })

  it('keeps options without a mark as they were', () => {
    expect(optionsOf(sheetWith(UNMARKED))).toEqual(UNMARKED)
  })

  it('rejects an empty mark, one over 3 characters, a non-text mark and hidden characters', () => {
    for (const mark of ['', '  ', 'Expe', 7, 'E​', null]) {
      expect(errorsOf(sheetWith([{ ...RANKS[0], mark }, RANKS[1]])), String(mark)).toContain('categories[0].sections[0].items[1].columns[0].options[0].mark')
    }
  })

  it('counts code points, not UTF-16 units', () => {
    expect(errorsOf(sheetWith([{ ...RANKS[0], mark: '◆◆◆' }, RANKS[1]]))).toEqual([])
  })
})

describe('resolveSheet: the selected option of an options cell', () => {
  it('carries the key of the stored option, else the default', () => {
    const cells = resolveSheet(sheetWith(RANKS), { sab: 3, sk0: 'x' }).sections[0].blocks[0].items[0]
    if (cells.kind !== 'capacidades') throw new Error('kind')
    expect(cells.rows.map((r) => r.cells[0].option)).toEqual(['x', 'u'])
  })
})

describe('SheetView: markers and legend from the options (S9)', () => {
  it('shows the mark of the selected option before each row and the legend of the options', () => {
    render(<SheetView resolved={resolveSheet(sheetWith(RANKS), { sab: 3, sk0: 'x', sk1: 'e' })} unread={{}} />)
    const tile = screen.getByTestId('capacidades-sab')
    expect(within(tile).getByText('Ex')).toBeTruthy()
    expect(within(tile).getByText('E')).toBeTruthy()
    expect(screen.getByText(/^— sin entrenar · E entrenado · Ex experto$/)).toBeTruthy()
  })

  it('draws no marker and no legend when the options have no marks', () => {
    render(<SheetView resolved={resolveSheet(sheetWith(UNMARKED), { sab: 3, sk0: 'x' })} unread={{}} />)
    expect(screen.queryByText(/sin entrenar ·/)).toBeNull()
    expect(within(screen.getByTestId('capacidades-sab')).queryByText('Ex')).toBeNull()
  })

  it('"Solo con valor" hides the rows on the first option', () => {
    render(<SheetView resolved={resolveSheet(sheetWith(RANKS, 22), { sab: 3, sk0: 'x', sk1: 'e' })} unread={{}} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo con valor' }))
    expect(screen.getByText('2 de 22')).toBeTruthy()
  })
})
