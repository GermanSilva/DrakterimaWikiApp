export const DISPLAY_NAME_MAX = 80
export const AVATAR_URL_MAX = 500

export interface ProfileInput {
  display_name: string
  avatar_url: string | null
}

export type ProfileErrors = Partial<Record<'display_name' | 'avatar_url', string>>

/** Length in code points, like Postgres char_length (an emoji counts as 1). */
const length = (s: string) => [...s].length

function isHttpsUrl(value: string): boolean {
  if (/\s/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

/**
 * Same rules as the profiles CHECK constraints (migration 20261007120000_profile_caps): name 1-80
 * code points after trimming; avatar null or a parseable https URL (any scheme case) up to 500.
 * The database stays the authority; this only gives early, friendly messages.
 */
export function validateProfile(draft: { display_name: string; avatar_url: string }):
  | { ok: true; value: ProfileInput }
  | { ok: false; errors: ProfileErrors } {
  const errors: ProfileErrors = {}
  const display_name = draft.display_name.trim()
  const avatar = draft.avatar_url.trim()

  if (!display_name) errors.display_name = 'Ingresá un nombre para mostrar.'
  else if (length(display_name) > DISPLAY_NAME_MAX) {
    errors.display_name = `El nombre puede tener hasta ${DISPLAY_NAME_MAX} caracteres.`
  }

  if (avatar) {
    if (!isHttpsUrl(avatar)) errors.avatar_url = 'La URL del avatar debe ser una dirección https:// válida, sin usuario ni contraseña.'
    else if (length(avatar) > AVATAR_URL_MAX) {
      errors.avatar_url = `La URL del avatar puede tener hasta ${AVATAR_URL_MAX} caracteres.`
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { display_name, avatar_url: avatar || null } }
}
