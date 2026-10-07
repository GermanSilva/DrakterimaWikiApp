import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthCallback, CALLBACK_TIMEOUT_MS } from './AuthCallback'
import { AuthContext, type AuthValue } from './AuthContext'
import { LoginPage, REDIRECT_RESET_MS } from './LoginPage'
import { ProfileForm } from './ProfileForm'
import { DISPLAY_NAME_MAX } from './profileValidation'
import { RequireAuth } from './RequireAuth'
import { createFakeAuth, profileRow } from './testing/fakeAuth'
import { userEvent } from './testing/userEvent'

afterEach(() => vi.useRealTimers())

describe('LoginPage Google redirect phase', () => {
  const pending = () => new Promise<void>(() => {})

  it('shows its own label and disables both buttons while redirecting', async () => {
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={pending} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    expect(screen.getByRole('button', { name: 'Redirigiendo a Google…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enviar link mágico' })).toBeDisabled()
  })

  it('resets when the page is restored from the bfcache (pageshow persisted)', async () => {
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={pending} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
    })
    expect(screen.getByRole('button', { name: 'Redirigiendo a Google…' })).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
  })

  it('resets after a timeout if navigation never happened', async () => {
    vi.useFakeTimers()
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={async () => {}} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    })
    expect(screen.getByRole('button', { name: 'Redirigiendo a Google…' })).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(REDIRECT_RESET_MS + 1)
    })
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
  })
})

describe('AuthCallback timeout', () => {
  it('moves to the error state with the back button when the exchange hangs', async () => {
    vi.useFakeTimers()
    const { client, auth } = createFakeAuth()
    auth.exchangeCodeForSession.mockImplementationOnce(() => new Promise(() => {}) as never)
    window.history.replaceState({}, '', '/auth/callback?code=abc')
    const onDone = vi.fn()
    render(<AuthCallback client={client} onDone={onDone} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(CALLBACK_TIMEOUT_MS + 1)
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/tardando/)
    fireEvent.click(screen.getByRole('button', { name: /volver/i }))
    expect(onDone).toHaveBeenCalledWith('/')
  })
})

describe('ProfileForm callbacks and caps', () => {
  it('uses the shared cap constant for the over-long case', async () => {
    const update = vi.fn()
    render(<ProfileForm profile={profileRow()} repository={{ update }} />)
    const name = screen.getByLabelText('Nombre para mostrar')
    await userEvent.clear(name)
    await userEvent.type(name, 'x'.repeat(DISPLAY_NAME_MAX + 1))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent(`hasta ${DISPLAY_NAME_MAX} caracteres`)
    expect(update).not.toHaveBeenCalled()
  })

  it('reports success and calls onSaved with the saved profile (outside the save try/catch)', async () => {
    const update = vi.fn().mockResolvedValue(profileRow())
    const onSaved = vi.fn()
    render(<ProfileForm profile={profileRow()} repository={{ update }} onSaved={onSaved} />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved).toHaveBeenCalledWith(profileRow())
    expect(await screen.findByText('Perfil guardado.')).toBeInTheDocument()
  })
})

describe('RequireAuth fails closed', () => {
  it('shows the fallback for any status other than signed_in', () => {
    const value = { status: 'something_new' } as unknown as AuthValue
    render(
      <AuthContext.Provider value={value}>
        <RequireAuth fallback={<p>afuera</p>}>
          <p>secreto</p>
        </RequireAuth>
      </AuthContext.Provider>,
    )
    expect(screen.getByText('afuera')).toBeInTheDocument()
    expect(screen.queryByText('secreto')).not.toBeInTheDocument()
  })
})
