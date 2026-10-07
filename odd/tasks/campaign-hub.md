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
| H6 | Router + hub shell: campaign list, `/c/:slug` layout, campaign context replacing App.jsx god-state, lazy pages | delegated (writer) | [ ] |
| H7 | Port wiki entity pages + forms to the data layer (sesiones, pnjs, lugares, facciones, lore, items) | delegated (writer) | [ ] |
| H8 | Port PJs (ownership, player self-edit), session screen, maps | delegated (writer) | [ ] |
| H9 | Port calendar, games, notes, homerules, unread state; DM zone → campaign settings | delegated (writer) | [ ] |
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

H6: router + hub shell (AuthProvider, /auth/callback, campaign list, /c/:slug layout).
