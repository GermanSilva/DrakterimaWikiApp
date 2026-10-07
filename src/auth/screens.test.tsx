import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthFlowError } from './authErrors'
import { AuthProvider } from './AuthProvider'
import { LoginPage } from './LoginPage'
import { ProfileForm } from './ProfileForm'
import { RequireAuth } from './RequireAuth'
import { createFakeAuth, fakeSession, profileRow } from './testing/fakeAuth'
import { userEvent } from './testing/userEvent'
import { UserMenu } from './UserMenu'

describe('LoginPage', () => {
  it('sends the link, shows the sending and sent states', async () => {
    let finish: () => void = () => {}
    const onEmailSubmit = vi.fn(() => new Promise<void>((r) => (finish = r)))
    render(<LoginPage onEmailSubmit={onEmailSubmit} onGoogle={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email'), ' Ana@Example.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link mágico' }))
    expect(onEmailSubmit).toHaveBeenCalledWith('Ana@Example.com')
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled()
    finish()
    expect(await screen.findByText(/Revisá tu email/)).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Usar otro email' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('shows the typed error message', async () => {
    const onEmailSubmit = vi.fn().mockRejectedValue(new AuthFlowError('rate_limited'))
    render(<LoginPage onEmailSubmit={onEmailSubmit} onGoogle={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link mágico' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/demasiados links/)
  })

  it('never renders raw error text from non-AuthFlowError failures', async () => {
    const onEmailSubmit = vi.fn().mockRejectedValue(new Error('duplicate key value violates constraint pg_internal'))
    render(<LoginPage onEmailSubmit={onEmailSubmit} onGoogle={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link mágico' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No pudimos iniciar sesión')
    expect(alert).not.toHaveTextContent('pg_internal')
  })

  it('tells the user to open the link in the same browser', async () => {
    render(<LoginPage onEmailSubmit={vi.fn().mockResolvedValue(undefined)} onGoogle={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link mágico' }))
    expect(await screen.findByText(/en este mismo navegador/)).toBeInTheDocument()
  })

  it('handles a disabled Google provider gracefully and keeps the page usable', async () => {
    const onGoogle = vi.fn().mockRejectedValue(new AuthFlowError('provider_disabled'))
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={onGoogle} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Google no está disponible/)
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Enviar link mágico' })).toBeEnabled()
  })

  it('hides the Google button when disabled', () => {
    render(<LoginPage onEmailSubmit={vi.fn()} onGoogle={vi.fn()} googleEnabled={false} />)
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument()
  })
})

describe('RequireAuth', () => {
  const renderWith = (initial: ReturnType<typeof fakeSession> | null, props = {}) => {
    const fake = createFakeAuth(initial)
    return render(
      <AuthProvider client={fake.client} profiles={{ get: async (id) => profileRow(id) }}>
        <RequireAuth {...props}>
          <p>secreto</p>
        </RequireAuth>
      </AuthProvider>,
    )
  }

  it('shows the loading state, then the login page by default when signed out', async () => {
    renderWith(null)
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByText('secreto')).not.toBeInTheDocument()
  })

  it('uses a custom fallback and loading element', async () => {
    renderWith(null, { fallback: <p>afuera</p>, loading: <p>esperá</p> })
    expect(screen.getByText('esperá')).toBeInTheDocument()
    expect(await screen.findByText('afuera')).toBeInTheDocument()
  })

  it('renders children when signed in', async () => {
    renderWith(fakeSession())
    expect(await screen.findByText('secreto')).toBeInTheDocument()
  })
})

describe('UserMenu', () => {
  it('shows the display name and signs out', async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined)
    render(<UserMenu profile={profileRow()} onSignOut={onSignOut} />)
    expect(screen.getByText('Ana')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(onSignOut).toHaveBeenCalled()
  })

  it('falls back to the email and reports a sign-out failure', async () => {
    const onSignOut = vi.fn().mockRejectedValue(new Error('x'))
    render(<UserMenu profile={null} email="a@b.co" onSignOut={onSignOut} />)
    expect(screen.getByText('a@b.co')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('renders an https avatar', () => {
    const { container } = render(
      <UserMenu profile={{ ...profileRow(), avatar_url: 'https://x.test/a.png' }} onSignOut={vi.fn()} />,
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x.test/a.png')
  })
})

describe('ProfileForm', () => {
  it('validates name and avatar with matching messages and does not save', async () => {
    const update = vi.fn()
    render(<ProfileForm profile={profileRow()} repository={{ update }} />)
    const name = screen.getByLabelText('Nombre para mostrar')
    await userEvent.clear(name)
    await userEvent.type(screen.getByLabelText('URL del avatar'), 'http://x.test/a.png')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('Ingresá un nombre para mostrar.')).toBeInTheDocument()
    expect(screen.getByText(/dirección https:\/\/ válida/)).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an over-long name', async () => {
    const update = vi.fn()
    render(<ProfileForm profile={profileRow()} repository={{ update }} />)
    const name = screen.getByLabelText('Nombre para mostrar')
    await userEvent.clear(name)
    await userEvent.type(name, 'x'.repeat(81))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('hasta 80 caracteres')
    expect(update).not.toHaveBeenCalled()
  })

  it('saves trimmed values and notifies', async () => {
    const saved = { ...profileRow(), display_name: 'Ana B' }
    const update = vi.fn().mockResolvedValue(saved)
    const onSaved = vi.fn()
    render(<ProfileForm profile={profileRow()} repository={{ update }} onSaved={onSaved} />)
    const name = screen.getByLabelText('Nombre para mostrar')
    await userEvent.clear(name)
    await userEvent.type(name, '  Ana B ')
    await userEvent.type(screen.getByLabelText('URL del avatar'), 'https://x.test/a.png')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(update).toHaveBeenCalledWith('u1', { display_name: 'Ana B', avatar_url: 'https://x.test/a.png' })
    expect(screen.getByText('Perfil guardado.')).toBeInTheDocument()
  })

  it('shows a generic error when the save fails', async () => {
    const update = vi.fn().mockRejectedValue(new Error('rls detail'))
    render(<ProfileForm profile={profileRow()} repository={{ update }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No pudimos guardar tu perfil')
    expect(alert).not.toHaveTextContent('rls detail')
  })
})
