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
    expect(await screen.findByRole('heading', { level: 1, name: 'Demo' })).toBeInTheDocument()
  })

  it('never puts the slug into a backend call: it only matches against my own list', async () => {
    const data = dataFor(dm)
    renderApp(`/c/${encodeURIComponent("demo' or '1'='1")}`, { data })
    await screen.findByRole('heading', { name: 'Campaña no disponible' })
    expect(data.listMyCampaigns).toHaveBeenCalledWith('user-1')
    expect(data.listMyCharacterIds).not.toHaveBeenCalled()
  })
})

describe('role-based navigation', () => {
  it('shows Ajustes to a DM', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    const nav = await screen.findByRole('navigation', { name: 'Secciones de la campaña' })
    expect(within(nav).getByRole('link', { name: /Ajustes/ })).toHaveAttribute('href', '/c/demo/ajustes')
    expect(screen.getByText('DM', { selector: 'strong' })).toBeInTheDocument()
  })

  it('hides Ajustes from a player, in the nav and on the dashboard', async () => {
    renderApp('/c/demo', { data: dataFor(player) })
    await screen.findByRole('heading', { level: 1, name: 'Demo' })
    expect(screen.queryByRole('link', { name: /Ajustes/ })).not.toBeInTheDocument()
    expect(screen.getByText('Jugador', { selector: 'strong' })).toBeInTheDocument()
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
    for (const section of SECTIONS) {
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
  it('renders the placeholder (a not yet ported section) for a deep link with an id', async () => {
    renderApp('/c/demo/srd/3', { data: dataFor(dm) })
    expect(await screen.findByRole('heading', { level: 1, name: 'SRD / Reglas' })).toBeInTheDocument()
    expect(screen.getByText(/Esta sección se está migrando/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders the id as text, never as markup', async () => {
    renderApp(`/c/demo/srd/${encodeURIComponent('<img src=x onerror=alert(1)>')}`, { data: dataFor(dm) })
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('main img')).toBeNull()
  })

  it('shows a 404 inside the layout for an unknown section (shell stays)', async () => {
    renderApp('/c/demo/nada', { data: dataFor(dm) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Secciones de la campaña' })).toBeInTheDocument()
  })

  it('moves focus into the main landmark after navigating between sections', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    await screen.findByRole('heading', { level: 1, name: 'Demo' })
    await act(async () => {
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones de la campaña' })).getByRole('link', { name: /Calendario/ }))
    })
    await screen.findByRole('heading', { level: 1, name: 'Calendario' })
    await waitFor(() => expect(document.getElementById('main-content')?.contains(document.activeElement)).toBe(true))
  })

  it('offers a skip link to the main content', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    await screen.findByRole('heading', { level: 1, name: 'Demo' })
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#main-content')
    expect(document.getElementById('main-content')).toBeInTheDocument()
  })
})

describe('branding', () => {
  const shell = () => document.querySelector<HTMLElement>('main')!.parentElement!

  it('applies a valid hex accent as CSS variables on the campaign shell only', async () => {
    const branded = makeCampaign({ branding: { accent_color: '#1E90FF', logo_url: 'https://cdn.test/l.png' } })
    renderApp('/c/demo', { data: dataFor(branded) })
    await screen.findByRole('heading', { level: 1, name: 'Demo' })
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
      await screen.findByRole('heading', { level: 1, name: 'Demo' })
      expect(shell().getAttribute('style') ?? '').not.toContain('--accent')
    },
  )

  it.each(['http://cdn.test/l.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '/relative.png', 'not a url'])(
    'falls back to the default dragon for the logo %j',
    async (logo) => {
      const branded = makeCampaign({ branding: { logo_url: logo } })
      renderApp('/c/demo', { data: dataFor(branded) })
      await screen.findByRole('heading', { level: 1, name: 'Demo' })
      expect(document.querySelector('header img')).toBeNull()
      expect(document.querySelector('header svg.text-accent')).not.toBeNull()
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
  it('lists my campaigns and navigates to the chosen one', async () => {
    const other = makeCampaign({ id: 'c2', slug: 'otra', name: 'Otra', role: 'player' })
    const { router } = renderApp('/c/demo', { data: dataFor(dm, other) })
    const select = await screen.findByRole('combobox', { name: 'Cambiar de campaña' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Demo', 'Otra', 'Todas mis campañas…'])
    await act(async () => {
      fireEvent.change(select, { target: { value: 'otra' } })
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/otra'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Otra' })).toBeInTheDocument()
  })

  it('shows the campaign name in the header and a working mobile menu toggle', async () => {
    renderApp('/c/demo', { data: dataFor(dm) })
    await screen.findByRole('heading', { level: 1, name: 'Demo' })
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
    await screen.findByRole('heading', { level: 1, name: 'Demo' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
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
