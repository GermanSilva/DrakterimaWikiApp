const FIELD_LABEL: Record<string, string> = {
  short: 'Campo corto',
  paragraph: 'Campo párrafo',
  number: 'Campo numérico',
  boolean: 'Campo sí/no',
  options: 'Campo de opciones',
}
const TABLE_LABEL: Record<string, string> = {
  stat: 'Tabla de stats',
  capacidades: 'Tabla de capacidades',
  habilidad: 'Tabla de habilidades',
  libre: 'Tabla libre',
  monedas: 'Tabla de monedas',
  economia: 'Tabla de economía',
}

export const itemKindLabel = (item: Record<string, unknown>): string =>
  (item.kind === 'table' ? TABLE_LABEL[String(item.type)] : FIELD_LABEL[String(item.type)]) ?? 'Ítem'

const FIELD_HINT: Record<string, string> = { short: 'texto', paragraph: 'texto', number: 'número', boolean: 'sí/no', options: 'opciones' }

/** The short kind marker the outline shows next to an item: ƒ formula, Σ calculation, else texto / número / sí/no / opciones / tabla. */
export function itemKindHint(item: Record<string, unknown>): string {
  if (item.kind === 'table') return 'tabla'
  if (item.formula !== undefined) return 'ƒ'
  if (item.calc !== undefined) return 'Σ'
  return FIELD_HINT[String(item.type)] ?? 'ítem'
}
