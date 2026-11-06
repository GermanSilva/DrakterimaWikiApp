import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { toDataError, type CampaignRequestWithRequester, type SystemSummary } from '../data'
import { makeCampaign, makeData, makeRequest, makeSystem, renderApp } from '../app/testing/renderApp'

const business = (message: string, code = 'P0001') => toDataError({ code, message })

const origin = makeSystem({ id: 'o1', name: 'D&D 5e base', kind: 'origin', campaign_id: null, owner_id: null })
const otherOrigin = makeSystem({ id: 'o2', name: 'Cthulhu base', kind: 'origin', campaign_id: null, owner_id: null })
const mine = makeSystem({ id: 'h1', name: 'Mi variante', campaign_id: 'c1', owner_id: 'user-1', branched_from: 'o1' })
const coDm = makeSystem({ id: 'h2', name: 'Del otro DM', campaign_id: 'c1', owner_id: 'user-9' })
const foreign = makeSystem({ id: 'h3', name: 'Ajeno', campaign_id: 'c-foreign', owner_id: 'user-9' })
const frozenMine = makeSystem({ id: 'f1', name: 'Copia mía', kind: 'frozen', campaign_id: null, owner_id: 'user-1' })
const frozenOther = makeSystem({ id: 'f2', name: 'Copia ajena', kind: 'frozen', campaign_id: null, owner_id: 'user-9' })
const everything: SystemSummary[] = [origin, otherOrigin, mine, coDm, foreign, frozenMine, frozenOther]

const dmCampaign = makeCampaign({ id: 'c1', name: 'Drakterima', role: 'dm' })
const playerCampaign = makeCampaign({ id: 'c-foreign', name: 'Campaña ajena', slug: 'ajena', role: 'player' })

const withBases = (systems: SystemSummary[], over: Parameters<typeof makeData>[0] = {}) =>
  makeData({ listAvailableSystems: vi.fn(async () => systems), listMyCampaigns: vi.fn(async () => [dmCampaign, playerCampaign]), ...over })
const ownerData = (over: Parameters<typeof makeData>[0] = {}) => makeData({ isHubOwner: vi.fn(async () => true), ...over })

async function open(name: string) {
  const opener = await screen.findByRole('button', { name })
  await act(async () => {
    fireEvent.click(opener)
  })
  return screen.findByRole('dialog', { name })
}
async function click(name: RegExp | string, within_: HTMLElement | Document = document.body) {
  await act(async () => {
    fireEvent.click(within(within_ as HTMLElement).getByRole('button', { name }))
  })
}
const picker = (dialog: HTMLElement) => within(dialog).getByLabelText('Sistema base') as HTMLSelectElement
const optionNames = (el: HTMLElement) => within(el).getAllByRole('option').map((o) => o.textContent)

describe('request form: base system picker', () => {
  it('is not shown when the user can use no base, and the payload carries no system_id', async () => {
    const data = makeData()
    renderApp('/', { data })
    const dialog = await open('Solicitar campaña')
    expect(within(dialog).queryByLabelText('Sistema base')).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText(/^Nombre$/), { target: { value: 'Demo' } })
    await click(/^Enviar solicitud$/, dialog)
    await waitFor(() => expect(data.createCampaignRequest).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(data.createCampaignRequest).mock.calls[0][0]
    expect(sent).not.toHaveProperty('system_id')
  })

  it('lists what the requester may use, grouped by kind, with the D&D 5e default selected', async () => {
    renderApp('/', { data: withBases(everything) })
    const dialog = await open('Solicitar campaña')
    const select = picker(dialog)
    expect(select.value).toBe('')
    expect(optionNames(select)).toEqual(['D&D 5e (predeterminado)', 'D&D 5e base', 'Cthulhu base', 'Mi variante', 'Del otro DM', 'Copia mía'])
    const groups = within(select).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('label'))).toEqual(['Sistemas Origen', 'Homebrew de mis campañas', 'Mis copias congeladas'])
    expect(optionNames(groups[0])).toEqual(['D&D 5e base', 'Cthulhu base'])
    expect(optionNames(groups[1])).toEqual(['Mi variante', 'Del otro DM'])
    expect(optionNames(groups[2])).toEqual(['Copia mía'])
    expect(within(select).queryByRole('option', { name: 'Ajeno' })).not.toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Copia ajena' })).not.toBeInTheDocument()
  })

  it('offers an outsider with no campaigns only the origins', async () => {
    renderApp('/', { data: withBases(everything.filter((s) => s.id !== 'f1'), { listMyCampaigns: vi.fn(async () => []) }) })
    const dialog = await open('Solicitar campaña')
    const select = picker(dialog)
    expect(optionNames(select)).toEqual(['D&D 5e (predeterminado)', 'D&D 5e base', 'Cthulhu base'])
    expect(within(select).getAllByRole('group').map((g) => g.getAttribute('label'))).toEqual(['Sistemas Origen'])
  })

  it('sends system_id only for the chosen base and goes back to the default after sending', async () => {
    const data = withBases(everything)
    renderApp('/', { data })
    const dialog = await open('Solicitar campaña')
    fireEvent.change(within(dialog).getByLabelText(/^Nombre$/), { target: { value: 'La Corona' } })
    fireEvent.change(picker(dialog), { target: { value: 'h1' } })
    await click(/^Enviar solicitud$/, dialog)
    await waitFor(() => expect(data.createCampaignRequest).toHaveBeenCalledTimes(1))
    expect(vi.mocked(data.createCampaignRequest).mock.calls[0][0]).toMatchObject({ name: 'La Corona', system_id: 'h1' })
    expect(await screen.findByText(/Solicitud enviada/)).toBeInTheDocument()
    expect(picker(dialog).value).toBe('')

    fireEvent.change(within(dialog).getByLabelText(/^Nombre$/), { target: { value: 'Otra' } })
    fireEvent.change(picker(dialog), { target: { value: 'o1' } })
    fireEvent.change(picker(dialog), { target: { value: '' } })
    await click(/^Enviar solicitud$/, dialog)
    await waitFor(() => expect(data.createCampaignRequest).toHaveBeenCalledTimes(2))
    expect(vi.mocked(data.createCampaignRequest).mock.calls[1][0]).not.toHaveProperty('system_id')
  })

  it('explains a base that is no longer available and lets the user retry without it', async () => {
    const create = vi.fn().mockRejectedValueOnce(business('system_not_available')).mockResolvedValue(makeRequest())
    renderApp('/', { data: withBases(everything, { createCampaignRequest: create }) })
    const dialog = await open('Solicitar campaña')
    fireEvent.change(within(dialog).getByLabelText(/^Nombre$/), { target: { value: 'Demo' } })
    fireEvent.change(picker(dialog), { target: { value: 'o1' } })
    await click(/^Enviar solicitud$/, dialog)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ese sistema base ya no está disponible. Elegí otro o pedí la campaña sin base.')
    expect(picker(dialog).value).toBe('o1')
    fireEvent.change(picker(dialog), { target: { value: '' } })
    await click(/^Enviar solicitud$/, dialog)
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(create.mock.calls[1][0]).not.toHaveProperty('system_id')
  })

  it('does not show the picker to the hub owner, who creates campaigns directly', async () => {
    renderApp('/', { data: ownerData({ listAvailableSystems: vi.fn(async () => everything) }) })
    await screen.findByRole('button', { name: 'Crear campaña' })
    expect(screen.queryByLabelText('Sistema base')).not.toBeInTheDocument()
  })
})

const inboxRow = (over: Partial<CampaignRequestWithRequester> = {}): CampaignRequestWithRequester => ({
  ...makeRequest({ id: 7, requester_id: 'u-9', name: 'La Corona Rota', slug_wanted: 'corona-rota' }),
  requester: { id: 'u-9', display_name: 'Beto', avatar_url: null },
  ...over,
})

describe('hub owner inbox: base system and approval result', () => {
  it('shows the chosen base on the tile and in the approval dialog, and nothing for the default', async () => {
    const data = ownerData({
      listAllSystems: vi.fn(async () => [origin, mine]),
      listAllCampaignRequests: vi.fn(async () => [inboxRow({ system_id: 'h1' }), inboxRow({ id: 8, name: 'Sin base', slug_wanted: 'sin-base' })]),
    })
    renderApp('/', { data })
    const tiles = await screen.findAllByTestId('request-tile')
    expect(within(tiles[0]).getByText('Sistema base: Mi variante')).toBeInTheDocument()
    expect(within(tiles[1]).queryByText(/Sistema base/)).not.toBeInTheDocument()
    await click('Aprobar', tiles[0])
    const dialog = await screen.findByRole('dialog', { name: 'Aprobar solicitud' })
    expect(within(dialog).getByText('Sistema base: Mi variante')).toBeInTheDocument()
  })

  it('says the base cannot be found when the hub owner cannot read it', async () => {
    const data = ownerData({ listAllCampaignRequests: vi.fn(async () => [inboxRow({ system_id: 'gone' })]) })
    renderApp('/', { data })
    expect(await screen.findByText('Sistema base: no se encuentra')).toBeInTheDocument()
  })

  it('reports the seeded and skipped actions after approving a request with a base', async () => {
    const approved = inboxRow({ system_id: 'o1', status: 'approved', seeded_actions: 5, skipped_actions: 1 })
    const listAllCampaignRequests = vi.fn().mockResolvedValueOnce([inboxRow({ system_id: 'o1' })]).mockResolvedValue([approved])
    const data = ownerData({ listAllSystems: vi.fn(async () => [origin]), listAllCampaignRequests, approveCampaignRequest: vi.fn(async () => 'corona-rota') })
    renderApp('/', { data })
    await click('Aprobar', (await screen.findAllByTestId('request-tile'))[0])
    const dialog = await screen.findByRole('dialog', { name: 'Aprobar solicitud' })
    await click('Aprobar y crear', dialog)
    expect(await screen.findByText('Campaña /corona-rota creada. Beto es su DM. Acciones copiadas: 5. Omitidas: 1.')).toBeInTheDocument()
    expect(data.approveCampaignRequest).toHaveBeenCalledWith(7, { slug: 'corona-rota', name: 'La Corona Rota' })
  })

  it('still confirms the approval when the counts cannot be read', async () => {
    const listAllCampaignRequests = vi.fn().mockResolvedValueOnce([inboxRow({ system_id: 'o1' })]).mockRejectedValueOnce(new Error('boom')).mockResolvedValue([])
    const data = ownerData({ listAllSystems: vi.fn(async () => [origin]), listAllCampaignRequests })
    renderApp('/', { data })
    await click('Aprobar', (await screen.findAllByTestId('request-tile'))[0])
    await click('Aprobar y crear', await screen.findByRole('dialog', { name: 'Aprobar solicitud' }))
    expect(await screen.findByText('Campaña /corona-rota creada. Beto es su DM.')).toBeInTheDocument()
  })

  it('keeps the approval notice of a request without a base exactly as before and reads no systems for counts', async () => {
    const listAllCampaignRequests = vi.fn(async () => [inboxRow()])
    const data = ownerData({ listAllCampaignRequests, approveCampaignRequest: vi.fn(async () => 'corona-rota') })
    renderApp('/', { data })
    await click('Aprobar', (await screen.findAllByTestId('request-tile'))[0])
    await click('Aprobar y crear', await screen.findByRole('dialog', { name: 'Aprobar solicitud' }))
    expect(await screen.findByText('Campaña /corona-rota creada. Beto es su DM.')).toBeInTheDocument()
    expect(screen.queryByText(/Acciones copiadas/)).not.toBeInTheDocument()
    // the initial load and the reload after the decision; no extra read for the counts
    await waitFor(() => expect(listAllCampaignRequests).toHaveBeenCalledTimes(2))
  })

  it('refuses an unavailable base with a clear message and leaves the request pending', async () => {
    const approveCampaignRequest = vi.fn().mockRejectedValue(business('system_not_available'))
    const listAllCampaignRequests = vi.fn(async () => [inboxRow({ system_id: 'o1' })])
    const data = ownerData({ listAllSystems: vi.fn(async () => [origin]), listAllCampaignRequests, approveCampaignRequest })
    renderApp('/', { data })
    await click('Aprobar', (await screen.findAllByTestId('request-tile'))[0])
    const dialog = await screen.findByRole('dialog', { name: 'Aprobar solicitud' })
    await click('Aprobar y crear', dialog)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'El sistema base elegido ya no está disponible. La solicitud sigue pendiente: rechazala o pedile a la persona que la repita con otra base.',
    )
    expect(screen.getByRole('dialog', { name: 'Aprobar solicitud' })).toBeInTheDocument()
    expect(screen.getAllByTestId('request-tile')).toHaveLength(1)
    expect(listAllCampaignRequests).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/creada/)).not.toBeInTheDocument()
  })
})

describe('hub: Mis plantillas', () => {
  it('lists the homebrew of my campaigns and my frozen copies, never origins or other people\'s systems', async () => {
    renderApp('/', { data: withBases(everything) })
    const section = await screen.findByRole('region', { name: 'Mis plantillas' })
    const items = await within(section).findAllByRole('listitem')
    expect(items.map((i) => within(i).getByRole('heading', { level: 3 }).textContent)).toEqual(['Mi variante', 'Del otro DM', 'Copia mía'])
    expect(within(items[0]).getByText('Homebrew')).toBeInTheDocument()
    expect(within(items[0]).getByText('Campaña: Drakterima')).toBeInTheDocument()
    expect(within(items[0]).getByText('Derivado de: D&D 5e base')).toBeInTheDocument()
    expect(within(items[2]).getByText('Copia congelada')).toBeInTheDocument()
    expect(within(section).queryByText('D&D 5e base', { selector: 'h3' })).not.toBeInTheDocument()
    expect(within(section).queryByText('Ajeno')).not.toBeInTheDocument()
    expect(within(section).queryByText('Copia ajena')).not.toBeInTheDocument()
  })

  it('is absent for a user who has no templates', async () => {
    renderApp('/', { data: withBases([origin, foreign, frozenOther]) })
    await screen.findByRole('button', { name: 'Solicitar campaña' })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Mis plantillas' })).not.toBeInTheDocument())
  })

  it('offers rename only on templates the user owns', async () => {
    renderApp('/', { data: withBases(everything) })
    const section = await screen.findByRole('region', { name: 'Mis plantillas' })
    expect(within(section).getByRole('button', { name: 'Renombrar Mi variante' })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Renombrar Copia mía' })).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: 'Renombrar Del otro DM' })).not.toBeInTheDocument()
  })

  it('renames a template and reloads the list', async () => {
    const listAvailableSystems = vi.fn().mockResolvedValueOnce(everything).mockResolvedValue(everything.map((s) => (s.id === 'h1' ? { ...s, name: 'Variante 2' } : s)))
    const renameSystem = vi.fn(async (id: string, name: string) => makeSystem({ id, name }))
    renderApp('/', { data: withBases(everything, { listAvailableSystems, renameSystem }) })
    const section = await screen.findByRole('region', { name: 'Mis plantillas' })
    await click('Renombrar Mi variante', section)
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar plantilla' })
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Mi variante')
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: ' Variante 2 ' } })
    await click('Guardar', dialog)
    await waitFor(() => expect(renameSystem).toHaveBeenCalledWith('h1', 'Variante 2'))
    expect(await within(section).findByRole('heading', { level: 3, name: 'Variante 2' })).toBeInTheDocument()
  })

  it('explains a refused rename in Spanish', async () => {
    const renameSystem = vi.fn().mockRejectedValue(business('system_owner_only', '42501'))
    renderApp('/', { data: withBases(everything, { renameSystem }) })
    const section = await screen.findByRole('region', { name: 'Mis plantillas' })
    await click('Renombrar Mi variante', section)
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar plantilla' })
    await click('Guardar', dialog)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Solo quien creó este sistema puede cambiarlo.')
  })
})
