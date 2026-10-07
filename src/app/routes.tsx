import type { RouteObject } from 'react-router'
import { AuthCallbackRoute } from './AuthCallbackRoute'
import { LoginRoute } from './LoginRoute'
import { RequireAuthRoute } from './RequireAuthRoute'
import { LoadingScreen, RouteErrorScreen } from './RouteStatus'
import { RootLayout } from './RootLayout'

/*
 * Route map. Only the auth entry points are static; every other screen is a lazy chunk. The legacy
 * Firebase app is reachable ONLY through the dynamic import below: never import it (or anything
 * that imports it) statically from this module.
 */
export const appRoutes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorScreen />,
    HydrateFallback: () => <LoadingScreen />,
    children: [
      { path: 'login', element: <LoginRoute /> },
      { path: 'auth/callback', element: <AuthCallbackRoute /> },
      {
        element: <RequireAuthRoute />,
        children: [
          {
            lazy: async () => ({ Component: (await import('../hub/HubLayout')).HubLayout }),
            children: [
              { index: true, lazy: async () => ({ Component: (await import('../hub/HubHome')).HubHome }) },
              { path: 'invite/:code', lazy: async () => ({ Component: (await import('../hub/InvitePage')).InvitePage }) },
              { path: 'profile', lazy: async () => ({ Component: (await import('../hub/ProfilePage')).ProfilePage }) },
            ],
          },
          {
            path: 'c/:slug',
            lazy: async () => ({ Component: (await import('../campaign/CampaignLayout')).CampaignLayout }),
            children: [
              { index: true, lazy: async () => ({ Component: (await import('../campaign/CampaignDashboard')).CampaignDashboard }) },
              { path: ':section', lazy: async () => ({ Component: (await import('../campaign/SectionRoute')).SectionRoute }) },
              { path: ':section/:id', lazy: async () => ({ Component: (await import('../campaign/SectionRoute')).SectionRoute }) },
            ],
          },
        ],
      },
      { path: 'legacy/*', lazy: async () => ({ Component: (await import('./LegacyApp')).LegacyApp }) },
      { path: '*', lazy: async () => ({ Component: (await import('../hub/NotFoundPage')).NotFoundPage }) },
    ],
  },
]
