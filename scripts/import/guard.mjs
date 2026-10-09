// Target resolution and the local-only guard for the importer. IO-free except `readLocalStatus`.
//
// Local (default): URLs and keys come from `supabase status -o json`, never from argv.
// Hosted: needs ALL of --remote, IMPORT_ALLOW_REMOTE=<host>, --confirm-host <host> (same host) and
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL in the environment.
//
// `assertLocalUrl` duplicates src/data/integration/assertLocal.ts on purpose (that file is TypeScript
// compiled by vitest, not loadable from plain Node); guard.test.mjs compares both on one URL table.
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
