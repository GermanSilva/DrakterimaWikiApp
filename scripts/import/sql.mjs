// SQL builders for the importer. Pure: they return { text, values } pairs for `pg`.
//
// Values NEVER appear in the SQL text: every cell is a `$n` parameter (or the DEFAULT keyword when a row does
// not carry the column). Only identifiers are interpolated, and only after matching a strict pattern; they come
// from the schema constants, never from the export.

const IDENT = /^[a-z_][a-z0-9_]*$/

export function quoteIdent(name) {
  if (typeof name !== 'string' || !IDENT.test(name)) throw new Error('unsafe SQL identifier')
  return `"${name}"`
}

/** Casts for parameters whose type cannot be inferred or needs a non-default wire format. */
export const COLUMN_CASTS = {
  data: 'jsonb',
  sections_updated: 'jsonb',
  monedas: 'jsonb',
  monedas_guardado: 'jsonb',
  prize: 'jsonb',
  value: 'jsonb',
  visible_to: 'bigint[]',
  created_at: 'timestamptz',
  updated_at: 'timestamptz',
  seen_at: 'timestamptz',
}
const JSON_COLUMNS = new Set(['data', 'sections_updated', 'monedas', 'monedas_guardado', 'prize', 'value'])

/** Keeps every statement far below the 65535 bind-parameter limit of the protocol. */
export const MAX_PARAMS = 20000

function encode(column, value) {
  if (value === null || value === undefined) return null
  return JSON_COLUMNS.has(column) ? JSON.stringify(value) : value
}

/** Union of the keys of all rows, in first-seen order (rows may omit optional columns). */
function columnsOf(rows) {
  const seen = new Set()
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key)
  return [...seen]
}

/**
 * Multi-row `INSERT ... ON CONFLICT`.
 *
 * - A column a row does not carry is written as DEFAULT (the schema default, e.g. now() for timestamps).
 * - `onConflict: 'update'` upserts the row only while it belongs to the same campaign
 *   (`WHERE target.campaign_id = excluded.campaign_id`); a row owned by another campaign is neither written
 *   nor returned, so the caller detects it by comparing the returned count with `rowCount`.
 * - `onConflict: 'nothing'` keeps whatever is there.
 *
 * @param {{ table: string, rows: object[], conflictColumns: string[], onConflict: 'update'|'nothing', returning?: string }} spec
 * @returns {{ text: string, values: unknown[], rowCount: number }[]} one statement per chunk
 */
export function buildUpsert({ table, rows, conflictColumns, onConflict, returning }) {
  if (rows.length === 0) return []
  const columns = columnsOf(rows)
  const t = quoteIdent(table)
  const colList = columns.map(quoteIdent).join(', ')
  const conflict = conflictColumns.map(quoteIdent).join(', ')
  const keepOnUpdate = new Set([...conflictColumns, 'campaign_id', 'created_at'])
  const setList = columns
    .filter((c) => !keepOnUpdate.has(c))
    .map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`)
    .join(', ')
  if (onConflict === 'update' && columns.includes('campaign_id') === false) throw new Error('campaign_id is required for an owned upsert')

  const tail =
    onConflict === 'nothing' || setList === ''
      ? ` on conflict (${conflict}) do nothing`
      : ` on conflict (${conflict}) do update set ${setList} where ${t}.campaign_id = excluded.campaign_id`
  const ret = returning ? ` returning ${quoteIdent(returning)}` : ''
  const perChunk = Math.max(1, Math.floor(MAX_PARAMS / columns.length))

  const statements = []
  for (let start = 0; start < rows.length; start += perChunk) {
    const chunk = rows.slice(start, start + perChunk)
    const values = []
    const tuples = chunk.map((row) => {
      const cells = columns.map((column) => {
        if (!(column in row) || row[column] === undefined) return 'default'
        values.push(encode(column, row[column]))
        const cast = COLUMN_CASTS[column]
        return cast ? `$${values.length}::${cast}` : `$${values.length}`
      })
      return `(${cells.join(', ')})`
    })
    statements.push({ text: `insert into public.${t} (${colList}) values ${tuples.join(', ')}${tail}${ret}`, values, rowCount: chunk.length })
  }
  return statements
}

/** Columns of a game_logs row, in the order the builder binds them. */
const GAME_LOG_COLUMNS = [
  ['actor_type', 'text'],
  ['character_id', 'bigint'],
  ['game', 'text'],
  ['play_date', 'date'],
  ['roll', 'smallint'],
  ['prize', 'jsonb'],
  ['prize_target', 'text'],
  ['created_at', 'timestamptz'],
]

/**
 * game_logs have no preserved id (identity), so a re-run must not duplicate them: a row is inserted only when
 * an identical one (same actor, character, game, day, roll, prize and, when known, timestamp) is missing.
 * The partial unique index one-play-per-day is respected through ON CONFLICT DO NOTHING.
 */
export function buildGameLogInsert(rows, campaignId) {
  if (rows.length === 0) return []
  const perChunk = Math.floor(MAX_PARAMS / (GAME_LOG_COLUMNS.length + 1))
  const statements = []
  for (let start = 0; start < rows.length; start += perChunk) {
    const chunk = rows.slice(start, start + perChunk)
    const values = [campaignId]
    const tuples = chunk.map((row) => {
      const cells = GAME_LOG_COLUMNS.map(([column, cast]) => {
        values.push(encode(column, row[column] ?? null))
        return `$${values.length}::${cast}`
      })
      return `(${cells.join(', ')})`
    })
    const names = GAME_LOG_COLUMNS.map(([c]) => c).join(', ')
    const text =
      `insert into public.game_logs (campaign_id, actor_type, character_id, game, play_date, roll, prize, prize_target, created_at) ` +
      `select $1::uuid, v.actor_type, v.character_id, v.game, v.play_date, v.roll, v.prize, v.prize_target, coalesce(v.created_at, now()) ` +
      `from (values ${tuples.join(', ')}) as v(${names}) ` +
      `where not exists (select 1 from public.game_logs g where g.campaign_id = $1::uuid and g.actor_type = v.actor_type ` +
      `and g.character_id is not distinct from v.character_id and g.game = v.game and g.play_date = v.play_date ` +
      `and g.roll = v.roll and g.prize = v.prize and g.prize_target = v.prize_target ` +
      `and (v.created_at is null or g.created_at = v.created_at)) ` +
      `on conflict do nothing returning id`
    statements.push({ text, values, rowCount: chunk.length })
  }
  return statements
}

/** Identity tables whose sequences the import advances (entities + session availability). */
export const SEQUENCE_TABLES = [
  'sesiones',
  'pjs',
  'pnjs',
  'lugares',
  'facciones',
  'lore',
  'items',
  'mapas',
  'map_points',
  'homebrew_rules',
  'disponibilidad',
]

/** Current state of the identity sequence of `table`: last_value is NULL when it was never advanced. */
export function sequenceStateQuery(table) {
  quoteIdent(table)
  return {
    text:
      `select s.last_value::bigint as last_value, (select max(id)::bigint from public.${quoteIdent(table)}) as max_id ` +
      `from pg_sequences s where s.schemaname = 'public' and s.sequencename = split_part(pg_get_serial_sequence($1, 'id'), '.', 2)`,
    values: [`public.${table}`],
  }
}

/**
 * setval past the highest id of the table (all campaigns), never below the sequence's own position.
 * Same semantics as supabase/seed.sql; an untouched empty table gets setval(seq, 1, false) so the first
 * generated id is 1, not 2.
 */
export function setvalStatement(table, state) {
  const floor = Math.max(Number(state.max_id ?? 0), Number(state.last_value ?? 0))
  quoteIdent(table)
  return floor > 0
    ? { text: `select setval(pg_get_serial_sequence($1, 'id'), $2::bigint, true)`, values: [`public.${table}`, floor] }
    : { text: `select setval(pg_get_serial_sequence($1, 'id'), 1, false)`, values: [`public.${table}`] }
}

/** Puts a sequence back where it was (setval is not transactional, so a dry run must undo it by hand). */
export function restoreSequenceStatement(table, state) {
  quoteIdent(table)
  return state.last_value === null || state.last_value === undefined
    ? { text: `select setval(pg_get_serial_sequence($1, 'id'), 1, false)`, values: [`public.${table}`] }
    : { text: `select setval(pg_get_serial_sequence($1, 'id'), $2::bigint, true)`, values: [`public.${table}`, state.last_value] }
}

/** Row counts of one campaign across the imported tables, one cheap query per table. */
export const COUNT_TABLES = [
  ...SEQUENCE_TABLES.filter((t) => t !== 'disponibilidad'),
  'entity_dm_notes',
  'game_logs',
  'disponibilidad',
  'campaign_config',
  'game_pot',
  'campaign_invites',
  'campaign_members',
]

export function countQuery(table, campaignId) {
  return { text: `select count(*)::int as n from public.${quoteIdent(table)} where campaign_id = $1::uuid`, values: [campaignId] }
}
