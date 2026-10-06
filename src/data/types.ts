import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type Db = SupabaseClient<Database>

/**
 * Flat UI entity: promoted columns and the keys of `data` live side by side (the Firestore-like
 * shape the UI uses today). Server-managed fields (`created_at`, `updated_at`, `created_by`) are
 * readable but are dropped when writing.
 */
export interface FlatEntity {
  id: number
  campaign_id: string
  created_at?: string
  updated_at?: string
  created_by?: string | null
  [key: string]: unknown
}

export type Coins = { cp: number; sp: number; ep: number; gp: number; pp: number }
