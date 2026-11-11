import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PublicInvitePreview } from '../data'
import { AuthFlowError } from './authErrors'
import { expiryText, LoginPage } from './LoginPage'
import { userEvent } from './testing/userEvent'

const NOW = new Date('2026-11-10T12:00:00Z')
const preview = (over: Partial<PublicInvitePreview> = {}): PublicInvitePreview => ({
  campaign_name: 'Drakterima',
  logo_url: null,
  banner_url: null,
  accent_color: null,
  tagline: null,
  expires_at: null,
  ...over,
})
const renderInvite = (over: Partial<PublicInvitePreview> = {}, props: Partial<Parameters<typeof LoginPage>[0]> = {}) =>
  render(<LoginPage onGoogle={vi.fn()} invite={{ status: 'ready', preview: preview(over) }} now={NOW} {...props} />)

describe('LoginPage invite mode', () => {
  it('shows kicker, campaign name, title, lead, steps and note', () => {
    renderInvite({ campaign_name: 'Drakterima' })
    expect(screen.getByText('Te invitaron a')).toBeInTheDocument()
    expect(screen.getByText('Drakterima')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ingresá para unirte' })).toBeInTheDocument()
    expect(screen.getByText('Entrá con Google y volvés directo a la invitación para confirmar.')).toBeInTheDocument()
    const steps = screen.getByRole('list', { name: 'Qué pasa después' })
    expect(steps).toHaveTextContent('Elegís tu cuenta de Google.')
    expect(steps).toHaveTextContent('Volvés acá y confirmás «Unirme».')
    expect(steps).toHaveTextContent('El DM te asigna tu personaje.')
    expect(screen.getByText(/Solo usamos tu nombre, email y foto de Google/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar con Google' }).className).toMatch(/bg-accent/)
  })

  it('shows the tagline and the expiry in the meta line', () => {
    renderInvite({ tagline: 'Una campaña oscura', expires_at: '2026-11-16T12:00:00Z' })
    expect(screen.getByText('Una campaña oscura · Invitación válida 6 días más')).toBeInTheDocument()
  })

  it('omits the meta line without tagline and expiry', () => {
    renderInvite()
    expect(screen.queryByText(/Invitación válida|Vence hoy/)).not.toBeInTheDocument()
  })

  it.each([
    ['2026-11-11T11:00:00Z', 'Invitación válida 1 día más'],
    ['2026-11-10T15:00:00Z', 'Vence hoy'],
    ['2026-11-09T12:00:00Z', 'Vence hoy'],
    ['2026-11-20T12:00:00Z', 'Invitación válida 10 días más'],
    // The calendar day is Argentina's (UTC-3), whatever the runner's or the visitor's timezone:
    // 01:00Z on the 11th is still 22:00 of the 10th in Buenos Aires; 03:30Z is already 00:30 of the 11th.
    ['2026-11-11T01:00:00Z', 'Vence hoy'],
    ['2026-11-11T03:30:00Z', 'Invitación válida 1 día más'],
  ])('expiry %s reads «%s»', (expires_at, text) => {
    expect(expiryText(expires_at, NOW)).toBe(text)
  })

  it('renders the banner only for an https URL', () => {
    const { container, unmount } = renderInvite({ banner_url: 'https://img.test/b.png' })
    const img = container.querySelector('img[src="https://img.test/b.png"]')!
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    unmount()
    const second = renderInvite({ banner_url: 'http://img.test/b.png' })
    expect(second.container.querySelector('img')).toBeNull()
    second.unmount()
    const third = renderInvite({ banner_url: 'javascript:alert(1)' })
    expect(third.container.querySelector('img')).toBeNull()
  })

  it('shows the logo for an https URL and the initial otherwise', () => {
    const { container, unmount } = renderInvite({ logo_url: 'https://img.test/l.png' })
    expect(container.querySelector('img[src="https://img.test/l.png"]')).toHaveAttribute('referrerpolicy', 'no-referrer')
    unmount()
    renderInvite({ campaign_name: 'drakterima', logo_url: 'http://img.test/l.png' })
    expect(screen.getByText('D')).toBeInTheDocument()
  })

  it('applies the campaign accent as CSS variables on the card', () => {
    const { container } = renderInvite({ accent_color: '#0099cc' })
    const card = container.querySelector('section') as HTMLElement
    expect(card.style.getPropertyValue('--accent')).toBe('#0099cc')
    expect(card.style.getPropertyValue('--accent-rgb')).toBe('0 153 204')
  })

  it('does not set accent variables for an invalid colour', () => {
    const { container } = renderInvite({ accent_color: 'red' })
    expect((container.querySelector('section') as HTMLElement).style.getPropertyValue('--accent')).toBe('')
  })

  it('error: retry label, message and the invitation reassurance with the campaign name', async () => {
    renderInvite({ campaign_name: 'Drakterima' }, { onGoogle: vi.fn().mockRejectedValue(new AuthFlowError('network')) })
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No pudimos iniciar sesión.')
    expect(alert).toHaveTextContent('No perdiste la invitación: volvé a intentar y te llevamos de nuevo a Drakterima.')
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeEnabled()
  })

  it('redirecting: spinner label, disabled and aria-busy', async () => {
    renderInvite({}, { onGoogle: () => new Promise<void>(() => {}) })
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    const btn = screen.getByRole('button', { name: 'Redirigiendo a Google…' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })
})

describe('LoginPage generic mode', () => {
  it('shows «Ingresar», its lead, no campaign block nor steps, and the brand gradient button', () => {
    render(<LoginPage onGoogle={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Ingresar' })).toBeInTheDocument()
    expect(screen.getByText('Entrá con tu cuenta de Google para ver tus campañas.')).toBeInTheDocument()
    expect(screen.queryByText('Te invitaron a')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Qué pasa después' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar con Google' }).className).toMatch(/brand-gradient-bg/)
    expect(screen.getByText('RPG Quester')).toBeInTheDocument()
  })

  it('error without invitation does not mention the invitation', async () => {
    render(<LoginPage onGoogle={vi.fn().mockRejectedValue(new AuthFlowError('network'))} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    expect(await screen.findByRole('alert')).not.toHaveTextContent(/invitación/)
  })
})
