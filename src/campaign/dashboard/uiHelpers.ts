export const linkFocus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright'

/** A short date ("9 mar") for the news rows. */
export function shortDate(iso: string): string {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? '' : new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '')
}
