// Argument parsing for scripts/import-firestore.mjs. Pure: no IO, no environment access.
// Secrets (API keys, DB URLs) are deliberately NOT accepted as arguments: argv ends up in shell
// history and process listings. They come from `supabase status` (local) or the environment (remote).
import { parseArgs } from 'node:util'

export class UsageError extends Error {}

export const USAGE = `Usage: npm run db:import -- --input <export.json> --dm-email <email> --app-origin <url> [options]

  --input <file>        legacy JSON export (required)
  --dm-email <email>    e-mail of the DM auth user (created without a password when missing)
  --app-origin <url>    origin used in the claim links, e.g. https://example.test (required)
  --slug <slug>         campaign slug (default: drakterima)
  --name <name>         campaign name (default: from the importer)
  --apply               commit. Without it the whole import runs in a transaction that is rolled back (dry run)
  --lenient             downgrade CHECK-violating data to warnings instead of aborting
  --allow-partial       accept an export with missing collections
  --invite-days <n>     claim invite lifetime in days, 1-365 (default: 90)
  --force-overwrite     re-import into a campaign that already has hub activity
  --remote --confirm-host <host>
                        hosted target; also needs env IMPORT_ALLOW_REMOTE=<host>, SUPABASE_URL,
                        SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL. Local by default.`

const OPTIONS = {
  input: { type: 'string' },
  'dm-email': { type: 'string' },
  slug: { type: 'string' },
  name: { type: 'string' },
  'app-origin': { type: 'string' },
  apply: { type: 'boolean' },
  lenient: { type: 'boolean' },
  'allow-partial': { type: 'boolean' },
  'invite-days': { type: 'string' },
  'force-overwrite': { type: 'boolean' },
  remote: { type: 'boolean' },
  'confirm-host': { type: 'string' },
  help: { type: 'boolean' },
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Normalises an origin: http(s) only, no credentials, no path/query/hash. Throws UsageError. */
export function normaliseOrigin(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new UsageError('--app-origin must be an absolute http(s) URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new UsageError('--app-origin must be an http(s) URL without credentials')
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new UsageError('--app-origin must be an origin only (no path, query or fragment)')
  }
  return url.origin
}

/**
 * @param {string[]} argv arguments after the script name
 * @returns {{ help: true } | { help: false, input: string, dmEmail: string, slug: string, name: string|null, appOrigin: string,
 *   apply: boolean, mode: 'strict'|'lenient', allowPartial: boolean, inviteDays: number, forceOverwrite: boolean,
 *   remote: boolean, confirmHost: string|null }}
 */
export function parseCliArgs(argv) {
  let values
  try {
    ;({ values } = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false }))
  } catch {
    // never echo the offending token: it could be a secret typed as a value
    throw new UsageError('invalid arguments (unknown option, missing value or unexpected positional)')
  }
  if (values.help) return { help: true }

  const need = (key, flag) => {
    const v = values[key]
    if (typeof v !== 'string' || v.trim() === '') throw new UsageError(`${flag} is required`)
    return v.trim()
  }
  const input = need('input', '--input')
  const dmEmail = need('dm-email', '--dm-email').toLowerCase()
  if (!EMAIL_PATTERN.test(dmEmail)) throw new UsageError('--dm-email is not a valid e-mail address')
  const appOrigin = normaliseOrigin(need('app-origin', '--app-origin'))

  const slug = (values.slug ?? 'drakterima').trim()
  if (!SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 40) {
    throw new UsageError('--slug must be 3-40 chars of lowercase letters, digits and single hyphens')
  }
  let name = null
  if (values.name !== undefined) {
    name = values.name.trim()
    if (name.length < 1 || name.length > 120) throw new UsageError('--name must be 1-120 characters')
  }

  let inviteDays = 90
  if (values['invite-days'] !== undefined) {
    if (!/^\d+$/.test(values['invite-days'])) throw new UsageError('--invite-days must be an integer')
    inviteDays = Number(values['invite-days'])
    if (inviteDays < 1 || inviteDays > 365) throw new UsageError('--invite-days must be between 1 and 365')
  }

  const remote = values.remote === true
  const confirmHost = values['confirm-host']?.trim().toLowerCase() || null
  if (confirmHost && !remote) throw new UsageError('--confirm-host only makes sense with --remote')

  return {
    help: false,
    input,
    dmEmail,
    slug,
    name,
    appOrigin,
    apply: values.apply === true,
    mode: values.lenient === true ? 'lenient' : 'strict',
    allowPartial: values['allow-partial'] === true,
    inviteDays,
    forceOverwrite: values['force-overwrite'] === true,
    remote,
    confirmHost,
  }
}
