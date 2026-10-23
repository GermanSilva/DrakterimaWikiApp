import { fireEvent, screen, within } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DataError, toDataError } from '../data'
import { makeData, renderApp } from '../app/testing/renderApp'
import { campaignRequestErrorMessage, createCampaignErrorMessage } from './campaignSlug'

const ownerData = (over: Parameters<typeof makeData>[0] = {}) => makeData({ isHubOwner: vi.fn(async () => true), ...over })

async function openDialog(name: string) {
  const opener = await screen.findByRole('button', { name })
  await act(async () => {
    fireEvent.click(opener)
  })
  return screen.findByRole('dialog', { name })
}
async function fill(label: RegExp, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  })
}
async function press(name: RegExp | string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}
const preview = () => screen.getByTestId('campaign-preview')

describe('campaign preview header', () => {
  it('shows the placeholders and the brand mark before anything is typed', async () => {
    renderApp('/')
    await openDialog('Solicitar campaña')
    expect(within(preview()).getByText('Nueva campaña')).toBeInTheDocument()
    expect(within(preview()).getByText('RPG Quester presenta')).toBeInTheDocument()
    expect(preview().querySelector('svg')).not.toBeNull()
    expect(preview().querySelector('img')).toBeNull()
  })

  it('follows the name, the pre-title, the accent colour and the logo as they are typed', async () => {
    renderApp('/')
    await openDialog('Solicitar campaña')
    await fill(/^Nombre$/, 'La Corona Rota')
    await fill(/^Pre-título/, 'Una historia de dragones')
    expect(within(preview()).getByText('La Corona Rota')).toBeInTheDocument()
    expect(within(preview()).getByText('Una historia de dragones')).toBeInTheDocument()
    expect(within(preview()).queryByText('Nueva campaña')).not.toBeInTheDocument()
    expect(within(preview()).queryByText('RPG Quester presenta')).not.toBeInTheDocument()

    await fill(/^Color de acento$/, '#aabbcc')
    expect(preview().getAttribute('style')).toContain('--accent: #aabbcc')

    await fill(/^URL del logo/, 'https://cdn.test/logo.png')
    expect(preview().querySelector('img')).toHaveAttribute('src', 'https://cdn.test/logo.png')
    expect(preview().querySelector('svg')).toBeNull()

    await fill(/^URL del logo/, 'http://cdn.test/logo.png')
    expect(preview().querySelector('img')).toBeNull()
    expect(preview().querySelector('svg')).not.toBeNull()
  })

  it('is shown in the create dialog for hub owners too', async () => {
    renderApp('/', { data: ownerData() })
    await openDialog('Crear campaña')
    expect(within(preview()).getByText('Nueva campaña')).toBeInTheDocument()
  })
})

describe('request with branding', () => {
  it('sends the pre-title, the accent colour and a normalised https logo', async () => {
    const data = makeData()
    renderApp('/', { data })
    await openDialog('Solicitar campaña')
    await fill(/^Nombre$/, 'La Corona Rota')
    await fill(/^Pre-título/, '  Una historia  ')
    await fill(/^Color de acento$/, '#AABBCC')
    await fill(/^URL del logo/, 'HTTPS://CDN.test/logo.png')
    await press(/^Enviar solicitud$/)
    expect(data.createCampaignRequest).toHaveBeenCalledWith({
      name: 'La Corona Rota',
      slug_wanted: 'la-corona-rota',
      message: null,
      tagline: 'Una historia',
      accent_color: '#aabbcc',
      logo_url: 'https://cdn.test/logo.png',
    })
  })

  it('sends null for the optional fields and a default accent colour when left alone', async () => {
    const data = makeData()
    renderApp('/', { data })
    await openDialog('Solicitar campaña')
    await fill(/^Nombre$/, 'Demo')
    await press(/^Enviar solicitud$/)
    expect(data.createCampaignRequest).toHaveBeenCalledWith({
      name: 'Demo',
      slug_wanted: 'demo',
      message: null,
      tagline: null,
      accent_color: '#4a32ac',
      logo_url: null,
    })
  })

  it('validates the pre-title length and the logo locally without calling the backend', async () => {
    const data = makeData()
    renderApp('/', { data })
    await openDialog('Solicitar campaña')
    await fill(/^Nombre$/, 'Demo')
    await fill(/^Pre-título/, 'x'.repeat(141))
    await fill(/^URL del logo/, 'http://cdn.test/logo.png')
    await press(/^Enviar solicitud$/)
    expect(screen.getByText(/hasta 140 caracteres/, { selector: '[role=alert]' })).toBeInTheDocument()
    expect(screen.getByText(/dirección https:\/\/ válida/, { selector: '[role=alert]' })).toBeInTheDocument()
    expect(data.createCampaignRequest).not.toHaveBeenCalled()
  })
})

describe('direct creation with branding', () => {
  it('passes the branding to createCampaign', async () => {
    const data = ownerData()
    renderApp('/', { data })
    await openDialog('Crear campaña')
    await fill(/^Nombre$/, 'La Corona Rota')
    await fill(/^Pre-título/, 'Lema')
    await fill(/^Color de acento$/, '#aabbcc')
    await press(/^Crear$/)
    expect(data.createCampaign).toHaveBeenCalledWith('la-corona-rota', 'La Corona Rota', {
      tagline: 'Lema',
      accent_color: '#aabbcc',
      logo_url: null,
    })
  })
})

describe('branding error messages', () => {
  const business = (reason: string) => toDataError({ code: '23514', message: reason })
  it.each([
    ['invalid_tagline', /pre-título/i],
    ['invalid_accent_color', /color/i],
    ['invalid_logo_url', /logo/i],
  ])('maps %s in both the request and the creation flows', (reason, pattern) => {
    const error = business(reason)
    expect(error).toBeInstanceOf(DataError)
    expect(campaignRequestErrorMessage(error, 'request')).toMatch(pattern)
    expect(createCampaignErrorMessage(error)).toMatch(pattern)
  })
})
