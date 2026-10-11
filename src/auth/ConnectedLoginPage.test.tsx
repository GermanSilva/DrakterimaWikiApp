import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthValue } from './AuthContext'
import { ConnectedLoginPage } from './ConnectedLoginPage'
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
