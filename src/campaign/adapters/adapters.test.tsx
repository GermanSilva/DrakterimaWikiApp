import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext'
import { DataContext } from '../../app/DataContext'
import { makeAuth, makeCampaign, makeData } from '../../app/testing/renderApp'
import PlayerNotes from '../../components/PlayerNotes'
import WikiText from '../../components/WikiText'
import UnreadDot from '../../components/UnreadDot'
import type { PlayerNote, WikiIndexItem } from '../../data'
import { CampaignContext } from '../CampaignContext'
import { useEntityForm } from '../entityFormContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { HubPortsProvider } from './HubPortsProvider'
import { createHubFormPort, parseRegions, FALLBACK_REGIONS } from './hubFormPort'
import { createHubWikiPort } from './hubWikiPort'
import { ReadStateCache, seenAtFor } from './readStateCache'
import type { WikiIndex } from '../entities/useWikiIndex'

const item = (id: number, title: string, over: Partial<WikiIndexItem> = {}): WikiIndexItem => ({ id, title, imagen_url: null, estado: 'publicado', ...over })
const READY = { sesiones: 'ready', pjs: 'ready', pnjs: 'ready', lugares: 'ready', facciones: 'ready', lore: 'ready', items: 'ready', mapas: 'ready', homebrew_rules: 'ready' } as WikiIndex['status']
const emptyIndex = (over: Partial<WikiIndex['byTable']> = {}, loading = false, status = READY): WikiIndex => ({
  status,
  byTable: { sesiones: [], pjs: [], pnjs: [], lugares: [], facciones: [], lore: [], items: [], mapas: [], homebrew_rules: [], ...over },
  loading,
  error: null,
})

describe('hub wiki port', () => {
  const port = createHubWikiPort({
    index: emptyIndex({ lugares: [item(4, 'Kardevir', { imagen_url: 'https://x/y.png' })], pnjs: [item(2, 'Ana')], homebrew_rules: [item(1, 'Regla')] }),
    navigate: vi.fn(),
  })

  it('resolves letters to the right table with title, label and image', () => {
    expect(port.resolve('G', 4)).toEqual({ title: 'Kardevir', section: 'Lugar', imagenUrl: 'https://x/y.png', table: 'lugares' })
    expect(port.resolve('H', 1)?.table).toBe('homebrew_rules')
  })

  it('returns null for unknown ids, tables or letters (a hidden article looks like a typo)', () => {
    expect(port.resolve('G', 5)).toBeNull()
    expect(port.resolve('Z', 4)).toBeNull()
    expect(port.resolve('N', 4)).toBeNull()
  })

  it('searches in picker order and caps non-empty queries', () => {
    expect(port.search('').map((r) => r.title)).toEqual(['Ana', 'Kardevir', 'Regla'])
    expect(port.search('kar')).toEqual([{ table: 'lugares', letter: 'G', id: 4, title: 'Kardevir' }])
    const many = createHubWikiPort({ index: emptyIndex({ lore: Array.from({ length: 80 }, (_, i) => item(i + 1, `Entrada ${i}`)) }), navigate: vi.fn() })
    expect(many.search('entrada')).toHaveLength(50)
  })
})

describe('ReadStateCache', () => {
  const row = (id: number, seen: string, section = '') => ({ user_id: 'u', campaign_id: 'c', entity_type: 'lore' as const, entity_id: id, section, seen_at: seen })

  it('is unread when never seen or changed after seen_at; never before the first load', () => {
    const cache = new ReadStateCache()
    expect(cache.isUnread('lore', 1, '2026-01-02T00:00:00Z')).toBe(false)
    cache.load([row(1, '2026-01-02T00:00:00Z'), row(2, '2026-01-01T00:00:00Z', 'equipo')])
    expect(cache.isUnread('lore', 1, '2026-01-02T00:00:00Z')).toBe(false)
    expect(cache.isUnread('lore', 1, '2026-01-03T00:00:00Z')).toBe(true)
    expect(cache.isUnread('lore', 3, '2026-01-01T00:00:00Z')).toBe(true)
    expect(cache.isUnread('lore', 3, null)).toBe(false)
    expect(cache.isUnread('lore', 2, '2026-01-02T00:00:00Z', 'equipo')).toBe(true)
    expect(cache.isUnread('lore', 2, '2026-01-02T00:00:00Z')).toBe(true) // whole-entity key differs from the section key
  })

  it('a local mark made while loading wins over an older row; the stored time never lags the entity', () => {
    const cache = new ReadStateCache()
    cache.mark('lore', 1, '', new Date('2026-02-01T00:00:00Z'))
    cache.load([row(1, '2026-01-01T00:00:00Z')])
    expect(cache.isUnread('lore', 1, '2026-01-15T00:00:00Z')).toBe(false)
    const now = new Date('2026-01-01T00:00:00Z')
    expect(seenAtFor('2026-03-01T00:00:00Z', now).toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(seenAtFor('2025-01-01T00:00:00Z', now)).toBe(now)
  })
})

describe('hub form port', () => {
  it('keeps only well-formed regions and a hex color; falls back when empty', () => {
    expect(
      parseRegions([
        { key: 'a', label: 'A', color: '#aabbcc' },
        { key: 'a', label: 'dup' },
        { key: 'b', label: 'B', color: 'red; background:url(x)' },
        { key: '', label: 'x' },
        'junk',
      ]),
    ).toEqual([{ key: 'a', label: 'A', color: '#aabbcc' }, { key: 'b', label: 'B' }])
    expect(parseRegions([])).toBe(FALLBACK_REGIONS)
    expect(parseRegions(null)).toBe(FALLBACK_REGIONS)
  })

  it('offers the pjs of the index as characters', () => {
    const port = createHubFormPort({ isDM: true, regions: [], pjs: [item(3, 'Eldric')] })
    expect(port.characters).toEqual([{ id: 3, nombre: 'Eldric' }])
    expect(port.sesiones).toEqual([])
  })
})

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}

function OpenLoreForm() {
  const { openForm } = useEntityForm()
  return (
    <>
      <button onClick={() => openForm({ type: 'lore' })}>nuevo</button>
      <button onClick={() => openForm({ type: 'lore', id: 1 })}>editar</button>
    </>
  )
}

function renderHub(options: { isDM?: boolean; layer: ReturnType<typeof createFakeLayer>['layer']; children: React.ReactNode }) {
  const isDM = options.isDM ?? true
  window.scrollTo = vi.fn() as typeof window.scrollTo
  const data = makeData({ layer: options.layer })
  return render(
    <MemoryRouter initialEntries={['/c/demo/lore']}>
      <AuthContext.Provider value={makeAuth()}>
        <DataContext.Provider value={data}>
          <CampaignContext.Provider
            value={{ campaign: makeCampaign({ id: 'c1', slug: 'demo' }), role: isDM ? 'dm' : 'player', isDM, myCharacterIds: [3], reload: () => undefined }}
          >
            <HubPortsProvider>
              {options.children}
              <Where />
            </HubPortsProvider>
          </CampaignContext.Provider>
        </DataContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('HubPortsProvider', () => {
  it('renders wiki links through the hub index and navigates to the section URL', async () => {
    const { layer } = createFakeLayer({ index: { lugares: [item(4, 'Kardevir')], homebrew_rules: [item(2, 'Regla')] } })
    renderHub({ layer, children: <WikiText text="Vamos a [[{4G}Kardevir]], no a [[{9G}Oculto]] ni [[{2H}reglas]]." /> })
    const link = await screen.findByText('Kardevir', { selector: 'span.cursor-pointer' })
    fireEvent.click(link)
    expect(screen.getByTestId('where')).toHaveTextContent('/c/demo/lugares/4')
    expect(screen.getByText('Oculto')).toHaveClass('cursor-default')
    fireEvent.click(screen.getByText('reglas'))
    expect(screen.getByTestId('where')).toHaveTextContent('/c/demo/homerules/2')
  })

  it('shows the player their own note and saves it with their first character', async () => {
    const { layer } = createFakeLayer()
    const saved = { campaign_id: 'c1', user_id: 'user-1', entity_type: 'lore', entity_id: 1, character_id: 3, text: 'hola', created_at: '', updated_at: '' } as PlayerNote
    const upsert = (layer.playerNotes.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(saved)
    renderHub({ isDM: false, layer, children: <PlayerNotes entityType="lore" entityId={1} /> })
    const box = await screen.findByPlaceholderText(/Escribe tus notas/)
    fireEvent.change(box, { target: { value: 'hola' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    await waitFor(() => expect(upsert).toHaveBeenCalledWith({ campaignId: 'c1', entityType: 'lore', entityId: 1, text: 'hola', characterId: 3 }))
  })

  it('shows the DM every author note labelled with the character name', async () => {
    const { layer } = createFakeLayer({ index: { pjs: [item(3, 'Eldric')] } })
    ;(layer.playerNotes.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { campaign_id: 'c1', user_id: 'u2', entity_type: 'lore', entity_id: 1, character_id: 3, text: 'nota de Eldric', created_at: '', updated_at: '' },
    ])
    renderHub({ layer, children: <PlayerNotes entityType="lore" entityId={1} /> })
    expect(await screen.findByDisplayValue('nota de Eldric')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Eldric')).toBeInTheDocument())
  })

  it('UnreadDot asks the hub unread port: unread once read_state loaded with no row', async () => {
    const { layer } = createFakeLayer()
    renderHub({ layer, children: <UnreadDot type="lore" id={1} updatedAt="2026-01-01T00:00:00Z" data-testid="dot" /> })
    expect(await screen.findByTestId('dot')).toBeInTheDocument()
  })

  it('DM creates a lore entry through the form host: DM notes never reach the entity payload', async () => {
    const { layer, spies } = createFakeLayer()
    renderHub({ layer, children: <OpenLoreForm /> })
    fireEvent.click(screen.getByRole('button', { name: 'nuevo' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'El Cisma' } })
    fireEvent.change(within(dialog).getByPlaceholderText(/historia, geografía/), { target: { value: 'Historia' } })
    const textareas = within(dialog).getAllByRole('textbox').filter((el) => el.tagName === 'TEXTAREA')
    fireEvent.change(textareas[1], { target: { value: 'solo para el DM' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalled())
    const [table, target, flat] = spies.saveEntityWithDmNotes.mock.calls[0]
    expect(table).toBe('lore')
    expect(target).toEqual({ campaignId: 'c1' })
    expect(flat).toMatchObject({ titulo: 'El Cisma', categoria: 'historia', estado: 'publicado' })
    expect(flat).not.toHaveProperty('notas')
    expect(flat).not.toHaveProperty('visibilidad')
    expect(spies.dmNotesUpsert).toHaveBeenCalledWith('c1', 'lore', 99, { notas: 'solo para el DM' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('edit opens only after the DM notes loaded, seeds them, and writes only what changed', async () => {
    const lore = { id: 1, campaign_id: 'c1', titulo: 'Viejo', categoria: 'historia', descripcion: 'd', estado: 'publicado', updated_at: 'v1' }
    const { layer, spies } = createFakeLayer({ entities: { lore: [lore] }, dmNotes: { 'lore:1': { notas: 'secreto previo', secreto: '', ganchos: '' } }, visibility: { 1: [] } })
    renderHub({ layer, children: <OpenLoreForm /> })
    fireEvent.click(screen.getByRole('button', { name: 'editar' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByDisplayValue('secreto previo')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByDisplayValue('Viejo'), { target: { value: 'Nuevo título' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalled())
    const [, target, flat] = spies.saveEntityWithDmNotes.mock.calls[0]
    expect(target).toMatchObject({ campaignId: 'c1', id: 1, base: { updated_at: 'v1' } })
    expect(flat).toEqual({ titulo: 'Nuevo título' })
    expect(spies.setVisibility).not.toHaveBeenCalled()
  })

  it('a player cannot open the entity form', async () => {
    const { layer } = createFakeLayer()
    renderHub({ isDM: false, layer, children: <OpenLoreForm /> })
    fireEvent.click(screen.getByRole('button', { name: 'nuevo' }))
    await act(async () => undefined)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('EntityFormHost hardening', () => {
  const lore = { id: 1, campaign_id: 'c1', titulo: 'Viejo', categoria: 'historia', descripcion: 'd', estado: 'publicado', updated_at: 'v1' }

  it('two rapid submits write once (in-flight guard) and Guardar is disabled while saving', async () => {
    const { layer, spies } = createFakeLayer()
    let release: () => void = () => undefined
    spies.saveEntityWithDmNotes.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ entity: { id: 50, campaign_id: 'c1', updated_at: 'v' } as never, dmNotes: null }) }),
    )
    renderHub({ layer, children: <OpenLoreForm /> })
    fireEvent.click(screen.getByRole('button', { name: 'nuevo' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Una' } })
    const guardar = within(dialog).getByRole('button', { name: 'Guardar' })
    await act(async () => {
      fireEvent.click(guardar)
      fireEvent.click(guardar)
    })
    expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1)
    expect(guardar).toBeDisabled()
    await act(async () => release())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1)
  })

  it('a failed notes write keeps the form open re-based on the saved version, and the retry sends that base', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lore: [lore] }, dmNotes: { 'lore:1': { notas: 'a', secreto: '', ganchos: '' } } })
    spies.dmNotesUpsert.mockRejectedValueOnce(new Error('boom'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderHub({ layer, children: <OpenLoreForm /> })
    fireEvent.click(screen.getByRole('button', { name: 'editar' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByDisplayValue('a'), { target: { value: 'b' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.dmNotesUpsert).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeEnabled())
    expect(screen.getByRole('dialog')).toBeInTheDocument() // still open
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.dmNotesUpsert).toHaveBeenCalledTimes(2))
    const retryTarget = spies.saveEntityWithDmNotes.mock.calls.at(-1)?.[1] as { base?: { updated_at: string } }
    expect(retryTarget.base?.updated_at).toBe('2026-01-01T00:00:00Z') // the saved version, not v1
    errorSpy.mockRestore()
  })

  it('a transient re-list error while the form is open does not close it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const { layer, spies } = createFakeLayer({ entities: { lore: [lore] }, dmNotes: {} })
      renderHub({ layer, children: <OpenLoreForm /> })
      fireEvent.click(screen.getByRole('button', { name: 'editar' }))
      await screen.findByRole('dialog')
      spies.entityList.mockRejectedValue(new Error('network'))
      vi.setSystemTime(Date.now() + 60_000)
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
      })
      await waitFor(() => expect(spies.entityList.mock.calls.length).toBeGreaterThan(1))
      await act(async () => undefined)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('an edit fails to open (and says so) when the entity is missing', async () => {
    const { layer } = createFakeLayer({ entities: { lore: [] } })
    renderHub({ layer, children: <OpenLoreForm /> })
    fireEvent.click(screen.getByRole('button', { name: 'editar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ya no existe')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('hub adapters: notes, unread and pending links', () => {
  it('a DM correcting another user\'s note uses UPDATE, never upsert', async () => {
    const { layer } = createFakeLayer()
    ;(layer.playerNotes.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { campaign_id: 'c1', user_id: 'u2', entity_type: 'lore', entity_id: 1, character_id: null, text: 'vieja', created_at: '', updated_at: '' },
    ])
    const update = (layer.playerNotes.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      campaign_id: 'c1', user_id: 'u2', entity_type: 'lore', entity_id: 1, character_id: null, text: 'nueva', created_at: '', updated_at: '',
    })
    renderHub({ layer, children: <PlayerNotes entityType="lore" entityId={1} /> })
    fireEvent.change(await screen.findByDisplayValue('vieja'), { target: { value: 'nueva' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('c1', 'u2', 'lore', 1, 'nueva'))
    expect(layer.playerNotes.upsert).not.toHaveBeenCalled()
  })

  it('UnreadDot with no type/id and no unread renders nothing, without a provider', () => {
    const { container } = render(<UnreadDot unread={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('links of a table whose index failed or is loading render as neutral text, not "no encontrado"', () => {
    const failed = { ...READY, lugares: 'error' } as WikiIndex['status']
    const port = createHubWikiPort({ index: emptyIndex({}, false, failed), navigate: vi.fn() })
    expect(port.pending('G')).toBe(true)
    expect(port.pending('N')).toBe(false)
    expect(port.resolve('G', 1)).toBeNull()
  })

  it('seen_at never goes back: an older mark is ignored', () => {
    const cache = new ReadStateCache()
    expect(cache.mark('lore', 1, '', new Date('2026-05-01T00:00:00Z'))).toBe(true)
    expect(cache.mark('lore', 1, '', new Date('2026-04-01T00:00:00Z'))).toBe(false)
    expect(cache.mark('lore', 1, '', new Date('2026-06-01T00:00:00Z'))).toBe(true)
  })
})
