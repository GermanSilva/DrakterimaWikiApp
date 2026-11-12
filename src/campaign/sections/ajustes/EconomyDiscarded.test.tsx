/** S8/F2: discarded economy instances are reviewed, restored and deleted in Sistema › Economía; the builder cannot bring them back. */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderEconomy, sectionItems, type Json } from './economyTestKit'
import { pressBar } from './saveBarTestKit'

configure({ asyncUtilTimeout: 10000 })
afterEach(() => vi.restoreAllMocks())

const AT = '2026-10-01T12:00:00.000Z'
const BANCO = { kind: 'table', type: 'economia', key: 'banco', label: 'Banco', editableBy: 'dm' }
const SHEET = (discarded: Json[] = [{ item: BANCO, section: 'equipo', at: AT }]): Json => ({
  categories: [
    {
      key: 'general',
      label: 'General',
      sections: [
        { key: 'perfil', label: 'Perfil', items: [{ kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'dm' }], blocks: [] },
        {
          key: 'equipo',
          label: 'Equipo',
          items: [{ kind: 'table', type: 'monedas', key: 'bolsa', label: 'Bolsa', rows: [{ key: 'oro', label: 'oro', value: 100 }, { key: 'bronce', label: 'bronce', value: 1 }], rewardDestination: true }],
          blocks: [],
        },
      ],
    },
  ],
  roles: {},
  discarded,
})
const PJS: Json[] = [
  { id: 1, campaign_id: 'c1', nombre: 'Ana', banco: 'tres cofres', updated_at: 'p1' },
  { id: 2, campaign_id: 'c1', nombre: 'Bruno', updated_at: 'p2' },
]

const names = (items: Json[]) => items.map((i) => i['key'])
const economy = () => screen.findByRole('region', { name: 'Economía' })
const discardedCard = async (name: string) => within(await screen.findByRole('region', { name: 'Instancias descartadas' })).getByRole('group', { name: `Descartado ${name}` })

describe('discarded economy instances live in Sistema › Economía', () => {
  it('the builder does not list them and a builder save never brings them back', async () => {
    const h = renderEconomy(SHEET(), { tab: 'ficha', pjs: PJS })
    await screen.findByRole('group', { name: 'Ítem Bolsa' })
    expect(screen.queryByRole('region', { name: 'Campos descartados' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Descartado Banco' })).toBeNull()
    expect(await screen.findByText(/instancia de economía descartada/)).toBeInTheDocument()
    fireEvent.click(within(await screen.findByRole('group', { name: 'Sección Perfil' })).getByRole('button', { name: 'Agregar campo' }))
    fireEvent.change(within(await screen.findByRole('group', { name: 'Ítem Nuevo campo' })).getByLabelText('Nombre del ítem'), { target: { value: 'Altura' } })
    await pressBar('Guardar plantilla')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(names(sectionItems(h.sheet(), 'equipo'))).toEqual(['bolsa'])
    expect(((h.sheet().discarded as Json[])[0].item as Json)['key']).toBe('banco')
  })

  it('lists them in Sistema with what each character holds, restores one into its section and saves it with the system, keeping the data', async () => {
    const h = renderEconomy(SHEET(), { pjs: PJS })
    const card = await discardedCard('Banco')
    await waitFor(() => expect(within(card).getByRole('list', { name: 'Datos de los personajes' })).toHaveTextContent('Ana: tres cofres'))
    fireEvent.click(within(card).getByRole('button', { name: 'Restaurar' }))
    const region = within(await economy())
    expect(await region.findByRole('group', { name: 'Instancia Banco' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Instancias descartadas' })).toBeNull()
    expect(h.spies.setSystemProfile).not.toHaveBeenCalled()
    await pressBar('Guardar sistema')
    await waitFor(() => expect(h.spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(names(sectionItems(h.sheet(), 'equipo'))).toEqual(['bolsa', 'banco'])
    expect(h.sheet().discarded).toBeUndefined()
    expect(h.spies.purgeDiscardedItem).not.toHaveBeenCalled()
    expect(h.spies.rekeyDiscardedItem).not.toHaveBeenCalled()
  })

  it('deletes one for good after confirming, through the purge RPC', async () => {
    const h = renderEconomy(SHEET(), { pjs: PJS })
    const card = await discardedCard('Banco')
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Eliminar definitivamente' })).toBeEnabled())
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar definitivamente' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('se borran los datos de 1 personaje')
    expect(h.spies.purgeDiscardedItem).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }))
    await waitFor(() => expect(h.spies.purgeDiscardedItem).toHaveBeenCalledWith('c1', 'banco', expect.any(String)))
  })

  it('does not offer to delete while the Sistema draft has changes', async () => {
    renderEconomy(SHEET(), { pjs: PJS })
    const card = await discardedCard('Banco')
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Eliminar definitivamente' })).toBeEnabled())
    const region = within(await economy())
    fireEvent.click(within(region.getByRole('row', { name: 'Moneda oro' })).getByRole('button', { name: 'Editar' }))
    fireEvent.change(within(region.getByRole('row', { name: 'Moneda oro' })).getByLabelText('Nombre de la moneda'), { target: { value: 'Corona' } })
    expect(within(await discardedCard('Banco')).getByRole('button', { name: 'Eliminar definitivamente' })).toBeDisabled()
  })

  it('restoring under a new key when a live table took the old one warns, moves the data in one RPC and writes the economy as Sistema owns it', async () => {
    const taken = { ...BANCO, key: 'bolsa', label: 'Bolsa vieja' }
    const h = renderEconomy(SHEET([{ item: taken, section: 'equipo', at: AT }]), { pjs: [{ id: 1, nombre: 'Ana', bolsa: 'x', updated_at: 'p' }] })
    const card = await discardedCard('Bolsa vieja')
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Restaurar' })).toBeEnabled())
    fireEvent.click(within(card).getByRole('button', { name: 'Restaurar' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('La clave «bolsa» ya la usa otro campo de la plantilla: se restauró como «bolsa_2».')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar y guardar' }))
    await waitFor(() => expect(h.spies.rekeyDiscardedItem).toHaveBeenCalledTimes(1))
    const [id, key, renames, profile] = h.spies.rekeyDiscardedItem.mock.calls[0] as unknown as [string, string, Record<string, string>, { sheet: Json }]
    expect([id, key, renames]).toEqual(['c1', 'bolsa', { bolsa: 'bolsa_2' }])
    expect(names(sectionItems(profile.sheet, 'equipo'))).toEqual(['bolsa', 'bolsa_2'])
    expect(profile.sheet.discarded).toBeUndefined()
    expect(h.spies.setSystemProfile).not.toHaveBeenCalled()
  })
})
