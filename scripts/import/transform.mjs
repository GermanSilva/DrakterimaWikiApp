// Per-collection transformers: normalised legacy data -> rows ready to insert into Supabase.
//
// Pure (no IO). Rows carry NO campaign_id: the loader injects the id of the campaign it creates
// (or finds by slug). Entity rows keep their legacy numeric id; the loader must advance each
// identity sequence past the ids reported by report.mjs.
//
// Output shape:
//   campaign        row for `campaigns`
//   tables          { sesiones: [...], ..., homebrew_rules: [...] } entity rows (id, columns, estado, visible_to, data)
//   dmNotes         rows for `entity_dm_notes` (separate from the entity rows by design)
//   gameLogs        rows for `game_logs` (no id: identity), deduped per character/day
//   gamePot         row for `game_pot` or null
//   campaignConfig  rows for `campaign_config` ('loteria' -> members, 'session_screen' -> dm)
//   disponibilidad  rows for `disponibilidad` (tipo 'sesion' only; personal ones are deferred)
//   deferred        data that needs a user account: { byPj: { [pjId]: { playerNotes, readState, availability } }, dm: { readState } }
//   dropped         counts of fields/collections deliberately not imported
import {
  CAMPAIGN_IDENTITY,
  CANONICAL_REGION_KEYS,
  CHARACTER_CUSTOM_FIELDS,
  COINS,
  DEFAULT_REGION_COLOR,
  DM_NOTES_TYPES,
  DM_NOTE_FIELDS,
  DROPPED_FIELDS,
  ENTITY_TABLES,
  NOTE_ENTITY_TYPES,
  NULLABLE_COLUMNS,
  PROMOTED_COLUMNS,
  REGION_COLOR,
  SESION_TIPOS,
  regionLabel,
} from './schema.mjs'
import {
  checkLinkPair,
  checkNivel,
  checkUnit,
  isEmpty,
  isEstado,
  isPlainObject,
  isValidDate,
  isValidTime,
  toId,
  toIso,
} from './validate.mjs'

/** Flat keys never copied into a row: server-managed, tenant key, or handled explicitly. */
const RESERVED_KEYS = new Set(['id', 'campaign_id', 'created_by', 'created_at', 'updated_at', 'visible_to', 'createdAt', 'updatedAt'])
const NON_TEXT_COLUMNS = new Set([
  'numero',
  'orden',
  'fecha',
  'nivel',
  'x',
  'y',
  'map_id',
  'link_id',
  'owner_id',
  'is_default',
  'sections_updated',
  'monedas',
  'monedas_guardado',
])
const OBJECT_COLUMNS = new Set(['sections_updated', 'monedas', 'monedas_guardado'])

/** Mirror of mappers.ts splitFlat: promoted columns / data keys / DM-private notes. */
export function splitFlat(table, flat) {
  const promoted = new Set(PROMOTED_COLUMNS[table])
  const nullable = new Set(NULLABLE_COLUMNS[table] ?? [])
  const columns = {}
  const data = {}
  const dmNotes = {}
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined || RESERVED_KEYS.has(key)) continue
    if (DM_NOTE_FIELDS.includes(key)) dmNotes[key] = typeof value === 'string' ? value : String(value ?? '')
    else if (promoted.has(key)) columns[key] = nullable.has(key) && value === '' ? null : value
    else data[key] = value
  }
  return { columns, data, dmNotes }
}

const byId = (a, b) => a.id - b.id

function timestamps(doc, loc, collector) {
  const out = {}
  for (const [src, dst] of [
    ['createdAt', 'created_at'],
    ['updatedAt', 'updated_at'],
  ]) {
    if (isEmpty(doc[src])) continue
    const iso = toIso(doc[src])
    if (iso) out[dst] = iso
    else collector.warn('invalid_timestamp', { ...loc, field: src })
  }
  return out
}

function coerceColumns(table, columns, loc, collector) {
  const out = {}
  for (const [key, value] of Object.entries(columns)) {
    if (value === null) {
      // NULL is only valid in the nullable columns; for the rest the column default applies
      if ((NULLABLE_COLUMNS[table] ?? []).includes(key)) out[key] = null
      continue
    }
    if (OBJECT_COLUMNS.has(key)) {
      if (isPlainObject(value)) out[key] = value
      else collector.problem('invalid_object_column', { ...loc, field: key })
      continue
    }
    if (!NON_TEXT_COLUMNS.has(key)) {
      out[key] = typeof value === 'string' ? value : String(value)
      continue
    }
    out[key] = value
  }

  if ('numero' in out && out.numero !== null) {
    const n = typeof out.numero === 'string' ? Number(out.numero) : out.numero
    if (Number.isInteger(n)) out.numero = n
    else {
      collector.problem('invalid_numero', { ...loc, field: 'numero' })
      out.numero = null
    }
  }
  if ('orden' in out) {
    const n = typeof out.orden === 'string' && out.orden.trim() !== '' ? Number(out.orden) : out.orden
    if (typeof n === 'number' && Number.isFinite(n)) out.orden = n
    else {
      collector.problem('invalid_orden', { ...loc, field: 'orden' })
      delete out.orden
    }
  }
  if ('fecha' in out && out.fecha !== null) {
    const m = typeof out.fecha === 'string' ? /^(\d{4}-\d{2}-\d{2})(T.*)?$/.exec(out.fecha) : null
    if (m && isValidDate(m[1])) out.fecha = m[1]
    else {
      collector.problem('invalid_fecha', { ...loc, field: 'fecha' })
      out.fecha = null
    }
  }
  if (table === 'sesiones' && 'tipo' in out && !SESION_TIPOS.includes(out.tipo)) {
    collector.problem('invalid_sesion_tipo', { ...loc, field: 'tipo' })
    out.tipo = 'sesion'
  }
  if ('nivel' in out) {
    const { value, ok } = checkNivel(out.nivel)
    if (!ok) collector.problem('nivel_out_of_range', { ...loc, field: 'nivel' })
    out.nivel = value
  }
  if ('is_default' in out) out.is_default = out.is_default === true
  if ('x' in out) {
    const { value, ok } = checkUnit(out.x)
    if (!ok) collector.problem('coordinate_out_of_range', { ...loc, field: 'x' })
    out.x = value
  }
  if ('y' in out) {
    const { value, ok } = checkUnit(out.y)
    if (!ok) collector.problem('coordinate_out_of_range', { ...loc, field: 'y' })
    out.y = value
  }
  return out
}

function transformEntity(table, doc, ctx) {
  const { collector } = ctx
  const loc = { table, id: doc.id }
  const flat = { ...doc }

  for (const key of DROPPED_FIELDS) {
    if (key in flat) {
      if (table === 'pjs') ctx.dropped[key === 'player_password' ? 'pj_credentials' : 'pj_must_change_flags'] += 1
      delete flat[key]
    }
  }
  delete flat.owner_id // legacy documents have no auth users; ownership is assigned by invites/claims

  // estado / visibilidad
  let estado = 'publicado'
  if (flat.estado === undefined || flat.estado === null || flat.estado === '') ctx.estadoDefaulted[table] = (ctx.estadoDefaulted[table] ?? 0) + 1
  else if (isEstado(flat.estado)) estado = flat.estado
  else {
    // fail closed: an unknown state must not publish the row
    collector.problem('invalid_estado', { ...loc, field: 'estado' })
    estado = 'borrador'
  }
  delete flat.estado

  let visibleTo = []
  if (flat.visibilidad !== undefined && flat.visibilidad !== null) {
    if (Array.isArray(flat.visibilidad)) {
      for (const v of flat.visibilidad) {
        const pjId = toId(v)
        if (pjId === null) collector.problem('invalid_visibility_id', { ...loc, field: 'visibilidad' })
        else visibleTo.push(pjId)
      }
    } else collector.problem('invalid_visibility_id', { ...loc, field: 'visibilidad' })
  }
  visibleTo = [...new Set(visibleTo)].sort((a, b) => a - b)
  delete flat.visibilidad

  // campaign-specific field -> data.custom_fields
  let customFields
  if (table === 'pjs') {
    const m = flat.magralita
    delete flat.magralita
    if (typeof m === 'string' && m !== '') customFields = { magralita: m }
    else if (m !== undefined && m !== null && m !== '' && typeof m !== 'string') collector.problem('invalid_custom_field', { ...loc, field: 'magralita' })
  }

  // map_points: pre-normalise the link pair before the generic split
  if (table === 'map_points') {
    const mapId = toId(flat.map_id)
    if (mapId === null) {
      collector.problem('invalid_map_id', { ...loc, field: 'map_id' })
      return null
    }
    flat.map_id = mapId
    const linkType = isEmpty(flat.link_type) ? null : flat.link_type
    let linkId = null
    let reported = false
    if (!isEmpty(flat.link_id)) {
      linkId = toId(flat.link_id)
      if (linkId === null) {
        collector.problem('invalid_link_id', { ...loc, field: 'link_id' })
        reported = true
      }
    }
    if (checkLinkPair(linkType, linkId) !== 'ok') {
      if (!reported) collector.problem('invalid_link_pair', { ...loc, field: 'link_type' })
      flat.link_type = null
      flat.link_id = null
    } else {
      flat.link_type = linkType
      flat.link_id = linkId
    }
  }

  const stamps = timestamps(doc, loc, collector)
  const { columns, data, dmNotes } = splitFlat(table, flat)
  const coerced = coerceColumns(table, columns, loc, collector)
  if (table === 'map_points') {
    // splitFlat turns '' into NULL only for link_*; make sure nothing else is missing
    coerced.link_type ??= null
    coerced.link_id ??= null
  }
  if (customFields) {
    const existing = isPlainObject(data.custom_fields) ? data.custom_fields : {}
    data.custom_fields = { ...existing, ...customFields }
  }

  const row = { id: doc.id, ...coerced, estado, visible_to: visibleTo, ...stamps, data }

  // DM-private text goes to entity_dm_notes, never into the entity row
  let note = null
  const hasText = DM_NOTE_FIELDS.some((f) => typeof dmNotes[f] === 'string' && dmNotes[f].trim() !== '')
  if (hasText) {
    if (DM_NOTES_TYPES.includes(table)) {
      note = {
        entity_type: table,
        entity_id: doc.id,
        notas: dmNotes.notas ?? '',
        secreto: dmNotes.secreto ?? '',
        ganchos: dmNotes.ganchos ?? '',
      }
    } else {
      // there is nowhere private to put it and the entity row is player-readable: never inline it
      collector.problem('dm_notes_unsupported_table', loc)
    }
  }
  return { row, note }
}

function buildRegions(tables) {
  const found = new Set()
  for (const t of ['pjs', 'pnjs', 'lugares', 'facciones']) {
    for (const row of tables[t] ?? []) if (typeof row.region === 'string' && row.region !== '') found.add(row.region)
  }
  const extras = [...found].filter((k) => !CANONICAL_REGION_KEYS.includes(k)).sort()
  const regions = [
    ...CANONICAL_REGION_KEYS.map((key) => ({ key, label: regionLabel[key] ?? key, color: REGION_COLOR[key] ?? DEFAULT_REGION_COLOR })),
    ...extras.map((key) => ({ key, label: key, color: DEFAULT_REGION_COLOR })),
  ]
  return { regions, extras }
}

function normaliseCoins(source, loc, collector, { clampOnly = false } = {}) {
  const out = {}
  for (const coin of COINS) {
    const v = source?.[coin]
    if (v === undefined || v === null || v === '') {
      if (!clampOnly) out[coin] = 0
      continue
    }
    const n = typeof v === 'string' ? Number(v) : v
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && Number.isInteger(n)) out[coin] = n
    else {
      collector.problem('invalid_coin_amount', { ...loc, field: coin })
      out[coin] = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
    }
  }
  return out
}

function transformGameLogs(docs, pjIds, collector) {
  const rows = []
  for (const doc of docs) {
    const loc = { table: 'game_logs', id: String(doc.id ?? '') }
    const actor = doc.actorType
    const target = doc.prizeTarget
    if (actor !== 'player' && actor !== 'dm') {
      collector.problem('invalid_game_log', { ...loc, field: 'actorType' })
      continue
    }
    if (target !== 'player' && target !== 'pot') {
      collector.problem('invalid_game_log', { ...loc, field: 'prizeTarget' })
      continue
    }
    if ((actor === 'player') !== (target === 'player')) {
      collector.problem('game_log_actor_target_mismatch', loc)
      continue
    }
    const roll = typeof doc.roll === 'string' && doc.roll.trim() !== '' ? Number(doc.roll) : doc.roll
    if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
      collector.problem('roll_out_of_range', { ...loc, field: 'roll' })
      continue
    }
    let playDate = doc.date
    if (!isValidDate(playDate)) {
      const iso = toIso(doc.timestamp)
      playDate = iso ? iso.slice(0, 10) : null
    }
    if (playDate === null) {
      collector.problem('invalid_play_date', { ...loc, field: 'date' })
      continue
    }
    let characterId = null
    if (actor === 'player') {
      const id = toId(doc.playerId)
      if (id !== null && pjIds.has(id)) characterId = id
      else collector.warn('game_log_unknown_character', loc)
    }
    const createdAt = toIso(doc.timestamp)
    rows.push({
      actor_type: actor,
      character_id: characterId,
      game: typeof doc.game === 'string' && doc.game !== '' ? doc.game : 'loteria',
      play_date: playDate,
      roll,
      prize: normaliseCoins(isPlainObject(doc.prize) ? doc.prize : {}, loc, collector, { clampOnly: true }),
      prize_target: target,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
  }

  // game_logs_one_play_per_day: keep the earliest play of each character/day
  const keep = new Map()
  const sorted = [...rows].sort((a, b) => (a.created_at ?? '￿').localeCompare(b.created_at ?? '￿'))
  const out = []
  let dupes = 0
  for (const r of sorted) {
    if (r.actor_type === 'player' && r.character_id !== null) {
      const key = `${r.character_id}|${r.game}|${r.play_date}`
      if (keep.has(key)) {
        dupes += 1
        continue
      }
      keep.set(key, true)
    }
    out.push(r)
  }
  if (dupes > 0) collector.warn('duplicate_daily_game_log', { table: 'game_logs', count: dupes })
  return out
}

function transformAvailability(docs, pjIds, collector, bucket) {
  const sesion = []
  for (const doc of docs) {
    const loc = { table: 'disponibilidad', id: doc.id }
    const tipo = doc.tipo
    if (tipo !== 'sesion' && tipo !== 'personal' && tipo !== 'no_disponible') {
      collector.problem('invalid_availability_tipo', { ...loc, field: 'tipo' })
      continue
    }
    const f = {}
    for (const k of ['fecha', 'fecha_inicio', 'fecha_fin', 'hora_inicio', 'hora_fin']) f[k] = isEmpty(doc[k]) ? null : doc[k]
    const datesOk = [f.fecha, f.fecha_inicio, f.fecha_fin].every((v) => v === null || isValidDate(v))
    const timesOk = [f.hora_inicio, f.hora_fin].every((v) => v === null || isValidTime(v))
    const complete = f.fecha_inicio && f.fecha_fin && f.hora_inicio && f.hora_fin
    let valid = datesOk && timesOk
    if (tipo === 'no_disponible') valid = valid && f.fecha !== null
    else valid = valid && Boolean(complete) && f.fecha_fin >= f.fecha_inicio
    if (!valid) {
      collector.problem('invalid_availability', loc)
      continue
    }
    const stamps = timestamps(doc, loc, collector)
    if (tipo === 'sesion') {
      sesion.push({ id: doc.id, tipo, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, ...stamps })
      continue
    }
    const pjId = toId(doc.pj_id)
    if (pjId === null || !pjIds.has(pjId)) {
      collector.warn('availability_unknown_character', loc)
      continue
    }
    bucket(pjId).availability.push({ tipo, fecha: f.fecha, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, ...stamps })
  }
  return sesion.sort(byId)
}

function transformPlayerNotes(docs, tables, collector, bucket) {
  const ids = {}
  const idsOf = (t) => (ids[t] ??= new Set((tables[t] ?? []).map((r) => r.id)))
  const seen = new Set()
  let empty = 0
  for (const doc of docs) {
    const loc = { table: 'player_notes', id: String(doc.id ?? '') }
    const pjId = toId(doc.pj_id)
    const entityId = toId(doc.entity_id)
    if (pjId === null || entityId === null || !idsOf('pjs').has(pjId)) {
      collector.warn('player_note_unknown_character', loc)
      continue
    }
    if (!NOTE_ENTITY_TYPES.includes(doc.type)) {
      collector.problem('player_note_unsupported_type', { ...loc, field: 'type' })
      continue
    }
    if (typeof doc.text !== 'string' || doc.text.trim() === '') {
      empty += 1
      continue
    }
    if (!idsOf(doc.type).has(entityId)) {
      collector.warn('player_note_dangling_entity', loc)
      continue
    }
    const key = `${pjId}|${doc.type}|${entityId}`
    if (seen.has(key)) {
      collector.warn('duplicate_player_note', loc)
      continue
    }
    seen.add(key)
    bucket(pjId).playerNotes.push({ entity_type: doc.type, entity_id: entityId, text: doc.text, ...timestamps(doc, loc, collector) })
  }
  if (empty > 0) collector.info('empty_player_notes_skipped', { table: 'player_notes', count: empty })
}

function transformReadState(docs, tables, collector, bucket, dmBucket) {
  const ids = {}
  const idsOf = (t) => (ids[t] ??= new Set((tables[t] ?? []).map((r) => r.id)))
  const latest = new Map()
  for (const doc of docs) {
    const loc = { table: 'read_state', id: String(doc.id ?? '') }
    const entityId = toId(doc.entityId)
    if (!NOTE_ENTITY_TYPES.includes(doc.type) || entityId === null) {
      collector.warn('read_state_unsupported', loc)
      continue
    }
    if (!idsOf(doc.type).has(entityId)) {
      collector.warn('read_state_dangling_entity', loc)
      continue
    }
    const seenAt = toIso(doc.seenAt)
    if (!seenAt) {
      collector.warn('read_state_invalid_timestamp', loc)
      continue
    }
    let viewer
    if (doc.viewerId === 'dm') viewer = 'dm'
    else {
      const pjId = toId(doc.viewerId)
      if (pjId === null || !idsOf('pjs').has(pjId)) {
        collector.warn('read_state_unknown_viewer', loc)
        continue
      }
      viewer = pjId
    }
    const section = typeof doc.section === 'string' ? doc.section : ''
    const key = `${viewer}|${doc.type}|${entityId}|${section}`
    const prev = latest.get(key)
    if (!prev || prev.row.seen_at < seenAt) latest.set(key, { viewer, row: { entity_type: doc.type, entity_id: entityId, section, seen_at: seenAt } })
  }
  for (const { viewer, row } of latest.values()) (viewer === 'dm' ? dmBucket : bucket(viewer).readState).push(row)
}

/**
 * @param {ReturnType<import('./legacy.mjs').parseLegacy>} legacy
 * @param {ReturnType<import('./validate.mjs').createCollector>} collector
 */
export function transform(legacy, collector) {
  const { data } = legacy
  const ctx = {
    collector,
    dropped: { pj_credentials: 0, pj_must_change_flags: 0 },
    estadoDefaulted: {},
  }

  const tables = {}
  const dmNotes = []
  for (const table of ENTITY_TABLES) {
    const rows = []
    for (const doc of data[table] ?? []) {
      const res = transformEntity(table, doc, ctx)
      if (!res) continue
      rows.push(res.row)
      if (res.note) dmNotes.push(res.note)
    }
    tables[table] = rows.sort(byId)
  }
  dmNotes.sort((a, b) => a.entity_type.localeCompare(b.entity_type) || a.entity_id - b.entity_id)

  const pjIds = new Set(tables.pjs.map((r) => r.id))
  const deferred = { byPj: {}, dm: { readState: [] } }
  const bucket = (pjId) => (deferred.byPj[pjId] ??= { playerNotes: [], readState: [], availability: [] })

  const { regions, extras } = buildRegions(tables)
  if (extras.length > 0) collector.info('extra_regions_added', { count: extras.length })

  const gameLogs = transformGameLogs(data.game_logs, pjIds, collector)
  const disponibilidad = transformAvailability(data.disponibilidad, pjIds, collector, bucket)
  transformPlayerNotes(data.player_notes, tables, collector, bucket)
  transformReadState(data.read_state, tables, collector, bucket, deferred.dm.readState)

  let gamePot = null
  if (data.game_pot.length > 0) {
    const doc = data.game_pot.find((d) => d.id === 'current') ?? data.game_pot[0]
    if (data.game_pot.length > 1) collector.warn('multiple_game_pot_docs', { table: 'game_pot', count: data.game_pot.length })
    gamePot = normaliseCoins(doc, { table: 'game_pot' }, collector)
  }

  const campaignConfig = []
  for (const doc of data.game_config) {
    const { id, ...value } = doc
    if (id === 'loteria') campaignConfig.push({ key: 'loteria', value, visibility: 'members' })
    else if (id === 'session_screen') campaignConfig.push({ key: 'session_screen', value, visibility: 'dm' })
    else collector.warn('unknown_config_key', { table: 'game_config' })
  }

  return {
    campaign: {
      ...CAMPAIGN_IDENTITY,
      branding: {},
      regions,
      character_custom_fields: CHARACTER_CUSTOM_FIELDS.map((f) => ({ ...f })),
    },
    tables,
    dmNotes,
    gameLogs,
    gamePot,
    campaignConfig,
    disponibilidad,
    deferred,
    dropped: { ...ctx.dropped, login_logs: legacy.counts.login_logs ?? 0 },
    estadoDefaulted: ctx.estadoDefaulted,
    extraRegions: extras.length,
  }
}

/** Last line of defence: nothing secret may leave the transformer, wherever it came from. */
export function assertNoSecrets(output) {
  const text = JSON.stringify(output)
  for (const key of DROPPED_FIELDS) {
    if (text.includes(`"${key}"`)) throw new Error(`refusing to emit output containing ${key}`)
  }
}
