export const SUPABASE_ENV_VARS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const

/**
 * Names of the required Supabase variables that are unset or blank. Reads the two keys one by
 * one (never the whole import.meta.env object, which Vite would inline in full) and returns
 * names only, never values.
 */
export function missingSupabaseEnv(
  env: Record<string, unknown> = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
): string[] {
  return SUPABASE_ENV_VARS.filter((name) => {
    const value = env[name]
    return typeof value !== 'string' || value.trim() === ''
  })
}
