import { describe, expect, it } from 'vitest'
import { readCharacterFields, readRegions } from '../../adapters/hubFormPort'
import { mergeCharacterFields, mergeRegions } from './storedMerge'

describe('mergeRegions with a stored duplicate key', () => {
  const stored = [
    { key: 'norte', label: 'Norte' },
    { key: 'sur', label: 'Sur' },
    { key: 'norte', label: 'Norte (copia)' }, // duplicate: rejected by the parser
    'garbage', // unreadable for another reason
  ]

  it('drops the duplicate of a region the editor removed, so it cannot become the readable one', () => {
    const next = mergeRegions(stored, [{ key: 'sur', label: 'Sur' }])
    expect(next).toEqual([{ key: 'sur', label: 'Sur' }, 'garbage'])
    expect(readRegions(next).regions.map((r) => r.key)).toEqual(['sur'])
  })

  it('keeps the duplicate while its valid twin stays, and always keeps other unreadable entries', () => {
    const next = mergeRegions(stored, [
      { key: 'norte', label: 'Norte' },
      { key: 'sur', label: 'Sur' },
    ])
    expect(next).toContainEqual({ key: 'norte', label: 'Norte (copia)' })
    expect(next).toContain('garbage')
  })
})

describe('mergeCharacterFields with a stored duplicate key', () => {
  const stored = [
    { key: 'raza', label: 'Raza', type: 'text' },
    { key: 'raza', label: 'Raza 2', type: 'text' },
    { label: 'sin clave' },
  ]

  it('drops the duplicate of a removed field but keeps the keyless one', () => {
    const next = mergeCharacterFields(stored, [])
    expect(next).toEqual([{ label: 'sin clave' }])
    expect(readCharacterFields(next).fields).toEqual([])
  })

  it('keeps the duplicate while the valid field stays', () => {
    expect(mergeCharacterFields(stored, [{ key: 'raza', label: 'Raza' }])).toContainEqual({ key: 'raza', label: 'Raza 2', type: 'text' })
  })
})
