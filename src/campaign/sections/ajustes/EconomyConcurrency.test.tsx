import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { destinations, renderEconomy, sectionItems, type Json } from './economyTestKit'
import { pressBar, saveBar } from './saveBarTestKit'

configure({ asyncUtilTimeout: 10000 })
afterEach(() => vi.restoreAllMocks())

const SHEET = (): Json => ({
  categories: [
    {
      key: 'general',
      label: 'General',
      sections: [
        { key: 'perfil', label: 'Perfil', items: [{ kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'dm' }], blocks: [] },
        {
          key: 'equipo',
          label: 'Equipo',
          items: [
            { kind: 'table', type: 'monedas', key: 'bolsa', label: 'Bolsa', rows: [{ key: 'oro', label: 'oro', value: 100 }, { key: 'bronce', label: 'bronce', value: 1 }], rewardDestination: true },
            { kind: 'table', type: 'economia', key: 'banco', label: 'Banco', editableBy: 'dm' },
          ],
          blocks: [{ key: 'dinero', title: 'Dinero', mode: 'plano', items: ['bolsa', 'banco'] }],
        },
      ],
    },
  ],
  roles: {},
})

const tab = async (name: RegExp) => fireEvent.click(await screen.findByRole('tab', { name }, { timeout: 12000 }))
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const keys = (items: Json[]) => items.map((i) => i.key)

/** Ficha tab: adds a field to the section Perfil (an unsaved builder change). */
async function addBuilderField(label: string) {
  await tab(/Ficha/)
  const perfil = await screen.findByRole('group', { name: 'Sección Perfil' })
  fireEvent.click(within(perfil).getByRole('button', { name: 'Agregar campo' }))
  type(within(await screen.findByRole('group', { name: 'Ítem Nuevo campo' })).getByLabelText('Nombre del ítem'), label)
}

/** Sistema tab: adds an economy instance in the section Equipo (an unsaved Sistema change). */
async function addInstance(name: string) {
  await tab(/Sistema/)
  const region = within(await screen.findByRole('region', { name: 'Economía' }))
  fireEvent.click(region.getByRole('button', { name: '+ Nueva instancia' }))
  type(region.getByLabelText('Nombre de la nueva instancia'), name)
  fireEvent.click(region.getByRole('button', { name: 'Crear instancia' }))
}

/** Sistema tab: renames the denomination `oro`. */
async function renameCoin(label: string) {
  await tab(/Sistema/)
  const region = within(await screen.findByRole('region', { name: 'Economía' }))
  fireEvent.click(within(region.getByRole('row', { name: 'Moneda oro' })).getByRole('button', { name: 'Editar' }))
  type(within(region.getByRole('row', { name: 'Moneda oro' })).getByLabelText('Nombre de la moneda'), label)
}

async function save(tabName: RegExp, button: string) {
  tab(tabName)
  await waitFor(() => expect(screen.getByRole('tab', { name: tabName })).toHaveAttribute('aria-selected', 'true'))
  await pressBar(button)
}

describe('no lost update across Sistema, Juegos and Ficha saves', () => {
  it('builder first, Sistema second: the Ficha change survives a Sistema economy save and the Sistema change survives the Ficha save', async () => {
    const h = renderEconomy(SHEET())
    await addBuilderField('Altura') // unsaved in Ficha
    await addInstance('Caja') // unsaved in Sistema
    await renameCoin('Corona')
    await save(/Sistema/, 'Guardar sistema')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(keys(sectionItems(h.sheet(), 'equipo'))).toEqual(['bolsa', 'banco', 'caja'])
    expect(keys(sectionItems(h.sheet(), 'perfil'))).toEqual(['edad']) // the Ficha draft was not written by Sistema

    // the Ficha draft is still there, follows the economy and counts only its own change
    await tab(/Ficha/)
    expect(await screen.findByRole('group', { name: 'Ítem Caja' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Estado de la plantilla' })).getByText('1 cambio sin guardar')).toBeInTheDocument()

    await save(/Ficha/, 'Guardar plantilla')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(2))
    const sheet = h.sheet()
    expect(keys(sectionItems(sheet, 'perfil'))).toEqual(['edad', 'altura'])
    expect(keys(sectionItems(sheet, 'equipo'))).toEqual(['bolsa', 'banco', 'caja'])
    expect((sectionItems(sheet, 'equipo')[0].rows as Json[])[0].label).toBe('Corona')
    expect(destinations(sheet)).toEqual(['bolsa'])
  })

  it('Sistema first (draft open), Ficha second: the builder save keeps its placement and the later Sistema save keeps the builder change', async () => {
    const h = renderEconomy(SHEET())
    await addInstance('Caja') // Sistema draft, not saved yet
    await addBuilderField('Altura')
    await save(/Ficha/, 'Guardar plantilla')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(keys(sectionItems(h.sheet(), 'perfil'))).toEqual(['edad', 'altura'])
    expect(keys(sectionItems(h.sheet(), 'equipo'))).toEqual(['bolsa', 'banco']) // the unsaved instance was not written by the builder

    await save(/Sistema/, 'Guardar sistema')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(2))
    expect(keys(sectionItems(h.sheet(), 'perfil'))).toEqual(['edad', 'altura'])
    expect(keys(sectionItems(h.sheet(), 'equipo'))).toEqual(['bolsa', 'banco', 'caja'])
  })

  it('S8/F1: a Ficha reorder save leaves a clean Sistema clean', async () => {
    const h = renderEconomy(SHEET())
    await tab(/Ficha/)
    fireEvent.click(within(await screen.findByRole('group', { name: 'Ítem Banco' })).getByRole('button', { name: 'Subir ítem' }))
    await save(/Ficha/, 'Guardar plantilla')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))
    await tab(/Sistema/)
    await screen.findByRole('region', { name: 'Economía' })
    expect(screen.getByRole('tab', { name: /Sistema/ })).not.toHaveAccessibleName(/cambios sin guardar/)
  })

  it('S8/F1: reordering economy tables in Ficha keeps an unsaved Sistema draft', async () => {
    const h = renderEconomy(SHEET())
    await renameCoin('Corona')
    await tab(/Ficha/)
    fireEvent.click(within(await screen.findByRole('group', { name: 'Ítem Banco' })).getByRole('button', { name: 'Subir ítem' }))
    await save(/Ficha/, 'Guardar plantilla')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(keys(sectionItems(h.sheet(), 'equipo'))).toEqual(['banco', 'bolsa'])
    await tab(/Sistema/)
    const region = within(await screen.findByRole('region', { name: 'Economía' }))
    expect(region.getByRole('row', { name: 'Moneda Corona' })).toBeInTheDocument()
  })

  it('an instance deleted in Sistema is not brought back by a builder draft that still had it, and its discarded entry stays', async () => {
    const h = renderEconomy(SHEET())
    await addBuilderField('Altura')
    await tab(/Sistema/)
    const region = within(await screen.findByRole('region', { name: 'Economía' }))
    fireEvent.click(within(region.getByRole('group', { name: 'Instancia Banco' })).getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    await save(/Sistema/, 'Guardar sistema')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))

    await tab(/Ficha/)
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Ítem Banco' })).toBeNull())
    await save(/Ficha/, 'Guardar plantilla')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(2))
    const sheet = h.sheet()
    expect(keys(sectionItems(sheet, 'equipo'))).toEqual(['bolsa'])
    expect(keys(sectionItems(sheet, 'perfil'))).toEqual(['edad', 'altura'])
    expect(((sheet.discarded as Json[])[0].item as Json).key).toBe('banco')
    expect(((((sheet.categories as Json[])[0].sections as Json[])[1].blocks as Json[])[0]).items).toEqual(['bolsa'])
  })

  it('the destination chosen in Juegos survives a Sistema save made from an older draft, and a Ficha save', async () => {
    const h = renderEconomy(SHEET())
    await addInstance('Caja') // Sistema draft started with Bolsa as the destination
    await tab(/Juegos/)
    fireEvent.change(await screen.findByLabelText('Destino de recompensa'), { target: { value: 'banco' } })
    await save(/Juegos/, 'Guardar juegos')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(destinations(h.sheet())).toEqual(['banco'])

    await save(/Sistema/, 'Guardar sistema')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(2))
    expect(destinations(h.sheet())).toEqual(['banco'])
    expect(keys(sectionItems(h.sheet(), 'equipo'))).toEqual(['bolsa', 'banco', 'caja'])

    await addBuilderField('Altura')
    await save(/Ficha/, 'Guardar plantilla')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(3))
    expect(destinations(h.sheet())).toEqual(['banco'])
    expect(keys(sectionItems(h.sheet(), 'perfil'))).toEqual(['edad', 'altura'])
  })

  it('Sistema first, Juegos second: the destination can be an instance created a moment ago, and Sistema keeps it', async () => {
    const h = renderEconomy(SHEET())
    await addInstance('Caja')
    await save(/Sistema/, 'Guardar sistema')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))
    await tab(/Juegos/)
    const select = (await screen.findByLabelText('Destino de recompensa')) as HTMLSelectElement
    await waitFor(() => expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Bolsa', 'Banco', 'Caja', 'Ninguno']))
    fireEvent.change(select, { target: { value: 'caja' } })
    await save(/Juegos/, 'Guardar juegos')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(2))
    expect(destinations(h.sheet())).toEqual(['caja'])
    expect(keys(sectionItems(h.sheet(), 'equipo'))).toEqual(['bolsa', 'banco', 'caja'])
  })

  it('an instance that became the destination in Juegos cannot be deleted by an older Sistema draft', async () => {
    const h = renderEconomy(SHEET())
    await tab(/Sistema/)
    const region = within(await screen.findByRole('region', { name: 'Economía' }))
    fireEvent.click(within(region.getByRole('group', { name: 'Instancia Banco' })).getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    await tab(/Juegos/)
    fireEvent.change(await screen.findByLabelText('Destino de recompensa'), { target: { value: 'banco' } })
    await save(/Juegos/, 'Guardar juegos')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))
    await save(/Sistema/, 'Guardar sistema')
    expect(await screen.findByText(/pasó a ser el destino de recompensa/)).toBeInTheDocument()
    expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1) // nothing was written
    expect(keys(sectionItems(h.sheet(), 'equipo'))).toEqual(['bolsa', 'banco'])
  })

  it('the Juegos destination and the Lotería config are separate saves of the same tab', async () => {
    const h = renderEconomy(SHEET(), { tab: 'juegos', config: { loteria: { value: { commonMinRoll: 15, commonPrize: { oro: 2 }, specialPrize: { bronce: 1 } }, visibility: 'members', updated_at: 'v1' } } })
    fireEvent.change(await screen.findByLabelText('Destino de recompensa'), { target: { value: 'banco' } })
    fireEvent.change(await screen.findByLabelText(/Tirada mínima/, {}, { timeout: 12000 }), { target: { value: '12' } })
    expect(within(await saveBar()).getByText(/2 cambios sin guardar/)).toBeInTheDocument()
    await pressBar('Guardar juegos')
    await waitFor(() => expect(h.spies.configPatch).toHaveBeenCalledTimes(1))
    expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1)
    expect(destinations(h.sheet())).toEqual(['banco'])
  })
})
