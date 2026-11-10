import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnreadPortContext, type UnreadPort } from '../../ports'
import type { Sheet } from '../../campaign/system/sheet/sheetModel'
import PJDetail from './PJDetail'

// odd/tasks/ficha-indice-lateral.md (S1-S4, S6, S7, S11, S12)

vi.mock('../../components/PlayerNotes', () => ({ default: () => <div>notas del jugador</div> }))
vi.mock('../../components/WikiText', () => ({ default: ({ text }: { text: string }) => <span>{text}</span> }))

const section = (key: string, label: string, field: string) => ({
  key,
  label,
  items: [{ kind: 'field', key: field, label: field, type: 'number', editableBy: 'dm' }],
  blocks: [{ key: `b_${key}`, mode: 'tile', items: [field] }],
})
const SHEET = {
  categories: [
    { key: 'mecanicas', label: 'Mecánicas', sections: [section('uno', 'Uno', 'fuerza'), section('dos', 'Dos', 'destreza')] },
    { key: 'historia', label: 'Historia', sections: [section('tres', 'Tres', 'edad')] },
  ],
  roles: { hp: 'vida', hp_current: 'vida_act', ac: 'ca' },
} as unknown as Sheet
const ROLE_SECTION = { key: 'combate', label: 'Combate', items: ['vida', 'vida_act', 'ca'].map((k) => ({ kind: 'field', key: k, label: k, type: 'number', editableBy: 'dm' })), blocks: [] }
const SHEET_ROLES = { ...SHEET, categories: [...SHEET.categories, { key: 'oculta', label: 'Oculta', sections: [ROLE_SECTION] }] } as unknown as Sheet
const PJ = { id: 7, nombre: 'Ana', jugador: 'Pepe', fuerza: 12, destreza: 14, edad: 30, vida: 58, vida_act: 52, ca: 18 }

const unreadPort = (unread: string[] = []): UnreadPort => ({ isUnread: (_t, _i, _u, s) => unread.includes(String(s)), markRead: vi.fn() })
const view = (props: Record<string, unknown> = {}, unread: string[] = []) =>
  render(
    <UnreadPortContext.Provider value={unreadPort(unread)}>
      <PJDetail pj={{ ...PJ, sections_updated: Object.fromEntries(unread.map((k) => [k, '2026-01-01'])) }} back={<span>volver</span>} sheet={SHEET_ROLES} {...props} />
    </UnreadPortContext.Provider>,
  )
const index = () => screen.getByRole('navigation', { name: 'Índice de la ficha' })

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  window.scrollTo = vi.fn() as typeof window.scrollTo
  window.history.replaceState(null, '', '/c/mesa/pjs/7')
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('PJDetail: side index grouped by category (S1)', () => {
  it('lists each category with its sections as links, then the fixed notes', () => {
    view()
    const nav = index()
    expect(within(nav).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Mecánicas', 'Historia', 'Notas'])
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Uno', 'Dos', 'Tres', 'Notas del jugador'])
    expect(within(nav).getByRole('link', { name: 'Dos' })).toHaveAttribute('href', '#dos')
  })

  it('adds "Notas del DM" for the DM when there are DM notes', () => {
    view({ isDM: true, notas: 'secreto' })
    expect(within(index()).getByRole('link', { name: 'Notas del DM' })).toHaveAttribute('href', '#dm')
  })

  it('gives the legacy detail (no sheet) the same index, its sections in one group', () => {
    view({ sheet: null })
    expect(within(index()).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Ficha', 'Notas'])
  })
})

describe('PJDetail: deep link by section key (S2-S4)', () => {
  it('a link scrolls to the section, marks it current and replaces the hash without a new history entry', () => {
    view()
    const before = window.history.length
    fireEvent.click(within(index()).getByRole('link', { name: 'Dos' }))
    expect(window.location.hash).toBe('#dos')
    expect(window.history.length).toBe(before)
    expect(window.scrollTo).toHaveBeenCalled()
    expect(within(index()).getByRole('link', { name: 'Dos' })).toHaveAttribute('aria-current', 'location')
    expect(within(index()).getByRole('link', { name: 'Uno' })).not.toHaveAttribute('aria-current')
  })

  it('a link expands a collapsed section first', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Tres', expanded: true }))
    fireEvent.click(within(index()).getByRole('link', { name: 'Tres' }))
    expect(screen.getByRole('button', { name: 'Tres' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('arriving with #key opens and scrolls to that section, even if it was collapsed', () => {
    localStorage.setItem('drakterima:sheet-collapsed:pjs:7', JSON.stringify(['dos']))
    window.history.replaceState(null, '', '/c/mesa/pjs/7#dos')
    view()
    expect(screen.getByRole('button', { name: 'Dos' })).toHaveAttribute('aria-expanded', 'true')
    expect(window.scrollTo).toHaveBeenCalled()
    expect(within(index()).getByRole('link', { name: 'Dos' })).toHaveAttribute('aria-current', 'location')
  })

  it('arriving with a key that no longer exists stays at the top with a notice', () => {
    window.history.replaceState(null, '', '/c/mesa/pjs/7#hechizos')
    view()
    expect(screen.getByRole('status').textContent).toBe('Esa sección («hechizos») ya no está en la ficha. Te dejamos al principio.')
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('a malformed hash does not break the detail: it is a key that does not exist', () => {
    window.history.replaceState(null, '', '/c/mesa/pjs/7#50%')
    expect(() => view()).not.toThrow()
    expect(index()).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Esa sección («50%») ya no está en la ficha. Te dejamos al principio.')
  })

  it('replacing the hash keeps the router history state', () => {
    const state = { usr: null, key: 'k', idx: 4 }
    window.history.replaceState(state, '', '/c/mesa/pjs/7')
    view()
    fireEvent.click(within(index()).getByRole('link', { name: 'Tres' }))
    expect(window.history.state).toEqual(state)
  })

  it('arriving on an unread section does not mark it read at once: the 1.5 s visible rule applies (S4)', () => {
    const markRead = vi.fn()
    window.history.replaceState(null, '', '/c/mesa/pjs/7#dos')
    render(
      <UnreadPortContext.Provider value={{ isUnread: (_t, _i, _u, s) => s === 'dos', markRead }}>
        <PJDetail pj={{ ...PJ, sections_updated: { dos: 'x' } }} back={<span />} sheet={SHEET_ROLES} />
      </UnreadPortContext.Provider>,
    )
    expect(markRead).not.toHaveBeenCalledWith('pjs', 7, expect.anything(), 'dos')
  })

  it('leaving the detail removes the section hash it wrote (the legacy app keeps the same URL)', () => {
    const { unmount } = view()
    fireEvent.click(within(index()).getByRole('link', { name: 'Dos' }))
    expect(window.location.hash).toBe('#dos')
    unmount()
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/c/mesa/pjs/7')
  })

  it('keeps the collapsed sections of this character between visits (S6)', () => {
    const first = view()
    fireEvent.click(screen.getByRole('button', { name: 'Uno', expanded: true }))
    first.unmount()
    view()
    expect(screen.getByRole('button', { name: 'Uno' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('PJDetail: index folds categories above 15 entries (S11)', () => {
  const many = {
    categories: [
      { key: 'a', label: 'Alfa', sections: Array.from({ length: 8 }, (_, i) => section(`a${i}`, `A${i}`, `fa${i}`)) },
      { key: 'b', label: 'Beta', sections: Array.from({ length: 8 }, (_, i) => section(`b${i}`, `B${i}`, `fb${i}`)) },
    ],
    roles: {},
  } as unknown as Sheet
  const pj = Object.fromEntries([...Array.from({ length: 8 }, (_, i) => [`fa${i}`, 1]), ...Array.from({ length: 8 }, (_, i) => [`fb${i}`, 1])])

  it('turns category headings into toggles; a folded one hides its links and keeps its unread count', () => {
    view({ sheet: many, pj: { ...PJ, ...pj, sections_updated: { b1: 'x', b2: 'x' } } }, ['b1', 'b2'])
    const beta = within(index()).getByRole('button', { name: /Beta/ })
    expect(beta).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(beta)
    expect(beta).toHaveAttribute('aria-expanded', 'false')
    expect(within(index()).queryByRole('link', { name: 'B0' })).toBeNull()
    expect(beta.textContent).toContain('2')
    expect(within(beta).getByText('2 con novedades')).toBeTruthy()
  })

  it('does not fold small indexes', () => {
    view()
    expect(within(index()).queryByRole('button')).toBeNull()
  })
})

describe('PJDetail: section picker for narrow screens (S7)', () => {
  it('names the current section and its position, and opens the index list', () => {
    view()
    const picker = screen.getByRole('button', { name: /^Sección: Uno/ })
    expect(picker.textContent).toContain('1 de 4')
    expect(picker).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(picker)
    expect(picker).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('navigation', { name: 'Secciones' })
    fireEvent.click(within(list).getByRole('link', { name: 'Tres' }))
    expect(window.location.hash).toBe('#tres')
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Sección: Tres/ }).textContent).toContain('3 de 4')
  })
})

describe('PJDetail: key facts in the header (S12)', () => {
  it('shows the bound roles, HP as current over max with a bar', () => {
    view()
    const facts = screen.getByRole('list', { name: 'Datos clave' })
    expect(within(facts).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['HP52/58', 'CA18'])
    expect(within(facts).getByRole('img', { name: 'HP 52 de 58' })).toBeTruthy()
  })

  it('adds the pinned fields of the card after the roles; DM-only pins only for the DM (S12)', () => {
    const withCard = { ...SHEET_ROLES, card: { pinned: [{ key: 'fuerza' }, { key: 'edad', dmOnly: true }] } } as unknown as Sheet
    const first = view({ sheet: withCard, isDM: true })
    const names = () => within(screen.getByRole('list', { name: 'Datos clave' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(names()).toEqual(['HP52/58', 'CA18', 'fuerza12', 'edad30'])
    first.unmount()
    view({ sheet: withCard })
    expect(names()).toEqual(['HP52/58', 'CA18', 'fuerza12'])
  })

  it('leaves no gap for unbound roles', () => {
    view({ sheet: SHEET })
    expect(screen.queryByRole('list', { name: 'Datos clave' })).toBeNull()
  })
})
