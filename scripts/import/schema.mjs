// Static knowledge of the target schema used by the legacy import. Plain ESM so Node can run it.
// PROMOTED_COLUMNS mirrors src/data/columns.ts; schema.test.mjs fails if the two drift apart.
import { COLLECTION_LETTER } from '../../src/components/wikiHelpers.js'
import { regionLabel, regionOptions } from '../../src/helpers.js'
import { REGION_COLOR } from '../../src/constants.js'

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
]

/** Tables that can own a row in entity_dm_notes (CHECK in the schema). */
export const DM_NOTES_TYPES = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'mapas']

/** Entity types a player note / read_state row may point at (CHECK in the schema). */
export const NOTE_ENTITY_TYPES = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items']

export const DM_NOTE_FIELDS = ['notas', 'secreto', 'ganchos']

export const PROMOTED_COLUMNS = {
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

/** Nullable promoted columns whose legacy "empty" is '' (written as NULL). */
export const NULLABLE_COLUMNS = {
  sesiones: ['numero', 'fecha'],
  pjs: ['owner_id'],
  map_points: ['link_type', 'link_id'],
}

export const ESTADOS = ['publicado', 'secreto', 'borrador']
export const SESION_TIPOS = ['sesion', 'avance']
export const COINS = ['cp', 'sp', 'ep', 'gp', 'pp']

/** map_points.link_type -> table holding the target row. */
export const LINK_TYPE_TABLE = {
  lugar: 'lugares',
  pnj: 'pnjs',
  faccion: 'facciones',
  lore: 'lore',
  item: 'items',
  sesion: 'sesiones',
  mapa: 'mapas',
}

/** Wiki-link letter -> table. Letters come from the app (S P N G F L I M H). */
export const LETTER_TABLE = Object.fromEntries(Object.entries(COLLECTION_LETTER).map(([table, letter]) => [letter, table]))

/** Tables whose ids come from an identity sequence (the loader must setval past the preserved ids). */
export const IDENTITY_TABLES = [...ENTITY_TABLES, 'disponibilidad']

/** Legacy fields that must never be written anywhere. */
export const DROPPED_FIELDS = ['player_password', 'player_must_change']

export const DEFAULT_REGION_COLOR = '#9ca3af'
export const CANONICAL_REGION_KEYS = regionOptions
export { regionLabel, REGION_COLOR }

export const CAMPAIGN_IDENTITY = { slug: 'drakterima', name: 'Leyendas de Drakterima', system: 'dnd5e' }
export const CHARACTER_CUSTOM_FIELDS = [{ key: 'magralita', label: 'Relación con la Magralita', type: 'text' }]
