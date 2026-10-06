import { PROFILE_COLUMNS, join } from './columns'
import { unwrap } from './errors'
import { fromTable } from './loose'
import type { Db } from './types'
import { throwZeroRows } from './zeroRows'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

const SELECT = join(PROFILE_COLUMNS)

export function createProfileRepository(client: Db) {
  return {
    async get(userId: string): Promise<Profile | null> {
      return unwrap<Profile | null>(await fromTable(client, 'profiles').select(SELECT).eq('id', userId).maybeSingle())
    },

    /** Own profile only (column grant: display_name, avatar_url). */
    async update(userId: string, patch: { display_name?: string; avatar_url?: string | null }): Promise<Profile> {
      const row = unwrap<Profile | null>(
        await fromTable(client, 'profiles').update(patch).eq('id', userId).select(SELECT).maybeSingle(),
      )
      if (!row) return throwZeroRows(client, 'profiles', { id: userId }, 'profile')
      return row
    },
  }
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>
