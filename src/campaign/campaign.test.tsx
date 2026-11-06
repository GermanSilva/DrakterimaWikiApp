import { fireEvent, screen, waitFor, within, act } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext'
import { DataContext } from '../app/DataContext'
import { makeAuth, makeCampaign, makeData, renderApp } from '../app/testing/renderApp'
import { CampaignLayout } from './CampaignLayout'
import { useCampaign } from './CampaignContext'
import { accentStyle, parseAccentColor, parseLogoUrl } from './branding'
import { SECTIONS } from './sections'

const dm = makeCampaign({ role: 'dm' })
const player = makeCampaign({ role: 'player' })
const dataFor = (...campaigns: ReturnType<typeof makeCampaign>[]) =>
  makeData({ listMyCampaigns: vi.fn(async () => campaigns) })

describe('CampaignLayout loading', () => {
  it('shows a friendly screen when the slug does not exist', async () => {
    renderApp('/c/nope', { data: dataFor(dm) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Campaña no disponible' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mis campañas' })).toHaveAttribute('href', '/')
  })

  it('shows the same screen when I am in no campaign at all (not a member)', async () => {
    renderApp('/c/demo', { data: dataFor() })
    expect(await screen.findByRole('heading', { name: 'Campaña no disponible' })).toBeInTheDocument()
  })

  it('reports a load failure with retry', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue([dm])
    renderApp('/c/demo', { data: makeData({ listMyCampaigns: list }) })
    expect(await screen.findByRole('heading', { name: 'No pudimos cargar la campaña' })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })).toBeInTheDocument()
  })

  it('never puts the slug into a backend call: it only matches against my own list', async () => {
    const data = dataFor(dm)
    renderApp(`/c/${encodeURIComponent("demo' or '1'='1")}`, { data })
    await screen.findByRole('heading', { name: 'Campaña no disponible' })
    expect(data.listMyCampaigns).toHaveBeenCalledWith('user-1')
    expect(data.listMyCharacterIds).not.toHaveBeenCalled()
  })
})

describe('topbar pre-title', () => {
  const topbar = () => within(document.querySelector('header')!)

  it('shows the branding pre-title in the topbar, above the name', async () => {
    renderApp('/c/demo', { data: dataFor(makeCampaign({ branding: { tagline: '  Que empiece la aventura ' } })) })
    await screen.findByRole('heading', { level: 1 })
    expect(topbar().getByText('Que empiece la aventura')).toBeInTheDocument()
  })

  it('cuts a legacy pre-title longer than 35 characters', async () => {
    renderApp('/c/demo', { data: dataFor(makeCampaign({ branding: { tagline: 'y'.repeat(50) } })) })
    await screen.findByRole('heading', { level: 1 })
    expect(topbar().getByText('y'.repeat(34) + '…')).toBeInTheDocument()
  })

  it.each([
    ['missing', {}],
    ['empty', { tagline: '' }],
    ['whitespace-only', { tagline: '   	 ' }],
    ['not text', { tagline: { x: 1 } }],
  ])('renders no pre-title for a %s value', async (_name, branding) => {
    renderApp('/c/demo', { data: dataFor(makeCampaign({ branding })) })
    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('header [data-testid="topbar-pretitle"]')).toBeNull()
  })
})

describe('sidebar toggle', () => {
  it('has a floating button that hides and shows the sidebar', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    const nav = await screen.findByRole('navigation', { name: 'Secciones de la campaña' })
    const toggle = screen.getByRole('button', { name: 'Ocultar menú lateral' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', 'campaign-nav')
    expect(nav).toHaveAttribute('data-collapsed', 'false')

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Mostrar menú lateral' })).toHaveAttribute('aria-expanded', 'false')
    expect(nav).toHaveAttribute('data-collapsed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar menú lateral' }))
    expect(nav).toHaveAttribute('data-collapsed', 'false')
  })
})

describe('role-based navigation', () => {
  const groupLabels = (nav: HTMLElement) => Array.from(nav.querySelectorAll('[data-testid="sidebar-scroll"] > div > div:first-child')).map((el) => el.textContent)

  it('puts Administración right below Panel for a DM', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    const nav = await screen.findByRole('navigation', { name: 'Secciones de la campaña' })
    expect(groupLabels(nav).slice(0, 2)).toEqual(['Administración', 'Principal'])
    const links = within(nav).getAllByRole('link').map((l) => l.textContent)
    expect(links.slice(0, 3)).toEqual(['Panel', 'Sesión en vivo', 'Ajustes'])
  })

  it('starts with Principal for a player (no Administración)', async () => {
    renderApp('/c/demo', { data: dataFor(player) })
    const nav = await screen.findByRole('navigation', { name: 'Secciones de la campaña' })
    expect(groupLabels(nav)[0]).toBe('Principal')
  })

  it('shows Ajustes to a DM', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    const nav = await screen.findByRole('navigation', { name: 'Secciones de la campaña' })
    expect(within(nav).getByRole('link', { name: /Ajustes/ })).toHaveAttribute('href', '/c/demo/ajustes')
  })

  it('hides Ajustes from a player, in the nav and on the dashboard', async () => {
    renderApp('/c/demo', { data: dataFor(player) })
    await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
    expect(screen.queryByRole('link', { name: /Ajustes/ })).not.toBeInTheDocument()
  })

  it('gives a player the in-layout 404 for /ajustes, same as an unknown section', async () => {
    renderApp('/c/demo/ajustes', { data: dataFor(player) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
  })

  it('lets a DM open /ajustes', async () => {
    renderApp('/c/demo/ajustes', { data: dataFor(dm) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument()
  })

  it('links every registered section and marks the active one with aria-current', async () => {
    renderApp('/c/demo/pnjs', { data: dataFor(dm) })
    const nav = await screen.findByRole('navigation', { name: 'Secciones de la campaña' })
    // the action catalogue only exists in a campaign whose sheet has a Habilidad table (AccionesPage.test.tsx)
    for (const section of SECTIONS.filter((s) => !s.needsActionTables)) {
      expect(within(nav).getByRole('link', { name: new RegExp(section.label.replace(/[()]/g, '\\$&')) })).toHaveAttribute(
        'href',
        `/c/demo/${section.path}`,
      )
    }
    expect(within(nav).getByRole('link', { name: /PNJs/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /Sesiones/ })).not.toHaveAttribute('aria-current')
  })
})

describe('sections', () => {
  it('has no SRD / Referencia section: no menu entry, no group, and its old address is the in-layout 404', async () => {
    renderApp('/c/demo/srd', { data: dataFor(dm) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Secciones de la campaña' })
    expect(within(nav).queryByRole('link', { name: /SRD/ })).toBeNull()
    expect(within(nav).queryByText('Referencia')).toBeNull()
    expect(SECTIONS.map((section) => section.key)).not.toContain('srd')
  })

  it('shows a 404 inside the layout for an unknown section (shell stays)', async () => {
    renderApp('/c/demo/nada', { data: dataFor(dm) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Secciones de la campaña' })).toBeInTheDocument()
  })

  it('moves focus into the main landmark after navigating between sections', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
    await act(async () => {
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones de la campaña' })).getByRole('link', { name: /Calendario/ }))
    })
    await screen.findByRole('heading', { level: 1, name: 'Calendario' })
    await waitFor(() => expect(document.getElementById('main-content')?.contains(document.activeElement)).toBe(true))
  })

  it('offers a skip link to the main content', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#main-content')
    expect(document.getElementById('main-content')).toBeInTheDocument()
  })
})

describe('branding', () => {
  const shell = () => document.querySelector<HTMLElement>('main')!.parentElement!

  it('applies a valid hex accent as CSS variables on the campaign shell only', async () => {
    const branded = makeCampaign({ branding: { accent_color: '#1E90FF', logo_url: 'https://cdn.test/l.png' } })
    renderApp('/c/demo', { data: dataFor(branded) })
    await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
    expect(shell().style.getPropertyValue('--accent')).toBe('#1e90ff')
    expect(shell().style.getPropertyValue('--accent-rgb')).toBe('30 144 255')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('')
    expect(document.querySelector('header img')).toHaveAttribute('src', 'https://cdn.test/l.png')
  })

  it.each(['red', 'url(javascript:alert(1))', '#fff', '#12345', '#gggggg', 'var(--x)', '#ff0000; background:url(x)', 42, null])(
    'ignores the invalid accent %j',
    async (accent) => {
      const branded = makeCampaign({ branding: { accent_color: accent } })
      renderApp('/c/demo', { data: dataFor(branded) })
      await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
      expect(shell().getAttribute('style') ?? '').not.toContain('--accent')
    },
  )

  it.each(['http://cdn.test/l.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '/relative.png', 'not a url'])(
    'falls back to the RPG Quester mark for the logo %j',
    async (logo) => {
      const branded = makeCampaign({ branding: { logo_url: logo } })
      renderApp('/c/demo', { data: dataFor(branded) })
      await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
      expect(document.querySelector('header img')).toBeNull()
      expect(document.querySelector('header a svg[viewBox="0 0 64 64"]')).not.toBeNull()
      expect(document.querySelector('header svg.text-accent')).toBeNull()
    },
  )

  it('parsers are strict', () => {
    expect(parseAccentColor('#AbCdEf')).toBe('#abcdef')
    expect(parseAccentColor('#abc')).toBeNull()
    expect(parseLogoUrl('https://a.test/x.png')).toBe('https://a.test/x.png')
    expect(parseLogoUrl('ftp://a.test/x')).toBeNull()
    expect(accentStyle({ accent_color: 'nope' })).toBeUndefined()
  })
})

describe('campaign switcher and header', () => {
  const other = makeCampaign({ id: 'c2', slug: 'otra', name: 'Otra', role: 'player' })
  const nav = async () => within(await screen.findByRole('navigation', { name: 'Secciones de la campaña' }))

  it('lives in the sidebar footer, not in the header', async () => {
    renderApp('/c/demo', { data: dataFor(dm, other) })
    const sidebar = await nav()
    expect(sidebar.getByRole('button', { name: 'Cambiar de campaña' })).toHaveTextContent('Demo')
    expect(within(document.querySelector('header')!).queryByRole('button', { name: 'Cambiar de campaña' })).toBeNull()
    expect(within(document.querySelector('header')!).queryByRole('combobox')).toBeNull()
  })

  it('lists my campaigns upward, marks the current one and navigates to the chosen one', async () => {
    const { router } = renderApp('/c/demo', { data: dataFor(dm, other) })
    const trigger = (await nav()).getByRole('button', { name: 'Cambiar de campaña' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = within(screen.getByRole('menu', { name: 'Campañas' }))
    expect(menu.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Demo', 'Otra', 'Todas mis campañas'])
    expect(menu.getByRole('menuitem', { name: 'Demo' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('menu', { name: 'Campañas' }).className).toContain('bottom-full')
    expect(menu.getByRole('menuitem', { name: 'Todas mis campañas' })).toHaveAttribute('href', '/')

    await act(async () => {
      fireEvent.click(menu.getByRole('menuitem', { name: 'Otra' }))
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/otra'))
    await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
    expect(within(screen.getByRole('main')).getByText('Otra')).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: 'Campañas' })).toBeNull()
  })

  it('closes with Escape and gives the focus back to the trigger', async () => {
    renderApp('/c/demo', { data: dataFor(dm, other) })
    const trigger = (await nav()).getByRole('button', { name: 'Cambiar de campaña' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Campañas' }), { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Campañas' })).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('closes with Escape while the focus is still on the trigger', async () => {
    renderApp('/c/demo', { data: dataFor(dm, other) })
    const trigger = (await nav()).getByRole('button', { name: 'Cambiar de campaña' })
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Campañas' })).toBeNull()
  })

  it('moves through the items with the arrow keys from the trigger', async () => {
    renderApp('/c/demo', { data: dataFor(dm, other) })
    const trigger = (await nav()).getByRole('button', { name: 'Cambiar de campaña' })
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Demo' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Demo' }), { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Todas mis campañas' })).toHaveFocus()
  })

  it('closes when pressing outside of it', async () => {
    renderApp('/c/demo', { data: dataFor(dm, other) })
    fireEvent.click((await nav()).getByRole('button', { name: 'Cambiar de campaña' }))
    fireEvent.mouseDown(screen.getByRole('main'))
    expect(screen.queryByRole('menu', { name: 'Campañas' })).toBeNull()
  })

  it('stays fixed: the section links scroll in their own area, the switcher does not', async () => {
    renderApp('/c/demo', { data: dataFor(dm, other) })
    const sidebar = await nav()
    const scroller = screen.getByTestId('sidebar-scroll')
    expect(scroller.className).toContain('overflow-y-auto')
    expect(within(scroller).getByRole('link', { name: /Notas/ })).toBeInTheDocument()
    expect(within(scroller).queryByRole('button', { name: 'Cambiar de campaña' })).toBeNull()
    expect(sidebar.getByRole('button', { name: 'Cambiar de campaña' })).toBeInTheDocument()
  })

  it('draws the default topbar icon in the accent colour, and keeps a custom logo as an image', async () => {
    renderApp('/c/demo', { data: dataFor(makeCampaign({ branding: { accent_color: '#00aa55' } })) })
    await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
    const link = within(document.querySelector('header')!).getByRole('link', { name: 'Demo: panel' })
    expect(link.querySelector('svg g')).toHaveAttribute('stroke', 'rgb(var(--accent-rgb))')
    expect(link.closest('div[style]')?.getAttribute('style') ?? document.querySelector('[style*="--accent-rgb"]')?.getAttribute('style')).toContain('--accent-rgb: 0 170 85')
  })

  it('shows the campaign name in the header and a working mobile menu toggle', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
    expect(within(document.querySelector('header')!).getByRole('link', { name: 'Demo: panel' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Menú' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('signs out from the header', async () => {
    const out = makeAuth({ status: 'signed_out', user: null, profile: null })
    let flip: (next: typeof out) => unknown = () => undefined
    const auth = makeAuth({ signOut: vi.fn(async () => void flip(out)) })
    const { router, setAuth } = renderApp('/c/demo', { data: dataFor(dm), auth })
    flip = setAuth
    await screen.findByRole('heading', { level: 1, name: 'Panel de campaña' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ana|Usuario|@/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})

describe('CampaignContext', () => {
  function Probe() {
    const { campaign, role, isDM, myCharacterIds } = useCampaign()
    return <p data-testid="probe">{JSON.stringify({ slug: campaign.slug, role, isDM, myCharacterIds })}</p>
  }

  function renderProbe(data = makeData()) {
    const router = createMemoryRouter(
      [{ path: '/c/:slug', element: <CampaignLayout />, children: [{ index: true, element: <Probe /> }] }],
      { initialEntries: ['/c/demo'] },
    )
    render(
      <AuthContext.Provider value={makeAuth()}>
        <DataContext.Provider value={data}>
          <RouterProvider router={router} />
        </DataContext.Provider>
      </AuthContext.Provider>,
    )
  }

  it('provides campaign, role, isDM and the characters I own', async () => {
    const data = makeData({
      listMyCampaigns: vi.fn(async () => [player]),
      listMyCharacterIds: vi.fn(async () => [3, 7]),
    })
    renderProbe(data)
    const probe = await screen.findByTestId('probe')
    expect(JSON.parse(probe.textContent ?? '')).toEqual({ slug: 'demo', role: 'player', isDM: false, myCharacterIds: [3, 7] })
    expect(data.listMyCharacterIds).toHaveBeenCalledWith('c1', 'user-1')
  })

  it('useCampaign outside the layout fails loudly', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Probe />)).toThrow(/useCampaign must be used inside/)
    spy.mockRestore()
  })
})
