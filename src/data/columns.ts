/**
 * Explicit column lists for every table the client reads or writes.
 *
 * Contract (see README.md):
 *  - Every SELECT uses one of these lists. Never `*`: on the 10 entity tables `visible_to` has no
 *    SELECT privilege for `authenticated`, so `select *` / `returning *` fails with 42501.
 *  - `visible_to` never appears here. It is read with `get_entity_visibility` and written with
 *    `set_entity_visibility` (DM-only RPCs).
 *  - Write lists contain only columns the client may send; server-managed columns (id on create,
 *    created_by, created_at, updated_at) are excluded.
 */

export const ENTITY_TABLES = [
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
] as const

export type EntityTable = (typeof ENTITY_TABLES)[number]

/** Tables that can have a row in `entity_dm_notes` (CHECK constraint in the schema). */
export const DM_NOTES_TYPES = [
  'sesiones',
  'pjs',
  'pnjs',
  'lugares',
  'facciones',
  'lore',
  'items',
  'mapas',
] as const

export type DmNotesType = (typeof DM_NOTES_TYPES)[number]

/** Keys that live in `entity_dm_notes` and must never reach an entity row (players could read it). */
export const DM_NOTE_FIELDS = ['notas', 'secreto', 'ganchos'] as const
export type DmNoteField = (typeof DM_NOTE_FIELDS)[number]

/**
 * Writable, non-`data` columns per entity table ("promoted" columns). Everything else a flat
 * entity carries is stored in the `data` jsonb column.
 */
export const PROMOTED_COLUMNS: Record<EntityTable, readonly string[]> = {
  sesiones: ['tipo', 'numero', 'orden', 'titulo', 'fecha', 'imagen_url', 'estado'],
  pjs: [
    'owner_id',
    'nombre',
    'jugador',
    'clase',
    'raza',
    'region',
    'nivel',
    'imagen_url',
    'sections_updated',
    'monedas',
    'monedas_guardado',
    'estado',
  ],
  pnjs: ['nombre', 'region', 'relacion', 'imagen_url', 'estado'],
  lugares: ['nombre', 'region', 'tipo', 'imagen_url', 'estado'],
  facciones: ['nombre', 'tipo', 'region', 'relacion', 'imagen_url', 'estado'],
  lore: ['titulo', 'categoria', 'estado'],
  items: ['nombre', 'tipo', 'rareza', 'imagen_url', 'estado'],
  mapas: ['nombre', 'imagen_url', 'is_default', 'estado'],
  map_points: ['map_id', 'nombre', 'x', 'y', 'link_type', 'link_id', 'estado'],
  homebrew_rules: ['nombre', 'texto', 'estado'],
}

/**
 * Nullable promoted columns whose UI representation of "empty" is '' (Firestore forms): the
 * empty string is written as NULL. Required text columns (nombre, region, ...) keep ''.
 */
export const NULLABLE_COLUMNS: Partial<Record<EntityTable, readonly string[]>> = {
  sesiones: ['numero', 'fecha'],
  pjs: ['owner_id'],
  map_points: ['link_type', 'link_id'],
}

/**
 * Whole-object jsonb columns. PostgREST replaces them as a unit, so patches shallow-merge onto the
 * current server value under an updated_at guard (same as the `data` column).
 */
export const MERGED_OBJECT_COLUMNS: Partial<Record<EntityTable, readonly string[]>> = {
  pjs: ['sections_updated', 'monedas', 'monedas_guardado'],
}

/** Read-only columns present on every entity row. */
export const ENTITY_META_COLUMNS = ['id', 'campaign_id', 'created_by', 'created_at', 'updated_at'] as const

export function entitySelectColumns(table: EntityTable): string[] {
  return [...ENTITY_META_COLUMNS, ...PROMOTED_COLUMNS[table], 'data']
}

export const ENTITY_SELECT: Record<EntityTable, string> = Object.fromEntries(
  ENTITY_TABLES.map((t) => [t, entitySelectColumns(t).join(', ')]),
) as Record<EntityTable, string>

export const PROFILE_COLUMNS = ['id', 'display_name', 'avatar_url', 'created_at', 'updated_at'] as const

export const CAMPAIGN_COLUMNS = [
  'id',
  'slug',
  'name',
  'system',
  'branding',
  'regions',
  'character_custom_fields',
  'settings',
  'created_by',
  'created_at',
  'updated_at',
] as const

export const CAMPAIGN_MEMBER_COLUMNS = ['campaign_id', 'user_id', 'role', 'created_at', 'updated_at'] as const

export const INVITE_COLUMNS = [
  'id',
  'campaign_id',
  'code',
  'role',
  'character_id',
  'max_uses',
  'uses',
  'expires_at',
  'created_by',
  'created_at',
] as const

/** Columns the client may send when creating an invite (column-level INSERT grant). */
export const INVITE_WRITE_COLUMNS = ['campaign_id', 'role', 'character_id', 'max_uses', 'expires_at'] as const

export const DM_NOTES_COLUMNS = [
  'id',
  'campaign_id',
  'entity_type',
  'entity_id',
  'notas',
  'secreto',
  'ganchos',
  'created_at',
  'updated_at',
] as const

export const PLAYER_NOTE_COLUMNS = [
  'campaign_id',
  'user_id',
  'entity_type',
  'entity_id',
  'character_id',
  'text',
  'created_at',
  'updated_at',
] as const

export const READ_STATE_COLUMNS = ['user_id', 'campaign_id', 'entity_type', 'entity_id', 'section', 'seen_at'] as const

export const DISPONIBILIDAD_COLUMNS = [
  'id',
  'campaign_id',
  'tipo',
  'character_id',
  'fecha',
  'fecha_inicio',
  'fecha_fin',
  'hora_inicio',
  'hora_fin',
  'created_by',
  'created_at',
  'updated_at',
] as const

/** Nullable columns of disponibilidad ('' is written as NULL). */
export const DISPONIBILIDAD_NULLABLE = ['character_id', 'fecha', 'fecha_inicio', 'fecha_fin', 'hora_inicio', 'hora_fin'] as const

export const DISPONIBILIDAD_WRITE_COLUMNS = [
  'tipo',
  'character_id',
  'fecha',
  'fecha_inicio',
  'fecha_fin',
  'hora_inicio',
  'hora_fin',
] as const

export const CAMPAIGN_CONFIG_COLUMNS = ['campaign_id', 'key', 'value', 'visibility', 'updated_at'] as const

export const GAME_LOG_COLUMNS = [
  'id',
  'campaign_id',
  'actor_type',
  'character_id',
  'game',
  'play_date',
  'roll',
  'prize',
  'prize_target',
  'created_at',
] as const

export const GAME_POT_COLUMNS = ['campaign_id', 'cp', 'sp', 'ep', 'gp', 'pp', 'updated_at'] as const

export const join = (cols: readonly string[]): string => cols.join(', ')

/** Every list above, for the guard test (no `*`, no `visible_to`). */
export const ALL_COLUMN_LISTS: Record<string, readonly string[]> = {
  ...Object.fromEntries(
    ENTITY_TABLES.flatMap((t) => [
      [`${t}.select`, entitySelectColumns(t)],
      [`${t}.promoted`, PROMOTED_COLUMNS[t]],
    ]),
  ),
  profiles: PROFILE_COLUMNS,
  campaigns: CAMPAIGN_COLUMNS,
  campaign_members: CAMPAIGN_MEMBER_COLUMNS,
  campaign_invites: INVITE_COLUMNS,
  campaign_invites_write: INVITE_WRITE_COLUMNS,
  entity_dm_notes: DM_NOTES_COLUMNS,
  player_notes: PLAYER_NOTE_COLUMNS,
  read_state: READ_STATE_COLUMNS,
  disponibilidad: DISPONIBILIDAD_COLUMNS,
  disponibilidad_write: DISPONIBILIDAD_WRITE_COLUMNS,
  campaign_config: CAMPAIGN_CONFIG_COLUMNS,
  game_logs: GAME_LOG_COLUMNS,
  game_pot: GAME_POT_COLUMNS,
}
