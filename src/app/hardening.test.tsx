import { useEffect, useState, type ReactNode } from 'react'
import { fireEvent, render, renderHook, screen, waitFor, within, act } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext'
import { deferred } from '../auth/testing/deferred'
import { useMyCampaigns } from '../hub/useMyCampaigns'
import { CHUNK_RELOAD_KEY, isChunkLoadError, reloadOnceForChunkError } from './chunkError'
import { ConfigGate } from './ConfigGate'
import { DataContext } from './DataContext'
import { RootLayout } from './RootLayout'
import { RouteErrorScreen } from './RouteStatus'
import { missingSupabaseEnv } from './supabaseConfig'
import { makeAuth, makeCampaign, makeData, renderApp } from './testing/renderApp'

describe('Supabase configuration', () => {
  it('names only the unset or blank variables, never values', () => {
    expect(missingSupabaseEnv({})).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])
    expect(missingSupabaseEnv({ VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_ANON_KEY: '  ' })).toEqual(['VITE_SUPABASE_ANON_KEY'])
    expect(missingSupabaseEnv({ VITE_SUPABASE_URL: 'http://x', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual([])
  })

  it('renders a dedicated screen instead of the app (and never mounts the children)', () => {
    const child = vi.fn(() => <p>app</p>)
    const Child = child
    render(
      <ConfigGate missing={['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']}>
        <Child />
      </ConfigGate>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Falta configurar Supabase' })).toBeInTheDocument()
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument()
    expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument()
    expect(screen.getByText('supabase status')).toBeInTheDocument()
    expect(child).not.toHaveBeenCalled()
  })

  it('renders the children when configured', () => {
    render(
      <ConfigGate missing={[]}>
        <p>app</p>
      </ConfigGate>,
    )
    expect(screen.getByText('app')).toBeInTheDocument()
  })
})

describe('chunk load errors', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('detects dynamic import failures but not ordinary errors', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true)
    expect(isChunkLoadError(new Error('boom'))).toBe(false)
    expect(isChunkLoadError('dynamically imported module')).toBe(false)
  })

  it('reloads once, then refuses inside the guard window', () => {
    const reload = vi.fn()
    const error = new TypeError('Failed to fetch dynamically imported module')
    expect(reloadOnceForChunkError(error, reload, 1000)).toBe(true)
    expect(reloadOnceForChunkError(error, reload, 2000)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1000')
    // long after: a new stale deploy may reload again
    expect(reloadOnceForChunkError(error, reload, 1000 + 120_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('never reloads for other errors', () => {
    const reload = vi.fn()
    expect(reloadOnceForChunkError(new Error('boom'), reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  function renderFailingRoute() {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          errorElement: <RouteErrorScreen />,
          lazy: async () => {
            throw new TypeError('Failed to fetch dynamically imported module: /assets/x.js')
          },
        },
      ],
      { initialEntries: ['/'] },
    )
    return render(<RouterProvider router={router} />)
  }

  it('route error screen reloads once for a chunk failure', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderFailingRoute()
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(reload).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Actualizando…', { selector: 'p' })).toBeInTheDocument()
  })

  it('route error screen shows the error UI on a repeated failure (no reload loop)', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    renderFailingRoute()
    expect(await screen.findByRole('heading', { level: 1, name: 'Algo salió mal' })).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/')
  })

  it('route error screen falls through to the error UI when storage throws (no reload happened)', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    renderFailingRoute()
    expect(await screen.findByRole('heading', { level: 1, name: 'Algo salió mal' })).toBeInTheDocument()
    expect(screen.queryByText('Actualizando…')).not.toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('route error screen shows the error UI for a non-chunk error, without reloading', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const router = createMemoryRouter(
      [
        {
          path: '/',
          errorElement: <RouteErrorScreen />,
          lazy: async () => ({
            Component: () => {
              throw new Error('render boom')
            },
          }),
        },
      ],
      { initialEntries: ['/'] },
    )
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument()
    expect(screen.queryByText(/render boom/)).not.toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('focus management', () => {
  const auth = makeAuth()
  const data = () => makeData({ listMyCampaigns: vi.fn(async () => [makeCampaign()]) })

  it('focuses the new page heading once lazy content resolves', async () => {
    renderApp('/c/demo', { auth, data: data() })
    await screen.findByRole('heading', { level: 1, name: 'Demo' })
    const nav = screen.getByRole('navigation', { name: 'Secciones de la campaña' })
    await act(async () => {
      fireEvent.click(within(nav).getByRole('link', { name: /Calendario/ }))
    })
    const heading = await screen.findByRole('heading', { level: 1, name: 'Calendario' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })

  it('does not steal focus on re-renders of the same page', async () => {
    renderApp('/', { auth, data: data() })
    await screen.findByRole('heading', { level: 1, name: 'Mis campañas' })
    const opener = await screen.findByRole('button', { name: 'Solicitar campaña' })
    await act(async () => {
      fireEvent.click(opener)
    })
    const name = await screen.findByLabelText(/^Nombre$/)
    name.focus()
    await act(async () => {
      fireEvent.change(name, { target: { value: 'Algo' } })
    })
    await act(async () => {
      fireEvent.change(name, { target: { value: 'Algo más' } })
    })
    expect(document.activeElement).toBe(name)
  })

  it('does not pull focus back once the user moved to another control before the late heading appears', async () => {
    const gate = deferred()
    function Home() {
      return (
        <main id="main-content">
          <h1>Home</h1>
          <Link to="/slow">go</Link>
        </main>
      )
    }
    function Slow() {
      const [ready, setReady] = useState(false)
      useEffect(() => {
        void gate.promise.then(() => setReady(true))
      }, [])
      return (
        <main id="main-content">
          {ready && <h1>Slow page</h1>}
          <button type="button">other control</button>
        </main>
      )
    }
    const routes = [
      {
        element: <RootLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: 'slow', element: <Slow /> },
        ],
      },
    ]
    renderApp('/', { auth, routes })
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'go' }))
    })
    // navigated; the heading does not exist yet, so the landmark holds focus
    expect(screen.queryByRole('heading', { name: 'Slow page' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(document.getElementById('main-content'))
    const other = screen.getByRole('button', { name: 'other control' })
    other.focus()
    await act(async () => gate.resolve())
    expect(screen.getByRole('heading', { name: 'Slow page' })).toBeInTheDocument()
    expect(document.activeElement).toBe(other)
  })

  it('focuses the late heading when the user has not moved focus (control for the test above)', async () => {
    const gate = deferred()
    function Slow() {
      const [ready, setReady] = useState(false)
      useEffect(() => {
        void gate.promise.then(() => setReady(true))
      }, [])
      return <main id="main-content">{ready && <h1>Slow page</h1>}</main>
    }
    const routes = [
      {
        element: <RootLayout />,
        children: [
          { path: '/', element: <Link to="/slow">go</Link> },
          { path: 'slow', element: <Slow /> },
        ],
      },
    ]
    renderApp('/', { auth, routes })
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'go' }))
    })
    await act(async () => gate.resolve())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Slow page' })))
  })
})

describe('useMyCampaigns', () => {
  type Campaigns = ReturnType<typeof makeCampaign>[]
  const names = (r: { current: { campaigns: Campaigns } }) => r.current.campaigns.map((c) => c.name)

  function setup(list: (userId: string) => Promise<Campaigns>) {
    const dataValue = makeData({ listMyCampaigns: vi.fn(list) })
    const state = { auth: makeAuth() }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={state.auth}>
        <DataContext.Provider value={dataValue}>{children}</DataContext.Provider>
      </AuthContext.Provider>
    )
    const hook = renderHook(() => useMyCampaigns(), { wrapper })
    const switchTo = (id: string) => {
      state.auth = makeAuth({ user: { id, email: `${id}@test.co` } as never })
      hook.rerender()
    }
    return { ...hook, switchTo }
  }

  it('shows nothing from the previous user after a switch without unmount', async () => {
    const second = deferred<Campaigns>()
    const { result, switchTo } = setup((id) => (id === 'user-1' ? Promise.resolve([makeCampaign({ name: 'Mine' })]) : second.promise))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(names(result)).toEqual(['Mine'])

    switchTo('user-2')
    // the very render that sees the new user: no stale list
    expect(result.current.status).toBe('loading')
    expect(result.current.campaigns).toEqual([])
    await act(async () => second.resolve([makeCampaign({ name: 'Theirs' })]))
    await waitFor(() => expect(names(result)).toEqual(['Theirs']))
  })

  it('discards a late response of the previous user', async () => {
    const first = deferred<Campaigns>()
    const { result, switchTo } = setup((id) =>
      id === 'user-1' ? first.promise : Promise.resolve([makeCampaign({ name: 'Theirs' })]),
    )
    switchTo('user-2')
    await waitFor(() => expect(names(result)).toEqual(['Theirs']))
    await act(async () => first.resolve([makeCampaign({ name: 'Stale' })]))
    expect(names(result)).toEqual(['Theirs'])
    expect(result.current.status).toBe('ready')
  })

  it('discards a superseded response after reload()', async () => {
    const calls: ReturnType<typeof deferred<Campaigns>>[] = []
    const { result } = setup(() => {
      const d = deferred<Campaigns>()
      calls.push(d)
      return d.promise
    })
    await waitFor(() => expect(calls).toHaveLength(1))
    act(() => result.current.reload())
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => calls[1].resolve([makeCampaign({ name: 'New' })]))
    await act(async () => calls[0].resolve([makeCampaign({ name: 'Old' })]))
    expect(names(result)).toEqual(['New'])
  })
})
