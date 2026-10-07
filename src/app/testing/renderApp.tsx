import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import type { AuthValue } from '../../auth/AuthContext'
import { AuthHost } from './AuthHost'
import type { CampaignWithRole, Profile } from '../../data'
import { DataContext } from '../DataContext'
import type { HubData } from '../hubData'
import { appRoutes } from '../routes'

export const ME = 'user-1'

export function makeCampaign(over: Partial<CampaignWithRole> = {}): CampaignWithRole {
  return {
    id: 'c1',
    slug: 'demo',
    name: 'Demo',
    system: 'dnd5e',
    branding: {},
    regions: [],
    character_custom_fields: [],
    settings: {},
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    role: 'dm',
    ...over,
  }
}

export const makeProfile = (over: Partial<Profile> = {}): Profile => ({
  id: ME,
  display_name: 'Ana',
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
})

export function makeAuth(over: Partial<AuthValue> = {}): AuthValue {
  return {
    status: 'signed_in',
    session: null,
    user: { id: ME, email: 'ana@test.co' } as AuthValue['user'],
    profile: makeProfile(),
    profileError: null,
    profileStatus: 'loaded',
    signInWithEmail: vi.fn(async () => undefined),
    signInWithGoogle: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    refreshProfile: vi.fn(async () => undefined),
    ...over,
  }
}

export function makeData(over: Partial<HubData> = {}): HubData {
  return {
    listMyCampaigns: vi.fn(async () => [makeCampaign()]),
    createCampaign: vi.fn(async (slug: string, name: string) => makeCampaign({ slug, name })),
    acceptInvite: vi.fn(async () => ({
      joined: true,
      claimed: false,
      campaign_id: 'c1',
      slug: 'demo',
      role: 'player' as const,
      character_id: null,
    })),
    listMyCharacterIds: vi.fn(async () => []),
    updateProfile: vi.fn(async (_id: string, patch) => makeProfile(patch as Partial<Profile>)),
    ...over,
  }
}

export interface RenderAppOptions {
  auth?: AuthValue
  data?: HubData
  routes?: RouteObject[]
  wrapper?: (children: ReactNode) => ReactNode
}

/** Renders the REAL route config in a memory router with injected auth and data. */
export function renderApp(path: string, options: RenderAppOptions = {}) {
  const auth = options.auth ?? makeAuth()
  const data = options.data ?? makeData()
  const router = createMemoryRouter(options.routes ?? appRoutes, { initialEntries: [path] })
  let setAuthValue: (next: AuthValue) => void = () => undefined
  const tree = (
    <AuthHost initial={auth} onReady={(set) => (setAuthValue = set)}>
      <DataContext.Provider value={data}>
        <RouterProvider router={router} />
      </DataContext.Provider>
    </AuthHost>
  )
  const utils = render(options.wrapper ? options.wrapper(tree) : tree)
  /** Replaces the auth value (call inside act when not already in one). */
  const setAuth = (next: AuthValue) => setAuthValue(next)
  return { router, auth, data, setAuth, ...utils }
}

export const here = (router: { state: { location: { pathname: string; search: string } } }) =>
  router.state.location.pathname + router.state.location.search
