import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthCallback } from './AuthCallback'
import { completeAuthCallback } from './completeAuthCallback'
import { createFakeAuth, fakeSession } from './testing/fakeAuth'
import { userEvent } from './testing/userEvent'

const goto = (suffix: string) => window.history.replaceState({}, '', `/auth/callback${suffix}`)

beforeEach(() => goto(''))

describe('completeAuthCallback', () => {
  it('exchanges the PKCE code and clears it from the URL before the exchange resolves', async () => {
    const { client, auth } = createFakeAuth()
    let urlDuringExchange = ''
    auth.exchangeCodeForSession.mockImplementationOnce(async () => {
      urlDuringExchange = window.location.search + window.location.hash
      return { data: { session: fakeSession() }, error: null }
    })
    goto('?code=abc123#frag')
    await expect(completeAuthCallback(client)).resolves.toEqual({ ok: true })
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123')
    expect(urlDuringExchange).toBe('')
    expect(window.location.pathname).toBe('/auth/callback')
  })

  it('fails when the exchange errors (e.g. link opened in another browser)', async () => {
    const { client, auth } = createFakeAuth()
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'verifier not found' } })
    goto('?code=abc')
    const result = await completeAuthCallback(client)
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('mismo navegador') })
  })

  it('does not treat a pre-existing session as success when the code is invalid', async () => {
    const { client, auth } = createFakeAuth(fakeSession('other-user'))
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'expired' } })
    goto('?code=stale')
    expect((await completeAuthCallback(client)).ok).toBe(false)
    expect(auth.getSession).not.toHaveBeenCalled()
  })

  it('fails when the exchange throws', async () => {
    const { client, auth } = createFakeAuth()
    auth.exchangeCodeForSession.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    goto('?code=abc')
    expect((await completeAuthCallback(client)).ok).toBe(false)
  })

  it('reports provider errors from the query without exchanging, hiding server text, and clears the URL', async () => {
    const { client, auth } = createFakeAuth()
    goto('?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    const result = await completeAuthCallback(client)
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('venció') })
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('reads errors from the fragment and clears it', async () => {
    const { client } = createFakeAuth()
    goto('#error=server_error&error_description=boom%20internal')
    const result = await completeAuthCallback(client)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).not.toContain('boom')
    expect(window.location.hash).toBe('')
  })

  it('rejects a fragment carrying tokens: never signs in, wipes the URL', async () => {
    const { client, auth } = createFakeAuth()
    goto('?code=abc#access_token=evil&refresh_token=evil')
    const result = await completeAuthCallback(client)
    expect(result.ok).toBe(false)
    expect(auth.setSession).not.toHaveBeenCalled()
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('')
  })

  it('fails with no code', async () => {
    const { client } = createFakeAuth()
    expect((await completeAuthCallback(client)).ok).toBe(false)
  })
})

describe('AuthCallback', () => {
  it('calls onDone("/") after a successful exchange', async () => {
    const { client } = createFakeAuth()
    const onDone = vi.fn()
    goto('?code=abc')
    render(<AuthCallback client={client} onDone={onDone} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('/'))
  })

  it('shows the error and lets the user go back', async () => {
    const { client } = createFakeAuth()
    const onDone = vi.fn()
    goto('?error_description=expired')
    render(<AuthCallback client={client} onDone={onDone} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /volver/i }))
    expect(onDone).toHaveBeenCalledWith('/')
  })

  it('runs the exchange exactly once under StrictMode', async () => {
    const { client, auth } = createFakeAuth()
    const onDone = vi.fn()
    goto('?code=abc')
    render(
      <StrictMode>
        <AuthCallback client={client} onDone={onDone} />
      </StrictMode>,
    )
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('does not call onDone after unmount', async () => {
    const { client, auth } = createFakeAuth()
    let release: () => void = () => {}
    auth.exchangeCodeForSession.mockImplementationOnce(
      () => new Promise((r) => (release = () => r({ data: {}, error: null }))) as never,
    )
    const onDone = vi.fn()
    goto('?code=abc')
    const { unmount } = render(<AuthCallback client={client} onDone={onDone} />)
    unmount()
    release()
    await new Promise((r) => setTimeout(r, 0))
    expect(onDone).not.toHaveBeenCalled()
  })
})
