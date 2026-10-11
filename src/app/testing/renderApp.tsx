import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import type { AuthValue } from '../../auth/AuthContext'
import { AuthHost } from './AuthHost'
import { createDataLayer, type CampaignRequest, type CampaignWithRole, type Profile } from '../../data'
import { createFakeClient } from '../../data/testing/fakeClient'
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

export const makeRequest = (over: Partial<CampaignRequest> = {}): CampaignRequest => ({
  id: 1,
  requester_id: ME,
  name: 'Mi campaña',
  slug_wanted: 'mi-campania',
  message: null,
  status: 'pending',
  decision_note: null,
  decided_at: null,
  campaign_id: null,
  created_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  ...over,
})

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
    layer: createDataLayer(createFakeClient().db),
    listMyCampaigns: vi.fn(async () => [makeCampaign()]),
    createCampaign: vi.fn(async (slug: string, name: string) => makeCampaign({ slug, name })),
    isHubOwner: vi.fn(async () => false),
    listMyCampaignRequests: vi.fn(async () => []),
    createCampaignRequest: vi.fn(async (request) => makeRequest({ name: request.name, slug_wanted: request.slug_wanted ?? null, message: request.message ?? null })),
    cancelCampaignRequest: vi.fn(async () => true),
    listAllCampaignRequests: vi.fn(async () => []),
    approveCampaignRequest: vi.fn(async (_id: number, overrides?: { slug?: string }) => overrides?.slug ?? 'nueva'),
    rejectCampaignRequest: vi.fn(async () => undefined),
    previewInvite: vi.fn(async () => ({
      campaign_name: 'Demo',
      campaign_slug: 'demo',
      logo_url: null,
      role: 'player' as const,
      character_name: null,
      is_member: false,
      nothing_to_do: false,
    })),
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
