import { StrictMode } from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { toDataError } from '../data'
import { makeAuth, makeCampaign, makeData, makeProfile, renderApp } from '../app/testing/renderApp'
import { deferred } from '../auth/testing/deferred'

const business = (message: string) => toDataError({ code: 'P0001', message })

async function fill(label: RegExp, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  })
}
async function submit(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('hub home', () => {
  it('lists my campaigns with role badges, logo only when https', async () => {
    const data = makeData({
      listMyCampaigns: vi.fn(async () => [
        makeCampaign({ id: 'a', slug: 'alfa', name: 'Alfa', role: 'dm', branding: { logo_url: 'https://cdn.test/a.png' } }),
        makeCampaign({ id: 'b', slug: 'beta', name: 'Beta', role: 'player', branding: { logo_url: 'http://cdn.test/b.png' } }),
      ]),
    })
    const { container } = renderApp('/', { data })
    const alfa = await screen.findByRole('link', { name: /Alfa/ })
    expect(alfa).toHaveAttribute('href', '/c/alfa')
    expect(within(alfa).getByText('DM')).toBeInTheDocument()
    const beta = screen.getByRole('link', { name: /Beta/ })
    expect(within(beta).getByText('Jugador')).toBeInTheDocument()
    const logos = Array.from(container.querySelectorAll('li img')).map((img) => img.getAttribute('src'))
    expect(logos).toEqual(['https://cdn.test/a.png'])
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows an empty state', async () => {
    renderApp('/', { data: makeData({ listMyCampaigns: vi.fn(async () => []) }) })
    expect(await screen.findByText(/Todavía no sos parte de ninguna campaña/)).toBeInTheDocument()
  })

  it('shows an error with retry when loading fails', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue([makeCampaign({ name: 'Back' })])
    renderApp('/', { data: makeData({ listMyCampaigns: list }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tus campañas')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    })
    expect(await screen.findByRole('link', { name: /Back/ })).toBeInTheDocument()
  })
})

describe('create campaign', () => {
  it('suggests the slug from the name, creates and navigates to /c/:slug', async () => {
    const data = makeData()
    const { router } = renderApp('/', { data })
    await screen.findByRole('heading', { name: 'Mis campañas' })
    await fill(/^Nombre$/, 'La Corona Rota')
    expect(screen.getByLabelText('Dirección')).toHaveValue('la-corona-rota')
    await submit(/^Crear campaña$/)
    expect(data.createCampaign).toHaveBeenCalledWith('la-corona-rota', 'La Corona Rota')
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/la-corona-rota'))
  })

  it('stops following the name once the slug was edited by hand', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: 'Mis campañas' })
    await fill(/^Nombre$/, 'Uno')
    await fill(/Dirección/, 'mi-slug')
    await fill(/^Nombre$/, 'Dos')
    expect(screen.getByLabelText('Dirección')).toHaveValue('mi-slug')
  })

  it('validates client-side without calling the backend', async () => {
    const data = makeData()
    renderApp('/', { data })
    await screen.findByRole('heading', { name: 'Mis campañas' })
    await fill(/^Nombre$/, 'Demo')
    await fill(/Dirección/, 'Bad Slug')
    await submit(/^Crear campaña$/)
    expect(screen.getByText(/minúsculas, números y guiones/i, { selector: '[role=alert]' })).toBeInTheDocument()
    await fill(/Dirección/, 'admin')
    await submit(/^Crear campaña$/)
    expect(screen.getByText(/reservada/, { selector: '[role=alert]' })).toBeInTheDocument()
    expect(data.createCampaign).not.toHaveBeenCalled()
  })

  it.each([
    ['reserved_slug', business('reserved_slug'), /reservada/],
    ['campaign_limit_reached', business('campaign_limit_reached'), /máximo de campañas/],
    ['duplicate slug', toDataError({ code: '23505', message: 'duplicate key value' }), /Ya existe una campaña/],
    ['unexpected', new Error('boom'), /No pudimos crear la campaña/],
  ])('maps %s to a Spanish message and allows retrying', async (_name, error, message) => {
    const create = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(makeCampaign({ slug: 'demo' }))
    const { router } = renderApp('/', { data: makeData({ createCampaign: create }) })
    await screen.findByRole('heading', { name: 'Mis campañas' })
    await fill(/^Nombre$/, 'Demo')
    await submit(/^Crear campaña$/)
    expect(await screen.findByText(message, { selector: '[role=alert]' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument()
    await submit(/^Crear campaña$/)
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/demo'))
  })

  it('creates exactly once on a double submit, also under StrictMode', async () => {
    const pending = deferred<ReturnType<typeof makeCampaign>>()
    const create = vi.fn(() => pending.promise)
    renderApp('/', { data: makeData({ createCampaign: create }), wrapper: (tree) => <StrictMode>{tree}</StrictMode> })
    await screen.findByRole('heading', { name: 'Mis campañas' })
    await fill(/^Nombre$/, 'Demo')
    const button = screen.getByRole('button', { name: /^Crear campaña$/ })
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    expect(create).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(makeCampaign({ slug: 'demo' })))
  })
})

describe('join with a code', () => {
  it('navigates to /invite/:code with the code URL-encoded and trimmed', async () => {
    const data = makeData()
    const { router } = renderApp('/', { data })
    await screen.findByRole('heading', { name: 'Mis campañas' })
    await fill(/Código de invitación/, '  abc123  ')
    await submit(/^Ver invitación$/)
    await waitFor(() => expect(router.state.location.pathname).toBe('/invite/abc123'))
    // the form only leads to the landing: it never joins by itself
    expect(await screen.findByRole('button', { name: 'Unirme' })).toBeInTheDocument()
    expect(data.previewInvite).toHaveBeenCalledWith('abc123')
    expect(data.acceptInvite).not.toHaveBeenCalled()
  })

  it('rejects an empty or malformed code locally', async () => {
    const { router } = renderApp('/')
    await screen.findByRole('heading', { name: 'Mis campañas' })
    await fill(/Código de invitación/, 'a/b ?')
    await submit(/^Ver invitación$/)
    expect(screen.getByText(/código de invitación válido/, { selector: '[role=alert]' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('profile', () => {
  it('saves through the data layer and refreshes the auth profile', async () => {
    const auth = makeAuth({ profile: makeProfile({ display_name: 'Ana' }) })
    const data = makeData()
    renderApp('/profile', { auth, data })
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi perfil' })).toBeInTheDocument()
    await fill(/Nombre para mostrar/, 'Ana María')
    await submit(/^Guardar$/)
    await waitFor(() => expect(data.updateProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({ display_name: 'Ana María' })))
    expect(auth.refreshProfile).toHaveBeenCalledTimes(1)
  })
})

describe('sign out', () => {
  it('signs out and lands on /login', async () => {
    const out = makeAuth({ status: 'signed_out', user: null, profile: null })
    let flip: (next: typeof out) => unknown = () => undefined
    const auth = makeAuth({ signOut: vi.fn(async () => void flip(out)) })
    const { router, setAuth } = renderApp('/', { auth })
    flip = setAuth
    await screen.findByRole('heading', { name: 'Mis campañas' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    })
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    // RequireAuth's redirect (with next) and the explicit navigation race; both land on /login.
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('shows an inline error when signOut fails, stays put, and still redirects once the status flips', async () => {
    const out = makeAuth({ status: 'signed_out', user: null, profile: null })
    const auth = makeAuth({ signOut: vi.fn().mockRejectedValue(new Error('network')) })
    const { router, setAuth } = renderApp('/', { auth })
    await screen.findByRole('heading', { name: 'Mis campañas' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    })
    expect(await screen.findByText('No pudimos cerrar la sesión. Volvé a intentar.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByText(/network/)).not.toBeInTheDocument()
    // the session ended anyway (e.g. the token expired): RequireAuth takes over
    await act(async () => setAuth(out))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})

