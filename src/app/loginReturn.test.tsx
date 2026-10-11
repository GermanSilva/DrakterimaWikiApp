import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeAuth } from '../auth/testing/fakeAuth'
import { userEvent } from '../auth/testing/userEvent'
import { here, makeAuth, renderApp } from './testing/renderApp'

// The REAL AuthCallback runs (code exchange against a fake client); only the client lookup is faked.
const fake = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('../data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data')>()),
  getSupabase: () => fake.client,
}))
vi.mock('../App', () => ({ default: () => <div>legacy app</div> }))

const signedOut = makeAuth({ status: 'signed_out', user: null, profile: null })

beforeEach(() => {
  window.localStorage.clear()
  fake.client = createFakeAuth().client
})

describe('returning to a protected link after signing in', () => {
  it('signed out → /invite/abc → login (magic link) → callback → lands on /invite/abc', async () => {
    const { router, setAuth } = renderApp('/invite/abc', { auth: signedOut })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))

    await userEvent.type(screen.getByLabelText('Email'), 'ana@test.co')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link mágico' }))

    // The magic link opens (here: the same router) with the session available after the exchange.
    window.history.replaceState({}, '', '/auth/callback?code=abc')
    act(() => setAuth(makeAuth()))
    await act(async () => {
      await router.navigate('/auth/callback?code=abc')
    })
    await waitFor(() => expect(here(router)).toBe('/invite/abc'))
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('works for the Google redirect too', async () => {
    const { router, setAuth } = renderApp('/invite/xyz', { auth: signedOut })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))

    window.history.replaceState({}, '', '/auth/callback?code=abc')
    act(() => setAuth(makeAuth()))
    await act(async () => {
      await router.navigate('/auth/callback?code=abc')
    })
    await waitFor(() => expect(here(router)).toBe('/invite/xyz'))
  })

  it('a plain login (no next) after an earlier invite attempt lands on / (no stale hijack)', async () => {
    const first = renderApp('/invite/abc', { auth: signedOut })
    await waitFor(() => expect(first.router.state.location.pathname).toBe('/login'))
    await userEvent.type(screen.getByLabelText('Email'), 'ana@test.co')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link mágico' }))
    first.unmount()

    const second = renderApp('/login', { auth: signedOut })
    await userEvent.type(screen.getByLabelText('Email'), 'ana@test.co')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link mágico' }))

    window.history.replaceState({}, '', '/auth/callback?code=abc')
    act(() => second.setAuth(makeAuth()))
    await act(async () => {
      await second.router.navigate('/auth/callback?code=abc')
    })
    await waitFor(() => expect(here(second.router)).toBe('/'))
  })

  it('ignores a crafted ?next= on the callback URL', async () => {
    const { router, setAuth } = renderApp('/login', { auth: signedOut })
    window.history.replaceState({}, '', '/auth/callback?code=abc&next=%2Finvite%2Fevil')
    act(() => setAuth(makeAuth()))
    await act(async () => {
      await router.navigate('/auth/callback?code=abc&next=%2Finvite%2Fevil')
    })
    await waitFor(() => expect(here(router)).toBe('/'))
  })
})
