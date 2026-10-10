import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { assertLocal } from '../../src/data/integration/assertLocal'
import { UsageError, parseCliArgs } from './args.mjs'
import { main } from './cli.mjs'
import { DM_SECRET_TEXT, SECRET_PASSWORD_1, SECRET_PASSWORD_2, SENTINEL_TEXT, makeLegacy } from './fixture.mjs'
import { GuardError, assertLocalDbUrl, assertLocalUrl, parseStatusOutput, redact, resolveTarget } from './guard.mjs'

const base = ['--input', 'export.json', '--dm-email', 'DM@Example.test', '--app-origin', 'https://app.example.test/']

describe('argument parsing', () => {
  it('applies the defaults: dry run, strict, drakterima, 90 days', () => {
    const a = parseCliArgs(base)
    expect(a).toMatchObject({
      input: 'export.json',
      dmEmail: 'dm@example.test',
      appOrigin: 'https://app.example.test',
      slug: 'drakterima',
      name: null,
      apply: false,
      mode: 'strict',
      allowPartial: false,
      inviteDays: 90,
      forceOverwrite: false,
      remote: false,
      confirmHost: null,
    })
  })

  it('reads every flag', () => {
    const a = parseCliArgs([...base, '--apply', '--lenient', '--allow-partial', '--slug', 'mi-campana', '--name', ' Mi Campana ', '--invite-days', '30', '--force-overwrite'])
    expect(a).toMatchObject({ apply: true, mode: 'lenient', allowPartial: true, slug: 'mi-campana', name: 'Mi Campana', inviteDays: 30, forceOverwrite: true })
  })

  it.each([
    [['--dm-email', 'a@b.test', '--app-origin', 'https://x.test'], /--input/],
    [['--input', 'f.json', '--app-origin', 'https://x.test'], /--dm-email/],
    [['--input', 'f.json', '--dm-email', 'a@b.test'], /--app-origin/],
    [[...base, '--dm-email', 'not-an-email'], /e-mail/],
    [[...base, '--slug', 'Bad Slug'], /--slug/],
    [[...base, '--slug', 'ab'], /--slug/],
    [[...base, '--invite-days', '0'], /--invite-days/],
    [[...base, '--invite-days', '366'], /--invite-days/],
    [[...base, '--invite-days', '9x'], /--invite-days/],
    [[...base.slice(0, 4), '--app-origin', 'https://u:p@x.test'], /credentials/],
    [[...base.slice(0, 4), '--app-origin', 'https://x.test/path'], /origin only/],
    [[...base.slice(0, 4), '--app-origin', 'ftp://x.test'], /http\(s\)/],
    [[...base, '--confirm-host', 'x.test'], /--remote/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError)
    expect(() => parseCliArgs(argv)).toThrow(message)
  })

  it('does not accept secrets as arguments and never echoes the offending token', () => {
    for (const argv of [[...base, '--service-role-key=SUPERSECRET'], [...base, '--db-url', 'postgres://u:SUPERSECRET@h/db'], [...base, 'SUPERSECRET']]) {
      try {
        parseCliArgs(argv)
        throw new Error('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(UsageError)
        expect(e.message).not.toContain('SUPERSECRET')
      }
    }
  })

  it('--help short-circuits', () => {
    expect(parseCliArgs(['--help'])).toEqual({ help: true })
  })
})

const LOCAL_STATUS = { API_URL: 'http://127.0.0.1:54321', SERVICE_ROLE_KEY: 'service-key-VALUE', DB_URL: 'postgresql://postgres:pw-VALUE@127.0.0.1:54322/postgres' }
const REMOTE_ENV = {
  SUPABASE_URL: 'https://abcd.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'remote-service-key-VALUE',
  SUPABASE_DB_URL: 'postgresql://postgres:remote-pw-VALUE@db.abcd.supabase.co:5432/postgres',
  IMPORT_ALLOW_REMOTE: 'abcd.supabase.co',
}
const local = { remote: false, confirmHost: null }
const remote = { remote: true, confirmHost: 'abcd.supabase.co' }

describe('local-only guard', () => {
  const URLS = [
    'http://127.0.0.1:54321',
    'http://localhost:54324',
    'http://127.0.0.1',
    'https://localhost/',
    'http://127.0.0.1:80@evil.com',
    'http://user:pass@127.0.0.1:54321',
    'http://127.0.0.1.evil.com',
    'http://localhost.evil.com:54321',
    'http://evil.com/?h=127.0.0.1',
    'http://[::1]:54321',
    'ftp://127.0.0.1',
    'not a url',
    '',
  ]

  it.each(URLS)('behaves exactly like src/data/integration/assertLocal.ts on %j', (url) => {
    let expected = 'ok'
    try {
      assertLocal('API', url)
    } catch {
      expected = 'refused'
    }
    let actual = 'ok'
    try {
      assertLocalUrl('API', url)
    } catch (e) {
      expect(e).toBeInstanceOf(GuardError)
      actual = 'refused'
    }
    expect(actual).toBe(expected)
  })

  it('never prints credentials of a refused URL', () => {
    expect(() => assertLocalUrl('API', 'http://admin:s3cret@evil.com')).toThrow(/evil\.com/)
    try {
      assertLocalUrl('API', 'http://admin:s3cret@evil.com')
    } catch (e) {
      expect(e.message).not.toContain('s3cret')
      expect(e.message).not.toContain('admin')
    }
  })

  it('accepts a local database URL with credentials and refuses a hosted one without echoing it', () => {
    expect(() => assertLocalDbUrl(LOCAL_STATUS.DB_URL)).not.toThrow()
    expect(() => assertLocalDbUrl('postgresql://u:topsecret@db.abcd.supabase.co:5432/postgres')).toThrow(/non-local database/)
    try {
      assertLocalDbUrl('postgresql://u:topsecret@db.abcd.supabase.co:5432/postgres')
    } catch (e) {
      expect(e.message).not.toContain('topsecret')
    }
    expect(() => assertLocalDbUrl('http://127.0.0.1:54322')).toThrow(GuardError)
  })

  it('parses supabase status output with leading notices and rejects junk', () => {
    expect(parseStatusOutput(`Notice\n${JSON.stringify(LOCAL_STATUS)}`)).toEqual(LOCAL_STATUS)
    expect(() => parseStatusOutput('no json here')).toThrow(GuardError)
    expect(() => parseStatusOutput('{ broken')).toThrow(GuardError)
  })
})

describe('target resolution', () => {
  it('local: takes URLs and keys from supabase status and ignores the environment', () => {
    const t = resolveTarget(local, REMOTE_ENV, () => LOCAL_STATUS)
    expect(t).toMatchObject({ remote: false, host: '127.0.0.1', apiUrl: LOCAL_STATUS.API_URL, dbUrl: LOCAL_STATUS.DB_URL })
  })

  it('local: refuses a status that points at a non-local host', () => {
    expect(() => resolveTarget(local, {}, () => ({ ...LOCAL_STATUS, API_URL: 'https://abcd.supabase.co' }))).toThrow(/non-local API/)
    expect(() => resolveTarget(local, {}, () => ({ ...LOCAL_STATUS, DB_URL: 'postgresql://u:p@db.abcd.supabase.co/postgres' }))).toThrow(/non-local database/)
    expect(() => resolveTarget(local, {}, () => ({ API_URL: LOCAL_STATUS.API_URL }))).toThrow(GuardError)
  })

  it('remote: needs every condition', () => {
    const run = (args, env) => () => resolveTarget(args, env, () => LOCAL_STATUS)
    expect(run(remote, REMOTE_ENV)()).toMatchObject({ remote: true, host: 'abcd.supabase.co' })
    for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL']) {
      expect(run(remote, { ...REMOTE_ENV, [key]: '' })).toThrow(new RegExp(key))
    }
    expect(run(remote, { ...REMOTE_ENV, IMPORT_ALLOW_REMOTE: undefined })).toThrow(/IMPORT_ALLOW_REMOTE/)
    expect(run(remote, { ...REMOTE_ENV, IMPORT_ALLOW_REMOTE: 'other.supabase.co' })).toThrow(/IMPORT_ALLOW_REMOTE/)
    expect(run({ remote: true, confirmHost: null }, REMOTE_ENV)).toThrow(/--confirm-host/)
    expect(run({ remote: true, confirmHost: 'other.supabase.co' }, REMOTE_ENV)).toThrow(/--confirm-host/)
    expect(run(remote, { ...REMOTE_ENV, SUPABASE_URL: 'http://abcd.supabase.co' })).toThrow(/https/)
    expect(run(remote, { ...REMOTE_ENV, SUPABASE_URL: 'https://u:p@abcd.supabase.co' })).toThrow(/https/)
  })

  it('remote: a refusal never contains a secret from the environment', () => {
    const attempts = [
      [remote, { ...REMOTE_ENV, IMPORT_ALLOW_REMOTE: 'nope' }],
      [{ remote: true, confirmHost: 'nope' }, REMOTE_ENV],
      [remote, { ...REMOTE_ENV, SUPABASE_URL: 'https://u:urlpw-VALUE@abcd.supabase.co' }],
    ]
    for (const [args, env] of attempts) {
      try {
        resolveTarget(args, env, () => LOCAL_STATUS)
        throw new Error('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(GuardError)
        for (const secret of ['VALUE', 'urlpw']) expect(e.message).not.toContain(secret)
      }
    }
  })

  describe('hosted database must belong to the confirmed project (R1-001)', () => {
    const withDb = (url) => () => resolveTarget(remote, { ...REMOTE_ENV, SUPABASE_DB_URL: url }, () => LOCAL_STATUS)
    const POOLER = 'aws-0-eu-west-1.pooler.supabase.com:6543'

    it('accepts the direct host and a pooler whose user carries the same ref', () => {
      expect(withDb('postgresql://postgres:pw-VALUE@db.abcd.supabase.co:5432/postgres')()).toMatchObject({ remote: true })
      expect(withDb(`postgresql://postgres.abcd:pw-VALUE@${POOLER}/postgres`)()).toMatchObject({ remote: true })
      expect(withDb(`postgres://cli_login.abcd:pw-VALUE@${POOLER}/postgres`)()).toMatchObject({ remote: true })
    })

    it.each([
      ['a staging API URL with a production database host', 'postgresql://postgres:pw-VALUE@db.prodref.supabase.co:5432/postgres', /host does not belong/],
      ['a pooler of another project', `postgresql://postgres.prodref:pw-VALUE@${POOLER}/postgres`, /pooler user/],
      ['a pooler user without any ref', `postgresql://postgres:pw-VALUE@${POOLER}/postgres`, /pooler user/],
      ['a look-alike suffix', 'postgresql://postgres:pw-VALUE@db.abcd.supabase.co.evil.test:5432/postgres', /host does not belong/],
      ['a look-alike prefix', 'postgresql://postgres:pw-VALUE@xdb.abcd.supabase.co:5432/postgres', /host does not belong/],
      ['an unrelated host', 'postgresql://postgres:pw-VALUE@db.example.test:5432/postgres', /host does not belong/],
      ['a local database', 'postgresql://postgres:pw-VALUE@127.0.0.1:54322/postgres', /host does not belong/],
      ['a host override in the query string', 'postgresql://postgres:pw-VALUE@db.abcd.supabase.co:5432/postgres?host=db.prodref.supabase.co', /override the host/],
      ['a user override in the query string', `postgresql://postgres.abcd:pw-VALUE@${POOLER}/postgres?user=postgres.prodref`, /override the user/],
      ['a non-postgres URL', 'https://db.abcd.supabase.co', /parseable postgres URL/],
      ['an unparseable URL', 'not a url pw-VALUE', /parseable postgres URL/],
    ])('refuses %s and never prints the URL or its credentials', (_name, url, message) => {
      expect(withDb(url)).toThrow(GuardError)
      expect(withDb(url)).toThrow(message)
      try {
        withDb(url)()
      } catch (e) {
        for (const leak of ['pw-VALUE', 'postgres://', 'postgresql://', 'prodref', 'evil.test']) expect(e.message).not.toContain(leak)
      }
    })

    it('refuses an API host that is not <ref>.supabase.co (the database cannot be matched to it)', () => {
      const custom = { remote: true, confirmHost: 'api.example.test' }
      const env = { ...REMOTE_ENV, SUPABASE_URL: 'https://api.example.test', IMPORT_ALLOW_REMOTE: 'api.example.test' }
      expect(() => resolveTarget(custom, env, () => LOCAL_STATUS)).toThrow(/<ref>.supabase.co/)
    })
  })

  it('does not read supabase status for a hosted target', () => {
    const t = resolveTarget(remote, REMOTE_ENV, () => {
      throw new Error('status must not be read')
    })
    expect(t.remote).toBe(true)
  })

  it('redact strips URLs, tokens and known secrets', () => {
    const text = 'failed for postgresql://postgres:pw@h:5432/db with sb_secret_abc and eyJhbGciOi.eyJzdWIi.sig plus hunter2'
    const out = redact(text, ['hunter2'])
    expect(out).not.toMatch(/postgresql|sb_secret|eyJ|hunter2|:pw@/)
  })
})

describe('main (no database reached)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'import-cli-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const capture = () => {
    const lines = []
    return { lines, io: { out: (s) => lines.push(s), err: (s) => lines.push(s), getStatus: () => { throw new Error('status must not be read') } } }
  }
  const run = async (argv, io) => main(argv, { IMPORT_OUT_DIR: join(dir, 'out') }, io)
  const args = (file) => ['--input', file, '--dm-email', 'dm@import.test', '--app-origin', 'http://localhost:5173']

  it('prints usage for bad arguments (exit 2) and for --help (exit 0)', async () => {
    const a = capture()
    expect(await run(['--nope'], a.io)).toBe(2)
    const b = capture()
    expect(await run(['--help'], b.io)).toBe(0)
    expect(b.lines.join('\n')).toContain('Usage:')
  })

  it('reports an unreadable or invalid input with fixed messages that never quote it', async () => {
    const missing = capture()
    expect(await run(args(join(dir, 'missing.json')), missing.io)).toBe(2)
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, `{ "pjs": [ SENTINEL-NOT-JSON ${SECRET_PASSWORD_1} `)
    const c = capture()
    expect(await run(args(bad), c.io)).toBe(1)
    const text = c.lines.join('\n')
    expect(text).toContain('not valid JSON')
    expect(text).not.toContain('SENTINEL')
    expect(text).not.toContain(SECRET_PASSWORD_1)
  })

  it('aborts a failing strict validation before touching the database and prints no row text or password', async () => {
    const file = join(dir, 'strict.json')
    writeFileSync(file, JSON.stringify(makeLegacy()))
    const c = capture()
    expect(await run(args(file), c.io)).toBe(1)
    const text = c.lines.join('\n')
    expect(text).toContain('nothing was written')
    for (const secret of [SECRET_PASSWORD_1, SECRET_PASSWORD_2, SENTINEL_TEXT, DM_SECRET_TEXT, 'Es una espía']) expect(text).not.toContain(secret)
  })

  it('refuses a hosted run whose database belongs to another project before connecting (R1-001)', async () => {
    const file = join(dir, 'lenient-mismatch.json')
    writeFileSync(file, JSON.stringify(makeLegacy()))
    const c = capture()
    const env = { IMPORT_OUT_DIR: join(dir, 'out'), ...REMOTE_ENV, SUPABASE_DB_URL: 'postgresql://postgres:prod-pw-VALUE@db.prodref.supabase.co:5432/postgres' }
    const code = await main([...args(file), '--lenient', '--remote', '--confirm-host', 'abcd.supabase.co', '--apply'], env, c.io)
    expect(code).toBe(1)
    const text = c.lines.join('\n')
    expect(text).toContain('SUPABASE_DB_URL host does not belong')
    for (const leak of ['VALUE', 'prodref', 'postgresql://']) expect(text).not.toContain(leak)
  })

  it('refuses a hosted run lacking the authorization before connecting', async () => {
    const file = join(dir, 'lenient.json')
    writeFileSync(file, JSON.stringify(makeLegacy()))
    const c = capture()
    const code = await main([...args(file), '--lenient', '--remote'], { IMPORT_OUT_DIR: join(dir, 'out'), ...REMOTE_ENV, IMPORT_ALLOW_REMOTE: '' }, c.io)
    expect(code).toBe(1)
    const text = c.lines.join('\n')
    expect(text).toContain('IMPORT_ALLOW_REMOTE')
    expect(text).not.toContain('VALUE')
  })
})
