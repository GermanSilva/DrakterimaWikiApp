import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SheetBuilder } from './SheetBuilder'
import { item } from './builderTestKit'

const sheet = (equipo: unknown[]) => ({
  categories: [
    {
      key: 'c',
      label: 'C',
      sections: [
        { key: 'perfil', label: 'Perfil', items: [], blocks: [] },
        { key: 'equipo', label: 'Equipo', items: equipo, blocks: [] },
      ],
    },
  ],
  roles: {},
})
const COINS = { kind: 'table', type: 'monedas', key: 'bolsa', label: 'Bolsa', rows: [{ key: 'oro', label: 'Oro', value: 1 }], rewardDestination: true }
const BANK = { kind: 'table', type: 'economia', key: 'banco', label: 'Banco', editableBy: 'dm' }

describe('SheetBuilder follows the economy edited elsewhere (S8)', () => {
  it('shows an instance created elsewhere without losing the draft or counting it as a change, and hands the synced sheet to the save', () => {
    const initial = sheet([COINS])
    const onSave = vi.fn()
    const { rerender } = render(<SheetBuilder initial={initial} economy={initial} onSave={onSave} />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Sección Perfil' })).getByRole('button', { name: 'Agregar campo' }))
    expect(screen.getByText('1 cambio sin guardar')).toBeInTheDocument()

    const later = sheet([COINS, BANK])
    rerender(<SheetBuilder initial={initial} economy={later} onSave={onSave} />)
    expect(item('Banco')).toBeInTheDocument()
    expect(screen.getByText('1 cambio sin guardar')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Ítem Nuevo campo' })).toBeInTheDocument()

    // and a deletion elsewhere removes it again
    rerender(<SheetBuilder initial={initial} economy={initial} onSave={onSave} />)
    expect(screen.queryByRole('group', { name: 'Ítem Banco' })).toBeNull()
    expect(screen.getByText('1 cambio sin guardar')).toBeInTheDocument()
  })

  it('a destination change elsewhere is not a change of the builder', () => {
    const initial = sheet([COINS, BANK])
    const { rerender } = render(<SheetBuilder initial={initial} economy={initial} />)
    expect(screen.getByText('Sin cambios')).toBeInTheDocument()
    rerender(<SheetBuilder initial={initial} economy={sheet([{ ...COINS, rewardDestination: undefined }, { ...BANK, rewardDestination: true }])} />)
    expect(screen.getByText('Sin cambios')).toBeInTheDocument()
  })
})
