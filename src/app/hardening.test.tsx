import type { ReactNode } from 'react'
import { fireEvent, render, renderHook, screen, waitFor, within, act } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext'
import { deferred } from '../auth/testing/deferred'
import { useMyCampaigns } from '../hub/useMyCampaigns'
import { CHUNK_RELOAD_KEY, isChunkLoadError, reloadOnceForChunkError } from './chunkError'
import { ConfigGate } from './ConfigGate'
import { DataContext } from './DataContext'
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
      fireEvent.click(within(nav).getByRole('link', { name: /Mapas/ }))
    })
    const heading = await screen.findByRole('heading', { level: 1, name: 'Mapas' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })

  it('does not steal focus on re-renders of the same page', async () => {
    renderApp('/', { auth, data: data() })
    await screen.findByRole('heading', { level: 1, name: 'Mis campañas' })
    const name = screen.getByLabelText(/^Nombre$/)
    name.focus()
    await act(async () => {
      fireEvent.change(name, { target: { value: 'Algo' } })
    })
    await act(async () => {
      fireEvent.change(name, { target: { value: 'Algo más' } })
    })
    expect(document.activeElement).toBe(name)
  })

  it('does not pull focus back once the user moved to another control while a section loaded', async () => {
    renderApp('/c/demo', { auth, data: data() })
    await screen.findByRole('heading', { level: 1, name: 'Demo' })
    const nav = screen.getByRole('navigation', { name: 'Secciones de la campaña' })
    await act(async () => {
      fireEvent.click(within(nav).getByRole('link', { name: /Facciones/ }))
    })
    const other = screen.getByRole('button', { name: 'Cerrar sesión' })
    other.focus()
    await screen.findByRole('heading', { level: 1, name: 'Facciones' })
    expect(document.activeElement).toBe(other)
  })
})

describe('useMyCampaigns', () => {
  it('drops the previous user list when the user changes', async () => {
    const second = deferred<ReturnType<typeof makeCampaign>[]>()
    const list = vi.fn((userId: string) =>
      userId === 'user-1' ? Promise.resolve([makeCampaign({ name: 'Mine' })]) : second.promise,
    )
    const dataValue = makeData({ listMyCampaigns: list })
    let current = makeAuth()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={current}>
        <DataContext.Provider value={dataValue}>{children}</DataContext.Provider>
      </AuthContext.Provider>
    )
    const { result, rerender } = renderHook(() => useMyCampaigns(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.campaigns.map((c) => c.name)).toEqual(['Mine'])

    current = makeAuth({ user: { id: 'user-2', email: 'b@test.co' } as never })
    rerender()
    // same render pass that sees the new user: no stale list, back to loading
    expect(result.current.status).toBe('loading')
    expect(result.current.campaigns).toEqual([])
    await act(async () => second.resolve([makeCampaign({ name: 'Theirs' })]))
    await waitFor(() => expect(result.current.campaigns.map((c) => c.name)).toEqual(['Theirs']))
  })
})
