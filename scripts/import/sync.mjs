// `--sync-claims`: the post-claim half of the legacy import (decision D1).
//
// Player-owned legacy data (notes, read state, personal availability) needs an auth user. It is deferred by the
// pure core (`output.deferred`) and lands here, AFTER a player claimed their character through accept_invite and
// `pjs.owner_id` is set. Everything is insert-missing / forward-only, so it is idempotent and never overwrites what
// a user changed in the hub:
//   player_notes        INSERT ... ON CONFLICT DO NOTHING            (a note edited in the hub is never touched)
//   player_availability INSERT ... WHERE NOT EXISTS (same window)    (never updated)
//   read_state          upsert that only moves seen_at FORWARD
//
// Like the import it runs in ONE transaction, COMMIT only with `apply`, otherwise ROLLBACK (dry run). Logging
// returns counts and ids only: never note text, names of players in the console, codes or credentials.
import { ImportAbort, IMPORT_MARKER, commitOrRollback } from './load.mjs'
import { NOTE_ENTITY_TYPES } from './schema.mjs'
import { buildAvailabilityInsertMissing, buildReadStateUpsert, buildUpsert, quoteIdent } from './sql.mjs'

const one = async (client, text, values) => (await client.query(text, values)).rows[0]

/** Entity ids a deferred bundle refers to, per entity type (only types the tables' CHECK allows). */
export function referencedEntities(deferred) {
  const refs = {}
  const add = (type, id) => {
    if (!NOTE_ENTITY_TYPES.includes(type)) return
    ;(refs[type] ??= new Set()).add(id)
  }
  for (const bundle of Object.values(deferred.byPj ?? {})) {
    for (const n of bundle.playerNotes ?? []) add(n.entity_type, n.entity_id)
    for (const r of bundle.readState ?? []) add(r.entity_type, r.entity_id)
  }
  for (const r of deferred.dm?.readState ?? []) add(r.entity_type, r.entity_id)
  return Object.fromEntries(Object.entries(refs).map(([t, ids]) => [t, [...ids]]))
}

const stamps = (row) => ({ ...(row.created_at ? { created_at: row.created_at } : {}), ...(row.updated_at ? { updated_at: row.updated_at } : {}) })

/** Splits `rows` by whether their target entity still exists. Returns { kept, dangling }. */
function splitByExistence(rows, existing) {
  const kept = []
  let dangling = 0
  for (const row of rows) {
    if (NOTE_ENTITY_TYPES.includes(row.entity_type) && existing[row.entity_type]?.has(row.entity_id)) kept.push(row)
    else dangling += 1
  }
  return { kept, dangling }
}

const availabilityKey = (r) => [r.tipo, r.fecha, r.fecha_inicio, r.fecha_fin, r.hora_inicio, r.hora_fin].map((v) => v ?? '').join('|')

/**
 * Pure planning: which rows go to which owner. Nothing here touches a database.
 *
 * @param {{
 *   deferred: { byPj: Record<string, {playerNotes: object[], readState: object[], availability: object[]}>, dm: { readState: object[] } },
 *   pjs: { id: number|string, owner_id: string|null, owner_is_member?: boolean }[]  characters of the campaign, as the DB has them
 *   existing: Record<string, Set<number>>  entity ids that still exist, per type
 *   campaignId: string, dmUserId: string
 * }} input
 */
export function planSync({ deferred, pjs, existing, campaignId, dmUserId }) {
  const claimed = []
  const unclaimedPjIds = []
  const detached = [] // owner no longer a member of the campaign
  const byId = new Map(pjs.map((p) => [Number(p.id), p]))

  for (const pj of [...pjs].sort((a, b) => Number(a.id) - Number(b.id))) {
    const pjId = Number(pj.id)
    if (!pj.owner_id) {
      unclaimedPjIds.push(pjId)
      continue
    }
    if (pj.owner_is_member === false) {
      detached.push(pjId)
      continue
    }
    const bundle = deferred.byPj?.[pjId] ?? deferred.byPj?.[String(pjId)] ?? { playerNotes: [], readState: [], availability: [] }
    const userId = pj.owner_id

    const notes = splitByExistence(
      bundle.playerNotes.filter((n) => typeof n.text === 'string' && n.text.trim() !== ''),
      existing,
    )
    const reads = splitByExistence(bundle.readState, existing)

    const seen = new Set()
    const availability = []
    for (const a of bundle.availability) {
      const key = availabilityKey(a)
      if (seen.has(key)) continue
      seen.add(key)
      // pinned to THIS campaign (D4): a legacy entry never starts applying to the owner's other campaigns
      availability.push({
        user_id: userId,
        campaign_id: campaignId,
        tipo: a.tipo,
        fecha: a.fecha ?? null,
        fecha_inicio: a.fecha_inicio ?? null,
        fecha_fin: a.fecha_fin ?? null,
        hora_inicio: a.hora_inicio ?? null,
        hora_fin: a.hora_fin ?? null,
        ...stamps(a),
      })
    }

    claimed.push({
      pjId,
      userId,
      playerNotes: notes.kept.map((n) => ({
        campaign_id: campaignId,
        user_id: userId,
        entity_type: n.entity_type,
        entity_id: n.entity_id,
        character_id: pjId,
        text: n.text,
        ...stamps(n),
      })),
      readState: reads.kept.map((r) => ({ user_id: userId, campaign_id: campaignId, entity_type: r.entity_type, entity_id: r.entity_id, section: r.section ?? '', seen_at: r.seen_at })),
      availability,
      skipped: { dangling_notes: notes.dangling, dangling_read_state: reads.dangling },
    })
  }

  const dmReads = splitByExistence(deferred.dm?.readState ?? [], existing)
  const dm = {
    userId: dmUserId,
    readState: dmReads.kept.map((r) => ({ user_id: dmUserId, campaign_id: campaignId, entity_type: r.entity_type, entity_id: r.entity_id, section: r.section ?? '', seen_at: r.seen_at })),
    skipped: { dangling_read_state: dmReads.dangling },
  }

  // deferred data of characters the hub no longer has
  const missingPjIds = Object.keys(deferred.byPj ?? {}).map(Number).filter((id) => !byId.has(id)).sort((a, b) => a - b)
  return { claimed, unclaimedPjIds, detached, dm, missingPjIds }
}

/** Existing ids of the referenced entities, per type, scoped to the campaign. */
async function loadExisting(client, campaignId, refs) {
  const existing = {}
  for (const [type, ids] of Object.entries(refs)) {
    if (!NOTE_ENTITY_TYPES.includes(type)) continue
    const t = quoteIdent(type)
    const { rows } = await client.query(`select id from public.${t} where campaign_id = $1::uuid and id = any($2::bigint[])`, [campaignId, ids])
    existing[type] = new Set(rows.map((r) => Number(r.id)))
  }
  return existing
}

async function runStatements(client, statements) {
  let n = 0
  for (const s of statements) n += (await client.query(s.text, s.values)).rowCount
  return n
}

/** Never throws for "live" lookups: a character without any invite simply reports `none`. */
async function inviteStatus(client, campaignId, pjId) {
  const r = await one(
    client,
    'select count(*)::int as total, count(*) filter (where uses < max_uses and (expires_at is null or expires_at > now()))::int as live ' +
      'from public.campaign_invites where campaign_id = $1::uuid and character_id = $2::bigint',
    [campaignId, pjId],
  )
  if (r.live > 0) return 'live'
  return r.total > 0 ? 'expired_or_used' : 'none'
}

/**
 * @param {import('pg').Client} client connected, no open transaction
 * @param {{ output: { deferred: object, tables: { pjs?: object[] } }, slug: string, apply: boolean }} opts
 */
export async function runSync(client, { output, slug, apply }) {
  try {
    await client.query('begin')
    await client.query("set local lock_timeout = '15s'")

    const campaign = (await client.query('select id, created_by, settings from public.campaigns where slug = $1 for update', [slug])).rows[0]
    if (!campaign) throw new ImportAbort('campaign_not_found', 'no campaign with this slug exists in the target')
    if (campaign.settings?.import?.source !== IMPORT_MARKER.source) {
      throw new ImportAbort('campaign_not_ours', 'the campaign with this slug was not created by this import')
    }
    const campaignId = campaign.id

    const pjs = (
      await client.query(
        'select p.id, p.nombre, p.jugador, p.owner_id, ' +
          'exists (select 1 from public.campaign_members m where m.campaign_id = p.campaign_id and m.user_id = p.owner_id) as owner_is_member ' +
          'from public.pjs p where p.campaign_id = $1::uuid order by p.id',
        [campaignId],
      )
    ).rows.map((p) => ({ ...p, id: Number(p.id) }))

    const existing = await loadExisting(client, campaignId, referencedEntities(output.deferred))
    const plan = planSync({ deferred: output.deferred, pjs, existing, campaignId, dmUserId: campaign.created_by })

    const perPj = {}
    const totals = { player_notes: 0, read_state: 0, player_availability: 0 }
    for (const c of plan.claimed) {
      const notes = await runStatements(
        client,
        buildUpsert({ table: 'player_notes', rows: c.playerNotes, conflictColumns: ['user_id', 'campaign_id', 'entity_type', 'entity_id'], onConflict: 'nothing' }),
      )
      const readState = await runStatements(client, buildReadStateUpsert(c.readState))
      const availability = await runStatements(client, buildAvailabilityInsertMissing(c.availability))
      perPj[c.pjId] = {
        playerNotes: { planned: c.playerNotes.length, written: notes, alreadyPresent: c.playerNotes.length - notes },
        readState: { planned: c.readState.length, written: readState },
        availability: { planned: c.availability.length, written: availability, alreadyPresent: c.availability.length - availability },
        skipped: c.skipped,
      }
      totals.player_notes += notes
      totals.read_state += readState
      totals.player_availability += availability
    }

    const dmWritten = await runStatements(client, buildReadStateUpsert(plan.dm.readState))
    totals.read_state += dmWritten

    const exportPjs = new Map((output.tables.pjs ?? []).map((p) => [Number(p.id), p]))
    const unclaimed = []
    for (const pj of pjs.filter((p) => !p.owner_id && exportPjs.has(p.id))) {
      unclaimed.push({ pjId: pj.id, nombre: pj.nombre ?? '', jugador: pj.jugador ?? '', invite: await inviteStatus(client, campaignId, pj.id) })
    }

    const committed = await commitOrRollback(client, apply)
    return {
      committed,
      db: {
        perPj,
        dm: { readState: { planned: plan.dm.readState.length, written: dmWritten }, skipped: plan.dm.skipped },
        totals,
        unclaimed,
        detachedPjIds: plan.detached,
        missingPjIds: plan.missingPjIds,
      },
    }
  } catch (e) {
    // after a failed COMMIT the outcome is unknown: do not touch the connection's state further
    if (e?.code !== 'commit_outcome_unknown') await client.query('rollback').catch(() => undefined)
    throw e
  }
}

/** The JSON report of a sync run. Ids, counts and the unclaimed list only: never note text. */
export function buildSyncReport({ importReport, args, target, result }) {
  return {
    ...importReport,
    run: { mode: args.apply ? 'apply' : 'dry-run', syncClaims: true, committed: result.committed, target: { remote: target.remote, host: target.host } },
    sync: result.db,
  }
}

/** Console summary: per-character counts and ids only (names stay in the report file). */
export function formatSyncSummary(db, apply) {
  const lines = [apply ? 'Committed.' : 'Dry run complete: everything was rolled back, the database is unchanged.']
  for (const [pjId, c] of Object.entries(db.perPj)) {
    const skipped = c.skipped.dangling_notes + c.skipped.dangling_read_state
    lines.push(
      `PJ ${pjId}: notes ${c.playerNotes.written}/${c.playerNotes.planned}, read_state ${c.readState.written}/${c.readState.planned}, ` +
        `availability ${c.availability.written}/${c.availability.planned}${skipped > 0 ? `, skipped (entity gone) ${skipped}` : ''}`,
    )
  }
  lines.push(`DM read_state ${db.dm.readState.written}/${db.dm.readState.planned}${db.dm.skipped.dangling_read_state > 0 ? `, skipped (entity gone) ${db.dm.skipped.dangling_read_state}` : ''}`)
  lines.push(`Totals: player_notes=${db.totals.player_notes} read_state=${db.totals.read_state} player_availability=${db.totals.player_availability}${apply ? '' : ' (not persisted)'}`)
  if (db.unclaimed.length > 0) {
    lines.push(`Still unclaimed (skipped): ${db.unclaimed.map((u) => `PJ ${u.pjId} (invite ${u.invite})`).join(', ')}`)
  }
  if (db.detachedPjIds.length > 0) lines.push(`Skipped, owner is no longer a member: PJ ${db.detachedPjIds.join(', ')}`)
  if (db.missingPjIds.length > 0) lines.push(`Skipped, character no longer in the hub: PJ ${db.missingPjIds.join(', ')}`)
  return lines
}
