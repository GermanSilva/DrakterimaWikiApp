// Pure request handler for report-login-failure. No Deno globals and no remote imports,
// so it runs under vitest; index.ts wires the real dependencies.

export type ReportKind = 'google_disabled' | 'google_error'

export interface ReportRow {
  kind: ReportKind
  error_kind: string | null
  message: string | null
  contact: string | null
  path: string | null
  user_agent: string | null
  ip_hash: string
}

export interface HandlerDeps {
  insertReport(row: ReportRow): Promise<{ id: number }>
  countRecent(ipHash: string, sinceIso: string): Promise<number>
  countSince(sinceIso: string): Promise<number>
  markEmailed(id: number): Promise<void>
  sendEmail(mail: { subject: string; text: string; replyTo?: string }): Promise<void>
  hashIp(ip: string): Promise<string>
  now(): Date
  allowedOrigins: string[]
  log?(message: string, error?: unknown): void
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const PER_IP_PER_HOUR = 3
const TOTAL_PER_DAY = 30

const KINDS: ReportKind[] = ['google_disabled', 'google_error']
const ERROR_KIND_RE = /^[a-z_]{1,64}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Control chars (keeping \t \n \r), DEL/C1, soft hyphen, ALM, zero-width/bidi marks and isolates.
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const UNSAFE_TEXT_RE = new RegExp('[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]', 'g')

const SUBJECT = '[RPG Quester] Falla de ingreso con Google'

function stripUnsafe(text: string): string {
  return text.replace(UNSAFE_TEXT_RE, '')
}

function hasUnsafe(text: string): boolean {
  return stripUnsafe(text) !== text
}

function formatBuenosAires(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

type Parsed = { ok: true; row: Omit<ReportRow, 'ip_hash' | 'user_agent'> } | { ok: false }

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null
  return typeof value === 'string' ? value : undefined
}

function validate(body: Record<string, unknown>): Parsed {
  const kind = body.kind
  if (typeof kind !== 'string' || !KINDS.includes(kind as ReportKind)) return { ok: false }

  const errorKind = optionalString(body.errorKind)
  if (errorKind === undefined || (errorKind !== null && !ERROR_KIND_RE.test(errorKind))) return { ok: false }

  const rawMessage = optionalString(body.message)
  if (rawMessage === undefined) return { ok: false }
  const message = rawMessage === null ? null : stripUnsafe(rawMessage).trim()
  if (message !== null && message.length > 1000) return { ok: false }

  const rawContact = optionalString(body.contact)
  if (rawContact === undefined) return { ok: false }
  const contact = rawContact === null ? null : rawContact.trim()
  if (contact !== null && contact !== '' && (contact.length > 254 || !EMAIL_RE.test(contact) || hasUnsafe(contact))) {
    return { ok: false }
  }

  const path = optionalString(body.path)
  if (path === undefined) return { ok: false }
  if (path !== null && (path.length > 200 || !path.startsWith('/') || path.startsWith('//') || hasUnsafe(path))) {
    return { ok: false }
  }

  return {
    ok: true,
    row: {
      kind: kind as ReportKind,
      error_kind: errorKind,
      message: message === '' ? null : message,
      contact: contact === '' ? null : contact,
      path,
    },
  }
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error))

  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin')
    const corsAllowed = origin !== null && deps.allowedOrigins.includes(origin)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (corsAllowed) {
      headers['access-control-allow-origin'] = origin as string
      headers['vary'] = 'Origin'
    }
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })

    if (req.method === 'OPTIONS') {
      if (!corsAllowed) return new Response(null, { status: 204, headers: { vary: 'Origin' } })
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin as string,
          vary: 'Origin',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, apikey, x-client-info',
          'access-control-max-age': '86400',
        },
      })
    }
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json(400, { error: 'invalid_input' })
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return json(400, { error: 'invalid_input' })
    const input = body as Record<string, unknown>

    // Honeypot: bots fill the hidden field; pretend success without storing or sending.
    if (typeof input.website === 'string' && input.website !== '') return json(202, { ok: true })

    const parsed = validate(input)
    if (!parsed.ok) return json(400, { error: 'invalid_input' })

    const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const ip = forwarded || 'unknown'
    const userAgent = req.headers.get('user-agent')?.slice(0, 300) || null

    const now = deps.now()
    let row: ReportRow
    try {
      const ipHash = await deps.hashIp(ip)
      const recent = await deps.countRecent(ipHash, new Date(now.getTime() - HOUR_MS).toISOString())
      if (recent >= PER_IP_PER_HOUR) return json(429, { error: 'rate_limited' })
      const total = await deps.countSince(new Date(now.getTime() - DAY_MS).toISOString())
      if (total >= TOTAL_PER_DAY) return json(429, { error: 'rate_limited' })
      row = { ...parsed.row, user_agent: userAgent && stripUnsafe(userAgent), ip_hash: ipHash }
    } catch (error) {
      log('report-login-failure: rate limit check failed', error)
      return json(500, { error: 'unavailable' })
    }

    let id: number
    try {
      id = (await deps.insertReport(row)).id
    } catch (error) {
      log('report-login-failure: insert failed', error)
      return json(500, { error: 'unavailable' })
    }

    try {
      const text = [
        'Alguien reportó un problema para ingresar con Google.',
        '',
        `Tipo: ${row.kind}`,
        `Error: ${row.error_kind ?? '-'}`,
        `Mensaje: ${row.message ?? '-'}`,
        `Contacto: ${row.contact ?? '-'}`,
        `Ruta: ${row.path ?? '-'}`,
        `Navegador: ${row.user_agent ?? '-'}`,
        `Fecha: ${formatBuenosAires(now)} (America/Argentina/Buenos_Aires)`,
      ].join('\n')
      await deps.sendEmail({ subject: SUBJECT, text, ...(row.contact ? { replyTo: row.contact } : {}) })
      await deps.markEmailed(id)
    } catch (error) {
      log('report-login-failure: email failed', error)
    }

    return json(202, { ok: true })
  }
}
