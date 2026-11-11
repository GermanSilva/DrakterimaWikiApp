import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthValue } from './AuthContext'
import { DataContext } from '../app/DataContext'
import type { HubData } from '../app/hubData'
import { ConnectedLoginPage, inviteCodeFromNext } from './ConnectedLoginPage'
import { consumeNext, NEXT_STORAGE_KEY, rememberNext } from './postLoginRedirect'
import { userEvent } from './testing/userEvent'

function setup(next?: string | null) {
  // What is stored at the moment each sign-in starts (it must already be there).
  const seen: { email?: string | null; google?: string | null } = {}
  const signInWithEmail = vi.fn<AuthValue['signInWithEmail']>(async () => {
    seen.email = window.localStorage.getItem(NEXT_STORAGE_KEY)
  })
  const signInWithGoogle = vi.fn(async () => {
    seen.google = window.localStorage.getItem(NEXT_STORAGE_KEY)
  })
  const value = { status: 'signed_out', signInWithEmail, signInWithGoogle } as unknown as AuthValue
  render(
    <AuthContext.Provider value={value}>
      <ConnectedLoginPage next={next} />
    </AuthContext.Provider>,
  )
  return { signInWithEmail, signInWithGoogle, seen }
}

const sendLink = async (email = 'ana@test.co') => {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.click(screen.getByRole('button', { name: 'Enviar link mágico' }))
}

beforeEach(() => window.localStorage.clear())

describe('ConnectedLoginPage remembers the destination', () => {
  it('stores next BEFORE sending the magic link', async () => {
    const { signInWithEmail, seen } = setup('/invite/abc')
    await sendLink()
    expect(signInWithEmail).toHaveBeenCalledWith('ana@test.co')
    expect(JSON.parse(seen.email!).path).toBe('/invite/abc')
  })

  it('stores next BEFORE the Google redirect', async () => {
    const { signInWithGoogle, seen } = setup('/invite/abc')
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    expect(signInWithGoogle).toHaveBeenCalledTimes(1)
    expect(JSON.parse(seen.google!).path).toBe('/invite/abc')
  })

  it.each([undefined, null, '', '//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)'])(
    'with next=%j clears a stale value instead of keeping it (magic link)',
    async (next) => {
      rememberNext('/invite/stale')
      const { seen } = setup(next)
      await sendLink()
      expect(seen.email).toBeNull()
      expect(consumeNext()).toBe('/')
    },
  )

  it('with no valid next clears a stale value before the Google redirect', async () => {
    rememberNext('/invite/stale')
    const { seen } = setup(null)
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    expect(seen.google).toBeNull()
  })

  it('stores nothing just by rendering the page', () => {
    setup('/invite/abc')
    expect(window.localStorage.getItem(NEXT_STORAGE_KEY)).toBeNull()
  })
})

describe('ConnectedLoginPage dev email login', () => {
  it('shows no email form when dev email login is off (production)', () => {
    render(
      <AuthContext.Provider value={{ status: 'signed_out', signInWithEmail: vi.fn(), signInWithGoogle: vi.fn() } as unknown as AuthValue}>
        <ConnectedLoginPage next="/invite/abc" devEmailLogin={false} />
      </AuthContext.Provider>,
    )
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar link mágico' })).not.toBeInTheDocument()
  })

  it('defaults to the dev form under vitest (import.meta.env.DEV is true)', () => {
    setup('/invite/abc')
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })
})

describe('ConnectedLoginPage invitation preview', () => {
  const PREVIEW = { campaign_name: 'Drakterima', logo_url: null, banner_url: null, accent_color: null, tagline: null, expires_at: null }
  function setupWithData(next: string | null | undefined, previewInvitePublic: ReturnType<typeof vi.fn>) {
    const value = { status: 'signed_out', signInWithEmail: vi.fn(), signInWithGoogle: vi.fn() } as unknown as AuthValue
    render(
      <AuthContext.Provider value={value}>
        <DataContext.Provider value={{ previewInvitePublic } as unknown as HubData}>
          <ConnectedLoginPage next={next} devEmailLogin={false} />
        </DataContext.Provider>
      </AuthContext.Provider>,
    )
  }

  it('loads the preview for next=/invite/abc123 and shows the campaign', async () => {
    const fn = vi.fn().mockResolvedValue(PREVIEW)
    setupWithData('/invite/abc123', fn)
    expect(await screen.findByText('Drakterima')).toBeInTheDocument()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('abc123')
  })

  it('stays generic while loading', () => {
    setupWithData('/invite/abc123', vi.fn(() => new Promise(() => {})))
    expect(screen.getByRole('heading', { name: 'Ingresar' })).toBeInTheDocument()
  })

  it('falls back to the generic login when the preview fails', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('invite_not_found'))
    setupWithData('/invite/abc123', fn)
    await waitFor(() => expect(fn).toHaveBeenCalled())
    expect(screen.getByRole('heading', { name: 'Ingresar' })).toBeInTheDocument()
    expect(screen.queryByText(/invite_not_found|Te invitaron a/)).not.toBeInTheDocument()
  })

  it.each([undefined, null, '', '/c/demo', '/', '//evil.com/invite/abc', 'https://evil.com/invite/abc', '/invite/', '/invite/%E0%A4%A'])(
    'does not request a preview for next=%j',
    async (next) => {
      const fn = vi.fn().mockResolvedValue(PREVIEW)
      setupWithData(next, fn)
      await Promise.resolve()
      expect(fn).not.toHaveBeenCalled()
      expect(screen.getByRole('heading', { name: 'Ingresar' })).toBeInTheDocument()
    },
  )

  it('extracts the code before a query string and decodes it', () => {
    expect(inviteCodeFromNext('/invite/ab%20c?x=1')).toBe('ab c')
    expect(inviteCodeFromNext('/invite/abc/extra')).toBe('abc')
  })
})
