import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataError, type DataErrorReason, type Invite } from '../../../data'
import { deferred } from '../../../auth/testing/deferred'
import { createFakeLayer } from '../../testing/fakeLayer'
import { entity, renderSection } from '../../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// 12:00 UTC on 2026-10-09. Only Date is faked: timers and promises keep running.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const PJS = [
  entity(10, { nombre: 'Eldric', owner_id: null }),
  entity(11, { nombre: 'Mara', owner_id: 'u-bob' }),
  entity(12, { nombre: 'Zed', owner_id: null }),
]
const invite = (id: string, over: Partial<Invite> = {}): Invite => ({
  id, campaign_id: 'c1', code: `code-${id}`, role: 'player', character_id: null, max_uses: 3, uses: 1,
  expires_at: '2026-10-12T12:00:00Z', created_by: 'user-1', created_at: '2026-10-09T10:00:00Z', ...over,
})
const trigger = (reason: DataErrorReason) => new DataError('validation', reason, { code: '23514' }, reason)

function setup({ invites = [] as Invite[], isDM = true } = {}) {
  const made = createFakeLayer({ entities: { pjs: PJS }, invites })
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, isDM })
  return { ...made, ...view }
}
const section = () => screen.findByRole('region', { name: 'Invitaciones' })
const form = async () => within(await section()).getByRole('form', { name: 'Nueva invitación' })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const pickKind = async (name: RegExp | string) => fireEvent.click(within(await form()).getByRole('radio', { name }))
const submit = async () => fireEvent.click(within(await form()).getByRole('button', { name: 'Crear invitación' }))

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('Ajustes: invites access', () => {
  it('is not shown to a player and requests nothing', async () => {
    const { spies } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Invitaciones' })).not.toBeInTheDocument()
    expect(spies.invitesList).not.toHaveBeenCalled()
  })
})

describe('Ajustes: invite list', () => {
  it('shows kind, status, uses, expiry, claimed character and the code of every invite', async () => {
    setup({
      invites: [
        invite('a'),
        invite('b', { character_id: 10, max_uses: 1, uses: 0 }),
        invite('c', { role: 'dm', max_uses: 1, uses: 0 }),
        invite('d', { uses: 3 }),
        invite('e', { expires_at: '2026-10-01T12:00:00Z' }),
      ],
    })
    const sec = await section()
    const items = await within(sec).findAllByRole('listitem')
    expect(items).toHaveLength(5)
    const [a, b, c, d, e] = items
    expect(a).toHaveTextContent('Jugador')
    expect(a).toHaveTextContent('Activa')
    expect(a).toHaveTextContent('Usos: 1/3')
    expect(a).toHaveTextContent('code-a')
    expect(within(a).getByText(/Vence:/)).toBeInTheDocument()
    expect(b).toHaveTextContent('Jugador con personaje: Eldric')
    expect(c).toHaveTextContent('DM')
    expect(d).toHaveTextContent('Agotada')
    expect(e).toHaveTextContent('Vencida')
    expect(within(e).getByText(/Venció:/)).toBeInTheDocument()
  })

  it('says so when there are none', async () => {
    setup()
    expect(await within(await section()).findByText('Todavía no hay invitaciones.')).toBeInTheDocument()
  })

  it('shows a retry when the list cannot be loaded, and reloads on "Actualizar"', async () => {
    const { spies } = setup({ invites: [invite('a')] })
    spies.invitesList.mockRejectedValueOnce(new Error('down'))
    const sec = await section()
    expect(await within(sec).findByRole('alert')).toHaveTextContent('No pudimos cargar las invitaciones')
    fireEvent.click(within(sec).getByRole('button', { name: 'Reintentar' }))
    expect(await within(sec).findByText('code-a')).toBeInTheDocument()
    const calls = spies.invitesList.mock.calls.length
    fireEvent.click(within(sec).getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(spies.invitesList.mock.calls.length).toBe(calls + 1))
  })
})

describe('Ajustes: create an invite', () => {
  it('creates a plain player invite expiring in 7 days by default, shows its link and refreshes the list', async () => {
    const { spies } = setup()
    const f = await form()
    expect(within(f).getByLabelText('Vence en')).toHaveValue('7')
    fireEvent.click(await within(f).findByRole('button', { name: 'Crear invitación' }))
    await waitFor(() => expect(spies.invitesCreate).toHaveBeenCalledTimes(1))
    expect(spies.invitesCreate).toHaveBeenCalledWith({
      campaign_id: 'c1', role: 'player', max_uses: 1, expires_at: '2026-10-16T12:00:00.000Z',
    })
    const created = await screen.findByRole('region', { name: 'Invitación creada' })
    expect(created).toHaveTextContent(`${window.location.origin}/invite/newcode1`)
    expect(within(await section()).getAllByRole('listitem')).toHaveLength(1)
  })

  it('lets the DM set max uses and expiry for a plain player invite', async () => {
    const { spies } = setup()
    const f = await form()
    type(within(f).getByLabelText('Usos máximos'), '10')
    type(within(f).getByLabelText('Vence en'), '30')
    await submit()
    await waitFor(() => expect(spies.invitesCreate).toHaveBeenCalled())
    expect(spies.invitesCreate).toHaveBeenCalledWith({ campaign_id: 'c1', role: 'player', max_uses: 10, expires_at: '2026-11-08T12:00:00.000Z' })
  })

  it.each(['0', '101', '2.5', 'abc', ''])('refuses %j as max uses without calling the backend', async (uses) => {
    const { spies } = setup()
    type(within(await form()).getByLabelText('Usos máximos'), uses)
    await submit()
    expect(await within(await form()).findByRole('alert')).toHaveTextContent(/entre 1 y 100/)
    expect(spies.invitesCreate).not.toHaveBeenCalled()
  })

  it('a claim invite offers only unowned characters, and sends a single-use player invite for it', async () => {
    const { spies } = setup()
    await pickKind(/Jugador con personaje/)
    const select = within(await form()).getByLabelText('Personaje')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Elegí un personaje…', 'Eldric', 'Zed'])
    await submit()
    expect(await within(await form()).findByRole('alert')).toHaveTextContent('Elegí el personaje')
    expect(spies.invitesCreate).not.toHaveBeenCalled()

    type(select, '12')
    await submit()
    await waitFor(() => expect(spies.invitesCreate).toHaveBeenCalled())
    expect(spies.invitesCreate).toHaveBeenCalledWith({
      campaign_id: 'c1', role: 'player', character_id: 12, max_uses: 1, expires_at: '2026-10-16T12:00:00.000Z',
    })
    expect(within(await section()).getByRole('listitem')).toHaveTextContent('Jugador con personaje: Zed')
  })

  it('does not offer a character that already has a live invite, and says so when none is left', async () => {
    setup({ invites: [invite('x', { character_id: 10, max_uses: 1, uses: 0 }), invite('y', { character_id: 12, max_uses: 1, uses: 0 })] })
    await within(await section()).findAllByRole('listitem')
    await pickKind(/Jugador con personaje/)
    expect(within(await form()).queryByRole('combobox', { name: 'Personaje' })).not.toBeInTheDocument()
    expect(within(await form()).getByText('No hay personajes sin jugador y sin invitación vigente.')).toBeInTheDocument()
  })

  it('a DM invite carries a strong warning, offers at most 7 days and is single-use', async () => {
    const { spies } = setup()
    await pickKind('DM')
    const f = await form()
    expect(within(f).getByRole('note')).toHaveTextContent(/va a ser DM.*un solo uso.*7 días/s)
    expect(within(within(f).getByLabelText('Vence en')).getAllByRole('option').map((o) => o.textContent)).toEqual(['1 día', '3 días', '7 días'])
    expect(within(f).queryByLabelText('Usos máximos')).not.toBeInTheDocument()
    await submit()
    await waitFor(() => expect(spies.invitesCreate).toHaveBeenCalled())
    expect(spies.invitesCreate).toHaveBeenCalledWith({ campaign_id: 'c1', role: 'dm', max_uses: 1, expires_at: '2026-10-16T12:00:00.000Z' })
  })

  it('switching to DM resets a longer expiry to the default', async () => {
    setup()
    const f = await form()
    type(within(f).getByLabelText('Vence en'), '30')
    await pickKind('DM')
    expect(within(f).getByLabelText('Vence en')).toHaveValue('7')
  })

  it.each([
    ['character_already_owned', /ya tiene jugador/],
    ['character_already_has_pending_invite', /invitación vigente/],
  ] as const)('shows a Spanish message for %s', async (reason, message) => {
    const { spies } = setup()
    spies.invitesCreate.mockRejectedValueOnce(trigger(reason))
    await pickKind(/Jugador con personaje/)
    type(within(await form()).getByLabelText('Personaje'), '10')
    await submit()
    expect(await within(await form()).findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('region', { name: 'Invitación creada' })).not.toBeInTheDocument()
  })

  it('never shows raw server text for an unexpected failure', async () => {
    const { spies } = setup()
    spies.invitesCreate.mockRejectedValueOnce(new Error('pg internals: relation x'))
    await submit()
    expect(await within(await form()).findByRole('alert')).toHaveTextContent('No pudimos crear la invitación')
    expect(screen.queryByText(/pg internals/)).not.toBeInTheDocument()
  })

  it('creates only one invitation on a double click', async () => {
    const pending = deferred<Invite>()
    const { spies } = setup()
    spies.invitesCreate.mockReturnValueOnce(pending.promise)
    const button = within(await form()).getByRole('button', { name: 'Crear invitación' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(spies.invitesCreate).toHaveBeenCalledTimes(1)
    expect(within(await form()).getByRole('button', { name: 'Creando…' })).toBeDisabled()
    await act(async () => pending.resolve(invite('z')))
  })
})

describe('Ajustes: share an invite', () => {
  it('copies the link /invite/CODE and the bare code', async () => {
    const writeText = vi.fn(async () => undefined)
    stubClipboard(writeText)
    setup({ invites: [invite('a')] })
    const item = (await within(await section()).findAllByRole('listitem'))[0]
    fireEvent.click(within(item).getByRole('button', { name: 'Copiar enlace' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/code-a`))
    expect(await screen.findByText('Enlace copiado.')).toBeInTheDocument()
    fireEvent.click(within(item).getByRole('button', { name: 'Copiar código' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('code-a'))
  })

  it('tells the DM to copy by hand when the browser refuses', async () => {
    stubClipboard(vi.fn(async () => Promise.reject(new Error('denied'))))
    setup({ invites: [invite('a')] })
    const item = (await within(await section()).findAllByRole('listitem'))[0]
    fireEvent.click(within(item).getByRole('button', { name: 'Copiar código' }))
    expect(await screen.findByText(/No pudimos copiar el código/)).toBeInTheDocument()
  })
})

describe('Ajustes: revoke an invite', () => {
  it('asks first; cancelling revokes nothing', async () => {
    const { spies } = setup({ invites: [invite('a')] })
    const item = (await within(await section()).findAllByRole('listitem'))[0]
    fireEvent.click(within(item).getByRole('button', { name: 'Revocar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Revocar invitación' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(spies.invitesRevoke).not.toHaveBeenCalled()
  })

  it('confirming deletes that invite only and refreshes the list', async () => {
    const { spies } = setup({ invites: [invite('a'), invite('b')] })
    const sec = await section()
    const item = (await within(sec).findAllByRole('listitem'))[0]
    fireEvent.click(within(item).getByRole('button', { name: 'Revocar' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revocar' }))
    await waitFor(() => expect(spies.invitesRevoke).toHaveBeenCalledWith('a'))
    expect(spies.invitesRevoke).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(within(sec).getAllByRole('listitem')).toHaveLength(1))
    expect(within(sec).queryByText('code-a')).not.toBeInTheDocument()
    expect(within(sec).getByText('code-b')).toBeInTheDocument()
    expect(within(sec).getByText('Invitación revocada.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('an invite already revoked elsewhere counts as done', async () => {
    const { spies } = setup({ invites: [invite('a')] })
    const sec = await section()
    const item = (await within(sec).findAllByRole('listitem'))[0]
    spies.invitesRevoke.mockRejectedValueOnce(new DataError('not_found', 'gone'))
    fireEvent.click(within(item).getByRole('button', { name: 'Revocar' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revocar' }))
    expect(await within(sec).findByText('Esa invitación ya no existía.')).toBeInTheDocument()
  })

  it('reports a failure to revoke without raw text and keeps the invite listed', async () => {
    const { spies } = setup({ invites: [invite('a')] })
    const sec = await section()
    const item = (await within(sec).findAllByRole('listitem'))[0]
    spies.invitesRevoke.mockRejectedValueOnce(new Error('pg internals'))
    fireEvent.click(within(item).getByRole('button', { name: 'Revocar' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revocar' }))
    expect(await within(sec).findByRole('alert')).toHaveTextContent('No pudimos revocar la invitación')
    expect(within(sec).queryByText(/pg internals/)).not.toBeInTheDocument()
    expect(within(sec).getByText('code-a')).toBeInTheDocument()
  })
})
