import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderEconomy, type Json } from './economyTestKit'
import { pressBar } from './saveBarTestKit'

configure({ asyncUtilTimeout: 10000 })
afterEach(() => vi.restoreAllMocks())

const SHEET: Json = {
  categories: [
    {
      key: 'general',
      label: 'General',
      sections: [
        {
          key: 'equipo',
          label: 'Equipo',
          items: [
            { kind: 'table', type: 'monedas', key: 'bolsa', label: 'Bolsa', rows: [{ key: 'oro', label: 'oro', value: 10 }, { key: 'bronce', label: 'bronce', value: 1 }], rewardDestination: true },
            { kind: 'table', type: 'economia', key: 'banco', label: 'Banco', editableBy: 'dm' },
          ],
          blocks: [],
        },
      ],
    },
  ],
  roles: {},
}
const LOTERIA = { loteria: { value: { commonMinRoll: 15, commonPrize: { oro: 2 }, specialPrize: { bronce: 1 } }, visibility: 'members' as const, updated_at: 'v1' } }

describe('Juegos destination draft vs a Sistema save (S1, S3, S8)', () => {
  it('keeps the unsaved destination choice after Sistema creates an instance and saves', async () => {
    const { spies } = renderEconomy(SHEET, { tab: 'juegos', config: LOTERIA })
    fireEvent.change(await screen.findByLabelText('Destino de recompensa', {}, { timeout: 12000 }), { target: { value: 'banco' } })
    fireEvent.click(screen.getByRole('tab', { name: /Sistema/ }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Nueva instancia' }))
    fireEvent.change(screen.getByLabelText('Nombre de la nueva instancia'), { target: { value: 'Caja' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear instancia' }))
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('tab', { name: /Juegos/ }))
    await waitFor(() => expect(within(screen.getByLabelText('Destino de recompensa')).getAllByRole('option').length).toBe(4))
    expect(screen.getByLabelText('Destino de recompensa')).toHaveValue('banco')
    expect(screen.getByRole('tab', { name: /Juegos/ })).toHaveAccessibleName(/cambios sin guardar/)
  })
})
