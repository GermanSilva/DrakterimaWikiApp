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
  tables: Record<string, { id: number; estado: string; visible_to: number[] }[]>
  campaignConfig: unknown[]
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
    for (const s of [slug, otherSlug, clashSlug, foreignSlug, freshSlug]) {
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
    const before = { pjs: await sequenceNext('pjs'), lugares: await sequenceNext('lugares'), disponibilidad: await sequenceNext('disponibilidad') }
    const res = runCli([])
    expect(res.code, res.stderr).toBe(0)
    expect(res.stdout).toContain('rolled back')
    expect(res.stdout).toContain('Claim invites: 2 created')

    expect(await campaignBySlug(slug)).toBeUndefined()
    expect(await count('pjs', 'id = any($1)', [pjIds])).toBe(0)
    expect(await count('lugares', 'id = $1', [maxOf('lugares')])).toBe(0)
    expect(await count('campaign_invites', 'character_id = any($1)', [pjIds])).toBe(0)
    // sequences are not transactional: the dry run must have put them back
    expect({ pjs: await sequenceNext('pjs'), lugares: await sequenceNext('lugares'), disponibilidad: await sequenceNext('disponibilidad') }).toEqual(before)
    // the report is written, the invite CSV (dead codes) is not
    const files = readdirSync(outDir)
    expect(files.some((f) => f.startsWith(`report-${slug}-`))).toBe(true)
    expect(files.some((f) => f.startsWith('invites-'))).toBe(false)
  })

  it('apply: writes rows with preserved ids, the DM membership, the pot and config, and prints no secrets', async () => {
    const res = runCli(['--apply'])
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
    firstInvites = lines.slice(1).map((l) => l.split(',')[3])
    for (const line of lines.slice(1)) {
      const cells = line.split(',')
      expect(cells[4]).toBe(`${APP_ORIGIN}/invite/${cells[3]}`)
      expect(cells[6]).toBe('created')
    }
    const reportName = files.find((f) => f.startsWith(`report-${slug}-`))!
    const text = readFileSync(join(outDir, reportName), 'utf8')
    const report = JSON.parse(text)
    expect(report.run).toMatchObject({ mode: 'apply', committed: true })
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
    await db.query("insert into public.campaign_members (campaign_id, user_id, role) values ($1, $2, 'player')", [campaignId, extraUser.id])
    const refused = runCli(['--apply'])
    expect(refused.code).toBe(1)
    expect(refused.stderr).toContain('--force-overwrite')
    const forced = runCli(['--apply', '--force-overwrite'])
    expect(forced.code, forced.stderr).toBe(0)
  })

  it('a missing DM user: the dry run does not create it, apply creates a confirmed user (no password supplied)', async () => {
    const freshFile = join(work, 'fresh.json')
    writeFileSync(freshFile, JSON.stringify(shiftLegacyIds(makeLegacy(), offset + 1_000)))
    const userCount = async () => Number((await one<{ n: string }>('select count(*)::int as n from auth.users where email = $1', [freshEmail])).n)
    const base = { slug: freshSlug, dmEmail: freshEmail, input: freshFile }

    const dry = runCli([], base)
    expect(dry.code, dry.stderr).toBe(0)
    expect(await userCount()).toBe(0)
    expect(await campaignBySlug(freshSlug)).toBeUndefined()

    const applied = runCli(['--apply'], base)
    expect(applied.code, applied.stderr).toBe(0)
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
    for (const r of [noAllow, noConfirm]) expect(`${r.stdout}${r.stderr}`).not.toContain('VALUE')
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
