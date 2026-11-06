import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dnd5eProfile } from '../../system/systemProfile'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

const sheetOf = (items: unknown[]) => ({ categories: [{ key: 'c', label: 'C', sections: [{ key: 'alpha', label: 'Alpha', items, blocks: [] }] }], roles: {} })
const coins = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero', rows, ...extra })
// schema order on purpose NOT by value: the editor follows the rows of the table
const ROWS = [{ key: 'oro', label: 'Galeón', value: 100 }, { key: 'plata', label: 'Sickle', value: 10 }, { key: 'bronce', label: 'Knut', value: 1 }]
const withSheet = (sheet: unknown) => ({ system_profile: { ...dnd5eProfile(), sheet } as unknown as Record<string, unknown> })
const LOTERIA = { loteria: { value: { commonMinRoll: 15, commonPrize: { oro: 2, bronce: 4 }, specialPrize: { plata: 1 } }, visibility: 'members' as const, updated_at: 'v1' } }

const setup = (campaign?: ReturnType<typeof withSheet>, config: Record<string, unknown> = LOTERIA) => {
  const made = createFakeLayer({ entities: { pjs: [] }, pot: null, config: config as never })
  renderSection('/c/demo/ajustes', { layer: made.layer, isDM: true, ...(campaign ? { campaign } : {}) })
  return made
}
// the first render of a file loads the lazy Ajustes chunk: under a loaded machine that alone can exceed the 5 s default, so wait up to
// 12 s (below the 15 s testTimeout of the repo) for the form without weakening what the tests then assert
const form = async () => within(await screen.findByRole('form', { name: 'Configuración de la lotería' }, { timeout: 12000 }))
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const labels = (group: HTMLElement) => within(group).getAllByRole('spinbutton').map((i) => i.closest('label')?.textContent)

describe('Ajustes: lottery prizes on a campaign with a sheet (S12, S28)', () => {
  it('edits the prizes in the denominations of the coin table, in schema order, with its labels', async () => {
    setup(withSheet(sheetOf([coins(ROWS, { rewardDestination: true })])))
    const f = await form()
    const common = f.getByRole('group', { name: 'Premio común' })
    expect(labels(common)).toEqual(['Galeón', 'Sickle', 'Knut'])
    expect(within(common).getByLabelText('Galeón')).toHaveValue(2)
    expect(within(common).getByLabelText('Knut')).toHaveValue(4)
    expect(within(f.getByRole('group', { name: /Premio especial/ })).getByLabelText('Sickle')).toHaveValue(1)
    expect(f.queryByLabelText('platino')).toBeNull() // no fixed coin keys
  })

  it('saves one amount per denomination, guarded by the version it read', async () => {
    const { spies } = setup(withSheet(sheetOf([coins(ROWS, { rewardDestination: true })])))
    const f = await form()
    type(f.getByLabelText(/Tirada mínima/), '12')
    type(within(f.getByRole('group', { name: 'Premio común' })).getByLabelText('Sickle'), '3')
    fireEvent.click(f.getByRole('button', { name: 'Guardar configuración' }))
    expect(await screen.findByText('Configuración guardada.')).toBeInTheDocument()
    expect(spies.configPatch).toHaveBeenCalledExactlyOnceWith(
      'c1', 'loteria',
      { commonMinRoll: 12, commonPrize: { oro: 2, plata: 3, bronce: 4 }, specialPrize: { oro: 0, plata: 1, bronce: 0 } },
      'members', 'v1',
    )
  })

  it('refuses an amount that is not a whole number of 0 or more, and saves nothing', async () => {
    const { spies } = setup(withSheet(sheetOf([coins(ROWS, { rewardDestination: true })])))
    const f = await form()
    type(within(f.getByRole('group', { name: 'Premio común' })).getByLabelText('Knut'), '-1')
    fireEvent.click(f.getByRole('button', { name: 'Guardar configuración' }))
    expect(await screen.findByText('Los premios deben ser números enteros de 0 o más.')).toBeInTheDocument()
    expect(spies.configPatch).not.toHaveBeenCalled()
  })

  it('cannot define prizes until the sheet has denominations and a destination', async () => {
    const { spies } = setup(withSheet(sheetOf([coins(ROWS)])))
    expect(await screen.findByText(/marcá un destino de recompensa/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Configuración de la lotería' })).toBeNull()
    expect(spies.configPatch).not.toHaveBeenCalled()
  })

  it('cannot define prizes without denominations', async () => {
    setup(withSheet(sheetOf([coins([], { rewardDestination: true })])))
    expect(await screen.findByText(/Definí las denominaciones de la moneda/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Configuración de la lotería' })).toBeNull()
  })
})

describe('Ajustes: lottery prizes on a campaign without a sheet are as before', () => {
  it('shows the five fixed coins and saves the five fixed keys', async () => {
    const { spies } = setup(undefined, { loteria: { value: { commonMinRoll: 15, commonPrize: { gp: 2 }, specialPrize: { pp: 1, gp: 5 } }, visibility: 'members', updated_at: 'v1' } })
    const f = await form()
    const common = within(f.getByRole('group', { name: 'Premio común' }))
    expect(common.getAllByRole('spinbutton')).toHaveLength(5)
    type(common.getByLabelText('plata'), '4')
    fireEvent.click(f.getByRole('button', { name: 'Guardar configuración' }))
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(1))
    expect(spies.configPatch.mock.calls[0][2]).toEqual({
      commonMinRoll: 15, commonPrize: { cp: 0, sp: 4, ep: 0, gp: 2, pp: 0 }, specialPrize: { cp: 0, sp: 0, ep: 0, gp: 5, pp: 1 },
    })
  })
})

describe('Ajustes: stale prize configuration (S12)', () => {
  const STALE = { loteria: { value: { commonMinRoll: 15, commonPrize: { gp: 1, oro: 2 }, specialPrize: { cp: 5 } }, visibility: 'members' as const, updated_at: 'v1' } }

  it('warns the DM, naming the stale keys, and says that saving the prizes again fixes it', async () => {
    setup(withSheet(sheetOf([coins(ROWS, { rewardDestination: true })])), STALE)
    const alert = await screen.findByRole('alert', { name: 'Premios desactualizados' }, { timeout: 12000 })
    expect(alert).toHaveTextContent('cp, gp')
    expect(alert).toHaveTextContent('Guardá los premios de nuevo')
    expect(await form()).toBeTruthy() // the editor stays available to fix it
  })

  it('shows no warning for a zero under an unknown key', async () => {
    setup(withSheet(sheetOf([coins(ROWS, { rewardDestination: true })])), { loteria: { ...STALE.loteria, value: { commonPrize: { oro: 2, gp: 0 }, specialPrize: { plata: 1 } } } })
    await form()
    expect(screen.queryByRole('alert', { name: 'Premios desactualizados' })).toBeNull()
  })
})
