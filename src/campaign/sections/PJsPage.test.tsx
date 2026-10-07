import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { here } from '../../app/testing/renderApp'
import type { EntityFormRequest } from '../entityFormContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, observers, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// Wraps the real hook so the tests can assert exactly what the page asks the form host to open.
const openFormSpy = vi.fn<(request: EntityFormRequest) => void>()
vi.mock('../entityFormContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../entityFormContext')>()
  return {
    ...actual,
    useEntityForm: () => {
      const api = actual.useEntityForm()
      return { ...api, openForm: (request: EntityFormRequest) => { openFormSpy(request); api.openForm(request) } }
    },
  }
})

afterEach(() => openFormSpy.mockClear())

const COINS0 = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
const pj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, {
    nombre: `PJ ${id}`, jugador: '', clase: 'Guerrero', raza: '', region: 'magral', nivel: 1, imagen_url: '',
    sections_updated: {}, monedas: COINS0, monedas_guardado: {}, ...over,
  })

const ELDRIC = pj(1, {
  nombre: 'Eldric', jugador: 'Ana', clase: 'Paladín', raza: 'Humano', nivel: 5, trasfondo: 'Un **soldado** retirado.',
  stat_hp: 40, stat_hp_current: 31, stat_hp_temp: 5, stat_ac: 18, stat_ac_temp: 2, stat_speed: 30, stat_initiative: 2,
  stat_str: 16, stat_dex: 10, stat_con: 14, stat_int: 8, stat_wis: 12, stat_cha: 15,
})
const MAISIE = pj(2, { nombre: 'Maisie', jugador: '', clase: 'Maga', raza: 'Elfa', region: 'lejana', nivel: 3 })
const KAYLINX = pj(3, { nombre: 'Kaylinx', jugador: 'Luz', clase: 'Pícaro', nivel: 2, estado: 'borrador' })
const PJS = [ELDRIC, MAISIE, KAYLINX]

const main = () => within(screen.getByRole('main'))
const cards = () => main().queryAllByRole('link').filter((a) => /\/pjs\/\d+(\?.*)?$/.test(a.getAttribute('href') ?? ''))
const names = () => cards().map((a) => within(a).getByText(/^(Eldric|Maisie|Kaylinx)$/).textContent)

describe('PJs list', () => {
  it('DM: renders the cards in id order with jugador, class and level, region and the HP/AC/speed badges', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: PJS } })
    renderSection('/c/demo/pjs', { layer, regions: [{ key: 'magral', label: 'Tierras de Magral' }] })
    expect(await screen.findByRole('heading', { level: 1, name: 'El Grupo' })).toBeInTheDocument()
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(names()).toEqual(['Eldric', 'Maisie', 'Kaylinx'])
    const first = within(cards()[0])
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/pjs/1')
    expect(first.getByText('Ana')).toBeInTheDocument()
    expect(first.getByText('Paladín - Nv. 5')).toBeInTheDocument()
    expect(first.getByText('Humano')).toBeInTheDocument()
    expect(first.getByText('Tierras de Magral')).toBeInTheDocument()
    expect(first.getByText('40')).toBeInTheDocument() // HP
    expect(first.getByText('HP Temp.').nextSibling).toHaveTextContent('5')
    expect(first.getByText('AC').nextSibling).toHaveTextContent('18')
    expect(first.getByText('AC Temp.').nextSibling).toHaveTextContent('2')
    expect(first.getByText('30ft')).toBeInTheDocument()
    expect(first.getByText('Init.').nextSibling).toHaveTextContent('+2')
    expect(first.getAllByText('+3').length).toBeGreaterThan(0) // FUE 16 modifier
    expect(first.getByText('Un soldado retirado.', { exact: false })).toBeInTheDocument()
    expect(within(cards()[1]).getByText('Sin asignar')).toBeInTheDocument()
    expect(within(cards()[1]).getByText('lejana')).toBeInTheDocument() // unknown region: raw key
    expect(within(cards()[1]).getByText('Sin trasfondo registrado.')).toBeInTheDocument()
    expect(within(cards()[2]).getByText('Borrador')).toBeInTheDocument()
  })

  it('searches by name, class, race and player (case-insensitive) and keeps the query in the URL', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: PJS } })
    const { router } = renderSection('/c/demo/pjs', { layer })
    await waitFor(() => expect(cards()).toHaveLength(3))
    const search = screen.getByRole('searchbox', { name: 'Buscar PJs' })
    fireEvent.change(search, { target: { value: 'ELF' } })
    await waitFor(() => expect(names()).toEqual(['Maisie']))
    expect(here(router)).toContain('q=ELF')
    fireEvent.change(search, { target: { value: 'ana' } })
    await waitFor(() => expect(names()).toEqual(['Eldric']))
    fireEvent.change(search, { target: { value: 'pícaro' } })
    await waitFor(() => expect(names()).toEqual(['Kaylinx']))
    fireEvent.change(search, { target: { value: 'nadie' } })
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument()
    expect(screen.getByText('No hay PJs que coincidan con la búsqueda.')).toBeInTheDocument()
  })

  it('empty campaign invites to add characters; a load failure is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [] } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/pjs', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los personajes')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/personajes jugadores de Demo/)).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('DM sees the lock only on characters with DM notes (reads only the PJ notes) and the create button', async () => {
    const { layer, spies } = createFakeLayer({
      entities: { pjs: PJS },
      dmNotes: { 'pjs:1': { notas: 'Es un traidor', secreto: '', ganchos: '' }, 'pjs:2': { notas: '  ', secreto: 'x', ganchos: '' } },
    })
    renderSection('/c/demo/pjs', { layer })
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Tiene notas DM' })).toHaveLength(1))
    expect(within(cards()[0]).getByRole('img', { name: 'Tiene notas DM' })).toBeInTheDocument()
    expect(spies.dmNotesList).toHaveBeenCalledWith('c1', 'pjs')
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo PJ' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'pjs' })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('player: no create button, no locks, never reads the DM tables or visibility; others\' drafts are hidden', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: PJS }, dmNotes: { 'pjs:1': { notas: 'secreto', secreto: '', ganchos: '' } } })
    renderSection('/c/demo/pjs', { layer, isDM: false, characterIds: [1] })
    await waitFor(() => expect(names()).toEqual(['Eldric', 'Maisie']))
    expect(screen.queryByText('Kaylinx')).toBeNull() // someone else's draft that reached the client
    expect(screen.queryByRole('button', { name: '+ Nuevo PJ' })).toBeNull()
    expect(screen.queryByRole('img', { name: 'Tiene notas DM' })).toBeNull()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('an owner still sees (and can open) their own draft character; strangers get "not found"', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: PJS } })
    const { router } = renderSection('/c/demo/pjs', { layer, isDM: false, characterIds: [3] })
    await waitFor(() => expect(names()).toEqual(['Eldric', 'Maisie', 'Kaylinx']))
    expect(within(cards()[2]).getByText('Borrador')).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/pjs/3')
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Kaylinx' })).toBeInTheDocument()
  })

  it('a draft by URL is "not found" for a player who does not own it', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: PJS } })
    renderSection('/c/demo/pjs/3', { layer, isDM: false, characterIds: [1] })
    expect(await screen.findByRole('heading', { level: 1, name: 'Personaje no encontrado' })).toBeInTheDocument()
    expect(screen.queryByText('Kaylinx')).toBeNull()
  })
})

describe('PJs unread dots per section', () => {
  const STAMPED = pj(1, {
    nombre: 'Eldric', stat_hp: 10, ataques: [{ id: 1, nombre: 'Espada', portando: true }],
    sections_updated: { stats: '2026-01-03T10:00:00Z', ataques: '2026-01-03T10:00:00Z', general: '2026-01-03T10:00:00Z' },
  })

  it('a character with stamped sections shows a dot on its card; one without stamps shows none', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [STAMPED, pj(2, { nombre: 'Maisie' })] } })
    const { container } = renderSection('/c/demo/pjs', { layer })
    await waitFor(() => expect(cards()).toHaveLength(2))
    await waitFor(() => expect(container.querySelectorAll('.unread-dot')).toHaveLength(1))
    expect(within(cards()[0]).getByText('Eldric').closest('a')?.querySelector('.unread-dot')).not.toBeNull()
  })

  it('opening the sheet clears "general" at once; a section clears when its nav button is used (read_state per section)', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [STAMPED] } })
    const { container } = renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 1, 'general', expect.any(Date)))
    // the sections with news keep their dot until viewed
    const nav = screen.getAllByRole('button', { name: 'Stats' })[0]
    await waitFor(() => expect(nav.querySelector('.unread-dot')).not.toBeNull())
    const ataques = screen.getAllByRole('button', { name: 'Ataques' })[0]
    expect(ataques.querySelector('.unread-dot')).not.toBeNull()
    window.scrollTo = vi.fn() as typeof window.scrollTo
    fireEvent.click(nav)
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 1, 'stats', expect.any(Date)))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Stats' })[0].querySelector('.unread-dot')).toBeNull())
    expect(screen.getAllByRole('button', { name: 'Ataques' })[0].querySelector('.unread-dot')).not.toBeNull()
    expect(container.querySelectorAll('.unread-dot').length).toBeGreaterThan(0)
  })

  it('a section read after it stayed mostly visible for the dwell time clears too', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { layer } = createFakeLayer({ entities: { pjs: [STAMPED] } })
      renderSection('/c/demo/pjs/1', { layer })
      await vi.waitFor(() => expect(document.getElementById('pj-section-ataques')).not.toBeNull())
      const el = document.getElementById('pj-section-ataques') as HTMLElement
      await vi.waitFor(() => expect(observers.some((o) => o.target === el || o.target?.id?.startsWith('pj-section-'))).toBe(true))
      const observer = observers.find((o) => o.target?.id?.startsWith('pj-section-'))
      act(() => {
        observer?.callback(
          [{ target: el, isIntersecting: true, intersectionRatio: 1, intersectionRect: { height: 500 } } as unknown as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
      })
      expect(layer.readState.markSeen).not.toHaveBeenCalledWith('c1', 'pjs', 1, 'ataques', expect.any(Date))
      await act(async () => {
        vi.advanceTimersByTime(1600)
      })
      expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 1, 'ataques', expect.any(Date))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('PJ "dm" unread dot comes from the DM-only notes row, never from sections_updated', () => {
  const NOTE = { notas: 'N', secreto: '', ganchos: '', updated_at: '2026-03-01T00:00:00Z' }

  it('DM: the dot follows entity_dm_notes.updated_at (card and nav) and clears when the DM section is opened', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [pj(1, { nombre: 'Eldric' })] }, dmNotes: { 'pjs:1': NOTE as never } })
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    window.scrollTo = vi.fn() as typeof window.scrollTo
    const nav = await waitFor(() => {
      const button = screen.getAllByRole('button', { name: /DM/ })[0]
      expect(button.querySelector('.unread-dot')).not.toBeNull()
      return button
    })
    fireEvent.click(nav)
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 1, 'dm', expect.any(Date)))
    const seen = (layer.readState.markSeen as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[3] === 'dm')?.[4] as Date
    expect(seen.getTime()).toBeGreaterThanOrEqual(Date.parse(NOTE.updated_at))
  })

  it('DM list: a character whose only news is a DM-notes edit shows a dot; a stale legacy sections_updated.dm alone does not', async () => {
    const { layer } = createFakeLayer({
      entities: { pjs: [pj(1, { nombre: 'Eldric' }), pj(2, { nombre: 'Maisie', sections_updated: { dm: '2026-03-01T00:00:00Z' } })] },
      dmNotes: { 'pjs:1': NOTE as never },
    })
    renderSection('/c/demo/pjs', { layer })
    await waitFor(() => expect(cards()).toHaveLength(2))
    await waitFor(() => expect(within(cards()[0]).getByText('Eldric').closest('a')?.querySelector('.unread-dot')).not.toBeNull())
    expect(within(cards()[1]).getByText('Maisie').closest('a')?.querySelector('.unread-dot')).toBeNull()
  })

  it('a player never gets a dm dot, even when a legacy dm stamp is in sections_updated', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [pj(1, { nombre: 'Eldric', sections_updated: { dm: '2026-03-01T00:00:00Z' } })] } })
    const { container } = renderSection('/c/demo/pjs', { layer, isDM: false, characterIds: [1] })
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(container.querySelectorAll('.unread-dot')).toHaveLength(0)
  })
})

const FULL = pj(1, {
  nombre: 'Eldric', jugador: 'Ana', clase: 'Paladín', raza: 'Humano', nivel: 5, alineamiento: 'Leal Bueno', region: 'magral',
  stat_hp: 40, stat_hp_current: 31, stat_hp_temp: 5, stat_ac: 18, stat_ac_temp: 2, stat_speed: 30, stat_initiative: 2,
  stat_str: 16, stat_dex: 10, stat_con: 14, stat_int: 8, stat_wis: 12, stat_cha: 15, stat_proficiency_bonus: 3,
  save_str: true, skill_athletics: 1, skill_perception: 2,
  ataques: [
    { id: 1, nombre: 'Espada larga', bono_ataque: '+6', dano: '1d8+3', tipo_dano: 'Cortante', alcance: '5 ft', precio: 15, precio_moneda: 'gp', portando: true },
    { id: 2, nombre: 'Daga', bono_ataque: '+4', dano: '1d4+1', tipo_dano: 'Perforante', alcance: '5 ft', precio: 2, precio_moneda: 'gp', portando: false },
  ],
  equipo: [
    { id: 1, nombre: 'Cuerda', cantidad: 2, descripcion: 'De cáñamo', precio: 5, precio_moneda: 'sp', portando: true },
    { id: 2, nombre: 'Gema', cantidad: 1, descripcion: '', precio: 1, precio_moneda: 'pp', portando: false },
  ],
  monedas: { cp: 7, sp: 0, ep: 0, gp: 120, pp: 2 },
  monedas_guardado: { cp: 0, sp: 30, ep: 0, gp: 0, pp: 0 },
  spell_dc: 14, spell_attack_bonus: 6, spell_ability: 'CAR', spell_slots: { '1': 4, '2': 2 }, spell_slots_current: { '1': 3 },
  hechizos: [
    { id: 1, nombre: 'Luz', nivel: 0, preparado: false, escuela: 'Evocación', descripcion: 'Una luz.' },
    { id: 2, nombre: 'Bendecir', nivel: 1, preparado: true, concentracion: true, descripcion: 'Bendice.' },
    { id: 3, nombre: 'Castigo', nivel: 1, preparado: false, ritual: true, descripcion: 'Golpe.' },
    { id: 4, nombre: 'Imposición', nivel: 10, preparado: false, descripcion: 'Curar.' },
  ],
  recursos: [{ id: 1, nombre: 'Canalizar', actual: 1, maximo: 2, recuperacion: 'corto' }],
  rasgos_clase: 'Sentido divino', idiomas: 'Común, Celestial',
  trasfondo: 'Soldado', motivo: 'Dinero', edad: '30', personalidad: 'Calmo',
  custom_fields: { magralita: 'Siente su pulso.' },
})

describe('PJ detail', () => {
  it('shows the identity header, tags, stats with modifiers, HP/AC (current/temp), speed and passive perception', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [FULL] } })
    renderSection('/c/demo/pjs/1', { layer, regions: [{ key: 'magral', label: 'Tierras de Magral', color: '#7aad82' }] })
    const title = await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    expect(title.nextSibling).toHaveTextContent('Ana')
    expect(screen.getByText('Personaje Jugador')).toHaveStyle({ color: 'rgb(122, 173, 130)' })
    expect(screen.getByText('Paladín - Nv. 5')).toBeInTheDocument()
    expect(screen.getByText('Tierras de Magral')).toBeInTheDocument()
    expect(screen.getByText('Leal Bueno')).toBeInTheDocument()
    const stats = document.getElementById('pj-section-stats') as HTMLElement
    expect(within(stats).getByText('31 (+5) / 40')).toBeInTheDocument()
    expect(within(stats).getByText('18 (+2)')).toBeInTheDocument()
    expect(within(stats).getByText('30 ft')).toBeInTheDocument()
    expect(within(stats).getByText('+3')).toBeInTheDocument() // FUE 16
    expect(within(stats).getByText('-1')).toBeInTheDocument() // INT 8
    expect(within(stats).getByText('Perc. Pasiva').nextSibling).toHaveTextContent('17') // 10 + 1 + 3 + 3
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/pjs')
  })

  it('attacks are grouped in Portando / Guardado', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [FULL] } })
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    const section = document.getElementById('pj-section-ataques') as HTMLElement
    const groups = within(section).getAllByText(/^(Portando|Guardado)$/).map((n) => n.textContent)
    expect(groups).toEqual(['Portando', 'Guardado'])
    expect(within(section).getByText('Espada larga')).toBeInTheDocument()
    expect(within(section).getByText('15 gp')).toBeInTheDocument()
    expect(within(section).getByText('Daga')).toBeInTheDocument()
  })

  it('equipment table with subtotals, combined value in platino/oro/plata/bronce, and coins in hand / saved (pp→cp order)', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [FULL] } })
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    const section = document.getElementById('pj-section-equipo') as HTMLElement
    expect(within(section).getByText('×2')).toBeInTheDocument()
    expect(within(section).getByText('5 sp')).toBeInTheDocument()
    // portando: 2 × 5 sp = 100 cp + espada 15 gp = 1500 cp -> 1600 cp = 1 platino 6 oro
    const subtotals = within(section).getAllByText('Subtotal:').map((n) => n.textContent)
    expect(subtotals).toHaveLength(2)
    expect(within(section).getByText('1 platino 6 oro')).toBeInTheDocument()
    // guardado: 1 pp (1000) + daga 2 gp (200) = 1200 cp
    expect(within(section).getByText('1 platino 2 oro')).toBeInTheDocument()
    // total: 1600 + 1200 = 2800 cp
    expect(within(section).getByText('2 platino 8 oro')).toBeInTheDocument()
    const handLabels = within(section).getAllByText(/^(En mano|Guardadas)$/).map((n) => n.textContent)
    expect(handLabels).toEqual(['En mano', 'Guardadas'])
    const coinLabels = within(section).getAllByText(/^(Platino|Oro|Electrum|Plata|Bronce)$/).map((n) => n.textContent)
    expect(coinLabels).toEqual(['Platino', 'Oro', 'Bronce', 'Plata']) // hand: pp, gp, cp (no sp); saved: sp
  })

  it('spell chips: cantrips and abilities are always active, prepared ones too; C / R badges; a chip opens the detail modal', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [FULL] } })
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    const section = document.getElementById('pj-section-hechizos') as HTMLElement
    const chip = (name: RegExp) => within(section).getByRole('button', { name })
    expect(chip(/^Luz/).className).toContain('bg-accent') // nivel 0, not marked prepared
    expect(chip(/^Imposición/).className).toContain('bg-accent') // nivel 10 (habilidad)
    expect(chip(/^Bendecir/).className).toContain('bg-accent') // prepared
    expect(chip(/^Castigo/).className).toContain('bg-bg-mid') // not prepared
    expect(chip(/^Bendecir/)).toHaveTextContent('C')
    expect(chip(/^Castigo/)).toHaveTextContent('R')
    expect(within(section).getByText('3/4')).toBeInTheDocument() // slots current/max
    expect(within(section).getByText('2/2')).toBeInTheDocument()
    fireEvent.click(chip(/^Castigo/))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Golpe.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /cerrar/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('resources, traits, narrative with the campaign custom field, appearance', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [FULL] } })
    const fields = [{ key: 'magralita', label: 'Relación con la Magralita', type: 'text' }, { key: 'vacio', label: 'Otra cosa' }]
    renderSection('/c/demo/pjs/1', { layer, customFields: fields })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    expect(within(document.getElementById('pj-section-recursos') as HTMLElement).getByText('1/2')).toBeInTheDocument()
    expect(within(document.getElementById('pj-section-rasgos') as HTMLElement).getByText('Sentido divino')).toBeInTheDocument()
    const narrativa = document.getElementById('pj-section-narrativa') as HTMLElement
    expect(within(narrativa).getByText('Relación con la Magralita')).toBeInTheDocument()
    expect(within(narrativa).getByText('Siente su pulso.')).toBeInTheDocument()
    expect(within(narrativa).queryByText('Otra cosa')).toBeNull() // empty custom field: no block
    expect(within(document.getElementById('pj-section-apariencia') as HTMLElement).getByText('Calmo')).toBeInTheDocument()
  })

  it('DM sees the DM notes block and nav button; a player never gets DM notes nor makes DM reads, and sees no edit', async () => {
    const dmNotes = { 'pjs:1': { notas: 'NOTA PRIVADA', secreto: '', ganchos: '' } }
    const dm = createFakeLayer({ entities: { pjs: [FULL] }, dmNotes })
    const { unmount } = renderSection('/c/demo/pjs/1', { layer: dm.layer })
    expect(await screen.findByText('NOTA PRIVADA')).toBeInTheDocument()
    expect(screen.getByText('Notas DM')).toBeInTheDocument()
    expect(dm.spies.dmNotesGet).toHaveBeenCalledWith('pjs', 1)
    expect(screen.getAllByRole('button', { name: /DM/ }).length).toBeGreaterThan(0)
    unmount()

    const pl = createFakeLayer({ entities: { pjs: [FULL] }, dmNotes })
    renderSection('/c/demo/pjs/1', { layer: pl.layer, isDM: false, characterIds: [2] })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    expect(screen.queryByText(/NOTA PRIVADA|Notas DM/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
    expect(pl.spies.dmNotesGet).not.toHaveBeenCalled()
    expect(pl.spies.dmNotesList).not.toHaveBeenCalled()
    expect(pl.spies.getVisibility).not.toHaveBeenCalled()
  })

  it('the DM edit button opens the form for this character; the owner gets one too; a delete returns to the list', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [FULL] } })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { router } = renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'pjs', id: 1, onRemoved: expect.any(Function) })
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(spies.entityRemove).toHaveBeenCalled())
    await waitFor(() => expect(here(router)).toBe('/c/demo/pjs'))
    confirmSpy.mockRestore()
  })

  it('does not delete when the confirmation is declined', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [FULL] } })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(spies.entityRemove).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('only the owner (not other players) gets "Editar", and no "Eliminar"', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [FULL] } })
    renderSection('/c/demo/pjs/1', { layer, isDM: false, characterIds: [1] })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
  })

  it('fades the name into the sticky bar when the title leaves the viewport', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [FULL] } })
    renderSection('/c/demo/pjs/1', { layer })
    const title = await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    const bar = title.ownerDocument.querySelector('.sticky span[aria-hidden="true"]') as HTMLElement
    expect(bar.style.opacity).toBe('0')
    await waitFor(() => expect(observers.some((o) => o.target === title)).toBe(true))
    const observer = observers.find((o) => o.target === title)
    act(() => observer?.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(bar.style.opacity).toBe('1')
  })

  it('unknown ids, non-numeric ids and a deleted row are "not found" (no DM read for them); a load failure is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [FULL] } })
    const { router } = renderSection('/c/demo/pjs/77', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Personaje no encontrado' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/pjs/1abc')
    })
    expect(await screen.findByText(/no corresponde a ningún personaje/)).toBeInTheDocument()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()

    const bad = createFakeLayer({ entities: { pjs: [FULL] } })
    bad.spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/pjs/1', { layer: bad.layer })
    expect(await screen.findByText('No pudimos cargar el personaje')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findAllByRole('heading', { level: 1, name: 'Eldric' })).not.toHaveLength(0)
    errorSpy.mockRestore()
  })

  it('the DM notes failure is a retryable notice, not silence', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [FULL] }, dmNotes: { 'pjs:1': { notas: 'Nota X', secreto: '', ganchos: '' } } })
    spies.dmNotesGet.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/pjs/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las notas del DM')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Nota X')).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('wiki links in the narrative navigate to the hub routes', async () => {
    const { layer } = createFakeLayer({
      entities: { pjs: [pj(1, { nombre: 'Eldric', trasfondo: 'Hijo de [[{4N}Kardevir]].' })] },
      index: { pnjs: [{ id: 4, title: 'Kardevir', imagen_url: null, estado: 'publicado' }] },
    })
    const { router } = renderSection('/c/demo/pjs/1', { layer })
    fireEvent.click(await screen.findByText('Kardevir', { selector: 'span.cursor-pointer' }))
    expect(here(router)).toBe('/c/demo/pnjs/4')
  })
})
