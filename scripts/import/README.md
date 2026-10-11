# Legacy import (Firestore export -> Supabase hub)

Operator guide for `npm run db:import`. It moves the legacy "Leyendas de Drakterima" data into one hub campaign in two
steps: the **import** (everything that does not need a user account) and **`--sync-claims`** (player-owned data, after
the players claimed their characters). No secret appears in this document; none is ever printed by the tool.

> **Never commit or paste a real export.** The legacy export (and `data/db.json` in the old repo history) holds the
> players' plaintext `player_password` values and DM-only text. Keep exports outside the repo, or under the gitignored
> `scripts/out/` / `*.drakterima-export.json`. The importer drops the passwords and never prints them, but the file
> itself is sensitive. The legacy passwords must be rotated or retired at cutover.

## 1. Export from the legacy app

Sign in to the legacy app as the DM, open **Zona DM** and use **Exportar JSON**. You get `drakterima-YYYY-MM-DD.json`.

## 2. Local dry run (default)

Needs the local stack (`supabase start`, Docker running). Target and keys are read from `supabase status`; secrets are
never accepted as arguments.

```bash
npm run db:import -- --input ./export.json --dm-email dm@example.com --app-origin https://your-app.example --lenient
```

Without `--apply` the whole import runs inside one transaction and is **rolled back**: you get the validation report and
the would-be counts, and no row is kept. Sequences of tables with generated ids (`entity_dm_notes`, `game_logs`) can still advance in a dry run (`nextval` is not transactional): that only leaves id gaps, nothing else changes. Strict mode (no `--lenient`) aborts on data the hub schema rejects;
real exports usually need `--lenient`, which downgrades those to warnings. `--allow-partial` accepts an export with
missing collections.

Outputs go to the gitignored `scripts/out/` (override with `IMPORT_OUT_DIR`): `report-<slug>-<date>.json` (counts only).

## 3. Apply

```bash
npm run db:import -- --input ./export.json --dm-email dm@example.com --app-origin https://your-app.example --lenient --apply
```

It creates the campaign (slug `drakterima` unless `--slug`), the DM membership, every entity with its **legacy id**, the
game log and pot, and one pending **claim invite per character**. The DM auth user is created without a password when the
e-mail has none (sign-in is by magic link / Google). Re-running is idempotent (invites are reused); a campaign that
already has hub activity needs `--force-overwrite`.

Exit codes: `0` ok, `1` refused or failed, `2` bad arguments, `3` the data **is committed** but a follow-up step failed
(an output file could not be written, or the post-apply counts could not be read; the message says which). Re-run with
`--apply` to regenerate the report and the invite CSV.

## 4. Claim flow

`scripts/out/invites-<slug>-<date>.csv` (mode 0600) lists `pj_id, nombre, jugador, code, link, expires_at, status`.
**It contains live invite codes: treat it like a password list and delete it when done.** Send each player their own
link (the CSV `jugador` column is the legacy player name). A player signs in and opens the link; accepting it joins
them to the campaign and makes them the owner of that character. Invites last 90 days (`--invite-days`).

## 5. Sync the claimed players' data

Run it after the players accepted (and again whenever more of them do):

```bash
npm run db:import -- --sync-claims --input ./export.json --slug drakterima --lenient          # dry run
npm run db:import -- --sync-claims --input ./export.json --slug drakterima --lenient --apply
```

For every character that **now has an owner** it copies, to that owner: the player notes (only the types the hub
allows, non-empty text, only for entities that still exist), the read state of that character's legacy viewer slot, and
the legacy personal / "not available" availability (pinned to this campaign, never general). The DM's legacy read state
goes to the DM user. Characters still unclaimed are skipped and listed with the status of their invite (`live`,
`expired_or_used`, `none`); the full list with names is in `scripts/out/sync-report-<slug>-<date>.json`, the console
shows ids and counts only. Pass `--redact-names` to leave the character and player names out of that file too (the
report is a local, mode-0600 file; names are kept by default so you can tell who still has to claim). Characters that exist
only in the hub (not in the export) have nothing to sync and are flagged `hubOnly` in the report.

Exit code `3` also applies here: the sync committed but its report could not be written; re-run with `--apply` to
regenerate the sync report (nothing is written twice).

It is idempotent and never overwrites hub edits: notes and availability are insert-missing, read state only moves
forward. A note a player **deleted** in the hub comes back on the next sync (the tool cannot tell "deleted" from "never
synced"); stop running it once everyone is synced. Same safety rules as the import: local by default, dry run by
default, and the campaign must carry the importer's marker.

## 6. Verify

- Dry runs print counts and "rolled back"; compare them with the report's `idRanges` and the legacy collection sizes.
- In the hub: open the campaign as the DM; check a few entities, the wiki links, the map points, the game pot.
- As a claimed player: the character is yours, your notes show on the entities, availability shows for the other members.
- `db.postApplyCounts` in the report lists the rows the database now holds per table.
- Sequences: new records created in the hub get ids above every imported one.

## What is dropped

- Login logs (`login_logs`), and the **players' passwords** (`player_password`, `player_must_change`): never imported.
- The legacy "import JSON" feature: out of scope (hub-format import does not exist).
- Dangling wiki links are left as they are and counted in the report.

## Hosted target (needs explicit per-operation authorization)

A hosted run is never implied. It needs **all** of: `--remote`, `--confirm-host <host>` typed back, the environment
`IMPORT_ALLOW_REMOTE=<host>`, `SUPABASE_URL=https://<ref>.supabase.co`, `SUPABASE_SERVICE_ROLE_KEY`, and a
`SUPABASE_DB_URL` of the **same project** (`db.<ref>.supabase.co`, or a `*.pooler.supabase.com` host with user
`<role>.<ref>`). The user must authorize each hosted operation (dry run included) explicitly before any of it is set.
Run it only in a **quiet window**: the legacy app frozen and no hub writers, because identity sequences are advanced
past the imported ids without a lock (a concurrent insert could be handed an id twice). The tool only advances
sequences, never rewinds them.

## Removing an orphaned DM auth user

The DM auth user is created **outside** the transaction (only with `--apply`, only when the e-mail has no user). If the
import then fails, that user stays and the report says `dmUser: created`. Re-running just reuses it. To remove it: Supabase
dashboard > Authentication > Users > delete, or `auth.admin.deleteUser(<id>)` with the service role.
