import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSheet } from './resolveSheet'
import type { Sheet } from './sheetModel'
import SheetView from './SheetView'

// odd/tasks/ficha-indice-lateral.md (S1, S5, S6, S8, S10)

const field = (key: string, label: string) => ({ kind: 'field', key, label, type: 'number', editableBy: 'dm' })
const tileSection = (key: string, label: string, items: Record<string, unknown>[]) => ({ key, label, items, blocks: [{ key: `b_${key}`, mode: 'tile', items: items.map((i) => i.key) }] })
const statTable = (rows: { key: string; label: string; modifier: string }[]) => ({ kind: 'table', type: 'stat', key: 'tabla_stats', label: 'Atributos', rows: rows.map((r) => ({ ...r, editableBy: 'dm' })) })

const SKILLS = Array.from({ length: 22 }, (_, i) => ({ key: `hab_${i}`, label: i === 0 ? 'Sigilo' : `Habilidad ${i}`, stat: 'des', use: 'valor', editableBy: 'dm' }))
const sheet = {
  categories: [
    {
      key: 'mecanicas',
      label: 'Mecánicas',
      sections: [
        {
          key: 'atributos',
          label: 'Atributos',
          items: [statTable([{ key: 'fue', label: 'Fuerza', modifier: 'floor(({valor} - 10) / 2)' }, { key: 'des', label: 'Destreza', modifier: '{valor}' }])],
          blocks: [{ key: 'b_atr', mode: 'stat', items: ['tabla_stats'] }],
        },
        {
          key: 'habilidades',
          label: 'Habilidades',
          items: [{ kind: 'table', type: 'capacidades', key: 'tabla_hab', label: 'Habilidades', editableBy: 'dm', columns: [{ key: 'nivel_h', label: 'Nivel', type: 'number', editableBy: 'dm', default: 0 }], rows: SKILLS }],
          blocks: [{ key: 'b_hab', mode: 'capacidades', items: ['tabla_hab'] }],
        },
      ],
    },
    { key: 'historia', label: 'Historia', sections: [tileSection('apariencia', 'Apariencia', [field('edad', 'Edad')])] },
  ],
  roles: {},
} as unknown as Sheet

const PJ = { fue: 16, des: 7, edad: 34, hab_0: 3, hab_1: 2 }
const resolved = () => resolveSheet(sheet, PJ)

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('SheetView: categories in the detail (S1)', () => {
  it('keeps the category key of each section in the resolved sheet', () => {
    expect(resolved().sections.map((s) => [s.key, s.categoryKey, s.category])).toEqual([
      ['atributos', 'mecanicas', 'Mecánicas'],
      ['habilidades', 'mecanicas', 'Mecánicas'],
      ['apariencia', 'historia', 'Historia'],
    ])
  })

  it('draws one labelled group per category, in order, holding its sections', () => {
    render(<SheetView resolved={resolved()} unread={{}} />)
    const groups = screen.getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Mecánicas', 'Historia'])
    expect(groups[0].querySelector('#pj-section-atributos')).not.toBeNull()
    expect(groups[1].querySelector('#pj-section-apariencia')).not.toBeNull()
  })
})

describe('SheetView: stat tiles show the value alone when there is no distinct modifier (S8)', () => {
  it('shows modifier and value when they differ, only the value when the modifier equals it', () => {
    render(<SheetView resolved={resolved()} unread={{}} />)
    const fuerza = screen.getByText('Fuerza').parentElement as HTMLElement
    expect(within(fuerza).getByText('+3')).toBeTruthy()
    expect(within(fuerza).getByText('16')).toBeTruthy()
    const destreza = screen.getByText('Destreza', { selector: '[data-stat-label]' }).parentElement as HTMLElement
    expect(within(destreza).getByText('7')).toBeTruthy()
    expect(within(destreza).queryByText('+7')).toBeNull()
  })
})

describe('SheetView: copy a link to a section (S5)', () => {
  it('copies the page URL with the section key as hash and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<SheetView resolved={resolved()} unread={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace a Apariencia' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${window.location.pathname}${window.location.search}#apariencia`)
    expect(await screen.findByRole('button', { name: 'Enlace copiado' })).toBeTruthy()
  })
})

describe('SheetView: collapsed sections are kept per character (S6)', () => {
  it('remembers a collapsed section for the same character, not for another one', () => {
    const first = render(<SheetView resolved={resolved()} unread={{}} storageKey="pj:1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Apariencia', expanded: true }))
    first.unmount()
    const again = render(<SheetView resolved={resolved()} unread={{}} storageKey="pj:1" />)
    expect(screen.getByRole('button', { name: 'Apariencia' })).toHaveAttribute('aria-expanded', 'false')
    again.unmount()
    render(<SheetView resolved={resolved()} unread={{}} storageKey="pj:2" />)
    expect(screen.getByRole('button', { name: 'Apariencia' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('a reveal expands it again and forgets the collapsed state', () => {
    const { rerender, unmount } = render(<SheetView resolved={resolved()} unread={{}} storageKey="pj:1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Apariencia', expanded: true }))
    rerender(<SheetView resolved={resolved()} unread={{}} storageKey="pj:1" reveal={{ key: 'apariencia', n: 1 }} />)
    expect(screen.getByRole('button', { name: 'Apariencia' })).toHaveAttribute('aria-expanded', 'true')
    unmount()
    render(<SheetView resolved={resolved()} unread={{}} storageKey="pj:1" />)
    expect(screen.getByRole('button', { name: 'Apariencia' })).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('SheetView: big capacidades blocks get search and "Solo con valor" (S10)', () => {
  it('shows the tools only above 20 rows, with the count of rows', () => {
    render(<SheetView resolved={resolved()} unread={{}} />)
    expect(screen.getByRole('searchbox', { name: 'Buscar en Habilidades' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Solo con valor' })).toBeTruthy()
    expect(screen.getByText('22 de 22')).toBeTruthy()
  })

  it('filters by name, by value, and says when nothing matches', () => {
    render(<SheetView resolved={resolved()} unread={{}} />)
    const search = screen.getByRole('searchbox', { name: 'Buscar en Habilidades' })
    fireEvent.change(search, { target: { value: 'sigi' } })
    expect(screen.getByText('1 de 22')).toBeTruthy()
    expect(screen.getByText('Sigilo')).toBeVisible()
    expect(screen.queryByText('Habilidad 1')).toBeNull()
    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo con valor' }))
    expect(screen.getByText('2 de 22')).toBeTruthy()
    expect(screen.getByText('Habilidad 1')).toBeTruthy()
    expect(screen.queryByText('Habilidad 2')).toBeNull()
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText('Ninguna coincide con «zzz»')).toBeTruthy()
  })

  it('draws small capacidades blocks without tools', () => {
    const small = { ...sheet, categories: [{ ...sheet.categories[0], sections: [{ ...sheet.categories[0].sections[1], items: [{ ...(sheet.categories[0].sections[1].items[0] as object), rows: SKILLS.slice(0, 5) }] }, sheet.categories[0].sections[0]] }] } as unknown as Sheet
    render(<SheetView resolved={resolveSheet(small, PJ)} unread={{}} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
})
