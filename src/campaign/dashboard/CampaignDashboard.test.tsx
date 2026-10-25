import { configure, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Disponibilidad } from '../../data'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

// the first test of a file pays for the lazy page chunks
configure({ asyncUtilTimeout: 5000 })

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 10, 12, 0) }))
afterEach(() => vi.useRealTimers())

const at = (id: number) => ({ created_at: `2026-02-${String(id).padStart(2, '0')}T10:00:00Z` })
const sesion = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { tipo: 'sesion', numero: id, titulo: `Sesión titulada ${id}`, resumen: `Resumen ${id}`, ...at(id), ...over })
const slot = (id: number, fecha: string, over: Partial<Disponibilidad> = {}): Disponibilidad => ({
  id, campaign_id: 'c1', tipo: 'sesion', fecha_inicio: fecha, fecha_fin: null, hora_inicio: null, hora_fin: null, created_by: null, created_at: '', updated_at: '', ...over,
})

interface Seed {
  entities?: Record<string, ReturnType<typeof entity>[]>
  disponibilidad?: Disponibilidad[]
  branding?: Record<string, unknown>
  isDM?: boolean
}
function setup({ entities = {}, disponibilidad = [], branding = {}, isDM = true }: Seed = {}) {
  const campaign = { name: 'Drakterima', branding }
  const { layer } = createFakeLayer({ entities, disponibilidad, campaign: campaign as never })
  return renderSection('/c/demo', { layer, isDM, campaign: campaign as never })
}
const panel = async () => {
  await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
  return within(screen.getByRole('main'))
}
const titles = (section: HTMLElement) => within(section).getAllByRole('link').map((l) => l.querySelector('[data-testid="tile-title"]')?.textContent)

describe('dashboard header', () => {
  it('follows the legacy structure: eyebrow, title and the campaign name', async () => {
    setup()
    const main = await panel()
    expect(main.getByText('Vista general')).toBeInTheDocument()
    expect(main.getByText('Drakterima')).toBeInTheDocument()
  })

  it('shows the campaign logo at the left', async () => {
    setup({ branding: { logo_url: 'https://x.test/logo.png' } })
    const main = await panel()
    expect(main.getByTestId('panel-icon').querySelector('img')).toHaveAttribute('src', 'https://x.test/logo.png')
  })

  it('falls back to the brand mark without a logo', async () => {
    setup()
    const main = await panel()
    expect(main.getByTestId('panel-icon').querySelector('svg')).not.toBeNull()
    expect(main.getByTestId('panel-icon').querySelector('g')).toHaveAttribute('stroke', 'rgb(var(--accent-rgb))')
    expect(main.getByTestId('panel-icon').querySelector('img')).toBeNull()
  })

  it('draws the banner image behind the header for a valid https URL', async () => {
    setup({ branding: { banner_url: 'https://x.test/banner.jpg' } })
    const main = await panel()
    expect(main.getByTestId('panel-banner')).toHaveAttribute('src', 'https://x.test/banner.jpg')
  })

  it.each([['http://x.test/b.jpg'], ['javascript:alert(1)'], [''], [42]])('draws no banner for %j', async (banner_url) => {
    setup({ branding: { banner_url } })
    const main = await panel()
    expect(main.queryByTestId('panel-banner')).toBeNull()
  })

  it('offers the live session screen to the DM only', async () => {
    setup({ isDM: true })
    expect((await panel()).getByRole('link', { name: /Pantalla de sesión/i })).toHaveAttribute('href', '/c/demo/sesion-en-vivo')
  })

  it('hides the live session screen from a player', async () => {
    setup({ isDM: false })
    expect((await panel()).queryByRole('link', { name: /Pantalla de sesión/i })).toBeNull()
  })
})

describe('dashboard stats', () => {
  it('counts what the viewer can see (no avances in sessions, no drafts for a player) in compact links', async () => {
    const entities = {
      sesiones: [sesion(1), sesion(2, { tipo: 'avance' }), sesion(3, { estado: 'borrador' })],
      pjs: [entity(1), entity(2)],
      pnjs: [entity(1)],
      lugares: [entity(1), entity(2, { estado: 'borrador' })],
      facciones: [],
      lore: [entity(1)],
    }
    setup({ entities, isDM: false })
    const main = await panel()
    const stats = within(await main.findByRole('list', { name: 'Estadísticas' }))
    const stat = (label: string) => stats.getByRole('link', { name: new RegExp(label, 'i') })
    await vi.waitFor(() => expect(stat('Sesiones').textContent).toMatch(/1\s*Sesiones/i))
    expect(stat('Jugadores').textContent).toMatch(/2\s*Jugadores/i)
    expect(stat('PNJs').textContent).toMatch(/1\s*PNJs/i)
    expect(stat('Lugares').textContent).toMatch(/1\s*Lugares/i)
    expect(stat('Facciones').textContent).toMatch(/0\s*Facciones/i)
    expect(stat('Lore').textContent).toMatch(/1\s*Lore/i)
    expect(stat('Jugadores')).toHaveAttribute('href', '/c/demo/pjs')
  })
})

describe('dashboard Sesiones', () => {
  it('has a Sesiones section with the last and the next session tiles', async () => {
    const entities = { sesiones: [sesion(1), sesion(2, { titulo: 'Un día ajetreado', resumen: '**Todo** salió [[{1A}bien]]' })] }
    setup({ entities, disponibilidad: [slot(1, '2026-03-01'), slot(2, '2026-03-20', { hora_inicio: '19:30' }), slot(3, '2026-03-12')] })
    const main = await panel()
    expect(main.getByRole('heading', { name: 'Sesiones' })).toBeInTheDocument()

    const last = await main.findByRole('link', { name: /Última sesión/i })
    expect(last).toHaveAttribute('href', '/c/demo/sesiones/2')
    expect(within(last).getByText('Un día ajetreado')).toBeInTheDocument()
    expect(within(last).getByText('Todo salió bien')).toBeInTheDocument()

    const next = await main.findByRole('link', { name: /Próxima sesión/i })
    expect(next).toHaveAttribute('href', '/c/demo/calendario')
    expect(within(next).getByText(/Sesión 3/)).toBeInTheDocument()
    expect(within(next).getByText(/12.+mar.+2026/)).toBeInTheDocument()
  })

  it('uses today as the lower bound, shows the time and parses the date as local', async () => {
    setup({ entities: { sesiones: [sesion(1)] }, disponibilidad: [slot(1, '2026-03-10', { hora_inicio: '19:30' })] })
    const next = await (await panel()).findByRole('link', { name: /Próxima sesión/i })
    expect(within(next).getByText(/10.+mar.+2026/)).toBeInTheDocument()
    expect(within(next).getByText(/19:30/)).toBeInTheDocument()
  })

  it('shows an empty state in each tile', async () => {
    setup()
    const main = await panel()
    expect(await main.findByText('Todavía no hay sesiones.')).toBeInTheDocument()
    expect(main.getByText('No hay una próxima sesión agendada.')).toBeInTheDocument()
  })

  it('says "Sin resumen." for a session without a summary', async () => {
    setup({ entities: { sesiones: [sesion(1, { resumen: '' })] } })
    expect(await (await panel()).findByText('Sin resumen.')).toBeInTheDocument()
  })

  it('keeps an avance out of the last-session tile', async () => {
    setup({ entities: { sesiones: [sesion(1, { titulo: 'La real' }), sesion(2, { tipo: 'avance', titulo: 'Un avance' })] } })
    const main = await panel()
    expect(await main.findByText('La real')).toBeInTheDocument()
    expect(main.queryByText('Un avance')).toBeNull()
  })
})

describe('dashboard PNJs recientes', () => {
  it('lists at most 5, newest first, linking to each PNJ', async () => {
    const pnjs = [1, 2, 3, 4, 5, 6].map((id) => entity(id, { nombre: `PNJ ${id}`, rol: `Rol ${id}`, relacion: id === 6 ? 'aliado' : 'neutral', ...at(id) }))
    setup({ entities: { pnjs } })
    const main = await panel()
    const section = (await main.findByRole('heading', { name: 'PNJs recientes' })).closest('section')!
    await vi.waitFor(() => expect(within(section).getAllByRole('link')).toHaveLength(5))
    expect(titles(section)).toEqual(['PNJ 6', 'PNJ 5', 'PNJ 4', 'PNJ 3', 'PNJ 2'])
    const first = within(section).getAllByRole('link')[0]
    expect(first).toHaveAttribute('href', '/c/demo/pnjs/6')
    expect(within(first).getByText('Rol 6')).toBeInTheDocument()
    expect(within(first).getByText('Aliado')).toBeInTheDocument()
  })

  it('hides a draft PNJ from a player', async () => {
    setup({ entities: { pnjs: [entity(1, { nombre: 'Público' }), entity(2, { nombre: 'Borrador', estado: 'borrador' })] }, isDM: false })
    const main = await panel()
    expect(await main.findByText('Público')).toBeInTheDocument()
    expect(main.queryByText('Borrador')).toBeNull()
  })
})

describe('dashboard Últimos artículos', () => {
  it('lists at most 5 across the article collections, newest first, with type label, date and preview', async () => {
    const entities = {
      lugares: [entity(1, { nombre: 'Kardevir', descripcion: 'Junto al **lago**', ...at(28) }), entity(2, { nombre: 'Genesia', ...at(27) })],
      facciones: [entity(3, { nombre: 'Orden de Argan', ...at(26) })],
      lore: [entity(4, { titulo: 'La caída', ...at(25) })],
      items: [entity(5, { nombre: 'Espada', ...at(24) }), entity(6, { nombre: 'Escudo', ...at(23) })],
    }
    setup({ entities })
    const main = await panel()
    const section = (await main.findByRole('heading', { name: 'Últimos artículos' })).closest('section')!
    await vi.waitFor(() => expect(within(section).getAllByRole('link')).toHaveLength(5))
    expect(titles(section)).toEqual(['Kardevir', 'Genesia', 'Orden de Argan', 'La caída', 'Espada'])
    const links = within(section).getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/c/demo/lugares/1')
    expect(links[3]).toHaveAttribute('href', '/c/demo/lore/4')
    expect(within(links[0]).getByText('Lugar')).toBeInTheDocument()
    expect(within(links[2]).getByText('Facción')).toBeInTheDocument()
    expect(within(links[4]).getByText('Ítem')).toBeInTheDocument()
    expect(within(links[0]).getByText(/28.+feb.+2026/)).toBeInTheDocument()
    expect(within(links[0]).getByText('Junto al lago')).toBeInTheDocument()
  })

  it('shows an empty state without articles', async () => {
    setup()
    expect(await (await panel()).findByText('Sin artículos recientes.')).toBeInTheDocument()
  })
})
