import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthFlowError } from './authErrors'
import { turnstileSiteKey } from './authConfig'
import { LoginPage } from './LoginPage'
import { userEvent } from './testing/userEvent'
import { installFakeTurnstile } from './turnstile/fakeTurnstile'
import { resetTurnstileLoaderForTests } from './turnstile/turnstileLoader'

const send = () => screen.getByRole('button', { name: 'Enviar link mágico' })
let fake: ReturnType<typeof installFakeTurnstile>

beforeEach(() => {
  resetTurnstileLoaderForTests()
  document.head.innerHTML = ''
  fake = installFakeTurnstile()
})
afterEach(() => fake.uninstall())

async function renderWithCaptcha(onEmailSubmit = vi.fn().mockResolvedValue(undefined), onGoogle = vi.fn()) {
  render(<LoginPage onEmailSubmit={onEmailSubmit} onGoogle={onGoogle} turnstileSiteKey="site-key" />)
  await waitFor(() => expect(fake.api.render).toHaveBeenCalledTimes(1))
  return { onEmailSubmit, onGoogle }
}

describe('turnstileSiteKey', () => {
  it('is null when unset or blank, otherwise the trimmed key', () => {
    expect(turnstileSiteKey({})).toBeNull()
    expect(turnstileSiteKey({ VITE_TURNSTILE_SITE_KEY: '  ' })).toBeNull()
    expect(turnstileSiteKey({ VITE_TURNSTILE_SITE_KEY: ' 1x00 ' })).toBe('1x00')
  })
})

describe('LoginPage without a Turnstile site key', () => {
  it.each([undefined, null, ''])('renders no widget, loads no script and sends no token (%s)', async (key) => {
    const onEmailSubmit = vi.fn().mockResolvedValue(undefined)
    render(<LoginPage onEmailSubmit={onEmailSubmit} onGoogle={vi.fn()} turnstileSiteKey={key} />)
    expect(screen.queryByTestId('turnstile-container')).not.toBeInTheDocument()
    expect(document.querySelectorAll('script')).toHaveLength(0)
    expect(send()).toBeEnabled()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(send())
    expect(onEmailSubmit).toHaveBeenCalledWith('a@b.co')
  })
})

describe('LoginPage with a Turnstile site key', () => {
  it('renders the widget and keeps the button disabled until a token exists', async () => {
    await renderWithCaptcha()
    expect(screen.getByTestId('turnstile-container')).toBeInTheDocument()
    expect(send()).toBeDisabled()
    act(() => fake.solve('tok-1'))
    expect(send()).toBeEnabled()
  })

  it('sends the token with the email, then resets the widget for the next attempt', async () => {
    const { onEmailSubmit } = await renderWithCaptcha()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    act(() => fake.solve('tok-1'))
    await userEvent.click(send())
    expect(onEmailSubmit).toHaveBeenCalledWith('a@b.co', 'tok-1')
    expect(await screen.findByText(/Revisá tu email/)).toBeInTheDocument()
    expect(fake.api.reset).toHaveBeenCalled()
  })

  it('after a failed attempt the old token is gone: a new one is required before retrying', async () => {
    const onEmailSubmit = vi.fn().mockRejectedValueOnce(new AuthFlowError('captcha_failed')).mockResolvedValue(undefined)
    await renderWithCaptcha(onEmailSubmit)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    act(() => fake.solve('tok-1'))
    await userEvent.click(send())
    expect(await screen.findByRole('alert')).toHaveTextContent(/verificación de seguridad/)
    expect(fake.api.reset).toHaveBeenCalledTimes(1)
    expect(send()).toBeDisabled()
    act(() => fake.solve('tok-2'))
    await userEvent.click(send())
    expect(onEmailSubmit).toHaveBeenLastCalledWith('a@b.co', 'tok-2')
  })

  it('does not submit without a token even when the form is submitted directly', async () => {
    const { onEmailSubmit } = await renderWithCaptcha()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await act(async () => {
      send().closest('form')!.requestSubmit()
    })
    expect(onEmailSubmit).not.toHaveBeenCalled()
  })

  it('shows a Spanish message with retry when the token expires, and blocks sending', async () => {
    await renderWithCaptcha()
    act(() => fake.solve('tok-1'))
    act(() => fake.expire())
    expect(screen.getByRole('alert')).toHaveTextContent('La verificación de seguridad venció.')
    expect(send()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(fake.api.reset).toHaveBeenCalledWith('w1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a message with retry when the widget reports an error', async () => {
    await renderWithCaptcha()
    act(() => fake.fail())
    expect(screen.getByRole('alert')).toHaveTextContent('La verificación de seguridad falló.')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(send()).toBeDisabled()
  })

  it('keeps login blocked (does not skip the captcha) when the Cloudflare script fails to load', async () => {
    fake.uninstall()
    const onEmailSubmit = vi.fn()
    render(<LoginPage onEmailSubmit={onEmailSubmit} onGoogle={vi.fn()} turnstileSiteKey="site-key" />)
    await act(async () => {
      document.querySelector('script[src*="challenges.cloudflare.com"]')!.dispatchEvent(new Event('error'))
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos cargar la verificación de seguridad/)
    expect(send()).toBeDisabled()
    expect(onEmailSubmit).not.toHaveBeenCalled()
  })

  it('leaves Google usable regardless of the captcha and sends no token for it', async () => {
    const { onGoogle } = await renderWithCaptcha()
    const google = screen.getByRole('button', { name: 'Continuar con Google' })
    expect(google).toBeEnabled()
    await userEvent.click(google)
    expect(onGoogle).toHaveBeenCalledWith()
  })

  it('removes the widget when the login page unmounts', async () => {
    const onEmailSubmit = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(<LoginPage onEmailSubmit={onEmailSubmit} onGoogle={vi.fn()} turnstileSiteKey="k" />)
    await waitFor(() => expect(fake.api.render).toHaveBeenCalled())
    unmount()
    expect(fake.api.remove).toHaveBeenCalled()
  })
})
