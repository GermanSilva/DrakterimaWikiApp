import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataError, type Member } from '../../../data'
import { ME } from '../../../app/testing/renderApp'
import { createFakeLayer } from '../../testing/fakeLayer'
import { entity, renderSection } from '../../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

const member = (user_id: string, name: string, role: 'dm' | 'player' = 'player'): Member => ({
  campaign_id: 'c1', user_id, role, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  profile: { id: user_id, display_name: name, avatar_url: null },
})
const MEMBERS = [member(ME, 'Ana', 'dm'), member('u-bob', 'Bob'), member('u-cleo', 'Cleo', 'dm'), member('u-dan', 'Dan')]
const PJS = [entity(10, { nombre: 'Eldric', owner_id: 'u-bob' }), entity(11, { nombre: 'Mara', owner_id: null })]
const LAST_DM = new DataError('validation', 'cannot remove, demote or delete the account of the only DM of a campaign', { code: '23514' }, 'last_dm')

function setup({ isDM = true, members = MEMBERS } = {}) {
  const made = createFakeLayer({ entities: { pjs: PJS }, members })
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, isDM })
  return { ...made, ...view }
}
const players = () => screen.findByRole('region', { name: 'Jugadores' })
const rowOf = async (name: string) => within(await players()).findByRole('row', { name: new RegExp(name) })
const dialog = () => screen.findByRole('dialog')

describe('Ajustes > Jugadores: roles and removal', () => {
  it('offers promote / demote / remove per member; the DM themself can only step down', async () => {
    setup()
    const ana = await rowOf('Ana')
    expect(within(ana).getByRole('button', { name: /Dejar de ser DM/ })).toBeInTheDocument()
    expect(within(ana).queryByRole('button', { name: /Sacar/ })).not.toBeInTheDocument()
    const bob = await rowOf('Bob')
    expect(within(bob).getByRole('button', { name: 'Nombrar DM a Bob' })).toBeInTheDocument()
    expect(within(bob).getByRole('button', { name: 'Sacar a Bob de la campaña' })).toBeInTheDocument()
    expect(within(await rowOf('Cleo')).getByRole('button', { name: 'Pasar a jugador a Cleo' })).toBeInTheDocument()
  })

  it('promoting asks first with a strong warning; Cancel changes nothing; Confirm makes them DM', async () => {
    const { spies } = setup()
    fireEvent.click(within(await rowOf('Bob')).getByRole('button', { name: 'Nombrar DM a Bob' }))
    let dlg = await dialog()
    expect(within(dlg).getByRole('heading', { name: 'Nombrar DM' })).toBeInTheDocument()
    expect(within(dlg).getByRole('note')).toHaveTextContent(/notas privadas/)
    expect(within(dlg).getByRole('note')).toHaveTextContent(/quitarte el rol de DM/)
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(spies.updateMemberRole).not.toHaveBeenCalled()

    fireEvent.click(within(await rowOf('Bob')).getByRole('button', { name: 'Nombrar DM a Bob' }))
    dlg = await dialog()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Nombrar DM' }))
    await waitFor(() => expect(spies.updateMemberRole).toHaveBeenCalledWith('c1', 'u-bob', 'dm'))
    expect(await screen.findByText('Bob ahora es DM.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await within(await rowOf('Bob')).findByRole('button', { name: 'Pasar a jugador a Bob' })).toBeInTheDocument()
  })

  it('demoting another DM confirms and sets the player role', async () => {
    const { spies } = setup()
    fireEvent.click(within(await rowOf('Cleo')).getByRole('button', { name: 'Pasar a jugador a Cleo' }))
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Pasar a jugador' }))
    await waitFor(() => expect(spies.updateMemberRole).toHaveBeenCalledWith('c1', 'u-cleo', 'player'))
    expect(await within(await rowOf('Cleo')).findByRole('button', { name: 'Nombrar DM a Cleo' })).toBeInTheDocument()
  })

  it('stepping down warns that the access is lost', async () => {
    const { spies } = setup()
    fireEvent.click(within(await rowOf('Ana')).getByRole('button', { name: /Dejar de ser DM/ }))
    const dlg = await dialog()
    expect(within(dlg).getByRole('note')).toHaveTextContent(/perdés el acceso a Ajustes/)
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }))
    expect(spies.updateMemberRole).not.toHaveBeenCalled()
  })

  it('removing a player confirms, explains that characters are released and content stays, and removes the row', async () => {
    const { spies } = setup()
    fireEvent.click(within(await rowOf('Dan')).getByRole('button', { name: 'Sacar a Dan de la campaña' }))
    const dlg = await dialog()
    expect(dlg).toHaveTextContent('sus personajes quedan sin dueño')
    expect(dlg).toHaveTextContent('Todo lo que creó se conserva')
    expect(within(dlg).queryByRole('note')).not.toBeInTheDocument()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }))
    expect(spies.removeMember).not.toHaveBeenCalled()

    fireEvent.click(within(await rowOf('Dan')).getByRole('button', { name: 'Sacar a Dan de la campaña' }))
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Sacar' }))
    await waitFor(() => expect(spies.removeMember).toHaveBeenCalledWith('c1', 'u-dan'))
    expect(await screen.findByText('Dan salió de la campaña.')).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Jugadores' })).queryByRole('row', { name: /Dan/ })).not.toBeInTheDocument())
  })

  it('removing a DM adds a strong warning', async () => {
    setup()
    fireEvent.click(within(await rowOf('Cleo')).getByRole('button', { name: 'Sacar a Cleo de la campaña' }))
    expect(within(await dialog()).getByRole('note')).toHaveTextContent('Cleo es DM de esta campaña')
  })

  it('the last-DM protection error is shown in the dialog and nothing changes', async () => {
    const { spies } = setup()
    spies.updateMemberRole.mockRejectedValueOnce(LAST_DM)
    fireEvent.click(within(await rowOf('Cleo')).getByRole('button', { name: 'Pasar a jugador a Cleo' }))
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Pasar a jugador' }))
    const alert = await within(await dialog()).findByRole('alert')
    expect(alert).toHaveTextContent('al menos un DM')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(await rowOf('Cleo')).getByRole('button', { name: 'Pasar a jugador a Cleo' })).toBeInTheDocument()

    spies.removeMember.mockRejectedValueOnce(LAST_DM)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(within(await rowOf('Cleo')).getByRole('button', { name: 'Sacar a Cleo de la campaña' }))
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Sacar' }))
    expect(await within(await dialog()).findByRole('alert')).toHaveTextContent('al menos un DM')
  })

  it('a person who already left is not an error when removing', async () => {
    const { spies } = setup()
    spies.removeMember.mockRejectedValueOnce(new DataError('not_found', 'membership: not found'))
    fireEvent.click(within(await rowOf('Dan')).getByRole('button', { name: 'Sacar a Dan de la campaña' }))
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Sacar' }))
    expect(await screen.findByText('Dan ya no estaba en la campaña.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a double click on confirm sends one request', async () => {
    const { spies } = setup()
    fireEvent.click(within(await rowOf('Bob')).getByRole('button', { name: 'Nombrar DM a Bob' }))
    const confirm = within(await dialog()).getByRole('button', { name: 'Nombrar DM' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(spies.updateMemberRole).toHaveBeenCalledTimes(1))
  })
})

describe('Ajustes > Jugadores: character owners', () => {
  const ownerSelect = async (character: string) => within(await players()).findByRole('combobox', { name: `Dueño de ${character}` })

  it('lists every character with its owner and the members plus "Sin dueño" as options', async () => {
    setup()
    const eldric = await ownerSelect('Eldric')
    expect(eldric).toHaveValue('u-bob')
    expect(await ownerSelect('Mara')).toHaveValue('')
    expect(within(eldric).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sin dueño', 'Ana', 'Bob', 'Cleo', 'Dan'])
  })

  it('assigns an owner through setPjOwner and says so', async () => {
    const { spies } = setup()
    fireEvent.change(await ownerSelect('Mara'), { target: { value: 'u-dan' } })
    await waitFor(() => expect(spies.setPjOwner).toHaveBeenCalledWith(11, 'u-dan'))
    expect(await screen.findByText('Mara ahora es de Dan.')).toBeInTheDocument()
    expect(await ownerSelect('Mara')).toHaveValue('u-dan')
  })

  it('releases a character with "Sin dueño"', async () => {
    const { spies } = setup()
    fireEvent.change(await ownerSelect('Eldric'), { target: { value: '' } })
    await waitFor(() => expect(spies.setPjOwner).toHaveBeenCalledWith(10, null))
    expect(await screen.findByText('Eldric quedó sin dueño.')).toBeInTheDocument()
  })

  it('a refused assignment shows an error toast and the select keeps the real owner', async () => {
    const { spies } = setup()
    spies.setPjOwner.mockRejectedValueOnce(new DataError('validation', 'character owner must be a member of the campaign', { code: '23514' }, 'owner_not_member'))
    fireEvent.change(await ownerSelect('Mara'), { target: { value: 'u-dan' } })
    expect(await screen.findByText('Esa persona ya no es parte de la campaña. Actualizá la lista de jugadores.')).toBeInTheDocument()
    expect(await ownerSelect('Mara')).toHaveValue('')
  })
})

describe('Ajustes > Zona de peligro: delete the campaign', () => {
  const open = async () => {
    const zone = await screen.findByRole('region', { name: 'Zona de peligro' })
    fireEvent.click(within(zone).getByRole('button', { name: /Borrar campaña/ }))
    return dialog()
  }

  it('requires typing the slug: the button stays disabled for anything else', async () => {
    const { spies } = setup()
    const dlg = await open()
    expect(dlg).toHaveTextContent('No se puede deshacer')
    const confirm = within(dlg).getByRole('button', { name: 'Borrar para siempre' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'dem' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'DEMO' } })
    expect(confirm).toBeDisabled()
    expect(spies.deleteCampaign).not.toHaveBeenCalled()
  })

  it('Cancel closes without deleting', async () => {
    const { spies } = setup()
    const dlg = await open()
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'demo' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(spies.deleteCampaign).not.toHaveBeenCalled()
  })

  it('with the right slug it deletes and goes back to the hub with a notice', async () => {
    const { spies, router } = setup()
    const dlg = await open()
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'demo' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Borrar para siempre' }))
    await waitFor(() => expect(spies.deleteCampaign).toHaveBeenCalledWith('c1', 'demo'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByText('Se borró la campaña «Demo».')).toBeInTheDocument()
  })

  it('a refusal from the server is shown and the dialog stays', async () => {
    const { spies, router } = setup()
    spies.deleteCampaign.mockRejectedValueOnce(new DataError('business', 'slug_mismatch', { code: 'P0001' }, 'slug_mismatch'))
    const dlg = await open()
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'demo' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Borrar para siempre' }))
    expect(await within(await dialog()).findByRole('alert')).toHaveTextContent('no coincide')
    expect(router.state.location.pathname).toBe('/c/demo/ajustes')
  })
})

describe('Ajustes: a player sees none of this', () => {
  it('has no member, owner or delete controls and requests nothing', async () => {
    const { spies } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Jugadores' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Zona de peligro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Borrar campaña|Nombrar DM|Sacar/ })).not.toBeInTheDocument()
    expect(spies.membersList).not.toHaveBeenCalled()
    expect(spies.updateMemberRole).not.toHaveBeenCalled()
    expect(spies.deleteCampaign).not.toHaveBeenCalled()
  })
})

describe('the standing last-connection note', () => {
  const NOTICE = 'El DM puede ver cuándo te conectaste por última vez a esta campaña.'

  it('is shown to a player in the campaign menu, on any section', async () => {
    setup({ isDM: false })
    expect(await screen.findByRole('navigation', { name: 'Secciones de la campaña' })).toHaveTextContent(NOTICE)
  })

  it('is not shown to a DM', async () => {
    setup({ isDM: true })
    await players()
    expect(screen.getByRole('navigation', { name: 'Secciones de la campaña' })).not.toHaveTextContent(NOTICE)
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument()
  })
})
