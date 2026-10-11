import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { userEvent } from './testing/userEvent'
import { installFakeTurnstile } from './turnstile/fakeTurnstile'
import { resetTurnstileLoaderForTests } from './turnstile/turnstileLoader'

const google = () => screen.queryByRole('button', { name: 'Continuar con Google' })
const send = () => screen.getByRole('button', { name: 'Enviar link mágico' })
const before = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

let fake: ReturnType<typeof installFakeTurnstile>
beforeEach(() => {
  resetTurnstileLoaderForTests()
  document.head.innerHTML = ''
  fake = installFakeTurnstile()
})
afterEach(() => fake.uninstall())

describe('LoginPage layout with Google enabled', () => {
  it('shows Google first, then the divider, then the email form with the spam note', () => {
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={vi.fn()} googleEnabled />)
    const divider = screen.getByRole('separator')
    const email = screen.getByLabelText('Email')
    expect(divider).toHaveTextContent('o con tu email')
    expect(before(google()!, divider)).toBe(true)
    expect(before(divider, email)).toBe(true)
    expect(before(email, send())).toBe(true)
    expect(screen.getByText(/carpeta de spam y tardar un minuto/)).toBeInTheDocument()
  })

  it('gives Google the primary style and the magic link the secondary one', () => {
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={vi.fn()} googleEnabled />)
    expect(google()!.className).not.toBe(send().className)
    expect(google()!.className).toMatch(/bg-accent/)
    expect(send().className).not.toMatch(/bg-accent/)
  })

  it('keeps Google usable while the captcha has no token; only the magic link waits for it', async () => {
    const onGoogle = vi.fn().mockResolvedValue(undefined)
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={onGoogle} googleEnabled turnstileSiteKey="site-key" />)
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledTimes(1))
    expect(send()).toBeDisabled()
    expect(google()).toBeEnabled()
    await userEvent.click(google()!)
    expect(onGoogle).toHaveBeenCalledTimes(1)
  })

  it('with a site key the widget sits in the email form, after the divider', async () => {
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={vi.fn()} googleEnabled turnstileSiteKey="site-key" />)
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledTimes(1))
    expect(before(screen.getByRole('separator'), screen.getByTestId('turnstile-container'))).toBe(true)
  })

  it('without a site key there is no widget and the email form is not gated', async () => {
    const onEmailSubmit = vi.fn().mockResolvedValue(undefined)
    render(<LoginPage onEmailSubmit={onEmailSubmit} onGoogle={vi.fn()} googleEnabled />)
    expect(screen.queryByTestId('turnstile-container')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(send())
    expect(onEmailSubmit).toHaveBeenCalledWith('a@b.co')
  })
})

describe('LoginPage layout with Google disabled', () => {
  it('is the email form only: no Google button, no divider, no spam note, primary submit', () => {
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={vi.fn()} googleEnabled={false} />)
    expect(google()).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(screen.queryByText(/o con tu email/)).not.toBeInTheDocument()
    expect(screen.queryByText(/spam/)).not.toBeInTheDocument()
    expect(send().className).toMatch(/bg-accent/)
  })

  it('still gates the magic link on the captcha when a site key is set', async () => {
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={vi.fn()} googleEnabled={false} turnstileSiteKey="site-key" />)
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledTimes(1))
    expect(send()).toBeDisabled()
    expect(google()).not.toBeInTheDocument()
  })
})
