import { StrictMode } from 'react'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { toDataError } from '../data'
import { makeCampaign, makeData, renderApp } from '../app/testing/renderApp'

const business = (message: string) => toDataError({ code: 'P0001', message })

describe('/invite/:code', () => {
  it('accepts the invite once and navigates to the campaign', async () => {
    const data = makeData({
      acceptInvite: vi.fn(async () => ({
        joined: true, claimed: false, campaign_id: 'c9', slug: 'otra', role: 'player' as const, character_id: null,
      })),
      listMyCampaigns: vi.fn(async () => [makeCampaign({ id: 'c9', slug: 'otra', name: 'Otra', role: 'player' })]),
    })
    const { router } = renderApp('/invite/abc123', { data })
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/otra'))
    expect(data.acceptInvite).toHaveBeenCalledTimes(1)
    expect(data.acceptInvite).toHaveBeenCalledWith('abc123')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('calls acceptInvite a single time under StrictMode (mount, cleanup, mount)', async () => {
    const data = makeData()
    const { router } = renderApp('/invite/abc123', { data, wrapper: (tree) => <StrictMode>{tree}</StrictMode> })
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/demo'))
    expect(data.acceptInvite).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['invite_expired', /venció/],
    ['invite_exhausted', /máximo de veces/],
    ['invite_not_found', /No encontramos esa invitación/],
    ['character_already_claimed', /ya fue reclamado/],
  ])('shows a friendly message for %s and offers a way out', async (reason, message) => {
    const data = makeData({ acceptInvite: vi.fn().mockRejectedValue(business(reason)) })
    const { router } = renderApp('/invite/abc123', { data })
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { level: 1, name: 'Invitación' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
    expect(router.state.location.pathname).toBe('/invite/abc123')
    expect(data.acceptInvite).toHaveBeenCalledTimes(1)
  })

  it('does not show unexpected server text', async () => {
    const data = makeData({ acceptInvite: vi.fn().mockRejectedValue(new Error('pg internals: relation x')) })
    renderApp('/invite/abc123', { data })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos aceptar la invitación')
    expect(screen.queryByText(/pg internals/)).not.toBeInTheDocument()
  })

  it('never calls the backend for a malformed code', async () => {
    const data = makeData()
    renderApp(`/invite/${encodeURIComponent("x'; drop table")}`, { data })
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos esa invitación')
    expect(data.acceptInvite).not.toHaveBeenCalled()
  })
})
