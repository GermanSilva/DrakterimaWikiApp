export const COLLECTION_LETTER = {
  sesiones:  'S',
  pjs:       'P',
  pnjs:      'N',
  lugares:   'G',
  facciones: 'F',
  lore:      'L',
  items:     'I',
  mapas:     'M',
}

// letra → colección (inverso de COLLECTION_LETTER)
export const LETTER_COLLECTION = Object.fromEntries(
  Object.entries(COLLECTION_LETTER).map(([coll, letter]) => [letter, coll])
)

export function findEntity(db, id) {
  for (const coll of Object.keys(COLLECTION_LETTER)) {
    const entity = (db[coll] || []).find(e => e.id === id)
    if (entity) return { entity, page: coll }
  }
  return null
}

export const COLLECTION_DISPLAY = {
  sesiones:  'Sesión',
  pjs:       'Personaje Jugador',
  pnjs:      'PNJ',
  lugares:   'Lugar',
  facciones: 'Facción',
  lore:      'Lore',
  items:     'Item',
  mapas:     'Mapa',
}
