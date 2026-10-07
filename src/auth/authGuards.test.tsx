import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthCallback, CALLBACK_TIMEOUT_MESSAGE, CALLBACK_TIMEOUT_MS } from './AuthCallback'
import { AuthFlowError } from './authErrors'
import {
  CALLBACK_EXPIRED,
  CALLBACK_GENERIC,
  CALLBACK_NETWORK,
  CALLBACK_RATE_LIMITED,
  CALLBACK_WRONG_BROWSER,
  completeAuthCallback,
} from './completeAuthCallback'
import { LoginPage, REDIRECT_RESET_MS } from './LoginPage'
import { ProfileForm } from './ProfileForm'
import { createFakeAuth, fakeSession, profileRow } from './testing/fakeAuth'
import { userEvent } from './testing/userEvent'
import { deferred } from './testing/deferred'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const googleButton = () => screen.getByRole('button', { name: /Google/ })

describe('LoginPage single OAuth flow', () => {
  it('a second click while the first attempt is pending does not call onGoogle twice', async () => {
    const first = deferred()
    const onGoogle = vi.fn(() => first.promise)
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={onGoogle} />)
    const button = googleButton()
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button) // before React re-renders the disabled state
    })
    expect(onGoogle).toHaveBeenCalledTimes(1)
  })

  it('does not start the reset timer until onGoogle resolved', async () => {
    vi.useFakeTimers()
    const pending = deferred()
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={() => pending.promise} />)
    await act(async () => {
      fireEvent.click(googleButton())
    })
    await act(async () => {
      vi.advanceTimersByTime(REDIRECT_RESET_MS * 2)
    })
    expect(screen.getByRole('button', { name: 'Redirigiendo a Google…' })).toBeInTheDocument()
    await act(async () => pending.resolve())
    await act(async () => {
      vi.advanceTimersByTime(REDIRECT_RESET_MS + 1)
    })
    expect(googleButton()).toHaveTextContent('Continuar con Google')
    expect(googleButton()).toBeEnabled()
  })

  it('ignores a stale rejection from an earlier attempt after a bfcache reset and a new attempt', async () => {
    const first = deferred()
    const second = deferred()
    const onGoogle = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={onGoogle} />)
    await userEvent.click(googleButton())
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    expect(googleButton()).toBeEnabled()
    await userEvent.click(googleButton())
    expect(onGoogle).toHaveBeenCalledTimes(2)
    await act(async () => first.reject(new AuthFlowError('provider_disabled')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redirigiendo a Google…' })).toBeInTheDocument()
    await act(async () => second.reject(new AuthFlowError('network')))
    expect(await screen.findByRole('alert')).toHaveTextContent(/conectarnos/)
    // after a real failure the user can retry
    await userEvent.click(googleButton())
    expect(onGoogle).toHaveBeenCalledTimes(3)
  })

  it('still shows a late failure of an attempt abandoned by a reset when nothing newer started', async () => {
    const first = deferred()
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={() => first.promise} />)
    await userEvent.click(googleButton())
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    expect(googleButton()).toBeEnabled()
    await act(async () => first.reject(new AuthFlowError('network')))
    expect(await screen.findByRole('alert')).toHaveTextContent(/conectarnos/)
    expect(googleButton()).toBeEnabled()
  })

  it('a late failure does not override a magic-link send the user started after the reset', async () => {
    const first = deferred()
    const send = deferred()
    render(<LoginPage onEmailSubmit={() => send.promise} onGoogle={() => first.promise} />)
    await userEvent.click(googleButton())
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.test')
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(/email/i).closest('form') as HTMLFormElement)
    })
    await act(async () => first.reject(new AuthFlowError('network')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeInTheDocument()
  })
})

const at = (suffix: string) => ({ href: `http://localhost/auth/callback${suffix}`, pathname: '/auth/callback' })
const noopHistory = { state: null, replaceState: () => {} } as unknown as History

describe('completeAuthCallback rate limits and provider errors', () => {
  async function exchangeError(error: unknown) {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, auth } = createFakeAuth()
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { session: null }, error })
    return completeAuthCallback(client, at('?code=c'), noopHistory)
  }

  it('429 / over_request_rate_limit gets its own message, not EXPIRED', async () => {
    expect(await exchangeError({ status: 429, message: 'x' })).toEqual({ ok: false, message: CALLBACK_RATE_LIMITED })
    expect(await exchangeError({ code: 'over_request_rate_limit', message: 'x' })).toEqual({ ok: false, message: CALLBACK_RATE_LIMITED })
  })

  it.each([400, 401, 403, 404, 422])('%i stays EXPIRED', async (status) => {
    expect(await exchangeError({ name: 'AuthApiError', status, message: 'x' })).toEqual({ ok: false, message: CALLBACK_EXPIRED })
  })

  it('other provider errors are generic even if the description says "invalid"', async () => {
    const { client } = createFakeAuth()
    expect(await completeAuthCallback(client, at('?error=invalid_request&error_description=Unsupported+provider'), noopHistory)).toEqual({
      ok: false,
      message: CALLBACK_GENERIC,
    })
    expect(await completeAuthCallback(client, at('?error=server_error&error_description=invalid+configuration'), noopHistory)).toEqual({
      ok: false,
      message: CALLBACK_GENERIC,
    })
  })

  it('classifies THROWN exchange errors like returned ones', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const thrown = async (error: unknown) => {
      const { client, auth } = createFakeAuth()
      auth.exchangeCodeForSession.mockRejectedValueOnce(error)
      return completeAuthCallback(client, at('?code=c'), noopHistory)
    }
    expect(await thrown({ status: 429, message: 'x' })).toEqual({ ok: false, message: CALLBACK_RATE_LIMITED })
    expect(await thrown({ name: 'AuthPKCECodeVerifierMissingError', message: 'x' })).toEqual({ ok: false, message: CALLBACK_WRONG_BROWSER })
    expect(await thrown({ status: 502, message: 'x' })).toEqual({ ok: false, message: CALLBACK_NETWORK })
    expect(await thrown(new TypeError('Failed to fetch'))).toEqual({ ok: false, message: CALLBACK_NETWORK })
    expect(await thrown(new Error('who knows'))).toEqual({ ok: false, message: CALLBACK_GENERIC })
  })

  it('rejects without exchanging when replaceState throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, auth } = createFakeAuth()
    const throwing = {
      state: null,
      replaceState: () => {
        throw new DOMException('denied', 'SecurityError')
      },
    } as unknown as History
    expect(await completeAuthCallback(client, at('?code=secret'), throwing)).toEqual({ ok: false, message: CALLBACK_GENERIC })
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })
})

describe('AuthCallback single navigation', () => {
  it('after the timeout error a late success shows "Ya iniciaste sesión" and navigates only via Continuar, once', async () => {
    vi.useFakeTimers()
    const { client, auth } = createFakeAuth()
    let release: () => void = () => {}
    auth.exchangeCodeForSession.mockImplementationOnce(
      () => new Promise((r) => (release = () => r({ data: { session: fakeSession() }, error: null }))) as never,
    )
    window.history.replaceState({}, '', '/auth/callback?code=abc')
    const onDone = vi.fn()
    render(<AuthCallback client={client} onDone={onDone} />)
    await act(async () => {
      vi.advanceTimersByTime(CALLBACK_TIMEOUT_MS + 1)
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(CALLBACK_TIMEOUT_MESSAGE)
    await act(async () => release())
    expect(onDone).not.toHaveBeenCalled() // no automatic navigation
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Ya iniciaste sesión.')).toBeInTheDocument()
    const next = screen.getByRole('button', { name: 'Continuar' })
    fireEvent.click(next)
    fireEvent.click(next)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith('/')
  })

  it('a normal success calls onDone exactly once', async () => {
    const { client } = createFakeAuth()
    window.history.replaceState({}, '', '/auth/callback?code=abc')
    const onDone = vi.fn()
    render(<AuthCallback client={client} onDone={onDone} />)
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    // flush any pending work and re-assert: nothing fires a second time
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('LoginPage stale results after a reset', () => {
  it('ignores a late resolve after the reset (does not re-enter the redirecting phase)', async () => {
    const first = deferred()
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={() => first.promise} />)
    await userEvent.click(googleButton())
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    await act(async () => first.resolve())
    expect(googleButton()).toHaveTextContent('Continuar con Google')
  })
})

describe('ProfileForm onSaved failures', () => {
  it('logs a throwing onSaved (sanitized), keeps the success state and leaks nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const update = vi.fn().mockResolvedValue(profileRow())
    const onSaved = vi.fn(() => {
      throw Object.assign(new Error('secret detail'), { code: 'X1' })
    })
    render(<ProfileForm profile={profileRow()} repository={{ update }} onSaved={onSaved} />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Perfil guardado.')).toBeInTheDocument()
    expect(screen.queryByText(/No pudimos guardar/)).not.toBeInTheDocument()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret detail')
    expect(JSON.stringify(warn.mock.calls)).toContain('X1')
  })
})
