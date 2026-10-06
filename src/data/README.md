# `src/data`: typed Supabase data layer

Additive layer for the campaign hub. It is not wired into the current Firebase UI yet; H5 (auth),
H6 (router) and H7-H9 (page ports) consume it.

## Layers

```
supabaseClient.ts      lazy typed client (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY), injectable
columns.ts             explicit column lists (the only place column names are listed)
mappers.ts             row <-> flat entity, DM-notes stripping
errors.ts              DataError (kind: permission | not_found | conflict | validation | business | auth)
*Repository.ts         one module per concern; factories taking the client: createXRepository(client)
realtime.ts            TableSource + subscribeToTable (pure, no React)
useCampaignTable.ts    React hook over realtime.ts: { items, loading, error, realtime, reload }
index.ts               createDataLayer(client?) bundles every repository
database.types.ts      generated: `npm run db:types` (needs `supabase start`)
```

UI code should call `createDataLayer()` / the hook, never `supabase.from(...)` directly.

## Client contract (enforced by the H3b grants and by tests)

- Every SELECT uses an explicit column list from `columns.ts`. Never `*` and never `visible_to`
  (players have no SELECT privilege on that column; `select *` or `returning *` fails with 42501).
  `columns.test.ts` fails if a list contains `*` or `visible_to`, or if a source file calls
  `.select()` without columns.
- `visible_to` is never written by insert/update/upsert. DMs read it with
  `visibility.getVisibility(type, ids)` and write it with `visibility.setVisibility(type, id, characterIds)`
  (RPCs `get_entity_visibility` / `set_entity_visibility`, DM only).
- DM-private fields `notas`, `secreto`, `ganchos` are not in entity rows. Entity `create`/`update`
  REJECT them with a `validation` DataError (nothing is silently dropped). Forms that mix both use
  `saveEntityWithDmNotes(repo, dmNotesRepo, { campaignId, id?, base? }, flat)` (or
  `createDataLayer().saveEntityWithDmNotes(table, target, flat)`): entity first, then `dmNotes.upsert`.
  Not atomic: if the notes write fails the entity is already saved and the error is rethrown; retry with
  `id` set (idempotent). `fromRow` also strips these keys and reserved keys from legacy `data`.
- Flat entity = promoted columns + `data` keys spread at top level + `campaign_id`, `created_at`,
  `updated_at`, `created_by` (read-only). `id`, server-managed fields, `visible_to` and the legacy
  `visibilidad` are dropped when writing. `''` is written as NULL for the nullable promoted columns
  (`NULLABLE_COLUMNS`: sesiones.numero/fecha, pjs.owner_id, map_points.link_type/link_id; disponibilidad
  date/time/character columns); `sesiones.fecha` reads back as `''`.
- Errors: `DataError.kind` follows the SQLSTATE; `DataError.reason` carries the stable code of our own
  functions (`KNOWN_REASONS`: invite_expired, not_a_member, not_your_character, dm_only,
  already_played_today, ...) whether it arrived as P0001, 42501 or 23514. A write whose
  `select().single()` returns no row is `written_not_visible` (it may have been applied: re-read before
  retrying), never `not_found`. A zero-row update/delete is `permission` when the row is readable and
  `not_found` otherwise.
- Every `list()` pages with `.range()` (1000 per page) until a short page and throws `validation` above
  20000 rows; no silent truncation.

## Patch semantics for `data` and whole-object jsonb columns

`entity.update(id, patch, { base? })` sends only the changed promoted columns. PostgREST can only replace
a jsonb column as a whole, so when the patch touches `data` keys (or `pjs.sections_updated` /
`monedas` / `monedas_guardado`, `MERGED_OBJECT_COLUMNS`) the repository ALWAYS reads the current server
value, shallow-merges only the patched keys onto it and writes it guarded by
`WHERE updated_at = <version>`:

- With `base` (the entity the UI edited): ONLY `base.updated_at` is used, as the optimistic version. If the
  row changed meanwhile the call throws `ConflictError`. Client-only keys on the flat object never reach
  the row because the merge base is the server value, not the client copy.
- Without `base`: the version is read by the repository and the write retries (max 3) on a concurrent
  change, re-merging only the patched keys onto the fresh value.
- Plain column patches have no version check (last writer wins per column).
- No database change was needed. Residual risk: two editors changing the same key still resolve as
  last-writer-wins after a retry; a server-side `jsonb ||` RPC would remove the read-merge step.
- A patch value of `undefined` is ignored; clear a `data` key by setting it to `null`.
- Coins: `pjs.monedas` are DM-writable only; players receive coins through `games.playLoteria` /
  `games.assignPotToCharacter`.

## Realtime caveats

`useCampaignTable(source, campaignId, { client?, sort? })` subscribes and loads together, then RE-LISTS on
every `SUBSCRIBED` (initial join and each reconnect), so changes between snapshot and join, or during an
outage, are not lost and rows that became invisible meanwhile disappear. Changes arriving during a load are
buffered and replayed; only the latest load wins. `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` set
`realtime: 'error'` (data may be stale until the next SUBSCRIBED); `reload()` forces a re-list. `source`,
`client` and `sort` must be referentially stable. Sources: `entitySource(repo)`, `disponibilidadSource(client)`.

- UPDATE payloads are MERGED onto the previous copy (large unchanged columns may be omitted by Realtime);
  INSERT replaces.
- Payloads never include `visible_to` (Realtime honours column privileges).
- INSERT/UPDATE are RLS-filtered. If a row stops being visible to a player (`estado` changed to `borrador`)
  no event arrives; the next re-list (reconnect or `reload()`) removes it.
- DELETE events carry only the primary key, are not RLS-filtered and cannot be matched by a
  `campaign_id` filter, so the DELETE listener is unfiltered and ids not in local state are ignored.
- `entity_dm_notes` is not published: DM notes are fetched on demand.
- Re-check on the hosted project at cutover that payloads still omit `visible_to`.

## Tests

- Unit (default): `npm test`. Fake chainable client in `testing/fakeClient.ts`.
- Integration (opt-in): `supabase start`, then `npm run test:integration`. It also executes every select list in `ALL_COLUMN_LISTS` and `list()`/`get()` on every entity table against the real schema. `integration/globalSetup.ts`
  reads URL and keys from `supabase status -o json` at runtime (nothing committed) and refuses non-local
  URLs. The service-role key is used only to create/delete throwaway users; tests sign in as them with the
  anon key and delete the campaign and users in `afterAll`.

## Environment

```
VITE_SUPABASE_URL=http://127.0.0.1:54321      # `supabase status`
VITE_SUPABASE_ANON_KEY=<anon key>             # public by design; RLS is the security boundary
```

Never put a service-role key in `VITE_*` variables or in `src/`.
