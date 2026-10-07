import { randomBytes } from 'node:crypto'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { requestMagicLink } from '../../auth/authActions'
import { completeAuthCallback } from '../../auth/completeAuthCallback'
import { createProfileRepository } from '../profileRepository'
import { createSupabaseClient } from '../supabaseClient'
import { createAdminClient } from './testUsers'

const env = inject('supabase')
const ORIGIN = 'http://127.0.0.1:5173'

interface MailpitSearch {
  messages: { ID: string }[]
}
interface MailpitMessage {
  Text: string
  HTML: string
}

async function mailpit<T>(path: string): Promise<T> {
  const res = await fetch(`${env.mailUrl}${path}`)
  if (!res.ok) throw new Error(`Mailpit ${path} answered ${res.status}`)
  return (await res.json()) as T
}

const searchIds = async (email: string) =>
  (await mailpit<MailpitSearch>(`/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).messages.map((m) => m.ID)

async function waitForMessageIds(email: string, timeoutMs = 15000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const ids = await searchIds(email)
    if (ids.length > 0) return ids
    if (Date.now() > deadline) throw new Error(`No email for ${email} reached Mailpit within ${timeoutMs}ms`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

/** In-memory storage: the PKCE code verifier must survive between request and exchange (as localStorage does in a browser). */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

const newClient = () => createSupabaseClient(env.url, env.anonKey, { persistSession: true, autoRefreshToken: false, storage: memoryStorage() })

const historyStub = () => ({ state: null, replaceState: () => {} }) as unknown as History

describe('PKCE magic link sign-in against the local stack (GoTrue + Mailpit)', () => {
  const email = `h5-${randomBytes(4).toString('hex')}@h5.test`
  let userId = ''

  afterAll(async () => {
    const admin = createAdminClient(env)
    const failures: string[] = []
    if (!userId) {
      // Sign-in never completed but OTP may have created the user: generateLink returns the existing
      // user's id for an email (no mail is sent, no listUsers pagination involved).
      const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
      userId = data?.user?.id ?? ''
    }
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error && error.status !== 404 && !/not found/i.test(error.message)) failures.push(`delete user: ${error.message}`)
    }
    // Delete whatever mail exists for the unique address, even if the test died early
    // (the generateLink above sends nothing).
    try {
      const ids = await searchIds(email)
      if (ids.length > 0) {
        const del = await fetch(`${env.mailUrl}/api/v1/messages`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ IDs: ids }),
        })
        if (!del.ok) failures.push(`delete mail: ${del.status}`)
      }
    } catch (e) {
      failures.push(`delete mail: ${(e as Error).message}`)
    }
    if (failures.length > 0) throw new Error(failures.join('; '))
  })

  it('emails a link whose code only the requesting client can exchange, then creates the profile', async () => {
    const client = newClient()
    await requestMagicLink(client, email.toUpperCase(), ORIGIN)

    const ids = await waitForMessageIds(email)
    expect(ids).toHaveLength(1)
    const message = await mailpit<MailpitMessage>(`/api/v1/message/${ids[0]}`)
    const body = `${message.Text}\n${message.HTML}`.replace(/&amp;/g, '&')
    const link = body.match(/https?:\/\/[^\s"'<>]*\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0]
    expect(link, 'magic link in the email').toBeTruthy()

    // Follow the real link without following its redirect: PKCE answers with ?code= (no tokens).
    const res = await fetch(link!, { redirect: 'manual' })
    expect([302, 303]).toContain(res.status)
    const location = res.headers.get('location') ?? ''
    expect(location.startsWith(`${ORIGIN}/auth/callback?code=`)).toBe(true)
    expect(location).not.toContain('access_token')

    // A different client (another browser) cannot exchange it: no code verifier.
    const stranger = await completeAuthCallback(newClient(), { href: location, pathname: '/auth/callback' }, historyStub())
    expect(stranger.ok).toBe(false)

    // The requesting client completes the real callback logic.
    const result = await completeAuthCallback(client, { href: location, pathname: '/auth/callback' }, historyStub())
    expect(result).toEqual({ ok: true })
    const { data } = await client.auth.getSession()
    expect(data.session?.user.email).toBe(email)
    userId = data.session!.user.id

    // handle_new_user created the profile (display name from the email local part).
    const profile = await createProfileRepository(client).get(userId)
    expect(profile).toMatchObject({ id: userId, display_name: email.split('@')[0], avatar_url: null })
  })

  it('rejects a crafted #access_token callback URL without signing anyone in', async () => {
    const client = newClient()
    const result = await completeAuthCallback(
      client,
      { href: `${ORIGIN}/auth/callback#access_token=forged&refresh_token=forged&token_type=bearer`, pathname: '/auth/callback' },
      historyStub(),
    )
    expect(result.ok).toBe(false)
    const { data } = await client.auth.getSession()
    expect(data.session).toBeNull()
  })
})
