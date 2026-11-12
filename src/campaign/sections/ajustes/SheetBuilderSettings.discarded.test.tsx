/** G7b in Ajustes: the "Campos descartados" review reads the characters through the data layer and acts through the DM-only RPCs (S26, S32). */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, DataError } from '../../../data'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'
import { pressBar } from './saveBarTestKit'
import { STORED_SHEET } from '../../system/builder/builderFixture'
import { DND5E_PROFILE } from '../../system/systemProfile'

configure({ asyncUtilTimeout: 10000 })
afterEach(() => vi.restoreAllMocks())

const AT = '2026-10-01T12:00:00.000Z'
const MAGRALITA = { kind: 'field', key: 'magralita', label: 'Magralita', type: 'short', editableBy: 'dm' }
const entry = (item: Record<string, unknown>) => ({ item, section: 'perfil', at: AT })
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const PJS = [
  { id: 1, campaign_id: 'c1', nombre: 'Ana', magralita: 'tres cargas', edad: '30', updated_at: 'p1' },
  { id: 2, campaign_id: 'c1', nombre: 'Bruno', edad: '41', updated_at: 'p2' },
]

function setup({ isDM = true, discarded = [entry(MAGRALITA)] }: { isDM?: boolean; discarded?: unknown[] } = {}) {
  const system = { ...clone(DND5E_PROFILE), sheet: { ...clone(STORED_SHEET), discarded }, distance: { main: 'ft', units: [{ key: 'ft', label: 'Pies', value: 1, decimals: 0 }] } }
  const stored = { name: 'Drakterima', system_profile: system }
  const made = createFakeLayer({ campaign: stored as never, entities: { pjs: PJS as never[] } })
  const view = renderSection('/c/demo/ajustes?tab=ficha', { layer: made.layer, isDM, campaign: stored as never })
  return { ...made, ...view, system }
}
const region = () => screen.findByRole('region', { name: 'Plantilla de ficha' })
const discardedItem = async (name: string) => within(await screen.findByRole('region', { name: 'Campos descartados' })).getByRole('group', { name: `Descartado ${name}` })

describe('Ajustes: Campos descartados', () => {
  it('is not reachable by a player: no list, no characters read, no RPC', async () => {
    const { spies } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Campos descartados' })).not.toBeInTheDocument()
    expect(spies.entityList).not.toHaveBeenCalled()
    expect(spies.purgeDiscardedItem).not.toHaveBeenCalled()
    expect(spies.rekeyDiscardedItem).not.toHaveBeenCalled()
  })

  it('shows the DM the discarded item with the value each character holds, read through the data layer', async () => {
    const { spies } = setup()
    const card = await discardedItem('Magralita')
    await waitFor(() => expect(within(card).getByRole('list', { name: 'Datos de los personajes' })).toHaveTextContent('Ana: tres cargas'))
    expect(within(card).getAllByRole('listitem')).toHaveLength(1) // Bruno holds nothing for it
    expect(spies.entityList).toHaveBeenCalledWith('pjs')
  })

  it('deletes after confirming: calls the RPC against the saved version and reports it', async () => {
    const { spies } = setup()
    const card = await discardedItem('Magralita')
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Eliminar definitivamente' })).toBeEnabled())
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar definitivamente' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('se borran los datos de 1 personaje')
    expect(spies.purgeDiscardedItem).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }))
    await waitFor(() => expect(spies.purgeDiscardedItem).toHaveBeenCalledWith('c1', 'magralita', '2026-01-01T00:00:00Z'))
    expect(await within(await region()).findByText('Campo descartado eliminado.')).toBeInTheDocument()
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('explains a refusal in Spanish and keeps the item', async () => {
    const { spies } = setup()
    spies.purgeDiscardedItem.mockRejectedValueOnce(new DataError('business', 'discarded_key_live', { message: 'discarded_key_live', code: 'P0001' }, 'discarded_key_live'))
    const card = await discardedItem('Magralita')
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Eliminar definitivamente' })).toBeEnabled())
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar definitivamente' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar definitivamente' }))
    expect(await within(await region()).findByText(/Un campo de la plantilla usa de nuevo esa clave/)).toBeInTheDocument()
    expect(await discardedItem('Magralita')).toBeInTheDocument()
  })

  it('a version conflict asks to review and deletes nothing', async () => {
    const { spies } = setup()
    spies.purgeDiscardedItem.mockRejectedValueOnce(new ConflictError())
    const card = await discardedItem('Magralita')
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Eliminar definitivamente' })).toBeEnabled())
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar definitivamente' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar definitivamente' }))
    expect(await within(await region()).findByText(/cambió mientras la editabas/)).toBeInTheDocument()
  })

  it('restores under a new key when a live item took the old one: warns, saves the template and moves the data in one RPC', async () => {
    const taken = { ...MAGRALITA, key: 'edad', label: 'Edad vieja' }
    const { spies, system } = setup({ discarded: [entry(taken)] })
    const card = await discardedItem('Edad vieja')
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Restaurar' })).toBeEnabled())
    fireEvent.click(within(card).getByRole('button', { name: 'Restaurar' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('La clave «edad» ya la usa otro campo de la plantilla: se restauró como «edad_2».')
    expect(spies.rekeyDiscardedItem).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar y guardar' }))
    await waitFor(() => expect(spies.rekeyDiscardedItem).toHaveBeenCalledTimes(1))
    const [id, key, renames, profile, base] = spies.rekeyDiscardedItem.mock.calls[0] as [string, string, Record<string, string>, { sheet: { categories: { sections: { items: { key: string }[] }[] }[]; discarded?: unknown }; distance: unknown }, string]
    expect([id, key, renames, base]).toEqual(['c1', 'edad', { edad: 'edad_2' }, '2026-01-01T00:00:00Z'])
    expect(profile.sheet.categories[0].sections[0].items.map((i) => i.key)).toEqual(['edad', 'vida', 'notas_pj', 'edad_2'])
    expect(profile.sheet.discarded).toBeUndefined()
    expect(profile.distance).toEqual(system.distance) // the rest of the document travels as stored
    expect(await within(await region()).findByText(/se restauró como «edad_2»/)).toBeInTheDocument()
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('a restore without a collision is a plain edit of the draft, saved with the template', async () => {
    const { spies } = setup()
    const card = await discardedItem('Magralita')
    fireEvent.click(within(card).getByRole('button', { name: 'Restaurar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await pressBar('Guardar plantilla')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    const sent = spies.setSystemProfile.mock.calls[0][1] as { sheet: { categories: { sections: { items: { key: string }[] }[] }[]; discarded?: unknown } }
    expect(sent.sheet.categories[0].sections[0].items.map((i) => i.key)).toEqual(['edad', 'vida', 'notas_pj', 'magralita'])
    expect(sent.sheet.discarded).toBeUndefined()
    expect(spies.rekeyDiscardedItem).not.toHaveBeenCalled()
  })
})
