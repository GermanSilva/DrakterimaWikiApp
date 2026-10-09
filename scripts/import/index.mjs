// Pure pipeline: legacy JSON export -> rows + report. No IO; the CLI/loader (later work unit) wraps it.
import { parseLegacy } from './legacy.mjs'
import { buildReport } from './report.mjs'
import { assertNoSecrets, transform } from './transform.mjs'
import { createCollector, validateOutput } from './validate.mjs'
import { auditWikiLinks } from './wikilinks.mjs'

/**
 * @param {string|object} input JSON text or parsed legacy export
 * @param {{ mode?: 'strict'|'lenient', allowPartial?: boolean }} [options]
 * @returns {{ ok: boolean, output: object|null, report: object }}
 *   `output` is null when `ok` is false: nothing may be written from a failed run.
 */
export function buildImport(input, { mode = 'strict', allowPartial = false } = {}) {
  const collector = createCollector(mode)
  const legacy = parseLegacy(input, { collector, allowPartial })
  const output = transform(legacy, collector)
  validateOutput(output, collector)
  assertNoSecrets(output)
  const wikiLinks = auditWikiLinks(output)
  const report = buildReport({ legacy, output, wikiLinks, collector, allowPartial })
  return { ok: report.ok, output: report.ok ? output : null, report }
}

export { parseLegacy, transform, validateOutput, auditWikiLinks, buildReport, createCollector }
export { formatReport } from './report.mjs'
