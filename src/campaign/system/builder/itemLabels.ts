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
