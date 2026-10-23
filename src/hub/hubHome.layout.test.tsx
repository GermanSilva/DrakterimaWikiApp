import { fireEvent, screen, within } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makeCampaign, makeData, renderApp } from '../app/testing/renderApp'

const ownerData = () => makeData({ isHubOwner: vi.fn(async () => true) })

async function press(name: string | RegExp) {
  const button = await screen.findByRole('button', { name })
  await act(async () => {
    fireEvent.click(button)
  })
}

describe('hub header', () => {
  it('shows the brand as a small RPG over a large QUESTER and links home', async () => {
    renderApp('/')
    const home = await screen.findByRole('link', { name: 'RPG Quester: inicio' })
    expect(within(home).getByText('RPG')).toBeInTheDocument()
    expect(within(home).getByText('QUESTER')).toBeInTheDocument()
    expect(home).toHaveAttribute('href', '/')
  })

  it('keeps only the account menu on the right', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: 'Mis campañas' })
    const nav = screen.getByRole('navigation', { name: 'Cuenta' })
    expect(within(nav).getAllByRole('button')).toHaveLength(1)
    expect(within(nav).queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('campaigns view actions', () => {
  it('offers Solicitar campaña and Unirme a campaña, with no form on the page until one is opened', async () => {
    renderApp('/')
    expect(await screen.findByRole('button', { name: 'Solicitar campaña' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unirme a campaña' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Nombre$/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Código de invitación/)).not.toBeInTheDocument()
  })

  it('opens the request form in a dialog that Escape and the close button dismiss', async () => {
    renderApp('/')
    await press('Solicitar campaña')
    const dialog = screen.getByRole('dialog', { name: 'Solicitar campaña' })
    expect(within(dialog).getByLabelText(/^Nombre$/)).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await press('Solicitar campaña')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the join form in a dialog', async () => {
    renderApp('/')
    await press('Unirme a campaña')
    const dialog = screen.getByRole('dialog', { name: 'Unirme a campaña' })
    expect(within(dialog).getByLabelText(/Código de invitación/)).toBeInTheDocument()
  })

  it('gives hub owners Crear campaña instead of Solicitar campaña', async () => {
    renderApp('/', { data: ownerData() })
    expect(await screen.findByRole('button', { name: 'Crear campaña' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Solicitar campaña' })).not.toBeInTheDocument()
    await press('Crear campaña')
    expect(screen.getByRole('dialog', { name: 'Crear campaña' })).toBeInTheDocument()
  })
})

describe('campaign tiles', () => {
  const campaigns = [
    makeCampaign({ id: 'a', slug: 'alfa', name: 'Alfa', role: 'dm', branding: { tagline: 'Una historia de dragones' } }),
    makeCampaign({ id: 'b', slug: 'beta', name: 'Beta', role: 'player', branding: {} }),
  ]

  it('puts the subtitle above the name, both uppercase, and omits an empty subtitle', async () => {
    renderApp('/', { data: makeData({ listMyCampaigns: vi.fn(async () => campaigns) }) })
    const alfa = (await screen.findByRole('link', { name: /Alfa/ })) as HTMLElement
    const tagline = within(alfa).getByText('Una historia de dragones')
    const name = within(alfa).getByText('Alfa')
    expect(tagline.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tagline.className).toContain('uppercase')
    expect(name.className).toContain('uppercase')
    const beta = screen.getByRole('link', { name: /Beta/ })
    expect(within(beta).queryByText('Una historia de dragones')).not.toBeInTheDocument()
  })
})
