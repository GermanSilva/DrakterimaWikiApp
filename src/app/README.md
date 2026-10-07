# `src/app`: router and hub shell

Entry of the campaign hub (this branch; `main` still deploys the Firebase app until cutover).
`src/main.jsx` renders `ErrorBoundary > AuthProvider > HubDataProvider > RouterProvider(createAppRouter())`.

```
src/app/       routes.tsx (the route map), router.ts, RootLayout (skip link + focus), RequireAuthRoute, LoginRoute,
               AuthCallbackRoute, ConnectedUserMenu, safeNext.ts, hubData.ts + DataContext.ts + HubDataProvider.tsx
src/hub/       screens outside a campaign: HubLayout, HubHome (list + create + join), InvitePage, ProfilePage, NotFoundPage
src/campaign/  CampaignLayout (loader + context), CampaignShell/Header/Sidebar/Switcher, sections.ts, branding.ts
```

## Route map

| Path | Screen | Notes |
| --- | --- | --- |
| `/login` | `ConnectedLoginPage` | signed in: redirect to `?next=` if it is a safe same-origin path, else `/` |
| `/auth/callback` | `AuthCallback` | `onDone` navigates (replace) to `/` |
| `/` | `HubHome` | "Mis campañas", create campaign, join with a code |
| `/invite/:code` | `InvitePage` | accepts once, then `/c/:slug` (replace) |
| `/profile` | `ProfilePage` | H5 `ProfileForm` + `refreshProfile` |
| `/c/:slug` | `CampaignLayout` > `CampaignDashboard` | provides `CampaignContext` |
| `/c/:slug/:section`, `/c/:slug/:section/:id` | `SectionRoute` | looks up `SECTIONS`; unknown or DM-only-for-player: 404 inside the layout |
| `/legacy/*` | `LegacyApp` | the Firebase app, dynamic import only |
| `*` | `NotFoundPage` | |

Everything except the auth entry points is a lazy route (`lazy: () => import(...)`), so each screen is its own chunk.
`/`, `/invite/*`, `/profile` and `/c/*` sit under `RequireAuthRoute` (signed out: `/login?next=<current path>`).

Safety rules baked in:

- `safeNextPath` (`safeNext.ts`) accepts only a single-slash relative path: no scheme, no `//`, no backslash or control
  characters, same origin after resolving, never `/login` or `/auth/callback`. Anything else becomes `/`.
- The `:slug` param is only compared in JS against `listMyCampaigns` (already scoped by RLS); it never reaches a query.
  "Does not exist" and "not a member" are indistinguishable by design and share one screen.
- `:id` and `:code` are rendered as text / validated (`normalizeInviteCode`) before use.
- The legacy app must never be imported statically by `routes.tsx` (a test enforces it and checks it is not evaluated for
  hub routes). Build check: `rg -l "firebase|three|leaflet|firestore" dist/assets/index-*.js` must print nothing.
  Do not pass `import.meta.env` as a whole object anywhere in hub code: Vite would inline every `VITE_*` value into that chunk.

## Plugging a page into `SECTIONS` (H7-H9)

`src/campaign/sections.ts` is the single registry used by the sidebar, the dashboard links and the router:

```ts
{ key, label, path, group, icon, dmOnly?, Component }   // Component: ComponentType<{ section, id? }>
```

Every entry starts with the lazy `SectionPlaceholder`. To port a section, replace only its `Component`:

```ts
const Pnjs = lazy(() => import('../pages/PNJs'))   // default export taking { section, id }
section('pnjs', 'PNJs', 'Personajes', Users)       // then set Component: Pnjs (extend the helper or the entry)
```

The page reads campaign data with `useCampaign()` and the data hooks (`useCampaignTable`, repositories from `createDataLayer`).
`id` is the raw second URL segment (a string); parse it yourself. `dmOnly: true` hides the nav link AND makes the route
a 404 for players, but RLS stays the real boundary. Routes, nav, role gating and the dashboard need no other change.

### Ported pages (`src/campaign/sections/`)

Sesiones, PNJs (H7b), Lugares, Facciones, Lore and Items (H7c) are ported: list and detail share one component driven by the
URL (`/c/:slug/<section>` and `/c/:slug/<section>/:id`), with no local `selectedId`. Conventions:

- `EntitySectionRoute` (`EntitySectionRoute.tsx`) owns the route: `parseEntityRoute(id)` turns the raw segment into
  `list | detail(id) | invalid` (only `^[0-9]{1,15}$` is an id; an invalid segment renders "not found" and makes no request) and
  the detail gate (loading / load error with retry / not found or hidden draft). The view mounts only with a loaded entity and
  is keyed by id, so local state (lightbox) never leaks across entities and `useStickyTitle` mounts together with the h1.
  A page supplies only `List`, `View` and its Spanish labels.
- Shared pieces live in `EntityUi.tsx` (`EntityCard`, `DetailHeading`, `TextSection`, `DmBlock`, `DmDetailActions`, `HeroImage`,
  `RegionTag`, `EstadoTag`) and `format.ts` (`canSee`).
- Reads: `useEntities` / `useEntity` (shared realtime list), `useDmNotes` (DM only, only for an entity that exists),
  `useDmSecretIds` (DM list badges, PNJs only: no other legacy list shows a lock). Writes only through `useEntityForm().openForm` (DM only).
- DM-only fields per table (as the legacy forms): sesiones `ganchos`/`notas`, pnjs `secreto`/`notas`, lugares `notas`,
  facciones `secreto`/`notas`, lore `notas` ("Secretos DM"). Items have none, so the Items page never touches the DM tables.
- List filters live in the URL (`?rel=`, `?q=`, `?tipo=`, `?region=`, `?cat=`) and are kept by card links, "← Volver" and
  browser back; an unknown value reads as "Todos". Sesiones prev/next walk the timeline inside the active `?tipo=` filter
  (and keep the query); a row outside the filter has no neighbours.
- Items use the same inline URL-driven detail as the others (the legacy Items page was already inline; `DetailPanel` has no
  views registered), which gives deep links.
- Players never get DM-only blocks or tags of drafts; `borrador` rows that reach a non-DM client are dropped (RLS is the real boundary).
- Region labels/colors come from `campaign.regions` (`useRegionInfo`, filter pills from `useRegionOptions`), falling back to the legacy names.

### Characters (`PJsPage.tsx`, H8a)

`/c/:slug/pjs[/:id]` reuses the legacy sheet (`pages/pj/PJDetail`, `PJCardContent`, the detail sections and `PJForm` + tabs),
which now read only ports: `UnreadPort` (per-section dots, `section` argument), `FormPort` / `FormActions` (regions, owned
characters, campaign character fields) and props for what differs (back link, buttons, DM notes text, region tag).

- **Who edits what.** DM: everything (all tabs, coins `monedas` / `monedas_guardado`, level, XP, estado, visibility, DM notes,
  delete). The owner of a character (`myCharacterIds`) gets an "Editar" button and the identity-only form (one tab, no level / XP /
  notes / visibility / delete / coins). Other players: read-only. `EntityFormProvider.openForm` refuses anything else.
- **Owner payload.** `pjOwnerFields.ts` lists the columns and `data` keys `guard_pj_player_update()` allows (`pjOwnerFields.test.ts`
  compares them with the migration); the host sends `pickOwnerPatch(changes)` only, never DM notes or visibility, so a form bug
  cannot become a rejected save. Anything else is rejected by the database with 42501 (`pjs.integration.test.ts`).
- **What counts as an edit.** The host diffs the form payload against the payload of the form's *initial* state
  (`pjFormState.ts`), so defaults the row lacks (`stat_hp_current` seeded from `stat_hp`, ...) are never written.
- **Unread per section.** Every save stamps `sections_updated[section]` (via `changedPjSections`; a jsonb column merged per key
  keeping the LATER stamp, allowed for owners) and clears the saver's own dots in `read_state`; the sheet marks `general` on open
  and a section when its nav button is used or it stays mostly visible for 1.5 s. `sections_updated` is readable by every member,
  so the hub never writes a `dm` stamp (nor one for a visibility-only change): the DM-notes dot is derived from the DM-only
  `entity_dm_notes.updated_at`. Migration `20261007140000_pj_owner_hardening.sql` makes the guard reject, for non-DM writers,
  unknown section keys, non-ISO / future (> now + 5 min) stamps, stamps going back or keys disappearing, and a `custom_fields`
  that is not a small (8 KB) object of strings.
- **Derived defaults.** When `stat_hp` changes in a save, `stat_hp_current` is written explicitly (its seeded default derives from it).
- **Legacy form change.** The legacy `PJForm` no longer carries the dead player-password UI (access is now Auth / magic link).
- **Visibility.** The page shows an owner their own draft character (RLS lets them read it); other drafts are dropped for players.
- **Campaign character fields** (`campaigns.character_custom_fields`, `[{ key, label }]`) replace the legacy `magralita` field:
  values live in `data.custom_fields[key]`, are edited as text and merged with the keys the form does not know.

## `CampaignContext` contract

`useCampaign()` (only inside `/c/:slug`, after the campaign loaded) returns:

```ts
{
  campaign: Campaign          // row from H4 (branding, regions, settings, ...)
  role: 'dm' | 'player'       // my membership in THIS campaign
  isDM: boolean               // role === 'dm'
  myCharacterIds: number[]    // pjs.owner_id === me (client-side filter over the visible pjs)
  reload: () => void          // re-reads campaign/role/characters (e.g. after editing branding)
}
```

Loading, "campaign not available" and error screens are rendered by `CampaignLayout`, so consumers can assume a value.

## Branding

`branding.accent_color` is applied only when it is exactly `#rrggbb`; the shell sets `--accent` plus RGB triplets
(`--accent-rgb`, `--accent-bright-rgb`, `--accent-dim-rgb`, `--accent-subtle-rgb`), all rebuilt from parsed integers
(never copied from the stored string). `tailwind.config.js` maps `accent*` to those triplets, defaults live in
`src/styles.css`, so the legacy app is visually unchanged. `branding.logo_url` is used only for an absolute `https:` URL,
otherwise the default dragon icon is shown.

## Accessibility

One `h1` per screen, a "Saltar al contenido" skip link (`#main-content`), `NavLink` gives `aria-current="page"`, and
`RootLayout` moves focus to the main `h1` (or the `main` landmark when the heading is not rendered yet, e.g. while a lazy
section loads) after every client-side navigation except the first load.

## Deploy

`vite.config.js` uses `base: '/'`. `vercel.json` rewrites every non-asset path to `/index.html` (SPA fallback for deep links).
Cutover (H13): `deploy.yml` still publishes to GitHub Pages under `/DrakterimaWikiApp/` and is deliberately untouched; the target host is Vercel.

## Tests

`npm test`. `src/app/testing/renderApp.tsx` renders the REAL `appRoutes` in a `createMemoryRouter` with a fake `AuthValue`
and a fake `HubData`; `AuthHost` lets a test flip the auth status (e.g. on sign out).

## Hardening notes

- **Missing configuration:** `ConfigGate` (in `main.jsx`, outside `AuthProvider`) shows "Falta configurar Supabase" naming
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (names only, never values) and pointing at `supabase status`. It gates the
  whole app, including `/legacy`.
- **Chunk load errors:** `RouteErrorScreen` reloads once (sessionStorage guard, 60 s window) when a lazy import fails
  (stale chunk after a deploy); a repeated failure or any other error shows the error screen.
- **`next` validation** is re-run after URL normalisation (`/.//evil.com`, `/a/..//evil.com`, `%2e` and `%5C` variants are refused).
- **Focus:** after navigation the page `h1` is focused; when a lazy section is still loading the `main` landmark is focused and
  the heading is focused once it appears, only if focus is still on the landmark/body. Loading screens mark their `h1`
  with `data-loading` so they are skipped.
- **Headers:** `vercel.json` sets `Referrer-Policy` (`no-referrer` on `/invite/*`, `strict-origin-when-cross-origin` elsewhere),
  `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. A full CSP is NOT in place yet (cutover/H13 item).
- **Accepted for now:** a DM-provided https logo (and avatar URLs) are fetched by every member's browser, so the logo host
  sees member IPs. `referrerPolicy="no-referrer"` is kept on those images; proxying or uploading images is out of scope.
- **Hosting:** the plan is Vercel. `vite.config.js` `base: '/'` and `.github/workflows/deploy.yml` (GitHub Pages under
  `/DrakterimaWikiApp/`) are intentionally left as they are; retiring GitHub Pages is part of cutover (H13).
