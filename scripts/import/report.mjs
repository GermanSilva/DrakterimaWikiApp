// Import report. Counts, ids and codes only: it must never contain row text or secrets.
import { IDENTITY_TABLES } from './schema.mjs'

const countBy = (items, key) => {
  const out = {}
  for (const item of items) out[item[key]] = (out[item[key]] ?? 0) + 1
  return out
}

function idRange(rows) {
  if (rows.length === 0) return { count: 0, min: null, max: null, nextSequenceValue: 1 }
  const ids = rows.map((r) => r.id)
  const max = Math.max(...ids)
  return { count: rows.length, min: Math.min(...ids), max, nextSequenceValue: max + 1 }
}

/**
 * @param {{ legacy: object, output: object, wikiLinks: object, collector: object, allowPartial?: boolean }} input
 */
export function buildReport({ legacy, output, wikiLinks, collector, allowPartial = false }) {
  const { tables } = output
  const outCounts = {
    ...Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])),
    entity_dm_notes: output.dmNotes.length,
    game_logs: output.gameLogs.length,
    game_pot: output.gamePot ? 1 : 0,
    campaign_config: output.campaignConfig.length,
    disponibilidad: output.disponibilidad.length,
  }
  const deferredBuckets = Object.values(output.deferred.byPj)
  const deferredCounts = {
    characters: deferredBuckets.length,
    playerNotes: deferredBuckets.reduce((n, b) => n + b.playerNotes.length, 0),
    readStatePlayers: deferredBuckets.reduce((n, b) => n + b.readState.length, 0),
    readStateDm: output.deferred.dm.readState.length,
    availability: deferredBuckets.reduce((n, b) => n + b.availability.length, 0),
  }

  const estadoDistribution = {}
  const secretCounts = {}
  for (const [table, rows] of Object.entries(tables)) {
    const dist = { publicado: 0, secreto: 0, borrador: 0 }
    for (const r of rows) dist[r.estado] += 1
    estadoDistribution[table] = dist
    secretCounts[table] = {
      secreto: dist.secreto,
      withVisibleTo: rows.filter((r) => r.visible_to.length > 0).length,
      withDmNotes: output.dmNotes.filter((n) => n.entity_type === table).length,
    }
  }

  const issues = collector.issues
  const idRanges = Object.fromEntries(
    IDENTITY_TABLES.map((t) => [t, idRange(t === 'disponibilidad' ? output.disponibilidad : (tables[t] ?? []))]),
  )

  return {
    mode: collector.mode,
    allowPartial,
    ok: collector.errors().length === 0,
    campaign: {
      slug: output.campaign.slug,
      regions: output.campaign.regions.length,
      extraRegions: output.extraRegions,
    },
    counts: {
      in: { ...legacy.counts },
      out: outCounts,
    },
    dropped: {
      player_password: output.dropped.pj_credentials,
      player_must_change: output.dropped.pj_must_change_flags,
      login_logs: output.dropped.login_logs,
    },
    estadoDistribution,
    estadoDefaulted: { ...output.estadoDefaulted },
    secretCounts,
    deferred: deferredCounts,
    idRanges,
    wikiLinks,
    issues: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      infos: issues.filter((i) => i.severity === 'info').length,
      byCode: countBy(issues, 'code'),
      list: issues,
    },
  }
}

const line = (label, value) => `  ${label}: ${value}`

/** Plain-text rendering of buildReport(); same guarantees (no row text, no secrets). */
export function formatReport(report) {
  const out = []
  out.push(`Import report (${report.mode}${report.allowPartial ? ', partial allowed' : ''}): ${report.ok ? 'OK' : 'FAILED'}`)
  out.push(`Campaign ${report.campaign.slug}: ${report.campaign.regions} regions (${report.campaign.extraRegions} extra)`)

  out.push('Rows (legacy in -> out):')
  const pairs = {
    sesiones: 'sesiones',
    pjs: 'pjs',
    pnjs: 'pnjs',
    lugares: 'lugares',
    facciones: 'facciones',
    lore: 'lore',
    items: 'items',
    mapas: 'mapas',
    map_points: 'map_points',
    homebrew_rules: 'homebrew_rules',
    disponibilidad: 'disponibilidad',
    game_logs: 'game_logs',
    game_pot: 'game_pot',
    game_config: 'campaign_config',
  }
  for (const [from, to] of Object.entries(pairs)) out.push(line(to, `${report.counts.in[from] ?? 0} -> ${report.counts.out[to] ?? 0}`))
  out.push(line('entity_dm_notes', report.counts.out.entity_dm_notes))

  out.push('Dropped:')
  for (const [k, v] of Object.entries(report.dropped)) out.push(line(k, v))

  out.push('Estado (publicado/secreto/borrador):')
  for (const [t, d] of Object.entries(report.estadoDistribution)) out.push(line(t, `${d.publicado}/${d.secreto}/${d.borrador}`))

  out.push('Secret content (secreto / with visible_to / with dm notes):')
  for (const [t, s] of Object.entries(report.secretCounts)) out.push(line(t, `${s.secreto} / ${s.withVisibleTo} / ${s.withDmNotes}`))

  out.push('Deferred until a user claims a character:')
  for (const [k, v] of Object.entries(report.deferred)) out.push(line(k, v))

  out.push('Id ranges (count, min, max, next sequence value):')
  for (const [t, r] of Object.entries(report.idRanges)) out.push(line(t, `${r.count}, ${r.min ?? '-'}, ${r.max ?? '-'}, ${r.nextSequenceValue}`))

  const w = report.wikiLinks
  out.push(`Wiki links: ${w.total} total, ${w.resolved} resolved, ${w.dangling} dangling, ${w.noLetter} without letter`)
  for (const [letter, s] of Object.entries(w.byLetter)) out.push(line(letter, `${s.total} total, ${s.resolved} resolved, ${s.dangling} dangling`))
  for (const [letter, n] of Object.entries(w.unknownLetters)) out.push(line(`unknown letter ${letter}`, n))

  out.push(`Issues: ${report.issues.errors} errors, ${report.issues.warnings} warnings, ${report.issues.infos} infos`)
  for (const i of report.issues.list) {
    const where = [i.table, i.id !== undefined ? `#${i.id}` : null, i.field, i.count !== undefined ? `x${i.count}` : null].filter(Boolean).join(' ')
    out.push(`  [${i.severity}] ${i.code}${where ? ` (${where})` : ''}`)
  }
  return out.join('\n')
}
