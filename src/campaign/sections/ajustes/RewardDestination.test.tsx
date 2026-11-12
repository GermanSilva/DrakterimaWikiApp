import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { destinations, renderEconomy, type Json } from './economyTestKit'
import { pressBar, saveBar } from './saveBarTestKit'

configure({ asyncUtilTimeout: 10000 })
afterEach(() => vi.restoreAllMocks())

const SHEET = (destination: string | null = 'bolsa'): Json => ({
  categories: [
    {
      key: 'general',
      label: 'General',
      sections: [
        {
          key: 'equipo',
          label: 'Equipo',
          items: [
            { kind: 'table', type: 'monedas', key: 'bolsa', label: 'Bolsa', rows: [{ key: 'oro', label: 'oro', value: 10 }, { key: 'bronce', label: 'bronce', value: 1 }], ...(destination === 'bolsa' ? { rewardDestination: true } : {}) },
            { kind: 'table', type: 'economia', key: 'banco', label: 'Banco', editableBy: 'dm', ...(destination === 'banco' ? { rewardDestination: true } : {}) },
          ],
          blocks: [],
        },
      ],
    },
  ],
  roles: {},
})
const LOTERIA = { loteria: { value: { commonMinRoll: 15, commonPrize: { oro: 2 }, specialPrize: { bronce: 1 } }, visibility: 'members' as const, updated_at: 'v1' } }

const setup = (sheet: Json | null = SHEET(), tab = 'juegos') => renderEconomy(sheet, { tab, config: LOTERIA })
const select = async () => (await screen.findByLabelText('Destino de recompensa', {}, { timeout: 12000 })) as HTMLSelectElement
describe('Juegos › Lotería: Destino de recompensa', () => {
  it('offers the economy instances and "Ninguno", with the stored destination selected, and the hint', async () => {
    setup()
    const s = await select()
    expect(within(s).getAllByRole('option').map((o) => o.textContent)).toEqual(['Bolsa', 'Banco', 'Ninguno'])
    expect(s).toHaveValue('bolsa')
    expect(screen.getByText(/Donde se acreditan la lotería, el pozo y las recompensas\. Las instancias se crean en/)).toBeInTheDocument()
    expect(screen.getByText(/Sin destino, la lotería no aparece en Juegos\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sistema › Economía' })).toBeInTheDocument()
  })

  it('saves exactly one destination into the sheet, in one system_profile write, composed over the latest document', async () => {
    const { spies } = setup()
    fireEvent.change(await select(), { target: { value: 'banco' } })
    expect(within(await saveBar()).getByText(/1 cambio sin guardar/)).toBeInTheDocument()
    await pressBar('Guardar juegos')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(destinations((spies.setSystemProfile.mock.calls[0][1] as Json).sheet as Json)).toEqual(['banco'])
    expect(spies.configPatch).not.toHaveBeenCalled() // the lottery config is another save
    expect(await screen.findByText('Destino de recompensa guardado.')).toBeInTheDocument()
  })

  it('"Ninguno" clears it, and the lottery stops being configurable (it is hidden for players)', async () => {
    const { spies } = setup()
    fireEvent.change(await select(), { target: { value: '' } })
    await pressBar('Guardar juegos')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(destinations((spies.setSystemProfile.mock.calls[0][1] as Json).sheet as Json)).toEqual([])
    expect(await screen.findByText(/marcá un destino de recompensa/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Configuración de la lotería' })).toBeNull()
    expect(await select()).toHaveValue('')
  })

  it('with no destination stored, the select starts on "Ninguno" and picking one makes the prizes editable again', async () => {
    const { spies } = setup(SHEET(null))
    expect(await select()).toHaveValue('')
    expect(await screen.findByText(/marcá un destino de recompensa/)).toBeInTheDocument()
    fireEvent.change(await select(), { target: { value: 'bolsa' } })
    await pressBar('Guardar juegos')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(destinations((spies.setSystemProfile.mock.calls[0][1] as Json).sheet as Json)).toEqual(['bolsa'])
    expect(await screen.findByRole('form', { name: 'Configuración de la lotería' }, { timeout: 12000 })).toBeInTheDocument()
  })

  it('does not appear on a campaign without a coin table (the lottery keeps the classic coins)', async () => {
    setup(null)
    await screen.findByRole('form', { name: 'Configuración de la lotería' }, { timeout: 12000 })
    expect(screen.queryByLabelText('Destino de recompensa')).toBeNull()
  })

  it('the link switches to the Sistema tab and scrolls to Economía', async () => {
    setup()
    const scroll = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scroll
    await select()
    fireEvent.click(screen.getByRole('button', { name: 'Sistema › Economía' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: /Sistema/ })).toHaveAttribute('aria-selected', 'true'))
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect(scroll.mock.instances.map((el) => (el as HTMLElement).id)).toContain('ajustes-economia')
  })

  it('keeps an unsaved choice when the DM visits Sistema and comes back', async () => {
    setup()
    fireEvent.change(await select(), { target: { value: 'banco' } })
    fireEvent.click(screen.getByRole('tab', { name: /Sistema/ }))
    fireEvent.click(screen.getByRole('tab', { name: /Juegos/ }))
    expect(await select()).toHaveValue('banco')
  })
})
