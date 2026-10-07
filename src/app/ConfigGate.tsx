import type { ReactNode } from 'react'
import { MissingConfigScreen } from './MissingConfigScreen'
import { missingSupabaseEnv } from './supabaseConfig'

export interface ConfigGateProps {
  children: ReactNode
  /** Defaults to the real environment; tests inject a list. */
  missing?: string[]
}

/** Renders the app only when Supabase is configured, so AuthProvider never builds a client without it. */
export function ConfigGate({ children, missing = missingSupabaseEnv() }: ConfigGateProps) {
  if (missing.length > 0) return <MissingConfigScreen missing={missing} />
  return <>{children}</>
}
