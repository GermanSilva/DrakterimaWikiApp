// Regenerates src/data/database.types.ts from the local Supabase stack.
// Output goes to a temp file and replaces the real one only when generation succeeded, so a
// failed run (stack down, CLI missing) never truncates the committed types.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, renameSync, copyFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const target = new URL('../src/data/database.types.ts', import.meta.url)
const dir = mkdtempSync(join(tmpdir(), 'dbtypes-'))
const tmp = join(dir, 'database.types.ts')

try {
  // shell: true so `supabase` resolves through PATHEXT on Windows (supabase.cmd / .exe shims)
  const res = spawnSync('supabase gen types typescript --local', { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (res.error || res.status !== 0 || !res.stdout.includes('export type Database')) {
    console.error(res.stderr || (res.error ? String(res.error) : 'supabase gen types produced no Database type'))
    console.error('database.types.ts left untouched. Is the local stack running (`supabase start`)?')
    // exitCode (not process.exit) so the finally block still removes the temp dir
    process.exitCode = res.status || 1
  } else {
    writeFileSync(tmp, res.stdout, 'utf8')
    try {
      renameSync(tmp, target)
    } catch {
      copyFileSync(tmp, target) // rename fails across drives; copy is still after a successful generation
    }
    console.log('src/data/database.types.ts updated')
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
