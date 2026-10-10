import { execSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { buildImport } from '../../../scripts/import/index.mjs'
import { makeLegacy, shiftLegacyIds, SECRET_PASSWORD_1, SENTINEL_TEXT } from '../../../scripts/import/fixture.mjs'
import { createDataLayer, type DataLayer } from '../index'
import { assertLocal } from './assertLocal'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

// End-to-end test of `npm run db:import` against the local stack: the real CLI is spawned (so the
// guard, `supabase status` discovery and the transaction are all exercised) and the result is read
// back through the data layer and plain SQL. The fixture is synthetic and shifted to a high id range
// because ids are unique per table across campaigns and the dev seed owns the low ones.

const env = inject('supabase')
const SCRIPT = resolve('scripts/import-firestore.mjs')
const APP_ORIGIN = 'http://localhost:5173'

interface ImportOut {
  tables: Record<string, { id: number; nombre?: string; estado: string; visible_to: number[] }[]>
  gamePot: { gp?: number } | null
  campaignConfig: { key: string; value: unknown }[]
  dmNotes: unknown[]
  gameLogs: unknown[]
  disponibilidad: unknown[]
}

interface CliResult {
  code: number | null
  stdout: string
  stderr: string
}

function localDbUrl(): string {
  const out = execSync('supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 })
  const status = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>
  const host = new URL(status.DB_URL).hostname
  // the DB URL carries credentials, so assertLocal's userinfo rule does not apply: check the host through the API URL too
  assertLocal('API', status.API_URL)
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('Refusing to run integration tests against a non-local database')
  return status.DB_URL
}

describe('legacy import CLI against the local stack', () => {
  const offset = 10_000_000 + Math.floor(Math.random() * 50_000_000)
  const tag = randomBytes(3).toString('hex')
  const slug = `imp-${tag}`
  const otherSlug = `imp-other-${tag}`
  const clashSlug = `imp-clash-${tag}`
  const foreignSlug = `imp-foreign-${tag}`
  const freshSlug = `imp-fresh-${tag}`
  const drySlug = `imp-dry-${tag}`
  const noPotSlug = `imp-nopot-${tag}`
  const outFailSlug = `imp-outfail-${tag}`
  const freshEmail = `imp-fresh-${tag}@import.test`
  let outDir: string
  let work: string
  let inputFile: string
  let db: pg.Client
  let dm: TestUser
  let dmData: DataLayer
  let extraUser: TestUser
  let campaignId = ''
  let firstInvites: string[] = []

  const legacy = shiftLegacyIds(makeLegacy(), offset)
  const built = buildImport(legacy, { mode: 'lenient' })
  const out = built.output as unknown as ImportOut
  const pjIds: number[] = out.tables.pjs.map((r) => r.id)
  const maxOf = (table: string): number => Math.max(...out.tables[table].map((r) => r.id))

  function runCli(extra: string[], opts: { slug?: string; dmEmail?: string; extraEnv?: Record<string, string>; input?: string } = {}): CliResult {
    const res = spawnSync(
      process.execPath,
      [SCRIPT, '--input', opts.input ?? inputFile, '--dm-email', opts.dmEmail ?? dm.email, '--app-origin', APP_ORIGIN, '--slug', opts.slug ?? slug, '--lenient', ...extra],
      { encoding: 'utf8', timeout: 120_000, env: { ...process.env, IMPORT_OUT_DIR: outDir, ...opts.extraEnv } },
    )
    return { code: res.status, stdout: res.stdout, stderr: res.stderr }
  }

  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T
  const count = async (table: string, where = 'true', params: unknown[] = []) =>
    Number((await one<{ n: string }>(`select count(*)::int as n from public.${table} where ${where}`, params)).n)
  const campaignBySlug = async (s: string) => (await db.query('select id, created_by, settings from public.campaigns where slug = $1', [s])).rows[0] as { id: string; created_by: string } | undefined
  const sequenceNext = async (table: string) => {
    const r = await one<{ last_value: string | null }>(
      "select last_value from pg_sequences where schemaname = 'public' and sequencename = split_part(pg_get_serial_sequence($1, 'id'), '.', 2)",
      [`public.${table}`],
    )
    return r.last_value === null ? null : Number(r.last_value)
  }

  async function cleanup() {
    const failures: string[] = []
    for (const s of [slug, otherSlug, clashSlug, foreignSlug, freshSlug, drySlug, noPotSlug, outFailSlug]) {
      const r = await db?.query('delete from public.campaigns where slug = $1', [s]).catch((e: Error) => e)
      if (r instanceof Error) failures.push(`delete campaign ${s}: ${r.message}`)
    }
    const gone = await db?.query('delete from auth.users where email = $1', [freshEmail]).catch((e: Error) => e)
    if (gone instanceof Error) failures.push(`delete user ${freshEmail}: ${gone.message}`)
    const admin = createAdminClient(env)
    for (const u of [dm, extraUser]) {
      if (!u) continue
      const { error } = await admin.auth.admin.deleteUser(u.id)
      if (error && error.status !== 404) failures.push(`delete user ${u.email}: ${error.message}`)
    }
    await db?.end().catch(() => undefined)
    rmSync(work, { recursive: true, force: true })
    if (failures.length > 0) {
      console.error(['INTEGRATION TEARDOWN FAILED, leftovers in the local DB:', ...failures].join('\n'))
      throw new Error(`teardown failed: ${failures[0]}`)
    }
  }

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'import-it-'))
    outDir = join(work, 'out')
    inputFile = join(work, 'export.json')
    writeFileSync(inputFile, JSON.stringify(legacy))
    try {
      db = new pg.Client({ connectionString: localDbUrl() })
      await db.connect()
      dm = await createTestUser(env, 'impdm')
      extraUser = await createTestUser(env, 'impextra')
      dmData = createDataLayer(dm.client)
    } catch (e) {
      await cleanup().catch(() => undefined)
      throw e
    }
  })

  afterAll(cleanup)

  it('built a valid lenient output (sanity of the fixture)', () => {
    expect(built.ok).toBe(true)
    expect(pjIds).toHaveLength(2)
  })

  it('dry run: runs the whole transaction, prints the report and writes nothing', async () => {
    // its own ids and slug: independent of whatever the other tests applied
    const dryFile = join(work, 'dry.json')
    const dryLegacy = shiftLegacyIds(makeLegacy(), offset + 3_000)
    writeFileSync(dryFile, JSON.stringify(dryLegacy))
    const dryOut = buildImport(dryLegacy, { mode: 'lenient' }).output as unknown as ImportOut
    const dryPjIds = dryOut.tables.pjs.map((r) => r.id)
    const tables = ['pjs', 'lugares', 'disponibilidad']
    // sequences are shared with concurrently running test files: only "never backwards" is stable
    const before: Record<string, number | null> = {}
    for (const t of tables) before[t] = await sequenceNext(t)
    const res = runCli([], { slug: drySlug, input: dryFile })
    expect(res.code, res.stderr).toBe(0)
    expect(res.stdout).toContain('rolled back')
    expect(res.stdout).toContain('Claim invites: 2 created')

    expect(await campaignBySlug(drySlug)).toBeUndefined()
    expect(await count('pjs', 'id = any($1)', [dryPjIds])).toBe(0)
    expect(await count('campaign_invites', 'character_id = any($1)', [dryPjIds])).toBe(0)
    for (const t of tables) {
      const after = await sequenceNext(t)
      if (before[t] !== null) expect(after, t).toBeGreaterThanOrEqual(before[t] as number)
    }
    // the report is written (with the would-be sequence values), the invite CSV (dead codes) is not
    const files = readdirSync(outDir)
    const reportName = files.find((f) => f.startsWith(`report-${drySlug}-`))
    expect(reportName).toBeDefined()
    const report = JSON.parse(readFileSync(join(outDir, reportName!), 'utf8'))
    expect(report.run.dmUser).toBe('existing')
    expect(report.db.sequences.pjs.nextValue).toBeGreaterThan(Math.max(...dryPjIds))
    expect(files.some((f) => f.startsWith(`invites-${drySlug}-`))).toBe(false)
  })

  describe('with the campaign applied once', () => {
    let applyRes: CliResult

    beforeAll(async () => {
      applyRes = runCli(['--apply'])
      expect(applyRes.code, applyRes.stderr).toBe(0)
      campaignId = (await campaignBySlug(slug))!.id
      const csvName = readdirSync(outDir).find((f) => f.startsWith(`invites-${slug}-`))!
      firstInvites = readFileSync(join(outDir, csvName), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')[3])
    })

    it('apply: writes rows with preserved ids, the DM membership, the pot and config, and prints no secrets', async () => {
      const res = applyRes
      expect(res.code, res.stderr).toBe(0)
      const printed = `${res.stdout}\n${res.stderr}`
      expect(printed).toContain('Committed.')
      for (const secret of [SECRET_PASSWORD_1, SENTINEL_TEXT, 'Es una espía']) expect(printed).not.toContain(secret)

      const campaign = await campaignBySlug(slug)
      expect(campaign).toBeDefined()
      campaignId = campaign!.id
      expect(campaign).toMatchObject({ created_by: dm.id, settings: { import: { source: 'legacy-firestore' } } })

      for (const table of ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas', 'map_points', 'homebrew_rules']) {
        const ids = (await db.query(`select id from public.${table} where campaign_id = $1 order by id`, [campaignId])).rows.map((r: { id: string }) => Number(r.id))
        expect(ids, table).toEqual(out.tables[table].map((r) => r.id))
      }
      expect(await count('campaign_members', "campaign_id = $1 and user_id = $2 and role = 'dm'", [campaignId, dm.id])).toBe(1)
      expect(await count('campaign_members', 'campaign_id = $1', [campaignId])).toBe(1)
      expect(await count('game_pot', 'campaign_id = $1', [campaignId])).toBe(1)
      expect(await count('campaign_config', 'campaign_id = $1', [campaignId])).toBe(out.campaignConfig.length)
      expect(await count('entity_dm_notes', 'campaign_id = $1', [campaignId])).toBe(out.dmNotes.length)
      expect(await count('disponibilidad', 'campaign_id = $1', [campaignId])).toBe(out.disponibilidad.length)
      expect(await count('game_logs', 'campaign_id = $1', [campaignId])).toBe(out.gameLogs.length)
    })

    it('writes the invite CSV and the report with counts only', async () => {
      const files = readdirSync(outDir)
      const csvName = files.find((f) => f.startsWith(`invites-${slug}-`))!
      const lines = readFileSync(join(outDir, csvName), 'utf8').trim().split('\n')
      expect(lines[0]).toBe('pj_id,nombre,jugador,code,link,expires_at,status')
      expect(lines).toHaveLength(3)
      for (const line of lines.slice(1)) {
        const cells = line.split(',')
        expect(cells[4]).toBe(`${APP_ORIGIN}/invite/${cells[3]}`)
        expect(cells[6]).toBe('created')
      }
      const reportName = files.find((f) => f.startsWith(`report-${slug}-`))!
      const text = readFileSync(join(outDir, reportName), 'utf8')
      const report = JSON.parse(text)
      expect(report.run).toMatchObject({ mode: 'apply', committed: true, dmUser: 'existing' })
      expect(report.db.postApplyCounts.pjs).toBe(2)
      expect(report.db.sequences.pjs.ok).toBe(true)
      for (const secret of [SECRET_PASSWORD_1, SENTINEL_TEXT, ...firstInvites]) expect(text).not.toContain(secret)
    })

    it('creates one pending claim invite per character, as the DB sees it', async () => {
      const rows = (await db.query('select code, character_id, role, max_uses, uses, expires_at from public.campaign_invites where campaign_id = $1 order by character_id', [campaignId])).rows
      expect(rows.map((r: { character_id: string }) => Number(r.character_id))).toEqual([...pjIds].sort((a, b) => a - b))
      for (const r of rows) {
        expect(r).toMatchObject({ role: 'player', max_uses: 1, uses: 0 })
        const days = (new Date(r.expires_at).getTime() - Date.now()) / 86_400_000
        expect(days).toBeGreaterThan(89)
        expect(days).toBeLessThan(91)
      }
      expect(rows.map((r: { code: string }) => r.code).sort()).toEqual([...firstInvites].sort())
    })

    it('advances the identity sequences: a row created through the data layer gets an id above every preserved one', async () => {
      const created = await dmData.entity('lugares').create(campaignId, { nombre: 'Nuevo lugar' })
      expect(created.id).toBeGreaterThan(maxOf('lugares'))
      const pj = await dmData.entity('pjs').create(campaignId, { nombre: 'Nuevo PJ' })
      expect(pj.id).toBeGreaterThan(Math.max(...pjIds))
      for (const table of ['sesiones', 'pnjs', 'facciones', 'lore', 'items', 'mapas', 'map_points', 'homebrew_rules']) {
        expect(await sequenceNext(table), table).toBeGreaterThanOrEqual(maxOf(table))
      }
      await dmData.entity('lugares').remove(created.id)
      await dmData.entity('pjs').remove(pj.id)
    })

    it('wiki-link ids in the imported texts resolve through the wiki index', async () => {
      const tableOfLetter: Record<string, 'sesiones' | 'pjs' | 'pnjs' | 'lugares' | 'facciones' | 'lore' | 'items' | 'mapas'> = {
        P: 'pjs', G: 'lugares', F: 'facciones', L: 'lore', S: 'sesiones', N: 'pnjs', I: 'items', M: 'mapas',
      }
      const indexIds: Record<string, Set<number>> = {}
      for (const table of Object.values(tableOfLetter)) indexIds[table] = new Set((await dmData.wikiIndex(table).list(campaignId)).map((i) => i.id))

      const linkRe = /\[\[\{(\d+)([A-Z])/g
      const dump = JSON.stringify(out)
      let resolved = 0
      for (const m of dump.matchAll(linkRe)) {
        const table = tableOfLetter[m[2]]
        if (!table) continue
        // {99N} (shifted) is the fixture's deliberately dangling link
        if (Number(m[1]) === 99 + offset && m[2] === 'N') {
          expect(indexIds.pnjs.has(Number(m[1]))).toBe(false)
          continue
        }
        expect(indexIds[table].has(Number(m[1])), `${m[2]}${m[1]}`).toBe(true)
        resolved += 1
      }
      expect(resolved).toBeGreaterThan(3)
    })

    it('keeps secret rows secret: estado and visible_to survive, readable only through the visibility RPC', async () => {
      const lugar = out.tables.lugares.find((r) => r.estado === 'secreto')!
      const rows = await dmData.entity('lugares').list(campaignId)
      expect(rows.find((r) => r.id === lugar.id)?.estado).toBe('secreto')
      const visibility = await dmData.visibility.getVisibility('lugares', [lugar.id])
      expect(visibility[lugar.id]).toEqual(lugar.visible_to)
      expect(lugar.visible_to.length).toBeGreaterThan(0)

      const borrador = out.tables.pnjs.find((r) => r.estado === 'borrador')!
      expect(rows).toBeDefined()
      expect((await dmData.entity('pnjs').list(campaignId)).find((r) => r.id === borrador.id)?.estado).toBe('borrador')

      // visible_to is not readable through table access even for the service role's user-facing path
      const direct = await dm.client.from('lugares').select('visible_to').eq('campaign_id', campaignId)
      expect(direct.error?.code).toBe('42501')
    })

    it('stores DM-private text only in entity_dm_notes', async () => {
      const entityJson = (await db.query('select to_jsonb(p) as j from public.pjs p where campaign_id = $1', [campaignId])).rows.map((r: { j: unknown }) => JSON.stringify(r.j)).join('')
      expect(entityJson).not.toContain('Es una espía')
      expect(await count('entity_dm_notes', "campaign_id = $1 and secreto like '%espía%'", [campaignId])).toBe(1)
    })

    it('lenient mode: a player log whose character is unknown is accepted by the real schema CHECKs (R3-004)', async () => {
      const orphan = await count('game_logs', "campaign_id = $1 and actor_type = 'player' and character_id is null and prize_target = 'player'", [campaignId])
      expect(orphan).toBe(1)
      expect(await count('game_logs', "campaign_id = $1 and actor_type = 'dm' and prize_target = 'pot'", [campaignId])).toBe(1)
    })

    it('re-run is idempotent: no duplicate rows, the same pending invites are reused', async () => {
      const before = {
        pjs: await count('pjs', 'campaign_id = $1', [campaignId]),
        logs: await count('game_logs', 'campaign_id = $1', [campaignId]),
        notes: await count('entity_dm_notes', 'campaign_id = $1', [campaignId]),
        invites: await count('campaign_invites', 'campaign_id = $1', [campaignId]),
      }
      const res = runCli(['--apply'])
      expect(res.code, res.stderr).toBe(0)
      expect(res.stdout).toContain('Claim invites: 0 created, 2 reused')
      // every log is already there (NULL character included): nothing new, and the skipped ones are reported (R2-002)
      expect(res.stdout).toContain(`Warning: ${out.gameLogs.length} game log(s) were not inserted`)
      expect({
        pjs: await count('pjs', 'campaign_id = $1', [campaignId]),
        logs: await count('game_logs', 'campaign_id = $1', [campaignId]),
        notes: await count('entity_dm_notes', 'campaign_id = $1', [campaignId]),
        invites: await count('campaign_invites', 'campaign_id = $1', [campaignId]),
      }).toEqual(before)
      const csvName = readdirSync(outDir).find((f) => f.startsWith(`invites-${slug}-`))!
      const codes = readFileSync(join(outDir, csvName), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')[3])
      expect(codes.sort()).toEqual([...firstInvites].sort())
      expect(await count('campaigns', 'slug = $1 and updated_at = created_at', [slug])).toBe(1)
    })

    it('refuses ids that belong to another campaign and leaves nothing behind', async () => {
      const res = runCli(['--apply'], { slug: clashSlug })
      expect(res.code).toBe(1)
      expect(res.stderr).toContain('another campaign')
      expect(await campaignBySlug(clashSlug)).toBeUndefined()
    })

    it('refuses to reuse a campaign it did not create', async () => {
      await db.query('insert into public.campaigns (slug, name, created_by) values ($1, $2, $3)', [foreignSlug, 'Foreign', dm.id])
      const res = runCli(['--apply'], { slug: foreignSlug })
      expect(res.code).toBe(1)
      expect(res.stderr).toContain('not created by this import')
    })

    it('refuses a re-run over a campaign with hub activity unless --force-overwrite', async () => {
      const lugar = out.tables.lugares[0]
      const config = out.campaignConfig[0]
      const state = async () => ({
        nombre: (await one<{ nombre: string }>('select nombre from public.lugares where id = $1', [lugar.id])).nombre,
        gp: Number((await one<{ gp: string }>('select gp from public.game_pot where campaign_id = $1', [campaignId])).gp),
        config: (await one<{ value: unknown }>('select value from public.campaign_config where campaign_id = $1 and key = $2', [campaignId, config.key])).value,
      })
      const imported = await state()
      expect(imported).toMatchObject({ nombre: lugar.nombre, gp: out.gamePot?.gp })

      // hub-side edits that a forced re-import is expected to overwrite
      await db.query("update public.lugares set nombre = 'EDITED-IN-HUB' where id = $1", [lugar.id])
      await db.query('update public.game_pot set gp = 424242 where campaign_id = $1', [campaignId])
      await db.query("update public.campaign_config set value = '\"edited\"'::jsonb where campaign_id = $1 and key = $2", [campaignId, config.key])
      await db.query("insert into public.campaign_members (campaign_id, user_id, role) values ($1, $2, 'player')", [campaignId, extraUser.id])
      try {
        const refused = runCli(['--apply'])
        expect(refused.code).toBe(1)
        expect(refused.stderr).toContain('--force-overwrite')
        expect(await state()).toMatchObject({ nombre: 'EDITED-IN-HUB', gp: 424242 }) // nothing written

        const forced = runCli(['--apply', '--force-overwrite'])
        expect(forced.code, forced.stderr).toBe(0)
        expect(await state()).toEqual(imported) // entity, pot and config were all rewritten from the export
      } finally {
        await db.query('delete from public.campaign_members where campaign_id = $1 and user_id = $2', [campaignId, extraUser.id])
      }
    })

    it('--force-overwrite re-run of an export WITHOUT a pot succeeds instead of a false id_conflict (R2-001)', async () => {
      const potless = shiftLegacyIds(makeLegacy(), offset + 4_000)
      ;(potless as { game_pot: unknown[] }).game_pot = []
      const file = join(work, 'potless.json')
      writeFileSync(file, JSON.stringify(potless))
      const first = runCli(['--apply'], { slug: noPotSlug, input: file })
      expect(first.code, first.stderr).toBe(0)
      const again = runCli(['--apply', '--force-overwrite'], { slug: noPotSlug, input: file })
      expect(again.code, again.stderr).toBe(0)
      expect(again.stderr).not.toContain('another campaign')
      const c = (await campaignBySlug(noPotSlug))!
      expect(await count('game_pot', 'campaign_id = $1', [c.id])).toBe(1)
    })

    it('committed but the output directory is unwritable: distinct exit code and message, nothing leaked (R4-002)', async () => {
      const file = join(work, 'outfail.json')
      writeFileSync(file, JSON.stringify(shiftLegacyIds(makeLegacy(), offset + 5_000)))
      // a directory "inside" a regular file can never be created
      const blocked = join(inputFile, 'cannot-exist')
      const res = runCli(['--apply'], { slug: outFailSlug, input: file, extraEnv: { IMPORT_OUT_DIR: blocked } })
      expect(res.code).toBe(3)
      expect(res.stderr).toMatch(/^committed, but writing the (JSON report|invite CSV) file .+ failed; re-run with --apply to regenerate both the JSON report and the invite CSV$/m)
      expect(res.stderr).not.toContain('database error')
      expect(`${res.stdout}${res.stderr}`).not.toMatch(/postgres(ql)?:\/\/|service-role|ENOTDIR/i)
      expect(await campaignBySlug(outFailSlug)).toBeDefined() // the data really is committed

      const regenerated = runCli(['--apply'], { slug: outFailSlug, input: file })
      expect(regenerated.code, regenerated.stderr).toBe(0)
      expect(readdirSync(outDir).some((f) => f.startsWith(`invites-${outFailSlug}-`))).toBe(true)
    })

    it('a missing DM user: the dry run does not create it, apply creates a confirmed user (no password supplied)', async () => {
      const freshFile = join(work, 'fresh.json')
      writeFileSync(freshFile, JSON.stringify(shiftLegacyIds(makeLegacy(), offset + 1_000)))
      const userCount = async () => Number((await one<{ n: string }>('select count(*)::int as n from auth.users where email = $1', [freshEmail])).n)
      const base = { slug: freshSlug, dmEmail: freshEmail, input: freshFile }

      const runReport = () => JSON.parse(readFileSync(join(outDir, readdirSync(outDir).find((f) => f.startsWith(`report-${freshSlug}-`))!), 'utf8')).run

      const dry = runCli([], base)
      expect(dry.code, dry.stderr).toBe(0)
      expect(await userCount()).toBe(0)
      expect(await campaignBySlug(freshSlug)).toBeUndefined()
      expect(runReport().dmUser).toBe('would-create')

      const applied = runCli(['--apply'], base)
      expect(applied.code, applied.stderr).toBe(0)
      expect(runReport().dmUser).toBe('created')
      expect(applied.stdout).toContain('DM auth user: created by this run.')
      const user = await one<{ id: string; email_confirmed_at: string | null }>(
        'select id, email_confirmed_at from auth.users where email = $1',
        [freshEmail],
      )
      expect(user.email_confirmed_at).not.toBeNull()
      expect((await campaignBySlug(freshSlug))?.created_by).toBe(user.id)
      expect(await count('campaign_members', "user_id = $1 and role = 'dm'", [user.id])).toBe(1)
    })

    it('refuses a hosted target without the full authorization and never reaches the database', async () => {
      const hostedEnv = {
        SUPABASE_URL: 'https://example.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'remote-key-VALUE',
        SUPABASE_DB_URL: 'postgresql://postgres:remote-pw-VALUE@db.example.invalid:5432/postgres',
      }
      const noAllow = runCli(['--apply', '--remote', '--confirm-host', 'example.invalid'], { slug: otherSlug, extraEnv: hostedEnv })
      expect(noAllow.code).toBe(1)
      expect(noAllow.stderr).toContain('IMPORT_ALLOW_REMOTE')
      const noConfirm = runCli(['--apply', '--remote'], { slug: otherSlug, extraEnv: { ...hostedEnv, IMPORT_ALLOW_REMOTE: 'example.invalid' } })
      expect(noConfirm.code).toBe(1)
      expect(noConfirm.stderr).toContain('--confirm-host')
      // fully authorised for the staging API host, but the database URL is another project's (R1-001)
      const mismatch = runCli(['--apply', '--remote', '--confirm-host', 'stagingref.supabase.co'], {
        slug: otherSlug,
        extraEnv: {
          SUPABASE_URL: 'https://stagingref.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'remote-key-VALUE',
          SUPABASE_DB_URL: 'postgresql://postgres:remote-pw-VALUE@db.prodref.supabase.co:5432/postgres',
          IMPORT_ALLOW_REMOTE: 'stagingref.supabase.co',
        },
      })
      expect(mismatch.code).toBe(1)
      expect(mismatch.stderr).toContain('SUPABASE_DB_URL host does not belong')
      for (const r of [noAllow, noConfirm, mismatch]) expect(`${r.stdout}${r.stderr}`).not.toMatch(/VALUE|prodref/)
      expect(await campaignBySlug(otherSlug)).toBeUndefined()
    })

    it('a local run ignores hosted environment variables', async () => {
      const res = runCli([], { slug: otherSlug, extraEnv: { SUPABASE_URL: 'https://example.invalid', SUPABASE_DB_URL: 'postgresql://x:y@db.example.invalid/postgres' } })
      // the stack is local, so the id clash with the first campaign is the (expected) outcome, not a connection to example.invalid
      expect(res.code).toBe(1)
      expect(res.stdout).toContain('Target: local (127.0.0.1)')
      expect(res.stderr).toContain('another campaign')
    })
  })
})
