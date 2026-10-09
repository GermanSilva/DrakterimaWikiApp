import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ME } from '../../app/testing/renderApp'
import type { BusySlot, Disponibilidad, Member, PlayerAvailability } from '../../data'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// March 2026: the 6th is a Friday. Only Date is faked so timers and promises keep working.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 2, 10, 12, 0))
})
afterEach(() => vi.useRealTimers())

const member = (user_id: string, name: string | null, role: 'dm' | 'player' = 'player'): Member => ({
  campaign_id: 'c1', user_id, role, created_at: '', updated_at: '',
  profile: name === null ? null : { id: user_id, display_name: name, avatar_url: null },
})
const DM_ME = member(ME, 'Ana López', 'dm')
const PLAYER_ME = member(ME, 'Ana López')
const BETO = member('u-beto', 'Beto Ruiz')
const CRIS = member('u-cris', 'Cris')

const avail = (id: number, user_id: string, over: Partial<PlayerAvailability> = {}): PlayerAvailability => ({
  id, user_id, campaign_id: null, tipo: 'personal', fecha: null, fecha_inicio: '2026-03-06', fecha_fin: '2026-03-06',
  hora_inicio: '18:00', hora_fin: '22:00', created_at: '', updated_at: '', ...over,
})
const off = (id: number, user_id: string, fecha: string, over: Partial<PlayerAvailability> = {}) =>
  avail(id, user_id, { tipo: 'no_disponible', fecha, fecha_inicio: null, fecha_fin: null, hora_inicio: null, hora_fin: null, ...over })
const slot = (id: number, fecha: string, over: Partial<Disponibilidad> = {}): Disponibilidad => ({
  id, campaign_id: 'c1', tipo: 'sesion', fecha_inicio: fecha, fecha_fin: fecha, hora_inicio: '19:00', hora_fin: '23:00',
  created_by: null, created_at: '', updated_at: '', ...over,
})
const busy = (user_id: string, fecha: string, hora_inicio = '19:00', hora_fin = '23:00'): BusySlot => ({
  user_id, fecha_inicio: fecha, fecha_fin: fecha, hora_inicio, hora_fin,
})

const day = (name: RegExp) => screen.findByRole('button', { name })
const FRI = /Viernes 06\/03\/2026/
const dialog = () => screen.getByRole('dialog')
const markerIn = (cell: HTMLElement, title: RegExp) => within(cell).queryByTitle(title)

async function openDay(name: RegExp = FRI) {
  const cell = await day(name)
  cell.focus() // a real click focuses the opener; fireEvent does not
  fireEvent.click(cell)
  return within(await screen.findByRole('dialog'))
}
const setField = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('Calendario grid', () => {
  it('shows each member\'s availability with initials, a full-day unavailable marker and the session badge', async () => {
    const { layer } = createFakeLayer({
      members: [DM_ME, BETO, CRIS],
      playerAvailability: [avail(1, 'u-beto'), off(2, 'u-cris', '2026-03-06'), avail(3, ME, { fecha_inicio: '2026-03-07', fecha_fin: '2026-03-07' })],
      disponibilidad: [slot(1, '2026-03-06')],
    })
    renderSection('/c/demo/calendario', { layer })
    const friday = await day(FRI)
    expect(await within(friday).findByTitle('Beto Ruiz — disponible')).toHaveTextContent('BR')
    expect(markerIn(friday, /Cris — no disponible/)).toHaveTextContent('CR')
    expect(markerIn(friday, /Ana López/)).toBeNull() // her window is on the 7th
    expect(within(friday).getByTitle('Sesión programada')).toBeInTheDocument()
    expect(markerIn(await day(/Sábado 07\/03\/2026/), /Ana López — disponible/)).toHaveTextContent('AL')
    // generic colours by member order, never the legacy PJ markers
    const color = (el: HTMLElement) => el.style.backgroundColor
    expect(color(within(friday).getByTitle('Beto Ruiz — disponible'))).not.toBe(color(within(await day(/Sábado 07\/03\/2026/)).getByTitle('Ana López — disponible')))
  })

  it('hides general rows of users who are not members of this campaign and rows pinned to another one', async () => {
    const { layer } = createFakeLayer({
      members: [PLAYER_ME, BETO],
      playerAvailability: [
        avail(1, 'u-outsider'), // shares ANOTHER campaign with the viewer
        avail(2, 'u-beto', { campaign_id: 'other' }),
        avail(3, 'u-beto', { campaign_id: 'c1', fecha_inicio: '2026-03-13', fecha_fin: '2026-03-13' }),
      ],
    })
    renderSection('/c/demo/calendario', { layer })
    const friday = await day(FRI)
    const friday13 = await day(/Viernes 13\/03\/2026/)
    await waitFor(() => expect(markerIn(friday13, /Beto Ruiz — disponible/)).not.toBeNull())
    expect(within(friday).queryAllByTitle(/disponible/)).toHaveLength(0)
    expect(screen.queryByText('u-outsider')).toBeNull()
    expect(screen.getByRole('list', { name: 'Referencias' })).not.toHaveTextContent(/outsider/i)
  })

  it('marks a member booked by another campaign as busy without naming any campaign', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME, BETO], busySlots: [busy('u-beto', '2026-03-06')] })
    renderSection('/c/demo/calendario', { layer })
    const friday = await day(FRI)
    expect(await within(friday).findByTitle('Beto Ruiz — ocupado')).toHaveAttribute('data-state', 'busy')
    expect(document.body.textContent).not.toMatch(/otra campaña:/i)
  })

  it('navigates between months', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME] })
    renderSection('/c/demo/calendario', { layer })
    expect(await screen.findByText('Marzo 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(screen.getByText('Abril 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(screen.getByText('Febrero 2026')).toBeInTheDocument()
  })

  it('shows an unread dot on the day of a session the viewer has not read', async () => {
    const { layer } = createFakeLayer({
      members: [PLAYER_ME],
      entities: { sesiones: [entity(1, { tipo: 'sesion', numero: 1, titulo: 'Una', fecha: '2026-03-06' })] },
    })
    renderSection('/c/demo/calendario', { layer })
    const friday = await day(FRI)
    await waitFor(() => expect(friday.querySelector('.unread-dot')).not.toBeNull())
    expect((await day(/Sábado 07\/03\/2026/)).querySelector('.unread-dot')).toBeNull()
  })

  it('shows a retryable error when the members cannot load', async () => {
    const { layer, spies } = createFakeLayer({ members: [PLAYER_ME] })
    spies.membersList.mockRejectedValueOnce(new Error('down'))
    renderSection('/c/demo/calendario', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el calendario')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await day(FRI)).toBeInTheDocument()
  })
})

describe('Calendario day dialog', () => {
  it('opens a labelled dialog with a timeline per member and closes with the button, Escape and the backdrop', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME, BETO], playerAvailability: [avail(1, 'u-beto')] })
    renderSection('/c/demo/calendario', { layer })
    const view = await openDay()
    expect(dialog()).toHaveAccessibleName('Viernes 06/03/2026')
    expect(dialog()).toContainElement(document.activeElement as HTMLElement) // focus moved into the dialog
    expect(view.getByText('18:00–22:00')).toBeInTheDocument()
    expect(view.getByText('Beto')).toBeInTheDocument()

    fireEvent.click(view.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await day(FRI)).toHaveFocus() // focus returns to the opener

    await openDay()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    await openDay()
    const backdrop = dialog().parentElement as HTMLElement
    fireEvent.pointerDown(backdrop)
    fireEvent.pointerUp(backdrop)
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the busy slots of a member in the timeline, labelled without a campaign', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME, BETO], busySlots: [busy('u-beto', '2026-03-06')] })
    renderSection('/c/demo/calendario', { layer })
    const view = await openDay()
    expect(await view.findByTitle('Ocupado 19:00–23:00')).toBeInTheDocument()
  })
})

describe('Calendario as DM', () => {
  it('creates a session slot from the day dialog and returns to the day', async () => {
    const { layer } = createFakeLayer({ members: [DM_ME, BETO] })
    renderSection('/c/demo/calendario', { layer })
    const view = await openDay()
    fireEvent.click(view.getByRole('button', { name: /Agregar sesión/ }))
    expect(dialog()).toHaveAccessibleName('Agregar sesión')
    setField('Hora de inicio', '19:00')
    setField('Hora de fin', '23:00')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(layer.disponibilidad.create).toHaveBeenCalledWith('c1', {
        tipo: 'sesion', fecha_inicio: '2026-03-06', fecha_fin: '2026-03-06', hora_inicio: '19:00', hora_fin: '23:00',
      }),
    )
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Viernes 06/03/2026'))
  })

  it('validates the times before writing', async () => {
    const { layer } = createFakeLayer({ members: [DM_ME] })
    renderSection('/c/demo/calendario', { layer })
    fireEvent.click((await openDay()).getByRole('button', { name: /Agregar sesión/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Completá los 4 campos.')
    setField('Hora de inicio', '22:00')
    setField('Hora de fin', '20:00')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('La hora de fin debe ser posterior')
    expect(layer.disponibilidad.create).not.toHaveBeenCalled()
  })

  it('edits and deletes an existing session slot', async () => {
    const { layer } = createFakeLayer({ members: [DM_ME], disponibilidad: [slot(5, '2026-03-06')] })
    renderSection('/c/demo/calendario', { layer })
    let view = await openDay()
    fireEvent.click(await view.findByRole('button', { name: 'Editar sesión 19:00–23:00' }))
    setField('Hora de fin', '23:30')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(layer.disponibilidad.update).toHaveBeenCalledWith(5, expect.objectContaining({ tipo: 'sesion', hora_fin: '23:30' })))

    await waitFor(() => expect(dialog()).toHaveAccessibleName('Viernes 06/03/2026'))
    view = within(dialog())
    fireEvent.click(view.getByRole('button', { name: 'Editar sesión 19:00–23:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(layer.disponibilidad.remove).toHaveBeenCalledWith(5))
  })

  it('refuses a session while a member is booked by another campaign, with a clear message', async () => {
    const { layer } = createFakeLayer({ members: [DM_ME, BETO, CRIS], busySlots: [busy('u-beto', '2026-03-06', '20:00', '23:00')] })
    renderSection('/c/demo/calendario', { layer })
    const view = await openDay()
    await view.findByTitle('Ocupado 20:00–23:00')
    fireEvent.click(view.getByRole('button', { name: /Agregar sesión/ }))
    setField('Hora de inicio', '19:00')
    setField('Hora de fin', '22:00')
    expect(screen.getByRole('alert')).toHaveTextContent('Beto Ruiz ya tiene otro compromiso')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(layer.disponibilidad.create).not.toHaveBeenCalled()
    // a time that does not collide is accepted again
    setField('Hora de fin', '20:00')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('can add the DM\'s own availability (no character needed)', async () => {
    const { layer } = createFakeLayer({ members: [DM_ME] })
    renderSection('/c/demo/calendario', { layer })
    fireEvent.click((await openDay()).getByRole('button', { name: /Agregar mi disponibilidad/ }))
    fireEvent.click(screen.getByLabelText('No disponible todo el día'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(layer.playerAvailability.create).toHaveBeenCalledWith({
        tipo: 'no_disponible', fecha: '2026-03-06', fecha_inicio: null, fecha_fin: null, hora_inicio: null, hora_fin: null, campaign_id: null,
      }),
    )
  })
})

describe('Calendario as player', () => {
  it('has no session controls', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME, BETO], disponibilidad: [slot(5, '2026-03-06')] })
    renderSection('/c/demo/calendario', { layer, isDM: false })
    const view = await openDay()
    expect(view.queryByRole('button', { name: /Agregar sesión/ })).toBeNull()
    expect(await view.findByText('19:00–23:00')).toBeInTheDocument()
    expect(view.queryByRole('button', { name: /Editar sesión/ })).toBeNull()
    expect(view.getByRole('button', { name: /Agregar mi disponibilidad/ })).toBeInTheDocument()
  })

  it('saves a window as general by default', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME] })
    renderSection('/c/demo/calendario', { layer, isDM: false })
    fireEvent.click((await openDay()).getByRole('button', { name: /Agregar mi disponibilidad/ }))
    expect(screen.getByLabelText('General (todas mis campañas)')).toBeChecked()
    setField('Hora de inicio', '18:00')
    setField('Hora de fin', '22:00')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(layer.playerAvailability.create).toHaveBeenCalledWith({
        tipo: 'personal', fecha: null, fecha_inicio: '2026-03-06', fecha_fin: '2026-03-06', hora_inicio: '18:00', hora_fin: '22:00', campaign_id: null,
      }),
    )
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Viernes 06/03/2026'))
  })

  it('persists the "only this campaign" scope on create and on edit', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME], playerAvailability: [avail(7, ME, { hora_inicio: '18:00:00', hora_fin: '21:00:00' })] })
    renderSection('/c/demo/calendario', { layer, isDM: false })
    let view = await openDay()
    fireEvent.click(view.getByRole('button', { name: /Agregar mi disponibilidad/ }))
    fireEvent.click(screen.getByLabelText('Solo esta campaña'))
    setField('Hora de inicio', '10:00')
    setField('Hora de fin', '12:00')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(layer.playerAvailability.create).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: 'c1', hora_inicio: '10:00' })))

    // editing the general row: Postgres times are shown as HH:MM, the scope is preselected and can be pinned
    await waitFor(() => expect(dialog()).toHaveAccessibleName('Viernes 06/03/2026'))
    view = within(dialog())
    fireEvent.click(await view.findByRole('button', { name: 'Editar mi disponibilidad 18:00–21:00' }))
    expect(screen.getByLabelText('General (todas mis campañas)')).toBeChecked()
    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('18:00')
    fireEvent.click(screen.getByLabelText('Solo esta campaña'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(layer.playerAvailability.update).toHaveBeenCalledWith(7, expect.objectContaining({ campaign_id: 'c1', tipo: 'personal' })))
  })

  it('edits a pinned row with its scope preselected and deletes own entries; other members\' entries are not editable', async () => {
    const { layer } = createFakeLayer({
      members: [PLAYER_ME, BETO],
      playerAvailability: [avail(7, ME, { campaign_id: 'c1' }), avail(8, 'u-beto')],
    })
    renderSection('/c/demo/calendario', { layer, isDM: false })
    const view = await openDay()
    expect(await view.findAllByRole('button', { name: /Editar mi disponibilidad/ })).toHaveLength(1) // Beto's block is not a button
    fireEvent.click(view.getByRole('button', { name: 'Editar mi disponibilidad 18:00–22:00 (solo esta campaña)' }))
    expect(screen.getByLabelText('Solo esta campaña')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(layer.playerAvailability.remove).toHaveBeenCalledWith(7))
  })

  it('marks a full day as unavailable and can remove the marker', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME], playerAvailability: [off(9, ME, '2026-03-06')] })
    renderSection('/c/demo/calendario', { layer, isDM: false })
    const view = await openDay()
    fireEvent.click(await view.findByRole('button', { name: 'Editar mi día no disponible' }))
    expect(screen.getByLabelText('No disponible todo el día')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(layer.playerAvailability.remove).toHaveBeenCalledWith(9))
  })

  it('cannot mark as available a window that overlaps the user\'s own busy slot, but can on a free window', async () => {
    const { layer } = createFakeLayer({
      members: [PLAYER_ME, BETO],
      busySlots: [busy(ME, '2026-03-06', '20:00', '23:00'), busy('u-beto', '2026-03-06', '10:00', '23:00')],
    })
    renderSection('/c/demo/calendario', { layer, isDM: false })
    const view = await openDay()
    await view.findAllByTitle(/Ocupado/)
    fireEvent.click(view.getByRole('button', { name: /Agregar mi disponibilidad/ }))
    setField('Hora de inicio', '19:00')
    setField('Hora de fin', '21:00')
    expect(screen.getByRole('alert')).toHaveTextContent('no podés marcarlo como disponible')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(layer.playerAvailability.create).not.toHaveBeenCalled()

    setField('Hora de fin', '20:00') // touches, does not overlap
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('does not block a window because ANOTHER member is busy', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME, BETO], busySlots: [busy('u-beto', '2026-03-06', '10:00', '23:00')] })
    renderSection('/c/demo/calendario', { layer, isDM: false })
    const view = await openDay()
    await view.findByTitle('Ocupado 10:00–23:00')
    fireEvent.click(view.getByRole('button', { name: /Agregar mi disponibilidad/ }))
    setField('Hora de inicio', '19:00')
    setField('Hora de fin', '21:00')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('keeps the form open and shows no success when the write fails', async () => {
    const { layer } = createFakeLayer({ members: [PLAYER_ME] })
    ;(layer.playerAvailability.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/calendario', { layer, isDM: false })
    fireEvent.click((await openDay()).getByRole('button', { name: /Agregar mi disponibilidad/ }))
    setField('Hora de inicio', '18:00')
    setField('Hora de fin', '22:00')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(dialog()).toHaveAccessibleName('Agregar mi disponibilidad')
    errorSpy.mockRestore()
  })
})

describe('Calendario realtime', () => {
  const channelOf = (fake: ReturnType<typeof createFakeLayer>['fake'], table: string) => fake.channels.find((c) => c.name.startsWith(`campaign:${table}:`))!

  it('follows inserts, updates and deletes of the members\' availability and ignores outsiders', async () => {
    const { layer, fake } = createFakeLayer({ members: [PLAYER_ME, BETO] })
    renderSection('/c/demo/calendario', { layer, isDM: false })
    const friday = await day(FRI)
    await waitFor(() => expect(fake.channels.some((c) => c.name.startsWith('campaign:player_availability:'))).toBe(true))
    const channel = channelOf(fake, 'player_availability')

    act(() => channel.emit('INSERT', { new: avail(1, 'u-beto') }))
    expect(await within(friday).findByTitle('Beto Ruiz — disponible')).toBeInTheDocument()

    act(() => channel.emit('INSERT', { new: avail(2, 'u-outsider') }))
    expect(within(friday).queryAllByTitle(/disponible/)).toHaveLength(1)

    // re-pinned to another campaign: the member leaves this calendar
    act(() => channel.emit('UPDATE', { new: avail(1, 'u-beto', { campaign_id: 'other' }) }))
    await waitFor(() => expect(within(friday).queryAllByTitle(/disponible/)).toHaveLength(0))

    act(() => channel.emit('INSERT', { new: off(3, 'u-beto', '2026-03-06') }))
    expect(await within(friday).findByTitle('Beto Ruiz — no disponible')).toBeInTheDocument()
    act(() => channel.emit('DELETE', { old: { id: 3 } }))
    await waitFor(() => expect(within(friday).queryAllByTitle(/disponible/)).toHaveLength(0))
  })

  it('follows session slots in realtime', async () => {
    const { layer, fake } = createFakeLayer({ members: [PLAYER_ME] })
    renderSection('/c/demo/calendario', { layer, isDM: false })
    const friday = await day(FRI)
    await waitFor(() => expect(fake.channels.some((c) => c.name.startsWith('campaign:disponibilidad:'))).toBe(true))
    act(() => channelOf(fake, 'disponibilidad').emit('INSERT', { new: slot(1, '2026-03-06') }))
    expect(await within(friday).findByTitle('Sesión programada')).toBeInTheDocument()
  })
})
