import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Disponibilidad, Member, PlayerAvailability, PlayerNote } from '../../data'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

// the first test of a file pays for the lazy page chunks
configure({ asyncUtilTimeout: 10000 })

// "Today" is Tuesday 2026-03-10 12:00 local; the viewer is user-1 (profile "Ana")
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 10, 12, 0) })
})
afterEach(() => vi.useRealTimers())

const LAST_VISIT_KEY = 'drakterima:last-visit:c1:user-1'
const visitedAt = (iso: string) => localStorage.setItem(LAST_VISIT_KEY, iso)

const sesion = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { tipo: 'sesion', numero: id, titulo: `Sesión titulada ${id}`, resumen: `Resumen ${id}`, ...over })
const slot = (id: number, fecha: string, over: Partial<Disponibilidad> = {}): Disponibilidad => ({
  id, campaign_id: 'c1', tipo: 'sesion', fecha_inicio: fecha, fecha_fin: null, hora_inicio: null, hora_fin: null, created_by: null, created_at: '', updated_at: '', ...over,
})
const member = (user_id: string, name: string, role: 'dm' | 'player' = 'player'): Member => ({
  campaign_id: 'c1', user_id, role, created_at: '', updated_at: '', profile: { id: user_id, display_name: name, avatar_url: null },
})
const MEMBERS = [member('dm1', 'Germán', 'dm'), member('user-1', 'Ana'), member('u2', 'Bruno'), member('u3', 'Carla')]
const window12 = (user_id: string): PlayerAvailability => ({
  id: 1, user_id, campaign_id: null, tipo: 'personal', fecha: null, fecha_inicio: '2026-03-12', fecha_fin: '2026-03-12', hora_inicio: '18:00', hora_fin: '23:00', created_at: '', updated_at: '',
})
const pj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `PJ ${id}`, jugador: '', clase: 'Maga', raza: 'Elfa', region: 'orrin', nivel: 3, imagen_url: '', sections_updated: {}, monedas: {}, monedas_guardado: {}, ...over })
const pnote = (over: Partial<PlayerNote> = {}): PlayerNote => ({
  campaign_id: 'c1', user_id: 'user-1', entity_type: 'pnjs', entity_id: 1, character_id: null, text: 'Nos ocultó algo', created_at: '', updated_at: '2026-03-09T10:00:00Z', ...over,
})

interface Seed {
  entities?: Record<string, ReturnType<typeof entity>[]>
  disponibilidad?: Disponibilidad[]
  playerAvailability?: PlayerAvailability[]
  members?: Member[]
  playerNotes?: PlayerNote[]
  dmNotes?: Record<string, { notas: string; secreto: string; ganchos: string }>
  branding?: Record<string, unknown>
  system_profile?: unknown
  isDM?: boolean
  characterIds?: number[]
  failNotes?: boolean
}
function setup({ entities = {}, disponibilidad = [], playerAvailability = [], members = MEMBERS, playerNotes = [], dmNotes, branding = {}, system_profile, isDM = false, characterIds = [], failNotes = false }: Seed = {}) {
  const campaign = { name: 'Drakterima', branding, regions: [{ key: 'orrin', label: 'Valle de Orrin', color: '#336699' }], ...(system_profile ? { system_profile } : {}) }
  const made = createFakeLayer({ entities, disponibilidad, playerAvailability, members, playerNotes, dmNotes, campaign: campaign as never })
  if (failNotes) made.spies.playerNotesList.mockRejectedValue(new Error('boom'))
  return { ...made, ...renderSection('/c/demo', { layer: made.layer, isDM, characterIds, campaign: campaign as never, regions: campaign.regions }) }
}
const panel = async () => {
  await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
  return within(screen.getByRole('main'))
}
const card = async (name: string) => {
  const main = await panel()
  return within((await main.findByRole('heading', { name })).closest('section')!)
}

describe('banner and greeting', () => {
  it('draws the banner as an image for a valid https URL, faded into the background', async () => {
    setup({ branding: { banner_url: 'https://x.test/banner.jpg' } })
    const main = await panel()
    expect(main.getByTestId('panel-banner')).toHaveAttribute('src', 'https://x.test/banner.jpg')
    expect(main.getByTestId('panel-banner-fade')).toBeInTheDocument()
  })

  it.each([['http://x.test/b.jpg'], ['javascript:alert(1)'], [''], [42]])('draws no banner for %j', async (banner_url) => {
    setup({ branding: { banner_url } })
    const main = await panel()
    expect(main.queryByTestId('panel-banner')).toBeNull()
  })

  it('greets the viewer by their hub name and no longer shows the old blocks', async () => {
    setup({ entities: { pnjs: [entity(1, { nombre: 'Ilvane' })], lore: [entity(2, { titulo: 'La caída' })] } })
    const main = await panel()
    expect(await main.findByRole('heading', { level: 2, name: 'Hola, Ana' })).toBeInTheDocument()
    expect(main.queryByRole('list', { name: 'Estadísticas' })).toBeNull()
    expect(main.queryByText('PNJs recientes')).toBeNull()
    expect(main.queryByText('Últimos artículos')).toBeNull()
  })

  it('player subtitle counts what changed since the last visit', async () => {
    visitedAt('2026-03-08T00:00:00Z')
    setup({ entities: { pnjs: [entity(1, { nombre: 'Ilvane', updated_at: '2026-03-09T10:00:00Z' })], lugares: [entity(2, { nombre: 'Faro', updated_at: '2026-03-09T11:00:00Z' })], lore: [entity(3, { titulo: 'Viejo', updated_at: '2026-03-01T11:00:00Z' })] } })
    const main = await panel()
    expect(await main.findByText('2 novedades desde tu última visita')).toBeInTheDocument()
  })

  it('the first visit starts counting from now (and remembers it)', async () => {
    setup({ entities: { pnjs: [entity(1, { nombre: 'Ilvane', updated_at: '2026-03-09T10:00:00Z' })] } })
    const main = await panel()
    expect(await main.findByText('Sin novedades desde tu última visita')).toBeInTheDocument()
    expect(Date.parse(localStorage.getItem(LAST_VISIT_KEY) ?? '')).toBe(new Date(2026, 2, 10, 12, 0).getTime())
  })

  it('DM subtitle counts the things to prepare', async () => {
    setup({ isDM: true, entities: { sesiones: [sesion(1, { resumen: '' })], pnjs: [entity(1, { nombre: 'Ilvane' })] } })
    const main = await panel()
    expect(await main.findByText('2 cosas para preparar')).toBeInTheDocument()
  })
})

describe('Próxima sesión', () => {
  const entities = { sesiones: [sesion(1), sesion(24)] }
  const disponibilidad = [slot(1, '2026-03-01'), slot(2, '2026-03-12', { hora_inicio: '19:30:00', hora_fin: '23:00:00' })]

  it('shows the date block, the countdown, the session number, the hours and who can play', async () => {
    setup({ entities, disponibilidad, playerAvailability: [window12('user-1'), window12('u2')] })
    const next = await card('Sesión 25')
    expect(next.getByText('Próxima sesión · en 2 días')).toBeInTheDocument()
    expect(next.getByText('mar')).toBeInTheDocument()
    expect(next.getByText('12')).toBeInTheDocument()
    expect(next.getByText('jueves')).toBeInTheDocument()
    expect(next.getByText('19:30 – 23:00')).toBeInTheDocument()
    await waitFor(() => expect(next.getByText('2 de 3 jugadores disponibles')).toBeInTheDocument())
  })

  it('does not count a player flagged as unavailable that day', async () => {
    const no: PlayerAvailability = { ...window12('u2'), tipo: 'no_disponible', fecha: '2026-03-12', fecha_inicio: null, fecha_fin: null, hora_inicio: null, hora_fin: null }
    setup({ entities, disponibilidad, playerAvailability: [window12('user-1'), window12('u2'), no] })
    const next = await card('Sesión 25')
    await waitFor(() => expect(next.getByText('1 de 3 jugadores disponibles')).toBeInTheDocument())
  })

  it('says hoy and mañana', async () => {
    setup({ entities, disponibilidad: [slot(1, '2026-03-10')] })
    expect(await (await card('Sesión 25')).findByText('Próxima sesión · hoy')).toBeInTheDocument()
  })

  it('player: link to mark availability, no RSVP buttons', async () => {
    setup({ entities, disponibilidad })
    const next = await card('Sesión 25')
    expect(next.getByRole('link', { name: 'Marcar mi disponibilidad' })).toHaveAttribute('href', '/c/demo/calendario')
    expect(next.queryByRole('button')).toBeNull()
    expect(next.queryByRole('link', { name: 'Abrir sesión en vivo' })).toBeNull()
  })

  it('DM: links to the live session and the calendar', async () => {
    setup({ entities, disponibilidad, isDM: true })
    const next = await card('Sesión 25')
    expect(next.getByRole('link', { name: 'Abrir sesión en vivo' })).toHaveAttribute('href', '/c/demo/sesion-en-vivo')
    expect(next.getByRole('link', { name: 'Ver calendario' })).toHaveAttribute('href', '/c/demo/calendario')
    expect(next.queryByRole('link', { name: 'Marcar mi disponibilidad' })).toBeNull()
  })

  it('has an empty state', async () => {
    setup()
    expect(await (await panel()).findByText('No hay una próxima sesión agendada.')).toBeInTheDocument()
  })
})

describe('Mi personaje', () => {
  const mine = pj(7, { nombre: 'Kestrel', clase: 'Pícara', raza: 'Mediana', nivel: 7, monedas: { pp: 1, gp: 26, ep: 0, sp: 0, cp: 29 }, monedas_guardado: { gp: 32 }, imagen_url: '' })

  it('shows identity, level, the economy in the largest unit and the access column', async () => {
    setup({ entities: { pjs: [mine, pj(8)] }, characterIds: [7] })
    const sheet = await card('Kestrel')
    expect(sheet.getByText('Mi personaje')).toBeInTheDocument()
    expect(sheet.getByText('Mediana · Pícara · Valle de Orrin')).toBeInTheDocument()
    expect(sheet.getByText('Nivel')).toBeInTheDocument()
    expect(sheet.getByText('7')).toBeInTheDocument()
    expect(sheet.getByText('Economía total')).toBeInTheDocument()
    expect(sheet.getByText('6,83')).toBeInTheDocument()
    expect(sheet.getByText('3,63 platino encima · 3,2 platino guardado')).toBeInTheDocument()
    expect(sheet.getByRole('link', { name: 'Hoja completa →' })).toHaveAttribute('href', '/c/demo/pjs/7')
    const access = within(sheet.getByRole('navigation', { name: 'Accesos de Kestrel' }))
    expect(access.getByRole('link', { name: 'Ver ficha' })).toHaveAttribute('href', '/c/demo/pjs/7')
    expect(access.getByRole('link', { name: 'Mis notas' })).toHaveAttribute('href', '/c/demo/notas')
    expect(access.getByRole('link', { name: 'Mi disponibilidad' })).toHaveAttribute('href', '/c/demo/calendario')
  })

  it('puts the label above each value', async () => {
    setup({ entities: { pjs: [mine] }, characterIds: [7] })
    const sheet = await card('Kestrel')
    const level = sheet.getByText('Nivel').parentElement!
    expect(level.firstElementChild).toHaveTextContent('Nivel')
  })

  it('hides the level when the campaign does not use it, and the economy when currency is off', async () => {
    const profile = {
      version: 1,
      character: { builtins: { nivel: { enabled: false, label: 'Nivel', min: 1, max: 20 } } },
      currency: { enabled: false, denominations: [] },
    }
    setup({ entities: { pjs: [mine] }, characterIds: [7], system_profile: profile })
    const sheet = await card('Kestrel')
    expect(sheet.queryByText('Nivel')).toBeNull()
    expect(sheet.queryByText('Economía total')).toBeNull()
  })

  it('shows the portrait image when there is a valid https URL, else the initial', async () => {
    setup({ entities: { pjs: [{ ...mine, imagen_url: 'https://x.test/k.png' }] }, characterIds: [7] })
    const sheet = await card('Kestrel')
    expect(sheet.getByTestId('pc-portrait').querySelector('img')).toHaveAttribute('src', 'https://x.test/k.png')
  })

  it('shows the initial without an image', async () => {
    setup({ entities: { pjs: [mine] }, characterIds: [7] })
    const sheet = await card('Kestrel')
    expect(sheet.getByTestId('pc-portrait')).toHaveTextContent('K')
  })

  it('is not shown to the DM or to a player without a character', async () => {
    setup({ entities: { pjs: [mine] }, isDM: true, characterIds: [7] })
    const main = await panel()
    await main.findByText('El grupo')
    expect(main.queryByText('Mi personaje')).toBeNull()
  })
})

describe('El grupo', () => {
  it('shows every visible character as a tile with class and level, the viewer own one highlighted', async () => {
    const entities = { pjs: [pj(1, { nombre: 'Aelra', clase: 'Clériga', nivel: 6 }), pj(2, { nombre: 'Kestrel', clase: 'Pícara', nivel: 7 }), pj(3, { nombre: 'Oculto', estado: 'borrador' })] }
    setup({ entities, characterIds: [2] })
    const group = await card('El grupo')
    const aelra = await group.findByRole('link', { name: /Aelra/ })
    expect(aelra).toHaveAttribute('href', '/c/demo/pjs/1')
    expect(within(aelra).getByText('Clériga · 6')).toBeInTheDocument()
    expect(aelra).not.toHaveAttribute('data-mine')
    expect(group.getByRole('link', { name: /Kestrel/ })).toHaveAttribute('data-mine', 'true')
    expect(group.queryByText('Oculto')).toBeNull()
    expect(group.getByRole('link', { name: 'Jugadores →' })).toHaveAttribute('href', '/c/demo/pjs')
  })

  it('tiles keep a fixed size (they never stretch to fill the row)', async () => {
    setup({ entities: { pjs: [pj(1, { nombre: 'Aelra' })] } })
    const group = await card('El grupo')
    const tile = await group.findByRole('link', { name: /Aelra/ })
    expect(tile.parentElement!.className).toContain('grid-cols-[repeat(auto-fill,140px)]')
  })

  it('leaves out the level when the system does not use it', async () => {
    const profile = { version: 1, character: { builtins: { nivel: { enabled: false, label: 'Nivel', min: 1, max: 20 } } } }
    setup({ entities: { pjs: [pj(1, { nombre: 'Aelra', clase: 'Clériga', nivel: 6 })] }, system_profile: profile })
    const aelra = await (await card('El grupo')).findByRole('link', { name: /Aelra/ })
    expect(within(aelra).getByText('Clériga')).toBeInTheDocument()
  })

  it('has an empty state', async () => {
    setup()
    expect(await (await card('El grupo')).findByText('Todavía no hay personajes.')).toBeInTheDocument()
  })
})

describe('Para preparar (DM)', () => {
  it('lists missing availability, sessions without summary and NPCs without image, with counts', async () => {
    setup({
      isDM: true,
      entities: { sesiones: [sesion(22, { resumen: '' }), sesion(23, { resumen: '' }), sesion(24)], pnjs: [entity(1, { nombre: 'Ilvane' }), entity(2, { nombre: 'Dorrel', imagen_url: 'https://x.test/d.png' })] },
      disponibilidad: [slot(1, '2026-03-12')],
      playerAvailability: [window12('user-1')],
    })
    const prep = await card('Para preparar')
    await waitFor(() => expect(prep.getByRole('link', { name: /Jugadores sin disponibilidad para la próxima sesión/ })).toHaveTextContent('Bruno, Carla'))
    expect(prep.getByRole('link', { name: /Sesiones sin resumen/ })).toHaveTextContent('22 · 23')
    expect(prep.getByRole('link', { name: /PNJs sin imagen/ })).toHaveTextContent('Ilvane')
    expect(prep.getByRole('link', { name: /Sesiones sin resumen/ })).toHaveAttribute('href', '/c/demo/sesiones')
  })

  it('says there is nothing pending', async () => {
    setup({ isDM: true, entities: { sesiones: [sesion(1)], pnjs: [entity(1, { imagen_url: 'https://x.test/d.png' })] } })
    expect(await (await card('Para preparar')).findByText('Nada pendiente.')).toBeInTheDocument()
  })

  it('is not shown to a player', async () => {
    setup()
    const main = await panel()
    await main.findByText('El grupo')
    expect(main.queryByText('Para preparar')).toBeNull()
  })
})

describe('Desde tu última visita (player)', () => {
  const entities = () => ({
    sesiones: [sesion(24, { titulo: 'La torre', updated_at: '2026-03-07T10:00:00Z', created_at: '2026-03-01T10:00:00Z' })],
    pnjs: [entity(1, { nombre: 'Ilvane', created_at: '2026-03-09T10:00:00Z', updated_at: '2026-03-09T10:00:05Z' }), entity(9, { nombre: 'Secreto', estado: 'borrador', updated_at: '2026-03-09T12:00:00Z' })],
    lugares: [entity(2, { nombre: 'Faro de Ceniza', created_at: '2026-03-01T10:00:00Z', updated_at: '2026-03-09T11:00:00Z' })],
  })

  it('lists the newest visible entities with kind, nuevo/actualizado, unread dot and a link', async () => {
    visitedAt('2026-03-08T00:00:00Z')
    setup({ entities: entities() })
    const news = await card('Desde tu última visita')
    const faro = await news.findByRole('link', { name: /Faro de Ceniza/ })
    expect(faro).toHaveAttribute('href', '/c/demo/lugares/2')
    expect(within(faro).getByText('Lugar actualizado')).toBeInTheDocument()
    expect(within(faro).getByRole('img', { name: 'No leído' })).toBeInTheDocument()
    const ilvane = news.getByRole('link', { name: /Ilvane/ })
    expect(within(ilvane).getByText('PNJ nuevo')).toBeInTheDocument()
    const torre = news.getByRole('link', { name: /La torre/ })
    expect(within(torre).getByRole('img', { name: 'Leído' })).toBeInTheDocument()
    expect(news.queryByText('Secreto')).toBeNull()
    const order = news.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(order).toEqual(['/c/demo/lugares/2', '/c/demo/pnjs/1', '/c/demo/sesiones/24'])
  })

  it('"Marcar leído" moves the last visit to now', async () => {
    visitedAt('2026-03-08T00:00:00Z')
    setup({ entities: entities() })
    const news = await card('Desde tu última visita')
    await news.findByRole('link', { name: /Faro de Ceniza/ })
    fireEvent.click(news.getByRole('button', { name: 'Marcar leído' }))
    await waitFor(() => expect(news.queryByRole('img', { name: 'No leído' })).toBeNull())
    expect(Date.parse(localStorage.getItem(LAST_VISIT_KEY) ?? '')).toBe(new Date(2026, 2, 10, 12, 0).getTime())
    expect(await screen.findByText('Sin novedades desde tu última visita')).toBeInTheDocument()
  })

  it('shows at most 6 entries', async () => {
    visitedAt('2026-03-01T00:00:00Z')
    setup({ entities: { lore: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => entity(i, { titulo: `Lore ${i}`, updated_at: `2026-03-09T1${i}:00:00Z` })) } })
    const news = await card('Desde tu última visita')
    await waitFor(() => expect(news.getAllByRole('link')).toHaveLength(6))
  })

  it('has an empty state', async () => {
    setup()
    expect(await (await card('Desde tu última visita')).findByText('Nada nuevo todavía.')).toBeInTheDocument()
  })
})

describe('Desde tu última visita (DM)', () => {
  const pjs = [
    pj(5, { nombre: 'Kestrel', jugador: 'Sofi', sections_updated: { equipo: '2026-03-09T10:00:00Z', hechizos: '2026-03-09T11:00:00Z' } }),
    pj(6, { nombre: 'Brannoc', jugador: 'Tomás', sections_updated: { narrativa: '2026-03-01T10:00:00Z' } }),
  ]

  it('shows the notes players wrote and the sheet changes, unread against the last visit', async () => {
    visitedAt('2026-03-08T00:00:00Z')
    const notes = [
      pnote({ user_id: 'u2', character_id: 5, entity_id: 1, text: 'Si la runa reacciona al fuego…', updated_at: '2026-03-09T09:00:00Z' }),
      pnote({ user_id: 'u3', character_id: null, entity_type: 'lugares', entity_id: 2, text: 'Vieja nota', updated_at: '2026-03-01T09:00:00Z' }),
      pnote({ user_id: 'u3', text: '   ' }),
    ]
    setup({ isDM: true, entities: { pjs, pnjs: [entity(1, { nombre: 'Ilvane', imagen_url: 'https://x.test/i.png' })], lugares: [entity(2, { nombre: 'Faro' })] }, playerNotes: notes })
    const news = await card('Desde tu última visita')

    const feed = within(await news.findByRole('region', { name: 'Notas de jugadores' }))
    const first = await feed.findByRole('link', { name: /Bruno · Kestrel sobre Ilvane/ })
    expect(first).toHaveAttribute('href', '/c/demo/pnjs/1')
    expect(within(first).getByText('“Si la runa reacciona al fuego…”')).toBeInTheDocument()
    expect(within(first).getByRole('img', { name: 'No leído' })).toBeInTheDocument()
    const old = feed.getByRole('link', { name: /Carla sobre Faro/ })
    expect(within(old).getByRole('img', { name: 'Leído' })).toBeInTheDocument()
    expect(feed.getAllByRole('link')).toHaveLength(2)

    const sheets = within(news.getByRole('region', { name: 'Cambios en fichas' }))
    const kestrel = sheets.getByRole('link', { name: /Kestrel · Sofi/ })
    expect(kestrel).toHaveAttribute('href', '/c/demo/pjs/5')
    expect(within(kestrel).getByText('Cambios en Hechizos y Equipo')).toBeInTheDocument()
    expect(within(kestrel).getByRole('img', { name: 'No leído' })).toBeInTheDocument()
    expect(within(sheets.getByRole('link', { name: /Brannoc · Tomás/ })).getByRole('img', { name: 'Leído' })).toBeInTheDocument()
  })

  it('has empty states', async () => {
    setup({ isDM: true })
    const news = await card('Desde tu última visita')
    expect(await news.findByText('Sin notas de jugadores.')).toBeInTheDocument()
    expect(news.getByText('Sin cambios en fichas.')).toBeInTheDocument()
  })

  it('"Marcar leído" clears the unread dots', async () => {
    visitedAt('2026-03-08T00:00:00Z')
    setup({ isDM: true, entities: { pjs }, playerNotes: [pnote({ user_id: 'u2', entity_id: 1 })] })
    const news = await card('Desde tu última visita')
    await news.findAllByRole('img', { name: 'No leído' })
    fireEvent.click(news.getByRole('button', { name: 'Marcar leído' }))
    await waitFor(() => expect(news.queryByRole('img', { name: 'No leído' })).toBeNull())
  })
})

describe('notes card', () => {
  it('player: own latest notes, newest 3, with the entity they are about', async () => {
    const notes = [1, 2, 3, 4].map((i) => pnote({ entity_id: i, text: `Nota ${i}`, updated_at: `2026-03-0${i}T10:00:00Z` }))
    setup({ playerNotes: [...notes, pnote({ user_id: 'u2', text: 'Ajena' })], entities: { pnjs: [1, 2, 3, 4].map((i) => entity(i, { nombre: `PNJ ${i}` })) } })
    const mineCard = await card('Mis últimas notas')
    await mineCard.findByText('Nota 4')
    expect(mineCard.getByText('sobre PNJ 4')).toBeInTheDocument()
    expect(mineCard.getByText('Nota 2')).toBeInTheDocument()
    expect(mineCard.queryByText('Nota 1')).toBeNull()
    expect(mineCard.queryByText('Ajena')).toBeNull()
    expect(mineCard.getByRole('link', { name: 'Notas →' })).toHaveAttribute('href', '/c/demo/notas')
  })

  it('player: empty state', async () => {
    setup()
    expect(await (await card('Mis últimas notas')).findByText('Todavía no escribiste notas.')).toBeInTheDocument()
  })

  it('DM: open hooks from the private notes, newest 3', async () => {
    const dmNotes: Record<string, { notas: string; secreto: string; ganchos: string }> = {
      'sesiones:24': { notas: '', secreto: '', ganchos: 'La runa reacciona al fuego' },
      'pnjs:1': { notas: 'solo notas', secreto: '', ganchos: '' },
      'lugares:2': { notas: '', secreto: '', ganchos: 'Emboscada en la costa' },
    }
    setup({ isDM: true, dmNotes, entities: { sesiones: [sesion(24)], lugares: [entity(2, { nombre: 'Orden del Ascua' })] } })
    const hooks = await card('Ganchos abiertos')
    expect(await hooks.findByText('La runa reacciona al fuego')).toBeInTheDocument()
    expect(hooks.getByText('Sesión titulada 24')).toBeInTheDocument()
    expect(hooks.getByText('Emboscada en la costa')).toBeInTheDocument()
    expect(hooks.getByText('Orden del Ascua')).toBeInTheDocument()
    expect(hooks.queryByText('solo notas')).toBeNull()
    expect(hooks.getByRole('link', { name: 'Notas →' })).toHaveAttribute('href', '/c/demo/notas')
  })

  it('DM: empty state', async () => {
    setup({ isDM: true })
    expect(await (await card('Ganchos abiertos')).findByText('No hay ganchos abiertos.')).toBeInTheDocument()
  })
})

describe('loading and errors', () => {
  it('a failing source shows a short message, never invented zeros', async () => {
    setup({ failNotes: true })
    const notes = await card('Mis últimas notas')
    expect(await notes.findByText('No se pudo cargar.')).toBeInTheDocument()
    expect(notes.queryByText('Todavía no escribiste notas.')).toBeNull()
  })

  it('the user-facing sections are labelled', async () => {
    setup({ isDM: true })
    const main = await panel()
    for (const name of ['Para preparar', 'El grupo', 'Desde tu última visita', 'Ganchos abiertos']) {
      expect((await main.findByRole('heading', { name })).closest('section')).toHaveAttribute('aria-labelledby')
    }
  })
})
