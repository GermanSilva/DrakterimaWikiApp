import { StrictMode } from 'react'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { toDataError, type AcceptInviteResult, type InvitePreview } from '../data'
import { deferred } from '../auth/testing/deferred'
import { makeAuth, makeCampaign, makeData, renderApp } from '../app/testing/renderApp'

const business = (message: string) => toDataError({ code: 'P0001', message })
const preview = (over: Partial<InvitePreview> = {}): InvitePreview => ({
  campaign_name: 'Leyendas de Drakterima',
  campaign_slug: 'drakterima',
  logo_url: null,
  role: 'player',
  character_name: null,
  is_member: false,
  nothing_to_do: false,
  ...over,
})
const joined = (over: Partial<AcceptInviteResult> = {}): AcceptInviteResult => ({
  joined: true, claimed: false, campaign_id: 'c9', slug: 'drakterima', role: 'player', character_id: null, ...over,
})
const NOTICE = 'El DM puede ver cuándo te conectaste por última vez a esta campaña.'

describe('/invite/:code landing', () => {
  it('only previews on open: it does NOT accept (nothing is consumed) and shows what the user is joining', async () => {
    const data = makeData({ previewInvite: vi.fn(async () => preview()) })
    const { router } = renderApp('/invite/abc123', { data })
    expect(await screen.findByRole('heading', { level: 2, name: 'Leyendas de Drakterima' })).toBeInTheDocument()
    expect(data.previewInvite).toHaveBeenCalledWith('abc123')
    expect(data.acceptInvite).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/invite/abc123')
    expect(screen.getByText('Jugador')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unirme' })).toBeEnabled()
  })

  it('tells the user, before accepting, that the DM can see their last connection', async () => {
    renderApp('/invite/abc123')
    const button = await screen.findByRole('button', { name: 'Unirme' })
    const notice = screen.getByText(NOTICE)
    // the notice is rendered ahead of the button that accepts
    expect(notice.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('never accepts under StrictMode', async () => {
    const data = makeData()
    renderApp('/invite/abc123', { data, wrapper: (tree) => <StrictMode>{tree}</StrictMode> })
    await screen.findByRole('button', { name: 'Unirme' })
    expect(data.acceptInvite).not.toHaveBeenCalled()
  })

  it('accepts only when the user presses "Unirme", once, and goes to the campaign', async () => {
    const data = makeData({
      acceptInvite: vi.fn(async () => joined({ slug: 'otra' })),
      listMyCampaigns: vi.fn(async () => [makeCampaign({ slug: 'otra', name: 'Otra', role: 'player' })]),
    })
    const { router } = renderApp('/invite/abc123', { data })
    fireEvent.click(await screen.findByRole('button', { name: 'Unirme' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/otra'))
    expect(data.acceptInvite).toHaveBeenCalledTimes(1)
    expect(data.acceptInvite).toHaveBeenCalledWith('abc123')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('guards "Unirme" against a double click: one accept, button disabled while it runs', async () => {
    const pending = deferred<AcceptInviteResult>()
    const data = makeData({ acceptInvite: vi.fn(() => pending.promise) })
    renderApp('/invite/abc123', { data })
    const button = await screen.findByRole('button', { name: 'Unirme' })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    expect(data.acceptInvite).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Uniéndote…' })).toBeDisabled()
    await act(async () => pending.resolve(joined()))
  })

  it('shows the character of a claim invite', async () => {
    renderApp('/invite/abc123', { data: makeData({ previewInvite: vi.fn(async () => preview({ character_name: 'Eldric' })) }) })
    const term = await screen.findByText('Personaje')
    expect(term.nextElementSibling).toHaveTextContent('Eldric')
  })

  it('shows the campaign logo only when it is https', async () => {
    const { container, unmount } = renderApp('/invite/abc123', {
      data: makeData({ previewInvite: vi.fn(async () => preview({ logo_url: 'https://cdn.test/l.png' })) }),
    })
    await screen.findByRole('button', { name: 'Unirme' })
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/l.png')
    unmount()
    const second = renderApp('/invite/abc123', {
      data: makeData({ previewInvite: vi.fn(async () => preview({ logo_url: 'http://cdn.test/l.png' })) }),
    })
    await screen.findByRole('button', { name: 'Unirme' })
    expect(second.container.querySelector('img')).toBeNull()
  })

  it('warns strongly before accepting a DM role', async () => {
    renderApp('/invite/abc123', { data: makeData({ previewInvite: vi.fn(async () => preview({ role: 'dm' })) }) })
    expect(await screen.findByText('DM (Dungeon Master)')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/rol de DM.*notas privadas/)
  })

  it('an existing member with nothing to claim is sent to the campaign, with nothing to accept', async () => {
    const data = makeData({ previewInvite: vi.fn(async () => preview({ is_member: true, nothing_to_do: true })) })
    renderApp('/invite/abc123', { data })
    expect(await screen.findByRole('link', { name: 'Ir a la campaña' })).toHaveAttribute('href', '/c/drakterima')
    expect(screen.getByRole('status')).toHaveTextContent('Ya sos parte de esta campaña')
    expect(screen.queryByRole('button', { name: 'Unirme' })).not.toBeInTheDocument()
    expect(data.acceptInvite).not.toHaveBeenCalled()
  })

  it.each([
    ['invite_expired', /venció/],
    ['invite_exhausted', /máximo de veces/],
    ['invite_not_found', /No encontramos esa invitación/],
    ['character_already_claimed', /ya fue reclamado/],
  ])('shows a friendly message for %s, no way to join and a way out', async (reason, message) => {
    const data = makeData({ previewInvite: vi.fn().mockRejectedValue(business(reason)) })
    const { router } = renderApp('/invite/abc123', { data })
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { level: 1, name: 'Invitación' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Unirme' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/invite/abc123')
    expect(data.acceptInvite).not.toHaveBeenCalled()
  })

  it('an unexpected failure to load can be retried and never shows server text', async () => {
    const previewInvite = vi.fn().mockRejectedValueOnce(new Error('pg internals: relation x')).mockResolvedValue(preview())
    renderApp('/invite/abc123', { data: makeData({ previewInvite }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la invitación')
    expect(screen.queryByText(/pg internals/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('button', { name: 'Unirme' })).toBeInTheDocument()
    expect(previewInvite).toHaveBeenCalledTimes(2)
  })

  it('a definitive refusal when joining (used up meanwhile) ends the landing', async () => {
    const data = makeData({ acceptInvite: vi.fn().mockRejectedValue(business('invite_exhausted')) })
    renderApp('/invite/abc123', { data })
    fireEvent.click(await screen.findByRole('button', { name: 'Unirme' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/máximo de veces/)
    expect(screen.queryByRole('button', { name: 'Unirme' })).not.toBeInTheDocument()
    expect(data.acceptInvite).toHaveBeenCalledTimes(1)
  })

  it('a transient failure when joining keeps the landing and lets the user try again', async () => {
    const acceptInvite = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(joined())
    const { router } = renderApp('/invite/abc123', { data: makeData({ acceptInvite }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Unirme' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos aceptar la invitación')
    const again = screen.getByRole('button', { name: 'Unirme' })
    expect(again).toBeEnabled()
    fireEvent.click(again)
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/drakterima'))
    expect(acceptInvite).toHaveBeenCalledTimes(2)
  })

  it('never calls the backend for a malformed code', async () => {
    const data = makeData()
    renderApp(`/invite/${encodeURIComponent("x'; drop table")}`, { data })
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos esa invitación')
    expect(data.previewInvite).not.toHaveBeenCalled()
    expect(data.acceptInvite).not.toHaveBeenCalled()
  })

  it('a signed-out visitor is sent to login with the invitation as next, and nothing is previewed', async () => {
    const data = makeData()
    const { router } = renderApp('/invite/abc123', { data, auth: makeAuth({ status: 'signed_out', user: null, profile: null }) })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe('/invite/abc123')
    expect(data.previewInvite).not.toHaveBeenCalled()
    expect(data.acceptInvite).not.toHaveBeenCalled()
  })

  it('offers a way out that leaves the invite untouched', async () => {
    const data = makeData()
    renderApp('/invite/abc123', { data })
    const card = (await screen.findByRole('button', { name: 'Unirme' })).closest('section')!
    expect(within(card).getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
    expect(data.acceptInvite).not.toHaveBeenCalled()
  })
})
