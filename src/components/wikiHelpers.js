export const COLLECTION_LETTER = {
  sesiones:  'S',
  pjs:       'P',
  pnjs:      'N',
  lugares:   'G',
  facciones: 'F',
  lore:      'L',
  items:     'I',
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
