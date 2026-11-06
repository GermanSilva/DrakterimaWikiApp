/** G7b: the "Campos descartados" review of the builder (S26, S32): removal keeps the definition, the DM reviews each character's data, restores or deletes. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Item } from '../sheet/sheetModel'
import { STORED_SHEET } from './builderFixture'
import { click, item, section, type } from './builderTestKit'
import { SheetBuilder, type ReviewHost } from './SheetBuilder'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const AT = '2026-10-01T12:00:00.000Z'
const stored = (extra: Record<string, unknown>) => ({ ...clone(STORED_SHEET), ...extra })
const entry = (itemDef: Record<string, unknown>, sectionKey = 'perfil', at = AT) => ({ item: itemDef, section: sectionKey, at })
const MAGRALITA = { kind: 'field', key: 'magralita', label: 'Magralita', type: 'short', editableBy: 'dm' }

const region = () => screen.getByRole('region', { name: 'Campos descartados' })
const discardedItem = (name: string) => within(region()).getByRole('group', { name: `Descartado ${name}` })
const perfilKeys = (sheet: { categories: { sections: { items: Item[] }[] }[] }) => sheet.categories[0].sections[0].items.map((i) => i.key)

function host(overrides: Partial<ReviewHost> = {}): ReviewHost {
  return {
    characters: [
      { id: 1, nombre: 'Ana', values: { magralita: 'tres cargas', vida: 12, ath: 4, ath__nota: 'diestra' } },
      { id: 2, nombre: 'Bruno', values: { magralita: 'x'.repeat(200) } },
      { id: 3, nombre: 'Carla', values: { vida: 9 } },
    ],
    onPurge: vi.fn(async () => undefined),
    onRestoreRenamed: vi.fn(async () => undefined),
    ...overrides,
  }
}

function renderBuilder(initial: unknown, review?: ReviewHost) {
  let last: unknown = initial
  const onSave = vi.fn(async () => undefined)
  render(<SheetBuilder initial={initial} onChange={(d) => void (last = d)} onSave={onSave} review={review} />)
  return { draft: () => last as { discarded?: { item: { key: string }; section: string; at: string }[]; categories: never }, onSave }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T10:00:00.000Z'))
})
afterEach(() => vi.useRealTimers())

describe('removing a saved item', () => {
  it('moves it to "Campos descartados" with today\'s date instead of dropping it', () => {
    const view = renderBuilder(stored({}), host())
    expect(screen.queryByRole('region', { name: 'Campos descartados' })).not.toBeInTheDocument()
    click('Quitar ítem', within(item('Vida')))
    expect(screen.getByRole('dialog')).toHaveTextContent('Campos descartados')
    click(/^Quitar$/, within(screen.getByRole('dialog')))
    expect(screen.queryByRole('group', { name: 'Ítem Vida' })).not.toBeInTheDocument()
    const card = discardedItem('Vida')
    expect(card).toHaveTextContent('Descartado el 06/11/2026')
    expect(card).toHaveTextContent('vida')
    expect(view.draft().discarded).toEqual([{ item: { kind: 'field', key: 'vida', label: 'Vida', type: 'number', editableBy: 'dm' }, section: 'perfil', at: '2026-11-06T10:00:00.000Z' }])
  })

  it('an item added in this session is dropped without a trace', () => {
    renderBuilder(stored({}), host())
    click('Agregar campo', within(section('Perfil')))
    click('Quitar ítem', within(item('Nuevo campo')))
    expect(screen.queryByRole('region', { name: 'Campos descartados' })).not.toBeInTheDocument()
  })

  it('the saved sheet carries the discarded list', async () => {
    const view = renderBuilder(stored({}), host())
    click('Quitar ítem', within(item('Vida')))
    click(/^Quitar$/, within(screen.getByRole('dialog')))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plantilla' }))
    await waitFor(() => expect(view.onSave).toHaveBeenCalled())
    const saved = (view.onSave.mock.calls[0] as unknown as [{ discarded: { item: { key: string } }[] }])[0]
    expect(saved.discarded.map((e) => e.item.key)).toEqual(['vida'])
  })
})

describe('the review', () => {
  const withDiscarded = () => stored({ discarded: [entry(MAGRALITA), entry({ kind: 'row', type: 'capacidades', table: 'habs', key: 'ath', label: 'Atletismo', stat: 'fue', use: 'valor', editableBy: 'dm', columns: ['prof', 'nota'] })] })

  it('lists each discarded item with its date and, per character, the stored value (formatted, truncated)', () => {
    renderBuilder(withDiscarded(), host())
    const card = discardedItem('Magralita')
    expect(card).toHaveTextContent('Descartado el 01/10/2026')
    const values = within(card).getByRole('list', { name: 'Datos de los personajes' })
    const lines = within(values).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toHaveLength(2) // Carla holds nothing for it
    expect(lines[0]).toBe('Ana: tres cargas')
    expect(lines[1]).toMatch(/^Bruno: x{20,}…$/)
    expect(lines[1].length).toBeLessThan(110)
  })

  it('a row shows every key it owns', () => {
    renderBuilder(withDiscarded(), host())
    const lines = within(discardedItem('Atletismo')).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toEqual(['Ana: ath: 4; ath__nota: diestra'])
  })

  it('says so when no character holds data for it', () => {
    renderBuilder(withDiscarded(), host({ characters: [{ id: 3, nombre: 'Carla', values: {} }] }))
    expect(discardedItem('Magralita')).toHaveTextContent('Ningún personaje tiene datos guardados.')
  })

  it('does not list a live item or draw the discarded one in the sheet tree', () => {
    renderBuilder(withDiscarded(), host())
    expect(screen.queryByRole('group', { name: 'Ítem Magralita' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('La plantilla es válida.')
  })

  it('without access to the characters it still lists the definitions but offers no deletion', () => {
    renderBuilder(withDiscarded())
    const card = discardedItem('Magralita')
    expect(within(card).getByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Eliminar definitivamente' })).not.toBeInTheDocument()
  })
})

describe('Restaurar', () => {
  it('moves the item to the END of its original section and leaves the list', () => {
    const view = renderBuilder(stored({ discarded: [entry(MAGRALITA)] }), host())
    click('Restaurar', within(discardedItem('Magralita')))
    expect(screen.queryByRole('region', { name: 'Campos descartados' })).not.toBeInTheDocument()
    const keys = within(section('Perfil')).getAllByRole('group', { name: /^Ítem / }).map((g) => g.getAttribute('aria-label'))
    expect(keys).toEqual(['Ítem Edad', 'Ítem Vida', 'Ítem Notas', 'Ítem Magralita'])
    expect(view.draft().discarded).toBeUndefined()
  })

  it('goes to the last section when the original one is gone', () => {
    renderBuilder(stored({ discarded: [entry(MAGRALITA, 'ya_no_existe')] }), host())
    click('Restaurar', within(discardedItem('Magralita')))
    fireEvent.click(screen.getByRole('tab', { name: 'Mecánicas' }))
    expect(within(section('Magia')).getByRole('group', { name: 'Ítem Magralita' })).toBeInTheDocument()
  })

  it('a key a live item took gets key_2 and a warning (no host: the draft only)', () => {
    const view = renderBuilder(stored({ discarded: [entry({ ...MAGRALITA, key: 'edad' })] }))
    click('Restaurar', within(discardedItem('Magralita')))
    expect(screen.getByRole('status', { name: 'Aviso de restauración' })).toHaveTextContent('La clave «edad» ya la usa otro campo de la plantilla: se restauró como «edad_2».')
    const sections = (view.draft() as unknown as { categories: { sections: { items: { key: string }[] }[] }[] }).categories[0].sections
    expect(sections[0].items.map((i) => i.key)).toEqual(['edad', 'vida', 'notas_pj', 'edad_2'])
  })

  it('with a reused key and access to the data it asks, then saves the template and moves the data in one step', async () => {
    const review = host()
    const view = renderBuilder(stored({ discarded: [entry({ ...MAGRALITA, key: 'edad' })] }), review)
    click('Restaurar', within(discardedItem('Magralita')))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('«edad_2»')
    expect(dialog).toHaveTextContent('se guardará la plantilla')
    expect(review.onRestoreRenamed).not.toHaveBeenCalled()
    click('Restaurar y guardar', within(dialog))
    await waitFor(() => expect(review.onRestoreRenamed).toHaveBeenCalledTimes(1))
    const [key, renames, sheet, warning] = (review.onRestoreRenamed as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, string>, { categories: { sections: { items: Item[] }[] }[]; discarded?: unknown }, string]
    expect(key).toBe('edad')
    expect(renames).toEqual({ edad: 'edad_2' })
    expect(perfilKeys(sheet)).toEqual(['edad', 'vida', 'notas_pj', 'edad_2'])
    expect(sheet.discarded).toBeUndefined()
    expect(warning).toBe('La clave «edad» ya la usa otro campo de la plantilla: se restauró como «edad_2».')
    expect(view.onSave).not.toHaveBeenCalled()
  })

  it('cancelling the question changes nothing', () => {
    const review = host()
    renderBuilder(stored({ discarded: [entry({ ...MAGRALITA, key: 'edad' })] }), review)
    click('Restaurar', within(discardedItem('Magralita')))
    click('Cancelar', within(screen.getByRole('dialog')))
    expect(review.onRestoreRenamed).not.toHaveBeenCalled()
    expect(discardedItem('Magralita')).toBeInTheDocument()
  })

  it('a removed row whose table is gone explains why it cannot be restored', () => {
    renderBuilder(stored({ discarded: [entry({ kind: 'row', type: 'stat', table: 'atrib', key: 'fue', label: 'FUE', modifier: '{valor}', editableBy: 'dm' })] }), host())
    click('Restaurar', within(discardedItem('FUE')))
    expect(screen.getByRole('alert', { name: 'No se pudo restaurar' })).toHaveTextContent('su tabla «atrib» ya no está en la plantilla')
    expect(discardedItem('FUE')).toBeInTheDocument()
  })
})

describe('Eliminar definitivamente', () => {
  it('asks first, names the characters that lose data, and only then deletes', async () => {
    const review = host()
    renderBuilder(stored({ discarded: [entry(MAGRALITA)] }), review)
    click('Eliminar definitivamente', within(discardedItem('Magralita')))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Magralita')
    expect(dialog).toHaveTextContent('2 personajes')
    expect(dialog).toHaveTextContent('no se puede deshacer')
    expect(review.onPurge).not.toHaveBeenCalled()
    click('Cancelar', within(dialog))
    expect(review.onPurge).not.toHaveBeenCalled()

    click('Eliminar definitivamente', within(discardedItem('Magralita')))
    click('Eliminar definitivamente', within(screen.getByRole('dialog')))
    await waitFor(() => expect(review.onPurge).toHaveBeenCalledWith('magralita'))
    expect(review.onPurge).toHaveBeenCalledTimes(1)
  })

  it('is not offered while the draft has unsaved changes (the database acts on the saved template)', () => {
    renderBuilder(stored({ discarded: [entry(MAGRALITA)] }), host())
    const button = within(discardedItem('Magralita')).getByRole('button', { name: 'Eliminar definitivamente' })
    expect(button).toBeEnabled()
    click('Agregar categoría')
    expect(button).toBeDisabled()
    expect(discardedItem('Magralita')).toHaveTextContent('Guardá la plantilla antes de eliminar.')
  })

  it('is not offered for an item discarded in this session and not saved yet', () => {
    renderBuilder(stored({}), host())
    click('Quitar ítem', within(item('Vida')))
    click(/^Quitar$/, within(screen.getByRole('dialog')))
    expect(within(discardedItem('Vida')).getByRole('button', { name: 'Eliminar definitivamente' })).toBeDisabled()
    expect(discardedItem('Vida')).toHaveTextContent('Guardá la plantilla antes de eliminar.')
  })

  it('a field name typed in the new-field form is unaffected', () => {
    renderBuilder(stored({ discarded: [entry(MAGRALITA)] }), host())
    click('Agregar campo', within(section('Perfil')))
    type(within(item('Nuevo campo')).getByLabelText('Nombre del ítem'), 'Magralita')
    expect(within(item('Magralita')).getByLabelText('Clave del ítem')).toHaveValue('magralita_2') // the discarded key stays reserved for new names
  })
})
