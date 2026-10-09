// Output files of the import: the claim-invite CSV and the JSON report. Both land in the gitignored scripts/out/
// directory with owner-only permissions where the platform supports them (the CSV holds live invite codes).
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** A CSV cell. Quotes when needed and neutralises spreadsheet formulas (a leading = + - @ becomes literal text). */
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const iso = (v) => (v instanceof Date ? v.toISOString() : String(v ?? ''))

export function inviteLink(appOrigin, code) {
  return `${appOrigin}/invite/${encodeURIComponent(code)}`
}

/** pj id, nombre, jugador, code, link, expires_at, status. Never printed to the console. */
export function buildInvitesCsv(invites, appOrigin) {
  const header = ['pj_id', 'nombre', 'jugador', 'code', 'link', 'expires_at', 'status']
  const lines = [header.join(',')]
  for (const i of invites) {
    lines.push([i.pjId, i.nombre, i.jugador, i.code, inviteLink(appOrigin, i.code), iso(i.expiresAt), i.status].map(csvCell).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function outputDir(env, repoRoot) {
  return env.IMPORT_OUT_DIR ? env.IMPORT_OUT_DIR : join(repoRoot, 'scripts', 'out')
}

export const stamp = (date = new Date()) => date.toISOString().slice(0, 10)

/** Writes with mode 0600 (best effort on Windows, where the mode is mostly ignored). Returns the path. */
export function writePrivateFile(path, content) {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(path, 0o600) // writeFileSync only applies the mode when it creates the file
  } catch {
    // unsupported filesystem: the directory is gitignored either way
  }
  return path
}
