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
| H1 | Tooling: ESLint, Vitest, TS config (`allowJs`), `npm run lint/test` scripts | delegated (writer; 2+ non-trivial files) | [x] |
| H2 | `supabase init`, auth config (magic link, Google provider via env), `.env.example` | inline (1 mechanical file) | [x] (env example deferred, see progress) |
| H3 | Schema + RLS migrations (identity, campaigns, members, invites, all entity tables, DM-private data, notes, read state, calendar, games, maps, session screen, homebrew) + pgTAP RLS tests | delegated (writer; 2+ non-trivial files) | [x] |
| H3b | Hide `visible_to` from players: column-level SELECT excludes it; DM reads it through a DM-only RPCs; pgTAP proves players get 42501 and local Realtime `apply_rls` strips it | delegated (writer) | [x] |
| H11b | Modal close safety: shared `useBackdropClose` (close only when pointer-down AND click both land on the backdrop), applied to every modal backdrop; visible close button in every modal; tests | delegated (writer) | [x] |
| H4 | Typed data layer: Supabase client, repositories (create/update/remove), realtime subscription hook, schemas | delegated (writer) | [x] |
| H4b | Fix native review warnings on H4 (paging, zero-row diagnosis, base-guarded updates, hook reload/buffering, integration teardown, safe db:types) | delegated (writer) | [x] |
| H5 | Auth: provider, login page (magic link + Google), session, profile | delegated (writer) | [x] |
| H5b | Fix H5 native review warnings (callback error classification, probe timeout, provider read ordering, login/callback timeouts, fail-closed guard) | delegated (writer) | [x] |
| H6 | Router + hub shell: campaign list, `/c/:slug` layout, campaign context replacing App.jsx god-state, lazy pages | delegated (writer) | [x] |
| H7a | Port infrastructure: per-entity data hooks (realtime list + actions incl. DM notes and visibility RPCs), campaign wiki-link index, data-agnostic shared components (WikiText/links, forms, unread, player notes) via injected adapters (legacy adapter keeps /legacy working), entity form host | delegated (writer) | [x] |
| H7b | Port Sesiones + PNJs pages (list + detail via URL, forms, visibility, DM notes, unread, player notes) | delegated (writer) | [x] |
| H7c | Port Lugares, Facciones, Lore, Items pages | delegated (writer) | [x] |
| H8a | Port PJs (list, detail with mechanics/inventory/spells/attacks/resources tabs, ownership; player self-edit of identity fields within the DB guard; DM full edit; coins via RPC/DM only) | delegated (writer) | [x] |
| H8b | Port DM session screen (cards layout in campaign_config session_screen, combat tracker, homebrew rules card, per-PJ cards, edit modal) | delegated (writer) | [x] |
| H8c | Port maps (mapas + map_points with Leaflet, click-to-place, pin visibility, hierarchical navigation) | delegated (writer) | [x] |
| H9 | Port calendar, games, notes, homerules, unread state; DM zone → campaign settings (split below; mapper report 2026-10-07) | delegated (writer) | [ ] |
| H9a | Infra (generic TableStore specs: disponibilidad/game_pot, hooks, fakeLayer extensions) + HomerulesPage (template ItemsPage) | delegated (writer) | [x] |
| H9b1 | Availability per player: migration `player_availability` (user_id, campaign_id nullable = general), RLS, busy-from-confirmed-sessions RPC, realtime, pgTAP, repository + types + TableStore spec | delegated (writer) | [x] |
| H9b2 | Calendar UI: CalendarioPage + day modal + availability form (general vs campaign-specific, DM own unavailability), generic member colors, busy days disabled, unread dots | delegated (writer) | [x] |
| H9c | Notes: PlayerNotesPort.all() (+legacy/hub adapters), NotasPage (search syntax, DM grouping by character) | delegated (writer) | [x] |
| H9d | Games: JuegosPage (config/pot/own log, owned-PJ selector, UTC-day messaging), Dice3D target roll, coins helpers | delegated (writer) | [x] |
| H9e | Ajustes: games config, pot transfer, log management, session-screen link; extensible container for H10 | delegated (writer) | [x] |
| H9f | Unread sweep + browser check (DM and player1) + adversarial sweep | delegated + parent | [ ] |
| H10 | Campaign management: create campaign, branding, regions, custom fields, invites, members/roles | delegated (writer) | [ ] |
| H11 | Refactors: `useStickyTitle`, split FormModal, error boundary + error toasts, a11y basics | delegated (writer; 2+ non-trivial files) | [x] |
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

- H0: branch `feat/campaign-hub` created from `4b12d60`; document created. Commit `ebae344`.
  Review assess: passive (no review); boundary → `ebae344`.
- H1: commits `c4cd3ea` (tooling) + `553da09` (keep `rules-of-hooks` as error, from
  review advisory). Checks: `npm run lint` 0 errors / 59 warnings (pre-existing code),
  `npm run typecheck` pass, `npm test` 5/5 pass (re-run by parent), `npm run build` pass.
  vitest pinned ^3 (v5 incompatible with vite 5). Native review on `c4cd3ea`: medium,
  **granted** → lens reliability → **approved**, acknowledged (lineage
  `review-68da3125b8e3da0b`, burned); boundary → `c4cd3ea`. `553da09`: medium,
  under_budget (pending in slice). Advisory follow-ups (non-blocking): broad
  `^[A-Z_]` unused-vars ignore (consider eslint-plugin-react jsx-uses-vars);
  `isVisible` tests lack string-vs-number id / unknown-estado cases (moot after RLS rewrite).

- H2: commit `f60744d`. `supabase init`; `site_url` = `http://localhost:5173`, redirect
  `/auth/callback` (localhost + 127.0.0.1); email magic link on (CLI default); Google
  provider block present but `enabled = false` until credentials exist
  (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` in `supabase/.env`, now gitignored).
  Adversarial sweep: inline self-check (found `supabase/.env` not ignored → fixed).
  `.env.example` could not be read (permission-protected) → env vars documented in H13
  runbook instead: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  Native review on slice `c4cd3ea..f60744d`: medium, granted → approved, acknowledged
  (lineage `review-984a98ae4b0fb96a`, burned); boundary → `f60744d`.
  Carried into H3: add `supabase/seed.sql` (config seeds it); document Google env vars.
- Stop-hook review of the whole branch `4b12d60..8322a47` (user granted): approved,
  acknowledged (lineage `review-3e6d2b2a66b1a959`, burned). New advisory carried into
  H3: eslint preset downgrade misses array-form severities (`['error', {...}]`).

- H3 (draft, written while Docker was unavailable): 3 migrations
  (`supabase/migrations/20261006120000_campaign_hub_core.sql`, `..._entities.sql`,
  `..._security.sql`), `supabase/seed.sql`, 3 pgTAP files (135 assertions). 21 tables, RLS
  on all; RPCs `create_campaign`, `accept_invite`, `play_loteria`,
  `assign_pot_to_character`. Design: `campaign_config(key, value, visibility)` for
  loteria/session_screen; DM-only fields in `entity_dm_notes`; type-specific fields in
  `data jsonb`, filter/sort fields promoted; coins in `pjs.monedas` /
  `pjs.monedas_guardado` columns; player PJ edits limited to identity fields by
  `guard_pj_player_update`; `login_logs` dropped; ids global per table (single Firestore
  import; future imports remap). eslint array-form downgrade fixed.
  Adversarial sweep (independent read-only reviewer): no critical hole; 20 findings, all
  actionable ones applied (map_points leak via hidden map, invite PJ-claim race, last-DM
  lock + explicit account-deletion block, safe coin parsing + pot upsert, coins out of
  `data`, entity_dm_notes out of realtime, campaign cap + reserved slugs, DM invites
  single-use + 7d expiry, player_notes character check, immutable id/created_by,
  handle_new_user caps, accept_invite return shape, default EXECUTE revoke, vacuous test
  fixed, new tests).
  Verified with Docker (2026-10-06): `supabase start` applied all 3 migrations + seed;
  first `supabase test db` 133/135 → fixed `accept_invite` check order (expired/exhausted
  now validated before the character-claimed check, so a dead code never reveals PJ
  ownership) and a stale invite-count test → `supabase db reset` + `supabase test db`:
  **135/135 PASS**. Magic link for seeded `dm@example.test`: OTP 200, mail in Mailpit.
  Open questions for the user: players can read `visible_to`; lottery roll is now
  server-side (Dice3D animates to returned roll); no `delete_campaign` / add-member RPC;
  sole-DM account deletion blocked by default (product default chosen by parent).

- H3 native review (slice `e07839f..2633720`): high, granted (standing consent), 4 lenses
  (risk, resilience, readability, reliability) → **approved**, acknowledged (lineage
  `review-b35867619efc736b`, burned); boundary → `2633720`. Advisory follow-ups applied in the
  next commit: DM invite expiry clamped to created_at + 7 days (insert and update, +2 pgTAP),
  stale DRAFT headers refreshed, task-doc mojibake repaired (cause: PowerShell 5.1
  `Get-Content` read UTF-8 as cp1252 — edit docs with UTF-8-safe tools only).
  `supabase test db`: **137/137 PASS**.
- H11 (uncommitted, working tree): useStickyTitle (9 copies replaced), useDialogFocus,
  a11y `clickable()`, ErrorBoundary (app + per-page), error toasts on mutations, FormModal
  split into `src/components/forms/*` (643 → ~140 lines), dialog roles/labels, icon
  aria-labels. Writer checks: lint 0 errors / 60 warnings, typecheck clean, build OK,
  one full `npm test` run 17/17 green BEFORE two last small edits. Pending: re-run
  `npm test` (machine out of virtual memory: vitest V8 OOM, git 0xC000012D), adversarial
  sweep, commit, review. Behaviour changes to confirm: failed save keeps form open;
  FormModal focuses first field on open (mobile keyboard).
  Closed: `npm test` 17/17 on final code; adversarial sweep (independent read-only) confirmed
  the FormModal split is behaviour-equivalent and found 4 issues, all fixed inline: error
  toast hidden under the form overlay (z 999 → 1100), ConfirmModal autofocused "Eliminar"
  (now "Cancelar" via `data-autofocus`), read_state failure after a successful save invited a
  duplicating retry (now logged only), ErrorBoundary retry could not recover from a failed
  lazy chunk (now reloads). Checks: lint 0 errors / 60 warnings, typecheck clean, test 17/17,
  build OK.


- H11 native review (slice `c2a5f4e..cf25799`): medium, granted → reliability lens → **approved**,
  acknowledged (lineage `review-43f258300d290b6c`, burned); boundary → `cf25799`. R3-001 (showToast not
  in context) verified false: exposed at App.jsx ctx. Test gaps carried into H4: save/remove failure
  behaviour (new data layer), ErrorBoundary chunk-reload branch, useDialogFocus preferred selector.
- Stop-hook whole-branch candidate (`4b12d60..cf25799`, 8457 lines): START → terminal
  `lens_context_budget_exceeded` (no authority created). Covered by the approved slice reviews
  (H1, H1-H2, H3, H11); no further action.

- H3b: new migration `20261006130000_hide_visible_to.sql` + `04_visible_to_privacy.test.sql`. On the 10
  entity tables, authenticated has column-level SELECT/INSERT/UPDATE on every column except
  `visible_to` (table-level grants revoked). DM-only SECURITY DEFINER RPCs: `get_entity_visibility`
  (read, max 1000 ids) and `set_entity_visibility` (write; same 42501 `dm_only` for not-DM and
  missing row; validates ids are PJs of the same campaign). `can_see_map` helper for the map_points
  policy. Default privileges revoke all on future tables/sequences from anon/authenticated.
  Client contract (for H4): no `select *` / `returning *`, never send `visible_to` in
  insert/update/upsert; use the RPCs. Realtime: local `realtime.apply_rls` honors
  `has_column_privilege` → `visible_to` stripped from payloads (recheck on hosted project at cutover).
  Adversarial sweep: no severe leak; fixed an owner equal-value UPDATE oracle on own
  `pjs.visible_to` (now privilege-denied for any value), discriminating test messages, RPC cap,
  default privileges. Checks: `supabase test db` **192/192 PASS** (re-run by parent), lint 0 errors.
  Native review (`85052bd..116169e`): medium, granted → reliability → **approved**, acknowledged
  (lineage `review-b33c5b9b3691b851`, burned). Follow-up tests added: DM writes pjs/mapas visibility
  through the RPC (guard + map_points effect), observable `realtime.apply_rls` call proving the UPDATE
  payload has no `visible_to` (local server only; recheck hosted), `pg_default_acl` closed.
  `supabase test db` **205/205 PASS**.

- H11b: `useBackdropClose` (close only if pointerdown AND pointerup AND click are on the backdrop;
  pointercancel resets) applied to 11 modals (AccessModal, DetailPanel, DisponibilidadDayModal,
  FormModal via `requestClose()` keeping discard-confirm, ImageLightbox, WikiLinkPicker,
  SessionCardPicker, SessionEditModal, SpellDetailModal, Notas detail + confirm); visible "Cerrar"
  button added where missing (FormModal header / sticky for PJ forms, ImageLightbox,
  WikiLinkPicker, SessionCardPicker). Skipped: MapPopup (popover, has ✕), mobile sidebar scrim.
  Adversarial sweep: nothing severe; fixed press-on-backdrop/release-inside still closing
  (onPointerUp) and stale flag after pointercancel (+3 tests). Checks: lint 0 errors / 60
  warnings, typecheck clean, test 29/29, build OK. Visual check pending: PJ-form × overlaps
  PJForm sticky header corner.

- H4: typed data layer in `src/data/` (additive; UI not wired yet). Generated `database.types.ts`
  (`npm run db:types`), lazy injectable client, explicit column lists, row⇄flat mappers (data keys
  spread; legacy/DM keys stripped both ways; `''`→null for nullable columns), repositories per table
  + RPCs, `saveEntityWithDmNotes` helper (entity create/update reject DM fields), paged lists
  (`.range()`, cap 20k), `DataError` kinds + stable `reason` codes, zero-row disambiguation
  (permission vs not_found), `written_not_visible`, optimistic lock on `updated_at` for `data` and
  whole-object jsonb columns (server data always re-read; base only supplies the version),
  `useCampaignTable` (re-list on every SUBSCRIBED, buffered events, UPDATE merge, error statuses).
  Integration tests (`npm run test:integration`, local stack, service key read at runtime only).
  Adversarial sweep: no contract break; fixed partial-realtime-row data wipe, join/reconnect gaps,
  `''` constraint errors, silent DM-note drop, error-kind ambiguity, PGRST116-after-write, zero-row
  misclassification, jsonb lost updates, 1000-row truncation, legacy key leak; parent fixed a
  flaky integration assertion (lottery writes read_state on a win). Carried test gaps closed
  (ErrorBoundary chunk reload, useDialogFocus preferred, FormModal discard-confirm).
  Checks: lint 0 errors / 60 warnings, typecheck clean, test 130/130, integration 11/11 (×3 writer,
  ×2 parent), build OK.

- H4 native review: the 5092-line slice exceeded the lens context budget, so H4 was split into 6
  layered commits (e1963cc deps+types, 4acf202 core, 71cab26 entity, 1217b20 repositories, 5f72545
  realtime, 0d5f5e6 integration+docs) and each was reviewed at its own commit (detached checkout):
  all **approved** and acknowledged (lineages review-48147b4d6eedf4fb, review-7187815cc3fa5082,
  review-417380ed6783cac2, review-9e57e4300fbd6438, review-1cefbc6608691d73, review-44185a35b33d48be;
  the last one high-risk with 4 lenses). Real warnings fixed in H4b.
- H4b: pagedList stops only on an empty page with an exact cap; zeroRows empty-match guard; base
  always guards updates (plain columns too) with conflict/permission/not_found diagnosis;
  dmNotes.remove zero-row check; getVisibility chunks by 1000; hook reload status + single buffer +
  overflow restart (5000) + no partial UPDATE insert before the first list; idempotent integration
  teardown, globalSetup timeout, split tests, realtime probe warm-up; `scripts/gen-db-types.mjs` (never
  truncates on failure, no temp leftovers). Adversarial sweep: nothing severe; parent fixed the partial
  UPDATE insert, buffer growth, script temp dir, contract comments (+2 tests). Checks: lint 0 errors,
  typecheck clean, test 154/154, integration 14/14 (×5 writer, ×4 parent), build OK, `db:types`
  regenerates with no diff.

- H4b native review (`0d5f5e6..ec010e0`): high, 4 lenses → **approved**, acknowledged (lineage
  review-7e49d113eb36c2dc). Follow-ups fixed by parent: `dmNotes.remove` idempotent (already gone =
  success, still present = permission), failed-load replay skips merging partial UPDATEs, overflow
  test proves the invalidated load is discarded, script fallback message, JSDoc placement, test
  title, watermark comment, unused `drained()` removed. Checks: test 155/155, integration 14/14,
  lint 0 errors, typecheck clean. Accepted trade-offs (documented): one extra empty-page request per
  list; a hung list() keeps buffering (bounded at 5000, then restarts) — no request timeout yet.

- H5: `src/auth/` (AuthProvider/useAuth with profileStatus, magic link + Google with a disabled-provider
  probe, AuthCallback, LoginPage, UserMenu, ProfileForm, RequireAuth), additive (not wired until H6).
  **PKCE** (user decision 2026-10-07): client `flowType: pkce`, `detectSessionInUrl: false`;
  `completeAuthCallback` is the single URL owner (replaceState before exchange), rejects
  `#access_token` fragments (no login CSRF), ok only when THIS exchange yields a session. Magic
  link must be opened in the same browser. signOut scope local. DB: migration
  `20261007120000_profile_caps.sql` (display_name 1..80 code points, avatar https ≤500 no
  whitespace; handle_new_user fallback) + pgTAP `05_profile_caps`. Integration: real magic link via
  Mailpit → 302 `/auth/callback?code=` → PKCE exchange with the requesting client; forged fragment
  rejected. Adversarial sweep: fixed client-only profile caps, implicit-flow token/CSRF exposure,
  global sign-out, code-unit length counting, URL validation, unhandled refreshProfile rejection,
  stale profile flash, callback success with a pre-existing session, raw error rendering, teardown
  gaps. **Cutover TODO (F5):** open signup without captcha → captcha + SMTP limits + optional
  invite gate before production. Checks: supabase test db 218/218, test 235/235, integration
  16/16 ×2, lint 0 errors, typecheck clean, build OK.

- H5 native reviews (5 layered commits a70db7e..b5f00dc): slice 1 under budget; slices 2-5 high, 4 lenses
  each → **approved**, acknowledged (review-105adbec00cdee98, review-61abcda958a8401f,
  review-8134548eeccc123f, review-8ba98093010c1195). Warnings fixed in H5b.
- H5b: callback errors classified (network / wrong browser / expired / rate-limited / cancelled /
  generic) with sanitized logging; Google probe 5s abort + OAuth-specific classifier; fetch-only
  network detection; PKCE invariants spread last + tested; AuthProvider read tickets + sign-in
  generation; LoginPage in-flight guard, attempt counter, redirecting phase, pageshow/10s reset after
  hand-off; AuthCallback 15s timeout, single onDone, late success ignored after timeout;
  ProfileForm onSaved isolated; RequireAuth fail-closed; integration assertLocal via URL hostname.
  Adversarial sweep x2 (no severe; fixed double OAuth flow, 422/429 mapping, provider error
  messages, callback idempotency). Checks: test 289/289, integration 16/16 x2, lint 0 errors,
  typecheck clean, build OK.

- H5b native reviews (85ec1ef, 138a3ef, 929ee46): high, 4 lenses each → **approved**, acknowledged
  (review-c03a5841d32767f7, review-ea8badfc0f16f73e, review-b24318a53c175dd7). Final batch: one shared
  exchange-error classifier for returned and thrown errors + single `isRateLimited`; pageshow/10s resets
  invalidate pending Google attempts; late success after the callback timeout shows "Ya iniciaste
  sesión" + Continuar; descriptive test names, shared `deferred` helper; README taxonomy aligned.
  Checks: test 292/292, integration 16/16, lint 0 errors, typecheck clean, build OK. Remaining review
  suggestions tracked as follow-ups (not blocking): refresh superseding initial load can end in error
  until retried; hung onGoogle has no timeout; integration timeout constant coupling.

- Review of 508bc99 (high, 4 lenses) → **approved** (review-0105cd89ba68e4ec). Parent fixed its warning: a
  late Google failure of an attempt abandoned by a reset is now shown when no newer attempt started and
  the page is idle (late resolves stay ignored); +2 tests, outdated opposite test removed. test 293/293.

- H6: react-router v7 data router; lazy routes; `/login` (safe `next`, re-validated after normalization),
  `/auth/callback`, protected `/` (Mis campañas: list with roles, create campaign, join with code),
  `/invite/:code`, `/profile`, `/c/:slug` (CampaignContext {campaign, role, isDM, myCharacterIds}, branding
  with strict #rrggbb accent + https logo, sidebar SECTIONS registry, DM-only Ajustes, switcher),
  `/c/:slug/:section/:id` placeholders for H7-H9, `/legacy/*` lazy Firebase app, 404. ConfigGate shows
  "Falta configurar Supabase" when env is missing. vercel.json SPA rewrite + security headers
  (no CSP yet). `base: /` (GitHub Pages retirement is a cutover item). Fixed H5 env leak
  (`import.meta.env` whole-object inlined Firebase secrets into the entry chunk). Entry chunk free of
  firebase/three/leaflet/secrets. Adversarial sweep: fixed SEVERE `next` open redirect via
  dot-segments (verified by parent), invalid vercel.json, chunk-load auto-reload in route errors,
  focus after lazy load, per-user campaign list. Real-browser check (parent): magic link PKCE login,
  Mis campañas with DM/Jugador roles, /c/:slug nav (DM sees Ajustes), player 404 on /ajustes, deep
  link placeholder, open-redirect payload lands on /. Checks: test 436/436, integration 16/16, lint 0
  errors, typecheck clean, build OK.

- H6 native reviews (5 slices 1f5aeb9..a36ae53): all **approved** (review-db2e8f9268298523,
  review-ad26a75494cf2036, review-fbedbcbbf29be6d3, review-6a3396057b8a406c, review-b09651b17b2712ab).
  Follow-ups fixed: auth-path loop guard case/trailing-slash insensitive; "Actualizando…" only when a
  reload really happens; chunkError unit tests; sign-out failure shows inline error (UserMenu); focus
  test made non-vacuous; useMyCampaigns user-switch/superseded-response tests; accent vars derived
  together (+ branding tests). Checks: test 469/469, lint 0 errors, typecheck clean, build OK.

- H7a: ports & adapters (`src/ports`: Wiki/Unread/PlayerNotes/Form); shared components (WikiText,
  WikiLink, WikiLinkPicker, UnreadDot, PlayerNotes, EstadoField, PosicionField, 8 forms) are
  data-agnostic; `LegacyPortsProvider` keeps /legacy identical; FormModal split into generic
  `FormShell` + legacy wrapper. Hub: refcounted TableStore (one realtime channel per table, re-list on
  focus/visibility ≥30s), useEntities/useEntity/useEntityActions (entity row, then DM notes and
  visibility as separate follow-ups with warnings; re-read after visibility RPC), useDmNotes/
  useVisibility (DM only, refreshed after save), campaign wiki index (id/title/imagen/estado only),
  hub unread (never lowers seen_at) and player notes (DM corrects others via UPDATE), EntityFormHost
  (seed latch, changed-fields patch, in-flight guard, disabled Guardar). Lore proof page wired.
  Sweep + browser: fixed DM-notes not refreshing after save (seen in browser, re-verified), DM
  editing a player note blocked by INSERT policy (+3 pgTAP), false conflict after partial failure,
  duplicate create on double click, form closing on transient re-list error, stale updated_at after
  visibility RPC, hidden-row staleness, UnreadDot undefined semantics, per-table index status; lint
  back to 60. Checks: test 530/530, pgTAP 221/221, integration 20/20, build OK, entry chunk clean.
  Browser: /legacy renders real Firestore data with no console errors.

- H7a native reviews (7 slices 5cc2e85..38f13c0): all **approved** (review-22eb65d1852f0a22,
  review-d31cd4074b39daa2, review-0920fa6e3781d625, review-6744250b174f3070, review-ad5809726a6f612a,
  review-86842c60ed8a08d4, review-6d870d55b722aa9c). Follow-ups fixed: useEntity error vs notFound;
  create with follow-up warnings continues as edit of the created row (no duplicate on retry); form
  host keyed per request; DM notes on tables without notes rejected before writing; stale-campaign
  player-note results ignored; region default falls back to "otro" in the hub (legacy "magral");
  legacy note keys keep the original pj_id; tests for conflict toast, markRead, refresh, TableStore.
  Checks: test 547/547, integration 20/20, lint 0 errors / 60 warnings, typecheck clean.

- H7b: Sesiones + PNJs ported to the hub with legacy parity: URL-driven list/detail (filters/search in
  query params survive detail and back), sticky title (gate/view split fixes deep links), unread,
  PlayerNotes, DM-only notas/secreto/ganchos via useDmNotes (no flicker; error notice with retry),
  DM lock badges via `useDmSecretIds` (entity-type filtered, debounced), strict route ids, "ya no
  existe" on not-found/hidden/deleted, separate load-error state, regions from campaign. Estado tags
  follow legacy (players see Secreto on rows shared with them). Browser: DM sees draft + secreto with
  create buttons; player1 sees only allowed rows, no create buttons, hidden PNJ by URL → not found;
  filter survives detail → Volver. Checks: test 621/621, integration 20/20, lint 0 errors, typecheck.

- H7b native reviews: slice 1 under budget; slices 2-3 **approved** (review-0eb32eb262c5797d,
  review-33f62a0c3b116aa1). Warnings (view key per id, prev/next vs filter) fixed in H7c.
- H7c: Lugares, Facciones, Lore, Items ported (Lore proof page removed) on shared
  `EntitySectionRoute` (list/detail/invalid routing, loading/error-retry/not-found gate, view keyed by
  entity.id) and `EntityUi`; PNJs/Sesiones refactored onto them. Sesiones prev/next walk the timeline
  inside the active `?tipo=` (no neighbours outside it). Items use inline URL detail (legacy was inline
  too). Lugares region pills from campaign regions; Lore category pills from visible rows only. Detail
  timestamps kept (parent decision; consistent with H7b). Parent fixed sweep minors: own-property
  region lookups, eyebrow without dangling separator, truthy Sintonía. Browser (player1): 4 sections
  render allowed rows only, secreto lugar shared with Maisie shown with tag. Checks: test 671/671,
  integration 20/20, lint 0 errors, typecheck clean.

- H7c native reviews: all **approved** (review-7b0f7a08af2a477e, review-eb4974cc37876526,
  review-163358871e4085c1).
- H8a: PJs ported. DM full create/edit/delete incl. coins; owner gets an identity-only form whose patch
  is filtered by `pickOwnerPatch` (mirrors `guard_pj_player_update`; drift test scans all migrations);
  other players read-only. Diff baseline = initial form state (no default writes); `stat_hp_current`
  written when `stat_hp` changes. `custom_fields` (campaign.character_custom_fields) replaces magralita.
  New migration `20261007140000_pj_owner_hardening.sql`: non-DM `custom_fields` must be an object of
  strings ≤8KB; non-DM `sections_updated` only known sections, ISO ≤ now+5min, no regression; client
  per-key max merge. DM-notes dot derived from entity_dm_notes.updated_at (no `dm` stamp leak to
  players). Inventory: qty 0 counts 0, negatives clamped. Legacy: monedas_guardado no longer dropped on
  save; dead player-password UI removed. Parent fixed HP "undefined / 8" (missing fallback). Browser:
  player1 owner sees Editar only on own PJ, identity-only form, save passes hardened guard. Checks:
  pgTAP 238/238, test 744/744, integration 29/29, lint 0 errors / 54 warnings, typecheck clean.
  Follow-ups: hardcoded "Motivación para unirse al Gremio" label; decimal prices truncated (legacy).

- H8a native reviews: all **approved** (review-5fa69390440c92cd, review-46cbb3ba3d4461f5,
  review-f9582d6bac65500c). Follow-ups: new migration `20261007150000_pj_guard_followups.sql` (non-DM
  cannot touch `dm`; non-object sections_updated rejected; invalid ISO dates → 42501; future stamps
  clamped to now() instead of rejected — device clock skew safe), PJIdentityTab picker uses latest
  state, legacy unread section test, drift test scans for newest guard. Checks: pgTAP 249/249, test
  748/748, integration 29/29, lint 0 errors, typecheck clean.

- H8b: DM session screen at `/c/:slug/sesion-en-vivo` (dmOnly, fullBleed) sharing `SessionScreenView` with
  the legacy wrapper through a session-screen port. Layout in campaign_config `session_screen`
  (visibility dm) via `configRepository.patch` with an explicit `base` guard; `useSessionLayout` drains
  queued writes (also after unmount), retries non-conflict failures with backoff keeping local edits,
  merges local card state after conflicts (notes drafts never overwritten), byte-measured 512KB cap
  blocking only growth. PJ edits from the modal send only changed fields (exact nested equality;
  shared fix also for the H8a form), stat_hp_current derived rule, base = opened when another writer
  changed a patched key, own-write tracking avoids spurious conflicts; rests write only changes.
  Legacy `save`/`remove` now return booleans. Browser (DM): empty state, picker adds Stats/Notas, row
  created with visibility dm, debounced notes persisted. Checks: test 800/800, integration 30/30, lint
  0 errors / 53 warnings, typecheck clean. Open: no realtime subscription on session_screen (second tab
  learns on its next write).

- H8b native reviews: all **approved** (review-7d232c51fae89f9d, review-5a0a3b81108745c2,
  review-0a397f43dbf252c3). Follow-ups: combat skips only writes equal to the last SENT value and
  ignores stale echoes; after MAX_CONFLICTS edits stay pending with a persistent banner + Reintentar,
  beforeunload and route-leave (useBlocker) guards; notes track in-flight texts so older echoes never
  replace newer drafts; a failed reload after conflict retries the reload (no stale-base resend);
  legacy wrapper keeps its optimistic layout across re-renders; untouched saves of legacy characters
  write/stamp nothing (form + all session modals); seen marks use server-clamped stamps. Checks: test
  813/813, integration 30/30, lint 0 errors / 52 warnings, typecheck clean.

- H8b follow-up review (860b13f): **approved** (review-f1fe8b1ad3b804fb); its notes (inflight pruning,
  banner assertion, stamp fallback assertion) fixed in H8c.
- H8c: maps at `/c/:slug/mapas` (fullBleed): `/mapas` → replace-redirect to the visible default map,
  `?todos=1` grid, `/mapas/:id?trail=…` breadcrumb trail (strict, deduped, cap 10, cycle-free), Leaflet
  only in lazy `LeafletCanvas` (memoized per-color icons, stable aria-label, keyboard activation,
  crosshair in add mode), image size with 15s timeout/abort, https-only map images (hub host), ghost
  pin click-to-place → form prefill {map_id,x,y} (kept on cancel), DM pin opacity, popup links via the
  wiki port, DM notes panel, default-map demotion guarded until the maps list is ready (two
  non-atomic writes; safe failure = no default until retried). MapaForm/MapPointForm on ports (link
  pair saved or both null; picker loading state). Browser (DM): redirect to default, Leaflet renders,
  pins 1/0.4 opacity with aria-labels, click-to-place saved normalized coords, crosshair. NOTE: a
  stale Vite transform cache served LeafletCanvas.jsx empty after edits — restarting the dev server
  fixed it (not a code bug). Checks: test 912/912 (2 flaky timeouts under full-suite load passed in
  isolation), integration 30/30, lint 0 errors / 52 warnings, typecheck clean. Follow-ups: pin
  clustering for huge maps; atomic default via RPC.

- H8c native reviews: slice 1 under budget; slices 2-3 **approved** (review-27ad1154eb362ab4,
  review-8ed3729909081eef). **Pending follow-ups for the next session (non-blocking warnings):**
  (1) LeafletCanvas Pin key should include the color so a link_type change re-adds the marker with its
  aria-label; (2) pin keydown listener closes over the first render position (use a ref);
  (3) document-level Escape in MapViewerPanel also clears the ghost while the point form is open;
  (4) MapViewerPanel/MapPopup lack direct tests (link resolution, Escape priority, ghost across cancel);
  (5) EntityFormHost.prepareMapSave useCallback deps miss mapsList.loading/error;
  (6) MapPointForm keeps a stale link_id when link_type changes (clear it).
  Also carried: session_screen realtime subscription; pin clustering; atomic default map RPC;
  hardcoded "Motivación para unirse al Gremio" label; cutover items (captcha/SMTP, hosted Realtime
  column check, GitHub Pages retirement, CSP).

## Next session — start here

1. Resume: `mem_context` → `mem_search odd/campaign-hub/tasks` → read this file. Branch
   `feat/campaign-hub`, last reviewed boundary `cdd796a` (2b059ec under budget, covered).
2. Fix the 6 H8c follow-ups above (small writer batch) → review.
3. H9: calendar (disponibilidad), games (loteria RPCs + Dice3D animate to server roll), notes,
   homerules page, unread; DM zone → campaign settings (Ajustes).
4. H10 campaign management (create/branding/regions/custom fields/invites/members, owner_id
   assignment), H12 Firestore import, H13 Vercel/docs/runbook, H14 cutover + Phase 2 analysis.
5. Local env: Docker + `supabase start`; dev server via preview `vite-dev` (`.claude/launch.json`,
   git-excluded, local env vars); if a module serves empty after edits, restart the dev server.
   Test login: dm@example.test / player1@example.test magic links from Mailpit (:54324).

## Product decisions (user, 2026-10-06)

- Sole-DM account deletion is blocked until the DM role is transferred or the campaign deleted — approved.
- A failed save keeps the form open with an error toast — approved.
- Opening a form focuses its first field — approved.
- `visible_to` must NOT be readable by players (it reveals which other PCs share a secret) → H3b.
- Accidental modal close (press inside, release on the backdrop) must not close; every modal gets a visible close button → H11b.

## Workflow rules (user, 2026-10-06)

- Consent for all native reviews is granted durably until the user revokes it
  (Engram `workflow/review-consent-standing`); run the `granted` invocation without asking.
- Every task gets an adversarial read-only sweep of its diff before the work-unit
  commit; confirmed findings are fixed first. Recorded per task below.

## Next step

H7: port wiki entity pages (sesiones, pnjs, lugares, facciones, lore, items) onto SECTIONS with the H4 data layer.

## H9 open product questions (pending user)

1. Dice3D: spin-then-reveal the server roll vs land on the real face (H9d).
2. Games day boundary: server uses UTC; show the UTC reset time instead of local midnight (proposed).
3. Player with several PJs: selector vs first owned (games, availability).
4. Ajustes: drop login logs / backfill / JSON import (H12 covers migration)? Keep export-only? Bulk log delete: one request per row vs new RPC.
5. game_logs / player_notes / read_state not in the realtime publication: acceptable (refresh on focus)?

Route per task: delegated writer (writer trigger: 2+ non-trivial files). TDD: not configured; ordinary functional checks.

- H9a done (1580a9e): TableStore specs `dispo`/`pot`, `useDisponibilidad`/`useGamePot`, fakeLayer extensions, HomerulesPage. Native review of slice cdd796a..1580a9e **approved** (review-7285ddba952b5235, burned); reviewed boundary → `1580a9e`. Checks: vitest 948/949 (1 load timeout, passed alone), lint 0 errors, tsc clean. Advisory (non-blocking): global timeouts mask slow suites; MapPopup "constructor" own-key guard lacks a direct assertion (assert default icon); mapForms stale-link test covers behavior already present. Unverified: `game_pot`/`disponibilidad` in the realtime publication.

## Product decision (user, 2026-10-08): availability is per PLAYER, across campaigns

- A player rarely has >1 PJ per campaign but plays in several campaigns; each campaign has its own calendar.
- Availability belongs to the user. Default scope = general (any campaign involving the user); the user can pin an entry to one campaign via UI.
- A confirmed session (`disponibilidad.tipo='sesion'`) in one campaign disables that slot, for every involved user, in all other campaigns. Shown as "busy" WITHOUT naming the other campaign (approved).
- DMs can mark their own unavailability too (user-scoped, no PJ needed).
- Supersedes H9 question 3 (selector vs first PJ). `disponibilidad` keeps only session slots; `personal`/`no_disponible` move to `player_availability`.

- H9b1 done (8c589c9, ce547fd): `player_availability` (user-scoped, campaign_id null = general), `campaign_has_member`, `campaign_busy_slots` RPC (no campaign identifiers), `disponibilidad` session-only, realtime source with `belongsTo` guard, repo/hook/spec `pavail`, pgTAP 294/294, integration 30/30, tsc/lint clean. Native review of slice 1580a9e..ce547fd **approved** (review-ae9a81989e2ed8d1, burned); boundary → `ce547fd`. Advisory: (1) stale re-pin: a member of campaign A not in B never receives the UPDATE of a row re-pinned A→B, so the stale copy stays until reload (refetch on focus / reconcile); (2) migration backfill is hand-verified only, no moved/dropped counts. Notes for H9b2: filter general rows by the campaign's members (list(X) can return rows of users who share another campaign but are not in X); the busy RPC returns ALL other-campaign session slots (not only overlapping) so the UI can grey them out; pinned rows stay after the owner leaves (invisible to others).

- H9b2 done (c6363fe..a887b5d): re-pin reconcile (relist on focus/visibility/SUBSCRIBED/60s timer/after local writes), pure `availabilityCalc` (user-keyed, member markers), `useCampaignMembers`/`useBusySlots`/actions, CalendarioPage + DayModal + forms (scope general/pinned, DM own availability, busy shown without campaign, UI-level session conflict block). Checks: vitest 996/1001 at last full run (4 files re-run alone pass; 1 test fixed in a887b5d, full suite not re-run), lint 0 errors, tsc clean, integration 30/30. **Browser verification NOT done** (needs a real local sign-in; do in H9f). Native review of slice ce547fd..a887b5d **approved** (review-0bd222036fbf803e, burned); boundary → `a887b5d`. Advisory follow-ups: (1) **gate saves while busy slots are loading/failed** (else a conflicting session can be saved: CalendarioPage.tsx:123); (2) DST days: clipBlockToDay can overflow 1440 min (use calendar-day arithmetic/pin tests); (3) test the session-slot write-failure path (form stays open). Residual: busy slots/members not realtime; stale re-pin up to ~1 min.

- H9b3 done (5c8f6a3): calendar saves gated on busy-slot status (loading/failed + Reintentar), wall-clock minutes on UTC calendar for DST days (tests under NY/Madrid TZ, 3 fail against old code), session-slot write-failure tests.
- H9c done (0234978, 1667569): `PlayerNotesPort.all()` (+failed/reload, save/remove results) with hub and legacy adapters; NotasPage (DM grouped by author with chips, player own notes, `[tipo]` search + highlight, detail/edit modal, delete confirm, failures keep the modal); pure `notesSearch` module. Checks: vitest 1043/1043, lint 0 errors, tsc clean, integration 30/30; browser NOT done (H9f). Native review of slice a887b5d..1667569 (includes H9b3) **approved** (review-beb5487446efd089, burned); boundary → `1667569`. Advisory follow-ups: (1) BusyAvailabilityNotice shows 'Cargando…' forever if busyStatus is 'idle' (no retry/exit) — handle idle; (2) `reload()` in HubPlayerNotesProvider gives no pending state and allows overlapping retries (disable/spinner during retry); (3) legacy void/rejection save path in NotasPage untested. Residual: notes not realtime; entity no longer visible shows '#id'; author mapping vs real profiles RLS only tested with fakes.

## Product decision (user, 2026-10-08): d20 animation (H9d)

- The d20 rolls across the WHOLE PAGE as a full-viewport overlay with a TRANSPARENT background (the UI stays visible behind), as if thrown onto a horizontal monitor seen from above (top-down camera).
- The result is the face that ends up pointing at the user and MUST be the server-decided roll (land on the real face, not spin-then-reveal). Supersedes H9 question 1.
- Defaults assumed unless the user objects: day reset shown in UTC; owned-PJ selector only when the player has >1 PJ in the campaign.

- H9d done (a48a5e3, 51362e5): `src/components/dice/` (pure `d20Orientation` for all 20 faces, transparent click-through full-viewport top-down `D20Overlay`, lazy `three` chunk; legacy Dice3D/Juegos untouched), JuegosPage (RPC first, then dice lands on the server roll; UTC reset messaging; PJ selector only when >1; no-PJ read-only; DM plays to pot; pot realtime; reduced-motion; double-click guard; two-tab race), `src/campaign/games/coins.ts` (reuse in H9e). Checks: vitest 1136/1136 with `--maxWorkers=3` (17 files/39 tests fail with default workers from load timeouts on first lazy render), tsc clean, lint 0 errors, build ok (three in its own 505kB chunk, main 282kB), integration 30/30. **Browser/visual check NOT done** (H9f). Native review of slice 1667569..51362e5 **approved** (review-2a3055e81286b6db, burned); boundary → `51362e5`. Advisory follow-ups: (1) overlay mount can throw (no WebGL context, or server roll outside 1-20) and nothing catches it → the already-awarded result is never shown: wrap with an error boundary/try-catch that falls back to revealing the result; (2) `play()` awaits the dice chunk import with no timeout → add a timeout that skips the animation; (3) pot-load-error branch untested. Residual: game_logs not realtime; overlay look unverified.
- Infra note: full vitest under default parallelism is saturating (many load timeouts); consider capping `maxWorkers` in vite.config.js (follow-up).

- H9d2 done (d5f5707, 970906e): d20 stays on screen after landing until click/tap/Escape/Enter/Space, then fade-out + zoom-in (500ms, pure `dismissFrame`); click-through while tumbling, captures input once landed; "Tocá para continuar" hint + aria-live result. Part B: `OverlayBoundary` (mount failures: no WebGL / roll outside 1-20 → result still revealed), 8s `withTimeout` on the dice chunk, pot-load-error test. Checks: vitest 1165/1165 (`--maxWorkers=3`), tsc clean, lint 0 errors, build ok (three lazy). Browser/visual NOT done (H9f). Native review of slice 51362e5..970906e **approved** (review-258b41cea6e4a65d, burned); boundary → `970906e`. Advisory: overlay effect re-run on roll change doesn't reset `landed`/`dismissing` flags (latent; JuegosPage mounts a fresh overlay per throw — key by roll or reset flags).

- Product decision (user, 2026-10-09): Ajustes drops login logs, timestamp backfill and JSON import; keeps JSON export only; replaces access logs with a players list showing LAST CONNECTION (per campaign, DM-only).
- H9e done (423c9d4, 87a510a, cf3bf3b + BOM fix): `campaign_presence` (DM-only SELECT, no direct writes, throttled SECURITY DEFINER `touch_campaign_presence`, not in realtime), presence beacon in the campaign layout (DM and players), AjustesPage (session screen link, loteria config with conflict handling, pot + transfer, game logs with confirmed bulk delete, players with last connection, JSON export), shared `AdminSection/AdminAction` extracted from ZonaDM. Checks: pgTAP 324/324, vitest 1235/1235 (`--maxWorkers=3`), integration 31/31, tsc, lint 0 errors, build ok. **Browser NOT done** (H9f). Native review of slice 970906e..cf3bf3b **approved** (review-2c2d5a435e4fb13c, burned); boundary → `cf3bf3b`. BOM in pgTAP 09 confirmed and fixed inline. Pending advisory follow-ups: (1) PlayersSettings shows 'Nunca' while the presence load is 'idle' (unknown must not read as never); (2) ExportSettings setState after unmount (mounted guard, as GameLogsSettings); (3) overlay `landed`/`dismissing` reset on roll change (H9d2 note). Residual: players are not told in-app that the DM sees their last connection → add a player-visible notice in H10 (invite/join screen).

- H9 follow-ups done (5a4a10f, 964ce99, bd85d32): idle busy notice (retry), notes reload pending/no overlap, NotasPage legacy void/rejection paths, d20 overlay reset on roll change (incl. stale fade styles), PlayersSettings dash unless presence ready, ExportSettings mounted guard, MapPopup own-key icon test, vitest `maxWorkers: 4`. Each new test verified failing on old code (the ExportSettings one by wrapping useState). Checks: `npx vitest run` (no flags) 1256/1256 twice (~84s), tsc clean, lint 0 errors, build ok. Slice cf3bf3b..bd85d32 = 318 lines (medium, under budget) → review pending in slice; reviewed boundary stays `cf3bf3b`. Stashes H8b/H7a intact.
