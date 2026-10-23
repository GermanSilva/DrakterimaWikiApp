import { useEffect } from 'react'

export const APP_NAME = 'RPG Quester'

/** "Part · Part · RPG Quester"; falsy parts are skipped. */
export function formatTitle(...parts: Array<string | null | undefined | false>): string {
  return [...parts.filter((part): part is string => !!part), APP_NAME].join(' · ')
}

/**
 * Title for the routes outside a campaign (`/c/*` sets its own in CampaignShell, `/legacy` is left
 * alone). Returns null when the route does not own the title.
 */
export function hubTitleForPath(pathname: string): string | null {
  if (pathname === '/c' || pathname.startsWith('/c/') || pathname.startsWith('/legacy')) return null
  if (pathname === '/login') return formatTitle('Iniciar sesión')
  if (pathname === '/auth/callback') return formatTitle('Iniciando sesión')
  if (pathname === '/') return formatTitle('Mis campañas')
  if (pathname === '/profile') return formatTitle('Perfil')
  if (pathname.startsWith('/invite/')) return formatTitle('Invitación')
  return formatTitle('Página no encontrada')
}

export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
