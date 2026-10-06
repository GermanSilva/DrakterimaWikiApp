# Feature: campaign-hub

Engram mirror: `odd/campaign-hub/tasks` (project `drakterimawikiapp`)
Branch: `feat/campaign-hub` (branch point `4b12d60`)

## Objective

Turn the single-campaign Drakterima wiki into a multi-campaign hub: users have one
global identity, can belong to several campaigns with a role per campaign (DM or
player), and can own characters in different campaigns. Data moves from Firebase
Firestore to Supabase (Postgres + Auth + RLS); the hub is deployed on Vercel.
The audit improvements (security, data integrity, architecture, performance) are
implemented as part of the same transition.

## Problem

- Access control is UI-only: passwords are baked into the public bundle
  (`VITE_*_PASSWORD`), sessions are forgeable `sessionStorage` flags, and secret /
  draft content is downloaded by every client and filtered client-side (`isVisible`).
- Identity is "player == PJ id"; exactly 6 players are hardcoded.
- Firestore paths, branding, regions and campaign-specific fields are global/hardcoded.
- `nextId()` (max+1 on client) races; `save()` overwrites whole docs; no routing /
  deep links; no tests, no lint; ~1 MB main bundle; duplicated sticky-title code.

## Why

The user wants a hub of campaigns where players can be in more than one campaign.
That requires real identity and server-side authorization; every other improvement
(routing, data layer, config-driven branding) is a prerequisite or rides along.

## Decisions (user-confirmed 2026-10-06)

- **Migration strategy:** migrate and coexist. The current GitHub Pages + Firestore
  app keeps running until cutover; a one-shot script imports the Firestore JSON
  export into Supabase as campaign "Drakterima".
- **Dev environment:** local Supabase stack (`supabase start`) — requires the user to
  install Docker Desktop. No remote Supabase/Vercel operations without explicit
  per-operation authorization.
- **Auth:** Supabase Auth with magic link + Google OAuth. Google credentials are
  created by the user before deploy; locally magic links land in the Supabase test inbox.
- **Stack:** Supabase (data, auth, realtime) + Vercel (hosting). React 18 + Vite stay.

## Technical approach (defaults, revisable in H3 design)

- Identity: `profiles` (1:1 `auth.users`), `campaigns`, `campaign_members(role)`,
  `campaign_invites`. Characters get `owner_id` (user) instead of identity-by-id.
- Visibility enforced by RLS: `estado` + `visible_to` (character ids) checked against
  the caller's membership and owned characters. DM-only fields (`notas`, `secreto`)
  move to a separate DM-only table/column set because RLS is row-level.
- Ids: Postgres identity columns (no client `nextId`). Drakterima ids are preserved on
  import so existing wiki-links `[[{3G}...]]` keep resolving within the campaign.
- Writes: explicit `create` / `update(patch)` — no whole-row overwrite gotcha.
- Realtime: per-page Supabase Realtime subscriptions (RLS-aware), no global
  subscribe-to-everything.
- Routing: URL routes `/c/:campaignSlug/...` with deep links; pages lazy-loaded.
- New data-layer modules in TypeScript (`allowJs`), existing JSX migrated opportunistically.
- Campaign config in DB: name, logo, accent color, regions, custom character fields
  (replaces hardcoded `magral/nezor/...` and `magralita`), game system flag (`dnd5e` only).

## Scope

In: everything listed in the checklist below.
Out (for now): non-5e game systems, Firebase removal before cutover, Phase 2 features
(selected later in H14 after a new analysis).

## Constraints

- Mutations from UI go through the data layer only (successor of `save/remove/savePlayerNote`).
- Existing GitHub Pages deploy (`main` → `deploy.yml`) must keep working until cutover.
- Remote operations (hosted Supabase, Vercel, Google Cloud) are user-authorized per operation.
- ~400 authored changed lines per task is a planning heuristic only.

## TDD / checks

- TDD mode: **off** — source: project CLAUDE.md ("No hay test runner configurado").
  Runner: none yet; H1 introduces Vitest (+ pgTAP via `supabase test db` in H3).
  Re-evaluate with the user once a runner exists.
- Applicable checks per task: `npm run build`, `npm run lint` (after H1),
  `npm test` (after H1), `supabase test db` (after H3, needs Docker).

## Delivery

- Strategy: `ask-on-risk` (default). Forecast: far above 400 authored lines
  (estimated 6–9k) → chain strategy: **feature-branch-chain** (user, 2026-10-06).
  All slice PRs target `feat/campaign-hub`; `main` is untouched until cutover so the
  GitHub Pages deploy keeps serving the current app.
- Slices: _to be recorded per PR_.

## Checklist

| ID | Task | Route | Status |
|----|------|-------|--------|
| H0 | Feature branch + this document + Engram mirror | inline | [x] |
| H1 | Tooling: ESLint, Vitest, TS config (`allowJs`), `npm run lint/test` scripts | inline | [ ] |
| H2 | `supabase init`, auth config (magic link, Google provider via env), `.env.example` | inline | [ ] |
| H3 | Schema + RLS migrations (identity, campaigns, members, invites, all entity tables, DM-private data, notes, read state, calendar, games, maps, session screen, homebrew) + pgTAP RLS tests | delegated (writer) | [ ] |
| H4 | Typed data layer: Supabase client, repositories (create/update/remove), realtime subscription hook, schemas | delegated (writer) | [ ] |
| H5 | Auth: provider, login page (magic link + Google), session, profile | delegated (writer) | [ ] |
| H6 | Router + hub shell: campaign list, `/c/:slug` layout, campaign context replacing App.jsx god-state, lazy pages | delegated (writer) | [ ] |
| H7 | Port wiki entity pages + forms to the data layer (sesiones, pnjs, lugares, facciones, lore, items) | delegated (writer) | [ ] |
| H8 | Port PJs (ownership, player self-edit), session screen, maps | delegated (writer) | [ ] |
| H9 | Port calendar, games, notes, homerules, unread state; DM zone → campaign settings | delegated (writer) | [ ] |
| H10 | Campaign management: create campaign, branding, regions, custom fields, invites, members/roles | delegated (writer) | [ ] |
| H11 | Refactors: `useStickyTitle`, split FormModal, error boundary + error toasts, a11y basics | delegated (writer) | [ ] |
| H12 | Firestore → Supabase import script (Drakterima campaign, id preservation, character claim via invites) | delegated (writer) | [ ] |
| H13 | Vercel config (SPA rewrites, env), docs (CLAUDE.md), cutover runbook | inline | [ ] |
| H14 | Cutover (user-owned remote steps) + Phase 2: deep feature analysis with approval stage | parent | [ ] |

## Acceptance criteria

- A user can sign in (magic link / Google), see their campaigns, and enter each one.
- One user can be DM in campaign A and player with a character in campaign B.
- A player never receives rows they cannot see (verified by pgTAP RLS tests),
  and never receives DM-private fields.
- Deep links work (`/c/:slug/pnjs/:id`), browser back works.
- Drakterima data imports with ids preserved; wiki-links resolve.
- Build, lint and tests pass; the app deploys on Vercel.

## Progress / evidence

- H0: branch `feat/campaign-hub` created from `4b12d60`; document created.

## Next step

Resolve delivery chain strategy, then H1.
