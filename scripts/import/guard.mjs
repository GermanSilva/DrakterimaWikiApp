// Target resolution and the local-only guard for the importer. IO-free except `readLocalStatus`.
//
// Local (default): URLs and keys come from `supabase status -o json`, never from argv.
// Hosted: needs ALL of --remote, IMPORT_ALLOW_REMOTE=<host>, --confirm-host <host> (same host) and
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL in the environment. The host of SUPABASE_DB_URL must
// belong to the same project as SUPABASE_URL (`db.<ref>.supabase.co`, or a pooler whose user carries `.<ref>`),
// because every write goes through the database URL, not the API URL.
//
// `assertLocalUrl` duplicates src/data/integration/assertLocal.ts on purpose (that file is TypeScript
// compiled by vitest, not loadable from plain Node); cli.test.mjs compares both on one URL table.
import { execSync } from 'node:child_process'

export class GuardError extends Error {}

/** Same rule as assertLocal.ts. Only the host is ever reported: the string may carry credentials. */
export function assertLocalUrl(label, url) {
  let parsed = null
  try {
    parsed = new URL(url)
  } catch {
    // falls through to the refusal below
  }
  const ok =
    parsed !== null &&
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
    parsed.username === '' &&
    parsed.password === ''
  if (!ok) throw new GuardError(`Refusing to run the import against a non-local ${label} (host: ${parsed?.hostname ?? 'unparseable'})`)
}

/** The database URL necessarily carries credentials (postgres:postgres locally): only the host is checked. */
export function assertLocalDbUrl(url) {
  let parsed = null
  try {
    parsed = new URL(url)
  } catch {
    // falls through
  }
  const ok =
    parsed !== null &&
    (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
  if (!ok) throw new GuardError(`Refusing to run the import against a non-local database (host: ${parsed?.hostname ?? 'unparseable'})`)
}

/** Parses `supabase status -o json` output (the CLI may print notices before the JSON). */
export function parseStatusOutput(out) {
  const start = out.indexOf('{')
  if (start < 0) throw new GuardError('`supabase status -o json` printed no JSON. Is the local stack running (`supabase start`)?')
  try {
    return JSON.parse(out.slice(start))
  } catch {
    throw new GuardError('`supabase status -o json` printed invalid JSON. Is the local stack fully started?')
  }
}

/** Runs the Supabase CLI (shell: true so Windows resolves the .cmd/.exe shim). Messages never include the output. */
export function readLocalStatus(exec = execSync) {
  let out
  try {
    out = exec('supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 })
  } catch {
    throw new GuardError('Cannot read the local Supabase stack. Install the Supabase CLI, run `supabase start` and make sure Docker is running.')
  }
  return parseStatusOutput(out)
}

/** Project ref of an API host of the form `<ref>.supabase.co`, or null. */
export function projectRefOf(apiHost) {
  const m = /^([a-z0-9]+)\.supabase\.co$/.exec(apiHost)
  return m ? m[1] : null
}

/**
 * The database the writes go to must be the confirmed project's: `db.<ref>.supabase.co`, or a pooler
 * (`*.pooler.supabase.com`) whose user is `<role>.<ref>`. Only the part that mismatched is named, never the URL.
 */
export function assertDbMatchesProject(apiHost, dbUrl) {
  const ref = projectRefOf(apiHost)
  if (ref === null) throw new GuardError('SUPABASE_URL must be the project API host (<ref>.supabase.co) so the database can be matched to it')
  let parsed = null
  try {
    parsed = new URL(dbUrl)
  } catch {
    // falls through
  }
  if (parsed === null || (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:')) {
    throw new GuardError('SUPABASE_DB_URL is not a parseable postgres URL')
  }
  // the driver lets query parameters override the host/user of the URL: refuse them
  for (const key of ['host', 'hostaddr', 'user', 'service']) {
    if (parsed.searchParams.has(key)) throw new GuardError(`SUPABASE_DB_URL must not override the ${key} through a query parameter`)
  }
  const host = parsed.hostname.toLowerCase()
  if (host === `db.${ref}.supabase.co`) return
  if (host.endsWith('.pooler.supabase.com')) {
    let user = ''
    try {
      user = decodeURIComponent(parsed.username)
    } catch {
      // stays empty and mismatches below
    }
    if (user.split('.').slice(1).join('.') === ref) return
    throw new GuardError('SUPABASE_DB_URL pooler user does not carry the project ref of SUPABASE_URL')
  }
  throw new GuardError('SUPABASE_DB_URL host does not belong to the project of SUPABASE_URL')
}

/**
 * @param {{ remote: boolean, confirmHost: string|null }} args
 * @param {Record<string, string|undefined>} env
 * @param {() => Record<string, string>} getStatus lazily reads the local status (not called for remote targets)
 * @returns {{ remote: boolean, host: string, apiUrl: string, serviceKey: string, dbUrl: string }}
 */
export function resolveTarget(args, env, getStatus) {
  if (!args.remote) {
    const status = getStatus()
    const { API_URL: apiUrl, SERVICE_ROLE_KEY: serviceKey, DB_URL: dbUrl } = status
    if (!apiUrl || !serviceKey || !dbUrl) throw new GuardError('`supabase status -o json` did not return API_URL / SERVICE_ROLE_KEY / DB_URL')
    assertLocalUrl('API', apiUrl)
    assertLocalDbUrl(dbUrl)
    return { remote: false, host: new URL(apiUrl).hostname, apiUrl, serviceKey, dbUrl }
  }

  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL'].filter((k) => !env[k])
  if (missing.length > 0) throw new GuardError(`A hosted import needs these environment variables: ${missing.join(', ')}`)
  let host
  try {
    const url = new URL(env.SUPABASE_URL)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('shape')
    host = url.hostname.toLowerCase()
  } catch {
    throw new GuardError('SUPABASE_URL must be an https URL without credentials')
  }
  const allow = (env.IMPORT_ALLOW_REMOTE ?? '').trim().toLowerCase()
  if (allow === '' || allow !== host) {
    throw new GuardError('A hosted import needs IMPORT_ALLOW_REMOTE set to the exact target host (a per-operation authorization)')
  }
  if (!args.confirmHost || args.confirmHost !== host) {
    throw new GuardError('A hosted import needs --confirm-host typed back as the exact target host')
  }
  assertDbMatchesProject(host, env.SUPABASE_DB_URL)
  return { remote: true, host, apiUrl: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, dbUrl: env.SUPABASE_DB_URL }
}

/** Error text safe to print: drops anything that looks like a URL or a token, and any known secret. */
export function redact(text, secrets = []) {
  let out = String(text)
  for (const s of secrets) if (s) out = out.split(s).join('[redacted]')
  return out
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/\bsb_(secret|publishable)_\S+/g, '[token]')
}
