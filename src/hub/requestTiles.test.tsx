import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignRequestWithRequester } from '../data'
import { makeRequest } from '../app/testing/renderApp'
import { MyCampaignRequests } from './MyCampaignRequests'
import { RequestsInbox } from './RequestsInbox'

const inboxRow = (over: Partial<CampaignRequestWithRequester> = {}): CampaignRequestWithRequester => ({
  ...makeRequest({ id: 7, name: 'La Corona Rota', slug_wanted: 'corona-rota' }),
  requester: { id: 'u-9', display_name: 'Beto', avatar_url: null },
  ...over,
})

const renderInbox = (requests: CampaignRequestWithRequester[]) =>
  render(<RequestsInbox requests={requests} onApprove={vi.fn()} onReject={vi.fn()} onChanged={vi.fn()} />)

const renderMine = (requests = [makeRequest({ id: 3, name: 'La Corona Rota' })]) =>
  render(
    <MemoryRouter>
      <MyCampaignRequests requests={requests} campaigns={[]} onCancel={vi.fn()} onChanged={vi.fn()} />
    </MemoryRouter>,
  )

const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('owner inbox tile', () => {
  const branded = inboxRow({ tagline: 'Una historia de dragones', accent_color: '#d4145a', logo_url: 'https://cdn.test/logo.png' })

  it('puts the logo on the left, the pre-title above the name and the actions on the right', () => {
    renderInbox([branded])
    const tile = screen.getByTestId('request-tile')
    const logo = tile.querySelector('img') as HTMLElement
    const tagline = within(tile).getByText('Una historia de dragones')
    const name = within(tile).getByText('La Corona Rota')
    const actions = within(tile).getByRole('button', { name: 'Aprobar' }).parentElement as HTMLElement
    expect(logo).toHaveAttribute('src', 'https://cdn.test/logo.png')
    expect(before(logo, tagline)).toBe(true)
    expect(before(tagline, name)).toBe(true)
    expect(before(name, actions)).toBe(true)
    expect(within(actions).getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
    expect(actions.className).toContain('shrink-0')
    expect(tagline.className).toContain('uppercase')
    expect(name.className).toContain('uppercase')
  })

  it('draws a left border in the chosen colour', () => {
    renderInbox([branded])
    const tile = screen.getByTestId('request-tile')
    expect(tile.className).toContain('border-l-4')
    expect(tile.getAttribute('style')).toContain('--accent: #d4145a')
  })

  it('falls back to the brand mark, the default colour and no pre-title line', () => {
    renderInbox([inboxRow()])
    const tile = screen.getByTestId('request-tile')
    expect(tile.querySelector('img')).toBeNull()
    expect(tile.querySelector('svg[viewBox="0 0 64 64"]')).not.toBeNull()
    expect(tile.getAttribute('style')).toContain('--accent: #4a32ac')
    expect(within(tile).queryByText('RPG Quester presenta')).not.toBeInTheDocument()
  })

  it('never renders a non-https logo and keeps the requester details and the message', () => {
    renderInbox([inboxRow({ logo_url: 'http://cdn.test/logo.png', message: 'Campaña nueva de D&D' })])
    const tile = screen.getByTestId('request-tile')
    expect(tile.querySelector('img')).toBeNull()
    expect(within(tile).getByText(/Beto/)).toBeInTheDocument()
    expect(within(tile).getByText('Campaña nueva de D&D')).toBeInTheDocument()
  })
})

describe('my requests tile', () => {
  it('has the same structure with the cancel action on the right', () => {
    renderMine([makeRequest({ id: 3, name: 'La Corona Rota', tagline: 'Lema', accent_color: '#102030', logo_url: 'https://cdn.test/l.png' })])
    const tile = screen.getByTestId('request-tile')
    const tagline = within(tile).getByText('Lema')
    const name = within(tile).getByText('La Corona Rota')
    const cancel = within(tile).getByRole('button', { name: 'Cancelar solicitud' })
    expect(tile.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/l.png')
    expect(before(tagline, name)).toBe(true)
    expect(before(name, cancel)).toBe(true)
    expect(cancel.parentElement?.className).toContain('shrink-0')
    expect(tile.getAttribute('style')).toContain('--accent: #102030')
    expect(tile.className).toContain('border-l-4')
  })

  it('still shows the status, the wanted address and the decision', () => {
    renderMine([makeRequest({ id: 4, name: 'Rechazada', status: 'rejected', decision_note: 'Sin cupo', slug_wanted: 'rechazada' })])
    const tile = screen.getByTestId('request-tile')
    expect(within(tile).getByText('Rechazada', { selector: 'span.uppercase' })).toBeInTheDocument()
    expect(within(tile).getByText(/Dirección pedida: \/rechazada/)).toBeInTheDocument()
    expect(within(tile).getByText(/Sin cupo/)).toBeInTheDocument()
  })
})
