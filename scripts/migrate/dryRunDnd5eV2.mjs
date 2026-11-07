// Dry run of the D&D v2 data migration (G10c) over a legacy export: runs the TypeScript twin (migrateDnd5eV2) on the characters the
// importer would write and prints COUNTS and WARNING CODES only. It never prints a name, a description or any free text, and it
// reads nothing but the export file you pass and files of this repository. It writes nothing and touches no database.
//
//   node scripts/migrate/dryRunDnd5eV2.mjs <export.json> [--strict]
//
// Needs Node 22.18+ (it loads the TypeScript twin directly). The export is the importer's input (Firestore "Exportar JSON"); keep
// it outside the repository. Exit codes: 0 done, 1 the export is not importable (counts of problems only), 2 bad arguments.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildImport } from '../import/index.mjs'
import { planV2, summariseV2 } from '../import/v2.mjs'

/** Repo-relative location of the migration; falls back to the cwd where import.meta.url is not a file: URL (jsdom tests). */
function migrationPath() {
  try {
    return fileURLToPath(new URL('../../supabase/migrations/20261107120000_dnd5e_v2_data.sql', import.meta.url))
  } catch {
    return join(process.cwd(), 'supabase/migrations/20261107120000_dnd5e_v2_data.sql')
  }
}

/** The v2 preset sheet, read from the migration that seeds it (so the dry run needs no build step). */
export function presetSheetV2(sql = readFileSync(migrationPath(), 'utf8')) {
  const open = '$sheet_v2$'
  const start = sql.indexOf(open)
  const end = sql.indexOf(open, start + open.length)
  if (start < 0 || end < 0) throw new Error('the v2 sheet literal was not found in the migration')
  return JSON.parse(sql.slice(start + open.length, end))
}

/** @returns {{ ok: false, problems: number } | { ok: true, pjs: number, summary: object, warningPjs: Record<string, number[]> }} */
export function dryRun(text, { mode = 'lenient' } = {}) {
  const built = buildImport(text, { mode, allowPartial: true })
  if (!built.ok) return { ok: false, problems: built.report?.issues?.errors ?? 0 }
  const pjRows = built.output.tables.pjs ?? []
  const plan = planV2({ sheet: presetSheetV2(), customFields: built.output.campaign.character_custom_fields, pjRows })
  const warningPjs = {}
  if (plan.applied) for (const w of plan.report.warnings) (warningPjs[w.code] ??= []).push(w.pj_id)
  return { ok: true, pjs: pjRows.length, summary: summariseV2(plan), warningPjs }
}

export function formatDryRun(result) {
  if (!result.ok) return [`The export is not importable (${result.problems} problem(s)); run the importer dry run for the report.`]
  const { counts } = result.summary
  const lines = [`Characters in the export: ${result.pjs}`]
  for (const [key, value] of Object.entries(counts)) lines.push(`  ${key}: ${value}`)
  lines.push(`Campaign sheet gets the custom-fields section: ${result.summary.sheetChanged ? 'yes' : 'no'}`)
  const codes = Object.keys(result.summary.warnings).sort()
  lines.push(codes.length === 0 ? 'Warnings: none' : 'Warnings (code: count; characters by legacy id):')
  for (const code of codes) {
    const ids = [...new Set(result.warningPjs[code].filter((id) => id !== null))].sort((a, b) => a - b)
    lines.push(`  ${code}: ${result.summary.warnings[code]}${ids.length > 0 ? ` (characters ${ids.join(', ')})` : ' (campaign)'}`)
  }
  return lines
}

export function main(argv, io = { read: (p) => readFileSync(p, 'utf8'), out: console.log, err: console.error }) {
  const args = argv.filter((a) => a !== '--strict')
  if (args.length !== 1 || args[0].startsWith('-')) {
    io.err('usage: node scripts/migrate/dryRunDnd5eV2.mjs <export.json> [--strict]')
    return 2
  }
  let text
  try {
    text = io.read(args[0])
  } catch {
    io.err('could not read the export file')
    return 1
  }
  let result
  try {
    result = dryRun(text, { mode: argv.includes('--strict') ? 'strict' : 'lenient' })
  } catch {
    io.err('the export could not be parsed')
    return 1
  }
  for (const line of formatDryRun(result)) io.out(line)
  return result.ok ? 0 : 1
}

if (process.argv[1]?.endsWith('dryRunDnd5eV2.mjs')) process.exitCode = main(process.argv.slice(2))
