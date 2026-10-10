// Database writer for the legacy import. Takes a connected `pg` client and the output of buildImport().
//
// Everything runs in ONE transaction. The caller decides between COMMIT (apply) and ROLLBACK (dry run) through
// `apply`. Sequences are not transactional and are NEVER rewound: a dry run does not touch them at all (the next
// values are computed from the data), and an apply only moves them forward, so a rolled-back or possibly
// committed run cannot make a live target hand out an id twice.
//
// Logging: this module returns counts and ids only. It never returns row text, and `ImportAbort` messages are
// fixed strings. Driver errors are summarised by `describeDbError` (code, table, constraint) because their
// message/detail can quote row values.
import {
  COUNT_TABLES,
  SEQUENCE_TABLES,
  advanceSequenceStatement,
  buildGameLogInsert,
  buildUpsert,
  countQuery,
  nextValueFrom,
  quoteIdent,
  sequenceStateQuery,
} from './sql.mjs'

export class ImportAbort extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** Marker stored in campaigns.settings so a re-run can tell "created by this importer" from "someone else's". */
export const IMPORT_MARKER = { source: 'legacy-firestore', version: 1 }

/** FK-safe write order of the entity tables. */
export const ENTITY_WRITE_ORDER = ['pjs', 'sesiones', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'homebrew_rules', 'map_points']

const one = async (client, q) => (await client.query(q.text, q.values)).rows[0]

/** Driver errors can quote row values in message/detail: keep only the structural fields. */
export function describeDbError(e) {
  if (e instanceof ImportAbort) return `${e.code}: ${e.message}`
  const parts = []
  for (const key of ['code', 'table', 'column', 'constraint']) if (e?.[key]) parts.push(`${key}=${e[key]}`)
  return parts.length > 0 ? `database error (${parts.join(', ')})` : 'database error'
}

export async function findUserIdByEmail(client, email) {
  const { rows } = await client.query('select id from auth.users where lower(email) = $1 limit 1', [email.toLowerCase()])
  return rows[0]?.id ?? null
}

/**
 * COMMIT (apply) or ROLLBACK (dry run). A failure of COMMIT itself is never reported as "not committed": the
 * server may have applied it before the connection broke.
 * @returns {Promise<boolean>} committed
 */
export async function commitOrRollback(client, apply) {
  if (!apply) {
    await client.query('rollback')
    return false
  }
  try {
    await client.query('commit')
  } catch {
    throw new ImportAbort(
      'commit_outcome_unknown',
      'the COMMIT failed with an unknown outcome: the import may have been applied. Check the target (a dry run reports what exists) before retrying. Sequences were left as they are',
    )
  }
  return true
}

/** Degraded upserts (nothing to SET) cannot count rows: confirm every key either is ours or was just inserted. */
async function assertOwnedByCampaign(client, spec, stmt, label) {
  const t = quoteIdent(spec.table)
  for (const key of stmt.keys) {
    const where = spec.conflictColumns.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(' and ')
    const owner = (await client.query(`select campaign_id from public.${t} where ${where}`, key)).rows[0]
    if (!owner || owner.campaign_id !== spec.rows[0].campaign_id) {
      throw new ImportAbort('id_conflict', `${label}: a row already belongs to another campaign (ids are unique per table: import into a database without the dev seed or other campaigns using these ids)`)
    }
  }
}

async function upsertOwned(client, spec, label) {
  let written = 0
  for (const stmt of buildUpsert(spec)) {
    const res = await client.query(stmt.text, stmt.values)
    if (stmt.degraded === 'do-nothing') {
      await assertOwnedByCampaign(client, spec, stmt, label)
    } else if (spec.onConflict === 'update' && res.rowCount !== stmt.rowCount) {
      throw new ImportAbort('id_conflict', `${label}: ${stmt.rowCount - res.rowCount} id(s) already belong to another campaign (ids are unique per table: import into a database without the dev seed or other campaigns using these ids)`)
    }
    written += res.rowCount
  }
  return written
}

/** Counts of the campaign across the imported tables (DB-side). */
export async function readCounts(client, campaignId) {
  const counts = {}
  for (const table of COUNT_TABLES) counts[table] = (await one(client, countQuery(table, campaignId))).n
  return counts
}

async function ensureCampaign(client, { output, slug, name, dmId, force }) {
  const existing = (await client.query('select id, created_by, settings from public.campaigns where slug = $1 for update', [slug])).rows[0]
  if (!existing) {
    const c = output.campaign
    const row = await one(client, {
      text:
        'insert into public.campaigns (slug, name, system, branding, regions, character_custom_fields, settings, created_by) ' +
        'values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8) returning id',
      values: [
        slug,
        name,
        c.system,
        JSON.stringify(c.branding),
        JSON.stringify(c.regions),
        JSON.stringify(c.character_custom_fields),
        JSON.stringify({ import: IMPORT_MARKER }),
        dmId,
      ],
    })
    return { id: row.id, created: true }
  }

  if (existing.settings?.import?.source !== IMPORT_MARKER.source || existing.created_by !== dmId) {
    throw new ImportAbort('campaign_not_ours', 'a campaign with this slug exists and was not created by this import for this DM')
  }
  const activity = await one(client, {
    text:
      'select ' +
      '(select count(*)::int from public.campaign_members where campaign_id = $1 and user_id <> $2) as other_members, ' +
      '(select count(*)::int from public.pjs where campaign_id = $1 and owner_id is not null) as owned_characters, ' +
      '(select (updated_at > created_at) from public.campaigns where id = $1) as campaign_edited',
    values: [existing.id, dmId],
  })
  if ((activity.other_members > 0 || activity.owned_characters > 0 || activity.campaign_edited) && !force) {
    throw new ImportAbort('campaign_has_activity', 're-running over a campaign with hub activity needs --force-overwrite')
  }
  return { id: existing.id, created: false, activity }
}

async function ensureClaimInvites(client, { campaignId, dmId, pjs, inviteDays }) {
  const invites = []
  for (const pj of pjs) {
    const owned = (await client.query('select owner_id from public.pjs where id = $1 and campaign_id = $2', [pj.id, campaignId])).rows[0]
    if (owned?.owner_id) continue // already claimed: nothing to hand out
    const live = (
      await client.query(
        'select code, expires_at from public.campaign_invites where campaign_id = $1 and character_id = $2 ' +
          'and uses < max_uses and (expires_at is null or expires_at > now()) order by created_at desc limit 1',
        [campaignId, pj.id],
      )
    ).rows[0]
    if (live) {
      invites.push({ pjId: pj.id, nombre: pj.nombre ?? '', jugador: pj.jugador ?? '', code: live.code, expiresAt: live.expires_at, status: 'reused' })
      continue
    }
    const created = await one(client, {
      text:
        "insert into public.campaign_invites (campaign_id, role, character_id, max_uses, expires_at, created_by) " +
        "values ($1, 'player', $2, 1, now() + make_interval(days => $3::int), $4) returning code, expires_at",
      values: [campaignId, pj.id, inviteDays, dmId],
    })
    invites.push({ pjId: pj.id, nombre: pj.nombre ?? '', jugador: pj.jugador ?? '', code: created.code, expiresAt: created.expires_at, status: 'created' })
  }
  return invites
}

/**
 * @param {import('pg').Client} client connected, no open transaction
 * @param {{
 *   output: object, slug: string, name: string, dmEmail: string, dmUserId: string|null,
 *   apply: boolean, inviteDays: number, forceOverwrite: boolean,
 * }} opts `dmUserId: null` is only valid for a dry run: a throw-away DM user is created inside the transaction.
 */
export async function runImport(client, opts) {
  const { output, slug, apply, inviteDays, forceOverwrite } = opts
  if (apply && opts.dmUserId === null) throw new ImportAbort('dm_user_missing', 'the DM user must exist before applying')

  try {
    await client.query('begin')
    await client.query("set local lock_timeout = '15s'")

    let dmId = opts.dmUserId
    if (dmId === null) {
      // dry run only: a stand-in DM so the campaign/membership/invite statements can run. Rolled back with the rest.
      dmId = (
        await one(client, {
          text:
            "insert into auth.users (id, email, aud, role, email_confirmed_at, raw_user_meta_data) " +
            "values (gen_random_uuid(), $1, 'authenticated', 'authenticated', now(), '{}'::jsonb) returning id",
          values: [opts.dmEmail],
        })
      ).id
    }

    const campaign = await ensureCampaign(client, { output, slug, name: opts.name, dmId, force: forceOverwrite })
    const campaignId = campaign.id
    const withCampaign = (rows) => rows.map((r) => ({ ...r, campaign_id: campaignId }))
    const written = {}

    await client.query(
      "insert into public.campaign_members (campaign_id, user_id, role) values ($1, $2, 'dm') on conflict (campaign_id, user_id) do nothing",
      [campaignId, dmId],
    )

    const potRow = { campaign_id: campaignId, ...(output.gamePot ?? {}) }
    written.game_pot = await upsertOwned(
      client,
      { table: 'game_pot', rows: [potRow], conflictColumns: ['campaign_id'], onConflict: forceOverwrite ? 'update' : 'nothing' },
      'game_pot',
    )

    for (const table of ENTITY_WRITE_ORDER) {
      written[table] = await upsertOwned(
        client,
        { table, rows: withCampaign(output.tables[table] ?? []), conflictColumns: ['id'], onConflict: 'update', returning: 'id' },
        table,
      )
    }

    written.entity_dm_notes = await upsertOwned(
      client,
      { table: 'entity_dm_notes', rows: withCampaign(output.dmNotes), conflictColumns: ['entity_type', 'entity_id'], onConflict: 'update', returning: 'id' },
      'entity_dm_notes',
    )

    written.game_logs = 0
    for (const stmt of buildGameLogInsert(output.gameLogs, campaignId)) written.game_logs += (await client.query(stmt.text, stmt.values)).rowCount
    // already present (identical row) or refused by one-play-per-day: expected on a re-run, a warning otherwise
    const gameLogsSkipped = output.gameLogs.length - written.game_logs

    written.campaign_config = await upsertOwned(
      client,
      {
        table: 'campaign_config',
        rows: withCampaign(output.campaignConfig),
        conflictColumns: ['campaign_id', 'key'],
        onConflict: forceOverwrite ? 'update' : 'nothing',
      },
      'campaign_config',
    )

    written.disponibilidad = await upsertOwned(
      client,
      { table: 'disponibilidad', rows: withCampaign(output.disponibilidad), conflictColumns: ['id'], onConflict: 'update', returning: 'id' },
      'disponibilidad',
    )

    // sequences: past every preserved id, forward only. A dry run only computes where they would end up.
    const sequenceChecks = {}
    for (const table of SEQUENCE_TABLES) {
      if (apply) await client.query(advanceSequenceStatement(table))
      const state = await one(client, sequenceStateQuery(table))
      const maxId = Number(state.max_id ?? 0)
      const nextValue = apply ? (state.last_value === null ? 1 : Number(state.last_value) + 1) : nextValueFrom(state)
      sequenceChecks[table] = { maxId, nextValue, ok: nextValue > maxId }
    }

    const invites = await ensureClaimInvites(client, { campaignId, dmId, pjs: output.tables.pjs ?? [], inviteDays })

    const db = {
      campaignCreated: campaign.created,
      written,
      gameLogsSkipped,
      counts: await readCounts(client, campaignId),
      sequences: sequenceChecks,
      invites: { created: invites.filter((i) => i.status === 'created').length, reused: invites.filter((i) => i.status === 'reused').length },
    }
    if (Object.values(sequenceChecks).some((c) => !c.ok)) throw new ImportAbort('sequence_behind', 'a sequence is not past the highest preserved id')

    const committed = await commitOrRollback(client, apply)
    return { committed, campaignId: apply ? campaignId : null, invites, db }
  } catch (e) {
    // after a failed COMMIT the outcome is unknown: do not touch the connection's state further
    if (e?.code !== 'commit_outcome_unknown') await client.query('rollback').catch(() => undefined)
    throw e
  }
}
