import { execSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { buildImport } from '../../../scripts/import/index.mjs'
import { makeLegacy, shiftLegacyIds, SENTINEL_TEXT } from '../../../scripts/import/fixture.mjs'
import { assertLocal } from './assertLocal'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

// End-to-end test of `npm run db:import -- --sync-claims` against the local stack. The real CLI is spawned for both
// steps; the claim goes through the real accept_invite RPC as admin-created test users; what players can read is
// checked through RLS (their own authenticated clients). Everything the test creates is removed in teardown.

const env = inject('supabase')
const SCRIPT = resolve('scripts/import-firestore.mjs')
const APP_ORIGIN = 'http://localhost:5173'

interface CliResult {
  code: number | null
  stdout: string
  stderr: string
}

function localDbUrl(): string {
  const out = execSync('supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 })
  const status = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>
  assertLocal('API', status.API_URL)
  if (new URL(status.DB_URL).hostname !== '127.0.0.1' && new URL(status.DB_URL).hostname !== 'localhost') {
    throw new Error('Refusing to run integration tests against a non-local database')
  }
  return status.DB_URL
}

describe('--sync-claims against the local stack', () => {
  const offset = 60_000_000 + Math.floor(Math.random() * 20_000_000)
  const tag = randomBytes(3).toString('hex')
  const slug = `sync-${tag}`
  const foreignSlug = `sync-foreign-${tag}`
  let work: string
  let outDir: string
  let inputFile: string
  let db: pg.Client
  let dm: TestUser
  let playerA: TestUser
  let playerB: TestUser
  let outsider: TestUser
  let campaignId = ''

  const legacy = shiftLegacyIds(makeLegacy(), offset)
  const built = buildImport(legacy, { mode: 'lenient' })
  const pjIds: number[] = (built.output as { tables: { pjs: { id: number }[] } }).tables.pjs.map((r) => r.id)
  const [pj1, pj2] = pjIds
  const lugarId = 1 + offset

  const baseEnv = () => ({ ...process.env, IMPORT_OUT_DIR: outDir })
  function runImport(extra: string[]): CliResult {
    const res = spawnSync(
      process.execPath,
      [SCRIPT, '--input', inputFile, '--dm-email', dm.email, '--app-origin', APP_ORIGIN, '--slug', slug, '--lenient', ...extra],
      { encoding: 'utf8', timeout: 120_000, env: baseEnv() },
    )
    return { code: res.status, stdout: res.stdout, stderr: res.stderr }
  }
  function runSync(extra: string[], opts: { slug?: string; extraEnv?: Record<string, string> } = {}): CliResult {
    const res = spawnSync(process.execPath, [SCRIPT, '--sync-claims', '--input', inputFile, '--slug', opts.slug ?? slug, '--lenient', ...extra], {
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...baseEnv(), ...opts.extraEnv },
    })
    return { code: res.status, stdout: res.stdout, stderr: res.stderr }
  }

  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T
  const count = async (table: string, where: string, params: unknown[] = []) =>
    Number((await one<{ n: string }>(`select count(*)::int as n from public.${table} where ${where}`, params)).n)
  const inviteCode = async (pjId: number) =>
    (await one<{ code: string }>('select code from public.campaign_invites where campaign_id = $1 and character_id = $2', [campaignId, pjId])).code
  async function claim(user: TestUser, pjId: number) {
    const { data, error } = await user.client.rpc('accept_invite', { p_code: await inviteCode(pjId) })
    expect(error, error?.message).toBeNull()
    expect(data).toMatchObject({ claimed: true, character_id: pjId })
  }

  async function cleanup() {
    const failures: string[] = []
    for (const s of [slug, foreignSlug]) {
      const r = await db?.query('delete from public.campaigns where slug = $1', [s]).catch((e: Error) => e)
      if (r instanceof Error) failures.push(`delete campaign ${s}: ${r.message}`)
    }
    const admin = createAdminClient(env)
    for (const u of [dm, playerA, playerB, outsider]) {
      if (!u) continue
      const { error } = await admin.auth.admin.deleteUser(u.id)
      if (error && error.status !== 404) failures.push(`delete user ${u.email}: ${error.message}`)
    }
    if (db) {
      const left = await db.query('select count(*)::int as n from public.campaigns where slug = any($1)', [[slug, foreignSlug]]).catch(() => null)
      if (left && left.rows[0].n > 0) failures.push('campaigns left behind')
    }
    await db?.end().catch(() => undefined)
    rmSync(work, { recursive: true, force: true })
    if (failures.length > 0) {
      console.error(['INTEGRATION TEARDOWN FAILED, leftovers in the local DB:', ...failures].join('\n'))
      throw new Error(`teardown failed: ${failures[0]}`)
    }
  }

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'import-sync-it-'))
    outDir = join(work, 'out')
    inputFile = join(work, 'export.json')
    writeFileSync(inputFile, JSON.stringify(legacy))
    try {
      db = new pg.Client({ connectionString: localDbUrl() })
      await db.connect()
      dm = await createTestUser(env, 'syncdm')
      playerA = await createTestUser(env, 'synca')
      playerB = await createTestUser(env, 'syncb')
      outsider = await createTestUser(env, 'syncout')
      const applied = runImport(['--apply'])
      expect(applied.code, applied.stderr).toBe(0)
      campaignId = (await one<{ id: string }>('select id from public.campaigns where slug = $1', [slug])).id
    } catch (e) {
      await cleanup().catch(() => undefined)
      throw e
    }
  })

  afterAll(cleanup)

  const synced = () => ({
    notes: count('player_notes', 'campaign_id = $1', [campaignId]),
    reads: count('read_state', 'campaign_id = $1', [campaignId]),
    avail: count('player_availability', 'campaign_id = $1', [campaignId]),
  })

  it('sanity: the import left both characters unclaimed with a live invite and no player-owned rows', async () => {
    expect(await count('pjs', 'campaign_id = $1 and owner_id is not null', [campaignId])).toBe(0)
    expect(await Promise.all(Object.values(synced()))).toEqual([0, 0, 0])
  })

  it('before anybody claimed: every character is skipped and listed, nothing is written', () => {
    const res = runSync(['--apply'])
    expect(res.code, res.stderr).toBe(0)
    expect(res.stdout).toContain('Still unclaimed (skipped)')
    expect(res.stdout).toContain(`PJ ${pj1} (invite live)`)
    expect(res.stdout).toContain(`PJ ${pj2} (invite live)`)
    expect(res.stdout).toContain('player_notes=0 read_state=1 player_availability=0') // only the DM's read state has an owner
  })

  it('claims character 1 through the real accept_invite RPC', async () => {
    await claim(playerA, pj1)
    expect(await count('pjs', 'id = $1 and owner_id = $2', [pj1, playerA.id])).toBe(1)
  })

  it('dry run: runs the whole transaction, reports, writes nothing', async () => {
    const before = await Promise.all(Object.values(synced()))
    const res = runSync([])
    expect(res.code, res.stderr).toBe(0)
    expect(res.stdout).toContain('rolled back')
    expect(res.stdout).toContain(`PJ ${pj1}: notes 1/1`)
    expect(res.stdout).toContain('(not persisted)')
    expect(await Promise.all(Object.values(synced()))).toEqual(before)
    expect(await count('player_notes', 'campaign_id = $1 and user_id = $2', [campaignId, playerA.id])).toBe(0)
    expect(readdirSync(outDir).some((f) => f.startsWith(`sync-report-${slug}-`))).toBe(true)
  })

  it('apply: the owner gets the notes, read state and availability; the unclaimed character is skipped and listed', async () => {
    const res = runSync(['--apply'])
    expect(res.code, res.stderr).toBe(0)
    expect(res.stdout).toContain('Committed.')
    expect(res.stdout).toContain(`PJ ${pj2} (invite live)`)
    expect(`${res.stdout}${res.stderr}`).not.toContain(SENTINEL_TEXT)

    const note = await one<{ user_id: string; character_id: string; text: string }>(
      "select user_id, character_id, text from public.player_notes where campaign_id = $1 and entity_type = 'lugares' and entity_id = $2",
      [campaignId, lugarId],
    )
    expect(note).toMatchObject({ user_id: playerA.id, text: 'Nota de Aria' })
    expect(Number(note.character_id)).toBe(pj1)
    expect(await count('player_notes', 'campaign_id = $1', [campaignId])).toBe(1)

    const reads = (await db.query('select user_id, entity_type, entity_id, section from public.read_state where campaign_id = $1 order by entity_type', [campaignId])).rows
    expect(reads).toHaveLength(2)
    expect(reads.find((r: { entity_type: string }) => r.entity_type === 'lugares')).toMatchObject({ user_id: playerA.id, section: 'descripcion' })
    expect(reads.find((r: { entity_type: string }) => r.entity_type === 'sesiones')?.user_id).toBe(dm.id) // the DM viewer

    const avail = (await db.query('select user_id, campaign_id, tipo from public.player_availability where campaign_id = $1', [campaignId])).rows
    expect(avail).toEqual([{ user_id: playerA.id, campaign_id: campaignId, tipo: 'personal' }]) // character 2's mark waits for its claim

    const reportName = readdirSync(outDir).filter((f) => f.startsWith(`sync-report-${slug}-`)).pop()!
    const report = readFileSync(join(outDir, reportName), 'utf8')
    for (const leak of ['Nota de Aria', playerA.id, playerA.email, await inviteCode(pj2)]) expect(report).not.toContain(leak)
    expect(JSON.parse(report).sync.unclaimed).toEqual([expect.objectContaining({ pjId: pj2, invite: 'live' })])
  })

  it('RLS: the player reads their own notes and read state, nobody else does', async () => {
    const own = await playerA.client.from('player_notes').select('text').eq('campaign_id', campaignId)
    expect(own.error).toBeNull()
    expect(own.data).toEqual([{ text: 'Nota de Aria' }])
    expect((await playerA.client.from('read_state').select('entity_type').eq('campaign_id', campaignId)).data).toEqual([{ entity_type: 'lugares' }])

    await claim(playerB, pj2) // a second member of the same campaign
    const others = await playerB.client.from('player_notes').select('text').eq('campaign_id', campaignId)
    expect(others.error).toBeNull()
    expect(others.data).toEqual([])
    expect((await playerB.client.from('read_state').select('entity_type').eq('campaign_id', campaignId)).data).toEqual([])
    expect((await outsider.client.from('player_notes').select('text').eq('campaign_id', campaignId)).data).toEqual([])

    const dmRead = await dm.client.from('player_notes').select('text').eq('campaign_id', campaignId)
    expect(dmRead.data).toEqual([{ text: 'Nota de Aria' }]) // the DM manages every note of the campaign (policy)
    expect((await dm.client.from('read_state').select('entity_type').eq('campaign_id', campaignId)).data).toEqual([{ entity_type: 'sesiones' }])
  })

  it('RLS: the pinned availability is visible to the campaign members (and the DM) and to nobody outside', async () => {
    for (const member of [playerA, playerB, dm]) {
      const { data, error } = await member.client.from('player_availability').select('user_id, tipo').eq('campaign_id', campaignId)
      expect(error).toBeNull()
      expect(data, member.email).toEqual([{ user_id: playerA.id, tipo: 'personal' }])
    }
    expect((await outsider.client.from('player_availability').select('user_id').eq('campaign_id', campaignId)).data).toEqual([])
  })

  it('re-run after the second claim adds only the newly claimed character; running again adds nothing', async () => {
    const second = runSync(['--apply'])
    expect(second.code, second.stderr).toBe(0)
    expect(second.stdout).toContain('Totals: player_notes=0 read_state=0 player_availability=1')
    expect(second.stdout).not.toContain('Still unclaimed')
    const after = await Promise.all(Object.values(synced()))
    expect(after).toEqual([1, 2, 2])

    const third = runSync(['--apply'])
    expect(third.code, third.stderr).toBe(0)
    expect(third.stdout).toContain('Totals: player_notes=0 read_state=0 player_availability=0')
    expect(await Promise.all(Object.values(synced()))).toEqual(after)
  })

  it('a note edited in the hub is never overwritten by a re-sync, and a read state seen later stays', async () => {
    const edit = await playerA.client.from('player_notes').update({ text: 'EDITADA-EN-EL-HUB' }).eq('campaign_id', campaignId).eq('entity_type', 'lugares').select('text')
    expect(edit.error).toBeNull()
    expect(edit.data).toEqual([{ text: 'EDITADA-EN-EL-HUB' }])
    await db.query("update public.read_state set seen_at = '2099-01-01T00:00:00Z' where campaign_id = $1 and user_id = $2", [campaignId, playerA.id])

    const res = runSync(['--apply'])
    expect(res.code, res.stderr).toBe(0)
    expect((await one<{ text: string }>('select text from public.player_notes where campaign_id = $1', [campaignId])).text).toBe('EDITADA-EN-EL-HUB')
    expect(
      (await one<{ seen_at: Date }>('select seen_at from public.read_state where campaign_id = $1 and user_id = $2', [campaignId, playerA.id])).seen_at.toISOString(),
    ).toBe('2099-01-01T00:00:00.000Z')
  })

  it('skips notes whose target entity no longer exists in the hub', async () => {
    await db.query('delete from public.player_notes where campaign_id = $1', [campaignId])
    // deleting the lugar the note points at (its children are cleaned by the trigger; the legacy note must not come back)
    await db.query('delete from public.map_points where campaign_id = $1 and link_type = $2 and link_id = $3', [campaignId, 'lugar', lugarId]).catch(() => undefined)
    await db.query('delete from public.lugares where id = $1 and campaign_id = $2', [lugarId, campaignId])
    const res = runSync(['--apply'])
    expect(res.code, res.stderr).toBe(0)
    expect(res.stdout).toContain('skipped (entity gone)')
    expect(await count('player_notes', 'campaign_id = $1', [campaignId])).toBe(0)
  })

  it('refuses a missing campaign and one the importer did not create', async () => {
    const missing = runSync([], { slug: `sync-missing-${tag}` })
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain('campaign_not_found')
    await db.query('insert into public.campaigns (slug, name, created_by) values ($1, $2, $3)', [foreignSlug, 'Foreign', dm.id])
    const foreign = runSync(['--apply'], { slug: foreignSlug })
    expect(foreign.code).toBe(1)
    expect(foreign.stderr).toContain('campaign_not_ours')
  })

  it('applies the hosted guard exactly like the import and never reaches a non-local database', async () => {
    const hosted = {
      SUPABASE_URL: 'https://example.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'remote-key-VALUE',
      SUPABASE_DB_URL: 'postgresql://postgres:remote-pw-VALUE@db.example.invalid:5432/postgres',
    }
    const noAllow = runSync(['--apply', '--remote', '--confirm-host', 'example.invalid'], { extraEnv: hosted })
    expect(noAllow.code).toBe(1)
    expect(noAllow.stderr).toContain('IMPORT_ALLOW_REMOTE')
    const noConfirm = runSync(['--apply', '--remote'], { extraEnv: { ...hosted, IMPORT_ALLOW_REMOTE: 'example.invalid' } })
    expect(noConfirm.code).toBe(1)
    expect(noConfirm.stderr).toContain('--confirm-host')
    const mismatch = runSync(['--apply', '--remote', '--confirm-host', 'stagingref.supabase.co'], {
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

    // a local run ignores hosted variables: it still targets 127.0.0.1
    const local = runSync([], { extraEnv: { SUPABASE_URL: 'https://example.invalid', SUPABASE_DB_URL: 'postgresql://x:y@db.example.invalid/postgres' } })
    expect(local.code, local.stderr).toBe(0)
    expect(local.stdout).toContain('Target: local (127.0.0.1)')
  })

  it('rejects options that do not apply to --sync-claims (exit 2)', () => {
    const res = spawnSync(process.execPath, [SCRIPT, '--sync-claims', '--input', inputFile, '--slug', slug, '--dm-email', dm.email], { encoding: 'utf8', env: baseEnv() })
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('does not apply')
  })
})
