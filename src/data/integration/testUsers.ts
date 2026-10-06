import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import type { Database } from '../database.types'
import type { LocalSupabase } from './globalSetup'
import type { Db } from '../types'

export interface TestUser {
  id: string
  email: string
  client: Db
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

export function createAdminClient(env: LocalSupabase) {
  return createClient<Database>(env.url, env.serviceKey, noSession)
}

/** Creates a confirmed throwaway user (service role, local stack only) and signs in as it with the anon key. */
export async function createTestUser(env: LocalSupabase, label: string): Promise<TestUser> {
  const admin = createAdminClient(env)
  const email = `${label}-${randomBytes(4).toString('hex')}@h4.test`
  const password = randomBytes(16).toString('hex')
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  const client = createClient<Database>(env.url, env.anonKey, noSession)
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`)
  return { id: data.user.id, email, client }
}
