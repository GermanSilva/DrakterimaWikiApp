// Orchestration of `npm run db:import`. Prints counts and paths only: never row text, passwords, keys,
// database URLs or invite codes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { USAGE, UsageError, parseCliArgs } from './args.mjs'
import { buildInvitesCsv, outputDir, stamp, writePrivateFile } from './files.mjs'
import { GuardError, readLocalStatus, redact, resolveTarget } from './guard.mjs'
import { buildImport, formatReport } from './index.mjs'
import { LegacyFormatError } from './legacy.mjs'
import { ImportAbort, describeDbError, findUserIdByEmail, readCounts, runImport } from './load.mjs'

/** Repo root from this file's location (falls back to the cwd where import.meta.url is not a file: URL, e.g. jsdom tests). */
function repoRootDir() {
  try {
    return fileURLToPath(new URL('../../', import.meta.url))
  } catch {
    return process.cwd()
  }
}

/** Exit code when the database COMMITTED but an output file could not be written (distinct from a database failure). */
export const EXIT_COMMITTED_OUTPUT_FAILED = 3

/** A file write failed. Carries the path only: the OS error text can quote more than the caller should print. */
class OutputWriteError extends Error {
  constructor(path) {
    super('output write failed')
    this.path = path
  }
}

function writeOutput(path, content) {
  try {
    return writePrivateFile(path, content)
  } catch {
    throw new OutputWriteError(path)
  }
}

/** Creates the DM auth user with no password supplied (sign-in is by magic link / Google; GoTrue keeps a random unusable one). */
async function createDmUser(target, email) {
  const admin = createClient(target.apiUrl, target.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error || !data.user) throw new ImportAbort('dm_user_create_failed', 'could not create the DM auth user')
  return data.user.id
}

/**
 * @param {string[]} argv
 * @param {Record<string, string|undefined>} env
 * @param {{ out?: (s: string) => void, err?: (s: string) => void, getStatus?: () => Record<string, string> }} [io]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, env, io = {}) {
  const out = io.out ?? ((s) => console.log(s))
  const err = io.err ?? ((s) => console.error(s))
  const secrets = []
  let client = null
  let dmUserCreated = false
  let committed = false
  try {
    const args = parseCliArgs(argv)
    if (args.help) {
      out(USAGE)
      return 0
    }

    let text
    try {
      text = readFileSync(args.input, 'utf8')
    } catch {
      throw new UsageError('cannot read the --input file')
    }

    const built = buildImport(text, { mode: args.mode, allowPartial: args.allowPartial })
    text = '' // the raw export is not needed past this point
    out(formatReport(built.report))

    const dir = outputDir(env, repoRootDir())
    const date = stamp()
    const reportPath = join(dir, `report-${args.slug}-${date}.json`)
    if (!built.ok) {
      writeOutput(reportPath, `${JSON.stringify({ ...built.report, run: { aborted: 'validation' } }, null, 2)}\n`)
      err('Import aborted by validation: nothing was written to the database.')
      out(`Report: ${reportPath}`)
      return 1
    }

    // the importer's identity is a default; the CLI decides the slug/name of this campaign
    const output = built.output
    output.campaign = { ...output.campaign, slug: args.slug, ...(args.name ? { name: args.name } : {}) }

    const target = resolveTarget(args, env, io.getStatus ?? readLocalStatus)
    secrets.push(target.serviceKey, target.dbUrl)
    out(`Target: ${target.remote ? 'HOSTED' : 'local'} (${target.host}); mode: ${args.apply ? 'APPLY' : 'dry run (rolled back)'}`)

    client = new pg.Client({ connectionString: target.dbUrl })
    await client.connect()

    let dmUserId = await findUserIdByEmail(client, args.dmEmail)
    // 'existing' | 'created' (this apply made it, outside the transaction) | 'would-create' (dry run, stand-in rolled back)
    let dmUser = 'existing'
    if (dmUserId === null) {
      if (args.apply) {
        dmUserId = await createDmUser(target, args.dmEmail)
        dmUserCreated = true
        dmUser = 'created'
      } else {
        dmUser = 'would-create'
      }
    }

    const result = await runImport(client, {
      output,
      slug: args.slug,
      name: output.campaign.name,
      dmEmail: args.dmEmail,
      dmUserId,
      apply: args.apply,
      inviteDays: args.inviteDays,
      forceOverwrite: args.forceOverwrite,
    })

    committed = result.committed
    const postApply = result.committed ? await readCounts(client, result.campaignId) : null
    const report = {
      ...built.report,
      run: {
        mode: args.apply ? 'apply' : 'dry-run',
        committed: result.committed,
        target: { remote: target.remote, host: target.host },
        dmUser,
        campaignCreated: result.db.campaignCreated,
      },
      db: { ...result.db, postApplyCounts: postApply },
    }
    writeOutput(reportPath, `${JSON.stringify(report, null, 2)}\n`)

    let invitesPath = null
    if (result.committed && result.invites.length > 0) {
      invitesPath = writeOutput(join(dir, `invites-${args.slug}-${date}.csv`), buildInvitesCsv(result.invites, args.appOrigin))
    }

    out(args.apply ? 'Committed.' : 'Dry run complete: everything was rolled back, the database is unchanged.')
    if (result.db.gameLogsSkipped > 0) {
      out(`Warning: ${result.db.gameLogsSkipped} game log(s) were not inserted (an identical one already exists, or one-play-per-day refused it).`)
    }
    if (dmUser === 'created') out('DM auth user: created by this run.')
    out(`DB rows written: ${Object.entries(result.db.written).map(([t, n]) => `${t}=${n}`).join(' ')}`)
    out(`Claim invites: ${result.db.invites.created} created, ${result.db.invites.reused} reused${args.apply ? '' : ' (not persisted)'}`)
    out(`Report: ${reportPath}`)
    if (invitesPath) out(`Invites: ${invitesPath}`)
    else if (!args.apply) out('Invites CSV is only written with --apply (dry-run codes do not exist afterwards).')
    return 0
  } catch (e) {
    if (e instanceof OutputWriteError) {
      if (committed) {
        err(`committed, but writing ${e.path} failed; re-run with --apply to regenerate the invite CSV`)
        return EXIT_COMMITTED_OUTPUT_FAILED
      }
      err(`could not write ${e.path}; nothing was committed`)
      return 1
    }
    if (dmUserCreated && !committed && e?.code !== 'commit_outcome_unknown') {
      err('The DM auth user created by this run was left behind (it is created outside the transaction); see --help to remove it.')
    }
    if (e instanceof UsageError) {
      err(e.message)
      err(USAGE)
      return 2
    }
    if (e instanceof GuardError || e instanceof LegacyFormatError) {
      err(redact(e.message, secrets))
      return 1
    }
    err(redact(describeDbError(e), secrets))
    return 1
  } finally {
    await client?.end().catch(() => undefined)
  }
}
