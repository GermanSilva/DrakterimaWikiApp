import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { here, makeAuth, renderApp } from './testing/renderApp'

// Counts how many times the legacy (Firebase) module graph is evaluated.
const legacy = vi.hoisted(() => ({ evaluated: 0 }))
vi.mock('../App', () => {
  legacy.evaluated++
  return { default: () => <div>legacy app</div> }
})
// The real AuthCallback needs a Supabase client; the route wiring is what is under test.
vi.mock('../auth/AuthCallback', async () => {
  const { useEffect } = await import('react')
  return {
    AuthCallback: ({ onDone }: { onDone: (path: string) => void }) => {
      useEffect(() => {
        onDone("/")
      }, [onDone])
      return <p>callback</p>
    },
  }
})

describe('RequireAuthRoute', () => {
  it('sends a signed-out visitor to /login with the current path as next', async () => {
    const { router } = renderApp('/c/demo/pnjs/3?tab=a', { auth: makeAuth({ status: 'signed_out', user: null, profile: null }) })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe('/c/demo/pnjs/3?tab=a')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('shows a loading state, not the page, while the session is restored', () => {
    const { router } = renderApp('/', { auth: makeAuth({ status: 'loading', user: null, profile: null }) })
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('/login', () => {
  const signedIn = makeAuth()

  it('redirects a signed-in user to a safe next target', async () => {
    const { router } = renderApp('/login?next=%2Fc%2Fdemo%2Fpnjs', { auth: signedIn })
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/demo/pnjs'))
  })

  it.each([
    ['absolute URL', 'https://evil.com'],
    ['protocol-relative', '//evil.com'],
    ['backslash trick', '/\\evil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['auth loop', '/login'],
    ['dot-segment collapse', '/.//evil.com'],
    ['encoded dot segments', '/%2e%2e//evil.com'],
    ['parent segment collapse', '/a/..//evil.com'],
    ['encoded single dot', '/%2e//evil.com'],
    ['encoded backslashes', '/%5C%5Cevil.com'],
    ['dot then backslash', '/.\\evil.com'],
  ])('ignores an unsafe next (%s) and goes to /', async (_name, next) => {
    const { router } = renderApp(`/login?next=${encodeURIComponent(next)}`, { auth: signedIn })
    await waitFor(() => expect(here(router)).toBe('/'))
    // never an off-origin or protocol-relative location
    expect(router.state.location.pathname.startsWith('//')).toBe(false)
  })

  it('shows the login page when signed out', () => {
    renderApp('/login', { auth: makeAuth({ status: 'signed_out', user: null, profile: null }) })
    expect(screen.getByRole('button', { name: /Google/ })).toBeInTheDocument()
  })
})

describe('/auth/callback', () => {
  it('navigates (replace) to / when the callback is done', async () => {
    const { router } = renderApp('/auth/callback?code=x')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(router.state.historyAction).toBe('REPLACE')
  })
})

describe('legacy app', () => {
  it('is not evaluated by hub routes and loads lazily at /legacy', async () => {
    expect(legacy.evaluated).toBe(0)
    const hub = renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Mis campañas' })).toBeInTheDocument()
    expect(legacy.evaluated).toBe(0)
    hub.unmount()

    renderApp('/legacy/anything', { auth: makeAuth({ status: 'signed_out', user: null, profile: null }) })
    expect(await screen.findByText('legacy app')).toBeInTheDocument()
    expect(legacy.evaluated).toBe(1)
  })

  it('is never imported statically by the router module', () => {
    const source = readFileSync(join(__dirname, 'routes.tsx'), 'utf8')
    const staticImports = source.split('\n').filter((line) => /^import .* from /.test(line))
    expect(staticImports.join('\n')).not.toMatch(/App|LegacyApp|firebase/)
    expect(source).toMatch(/await import\('\.\/LegacyApp'\)/)
  })
})

describe('not found', () => {
  it('renders the 404 page for unknown paths', async () => {
    renderApp('/nope/at/all')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})
