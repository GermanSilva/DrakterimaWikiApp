import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { toDataError, type SystemSummary } from '../data'
import { makeCampaign, makeData, makeSystem, renderApp } from '../app/testing/renderApp'

const business = (message: string, code = 'P0001') => toDataError({ code, message })

const origin = makeSystem({ id: 'o1', name: 'D&D 5e base', kind: 'origin', campaign_id: 'c1', owner_id: null, created_at: '2026-10-01T12:00:00Z' })
const homebrew = makeSystem({ id: 'h1', name: 'Mi variante', branched_from: 'o1', campaign_id: 'c2', owner_id: 'u-9' })
const frozen = makeSystem({ id: 'f1', name: 'Copia vieja', kind: 'frozen', campaign_id: null, owner_id: 'u-9' })
const archivedOrigin = makeSystem({ id: 'o2', name: 'Sistema retirado', kind: 'origin', campaign_id: null, owner_id: null, archived_at: '2026-11-01T00:00:00Z' })

function ownerData(systems: SystemSummary[] = [origin, homebrew, frozen, archivedOrigin], over: Parameters<typeof makeData>[0] = {}) {
  return makeData({
    isHubOwner: vi.fn(async () => true),
    listAllSystems: vi.fn(async () => systems),
    listMyCampaigns: vi.fn(async () => [makeCampaign({ id: 'c1', name: 'Drakterima' }), makeCampaign({ id: 'c2', name: 'La Corona Rota', slug: 'corona' })]),
    ...over,
  })
}

const rows = async () => within(await screen.findByRole('list', { name: 'Sistemas' })).getAllByRole('listitem')
const rowOf = async (name: string) => {
  const found = (await rows()).find((r) => within(r).queryByText(name))
  if (!found) throw new Error(`no row for ${name}`)
  return found
}
async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el)
  })
}

describe('hub owner systems page: access', () => {
  it('shows an ordinary user the not-found page and reads no system', async () => {
    const data = makeData()
    renderApp('/sistemas', { data })
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sistemas' })).not.toBeInTheDocument()
    expect(data.listAllSystems).not.toHaveBeenCalled()
  })

  it('treats a failed owner check as not allowed', async () => {
    const data = makeData({ isHubOwner: vi.fn().mockRejectedValue(new Error('boom')) })
    renderApp('/sistemas', { data })
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(data.listAllSystems).not.toHaveBeenCalled()
  })

  it('links to it from the hub only for the hub owner', async () => {
    renderApp('/', { data: makeData() })
    expect(await screen.findByRole('button', { name: 'Solicitar campaña' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sistemas' })).not.toBeInTheDocument()
  })

  it('offers the link to the hub owner', async () => {
    renderApp('/', { data: ownerData() })
    expect(await screen.findByRole('link', { name: 'Sistemas' })).toHaveAttribute('href', '/sistemas')
  })
})

describe('hub owner systems page: list', () => {
  it('lists every system with kind, source campaign, lineage and archived state', async () => {
    renderApp('/sistemas', { data: ownerData() })
    expect(await screen.findByRole('heading', { name: 'Sistemas' })).toBeInTheDocument()
    const all = await rows()
    expect(all).toHaveLength(4)

    const o = await rowOf('D&D 5e base')
    expect(within(o).getByText('Sistema Origen')).toBeInTheDocument()
    expect(within(o).getByText('Campaña de origen: Drakterima')).toBeInTheDocument()

    const h = await rowOf('Mi variante')
    expect(within(h).getByText('Homebrew')).toBeInTheDocument()
    expect(within(h).getByText('Campaña de origen: La Corona Rota')).toBeInTheDocument()
    expect(within(h).getByText('Derivado de: D&D 5e base')).toBeInTheDocument()

    const f = await rowOf('Copia vieja')
    expect(within(f).getByText('Copia congelada')).toBeInTheDocument()
    expect(within(f).getByText('Campaña de origen: ya no existe')).toBeInTheDocument()

    const a = await rowOf('Sistema retirado')
    expect(within(a).getByText('Archivado')).toBeInTheDocument()
    expect(within(h).queryByText('Archivado')).not.toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    renderApp('/sistemas', { data: ownerData([]) })
    expect(await screen.findByText('Todavía no hay sistemas.')).toBeInTheDocument()
  })

  it('offers a retry when the list cannot be read', async () => {
    const listAllSystems = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue([origin])
    renderApp('/sistemas', { data: ownerData([], { listAllSystems }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los sistemas.')
    await click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('D&D 5e base')).toBeInTheDocument()
  })

  it('reads the shared action count of one system on demand', async () => {
    const getSystemActions = vi.fn(async () => [
      { table_key: 'hechizos', category: 'n1', name: 'A', description: '', extras: {}, function: null },
      { table_key: 'hechizos', category: 'n1', name: 'B', description: '', extras: {}, function: null },
      { table_key: 'hechizos', category: 'n2', name: 'C', description: '', extras: {}, function: null },
    ])
    renderApp('/sistemas', { data: ownerData(undefined, { getSystemActions }) })
    const h = await rowOf('Mi variante')
    expect(getSystemActions).not.toHaveBeenCalled()
    await click(within(h).getByRole('button', { name: 'Ver acciones compartidas de Mi variante' }))
    expect(await within(h).findByText('3 acciones compartidas')).toBeInTheDocument()
    expect(getSystemActions).toHaveBeenCalledWith('h1')
  })

  it('says so when the catalogue cannot be read', async () => {
    const getSystemActions = vi.fn().mockRejectedValue(business('system_not_available'))
    renderApp('/sistemas', { data: ownerData(undefined, { getSystemActions }) })
    const h = await rowOf('Mi variante')
    await click(within(h).getByRole('button', { name: 'Ver acciones compartidas de Mi variante' }))
    expect(await within(h).findByRole('alert')).toHaveTextContent('Ese sistema base ya no está disponible.')
  })
})

describe('hub owner systems page: writes', () => {
  it('creates an origin from a campaign with the typed name and reloads the list', async () => {
    const created = makeSystem({ id: 'o-new', name: 'Mi origen', kind: 'origin', campaign_id: 'c2', owner_id: null })
    const listAllSystems = vi.fn().mockResolvedValueOnce([origin]).mockResolvedValue([origin, created])
    const createOriginFromCampaign = vi.fn(async () => created)
    const data = ownerData([], { listAllSystems, createOriginFromCampaign })
    renderApp('/sistemas', { data })
    await screen.findByText('D&D 5e base')
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: 'c2' } })
    await click(screen.getByRole('button', { name: 'Crear Sistema Origen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Crear Sistema Origen' })
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: '  Mi origen ' } })
    await click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(createOriginFromCampaign).toHaveBeenCalledWith('c2', 'Mi origen')
    expect(await screen.findByText('Mi origen')).toBeInTheDocument()
  })

  it('explains a refused creation in Spanish and keeps the dialog open', async () => {
    const createOriginFromCampaign = vi.fn().mockRejectedValue(business('hub_owner_only', '42501'))
    renderApp('/sistemas', { data: ownerData(undefined, { createOriginFromCampaign }) })
    await screen.findByText('D&D 5e base')
    await click(screen.getByRole('button', { name: 'Crear Sistema Origen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Crear Sistema Origen' })
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'X' } })
    await click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
  })

  it('promotes a homebrew to an origin (a new origin, the source stays) and offers no promotion for an origin', async () => {
    const promoteSystem = vi.fn(async () => makeSystem({ id: 'o-new', name: 'Variante oficial', kind: 'origin', campaign_id: null, owner_id: null }))
    renderApp('/sistemas', { data: ownerData(undefined, { promoteSystem }) })
    expect(within(await rowOf('D&D 5e base')).queryByRole('button', { name: /Promover/ })).not.toBeInTheDocument()
    const h = await rowOf('Mi variante')
    await click(within(h).getByRole('button', { name: 'Promover Mi variante a origen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Promover a Sistema Origen' })
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Mi variante')
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Variante oficial' } })
    await click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(promoteSystem).toHaveBeenCalledWith('h1', 'Variante oficial')
  })

  it('also promotes a frozen copy', async () => {
    const promoteSystem = vi.fn(async () => origin)
    renderApp('/sistemas', { data: ownerData(undefined, { promoteSystem }) })
    await click(within(await rowOf('Copia vieja')).getByRole('button', { name: 'Promover Copia vieja a origen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Promover a Sistema Origen' })
    await click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(promoteSystem).toHaveBeenCalledWith('f1', 'Copia vieja'))
  })

  it('archives after confirming, and unarchives straight away', async () => {
    const archiveSystem = vi.fn(async (id: string, archived: boolean) => makeSystem({ id, archived_at: archived ? '2026-11-06T00:00:00Z' : null }))
    renderApp('/sistemas', { data: ownerData(undefined, { archiveSystem }) })
    await click(within(await rowOf('D&D 5e base')).getByRole('button', { name: 'Archivar D&D 5e base' }))
    const dialog = await screen.findByRole('dialog', { name: 'Archivar sistema' })
    expect(dialog).toHaveTextContent('Los DM dejan de poder usarlo como base')
    expect(archiveSystem).not.toHaveBeenCalled()
    await click(within(dialog).getByRole('button', { name: 'Archivar' }))
    await waitFor(() => expect(archiveSystem).toHaveBeenCalledWith('o1', true))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await click(within(await rowOf('Sistema retirado')).getByRole('button', { name: 'Desarchivar Sistema retirado' }))
    await waitFor(() => expect(archiveSystem).toHaveBeenCalledWith('o2', false))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancelling the archive writes nothing', async () => {
    const data = ownerData()
    renderApp('/sistemas', { data })
    await click(within(await rowOf('D&D 5e base')).getByRole('button', { name: 'Archivar D&D 5e base' }))
    const dialog = await screen.findByRole('dialog', { name: 'Archivar sistema' })
    await click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(data.archiveSystem).not.toHaveBeenCalled()
  })

  it('renames a system and refuses an empty name without writing', async () => {
    const renameSystem = vi.fn(async (id: string, name: string) => makeSystem({ id, name }))
    renderApp('/sistemas', { data: ownerData(undefined, { renameSystem }) })
    await click(within(await rowOf('Mi variante')).getByRole('button', { name: 'Renombrar Mi variante' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar sistema' })
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: ' ' } })
    await click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ingresá un nombre (hasta 120 caracteres).')
    expect(renameSystem).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Otro nombre' } })
    await click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(renameSystem).toHaveBeenCalledWith('h1', 'Otro nombre'))
  })

  it('explains invalid_system_kind when promoting something that is already an origin', async () => {
    const promoteSystem = vi.fn().mockRejectedValue(business('invalid_system_kind'))
    renderApp('/sistemas', { data: ownerData(undefined, { promoteSystem }) })
    await click(within(await rowOf('Mi variante')).getByRole('button', { name: 'Promover Mi variante a origen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Promover a Sistema Origen' })
    await click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ese sistema ya es un Sistema Origen.')
  })

  it('explains a failed archive in Spanish', async () => {
    const archiveSystem = vi.fn().mockRejectedValue(business('system_not_found'))
    renderApp('/sistemas', { data: ownerData(undefined, { archiveSystem }) })
    await click(within(await rowOf('D&D 5e base')).getByRole('button', { name: 'Archivar D&D 5e base' }))
    const dialog = await screen.findByRole('dialog', { name: 'Archivar sistema' })
    await click(within(dialog).getByRole('button', { name: 'Archivar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ese sistema ya no existe o no tenés acceso a él.')
  })
})
