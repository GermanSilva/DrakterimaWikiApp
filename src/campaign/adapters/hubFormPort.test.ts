import { describe, expect, it } from 'vitest'
import { createHubFormPort, parseCharacterFields } from './hubFormPort'

describe('parseCharacterFields', () => {
  it('keeps entries with a usable key, falls back to the key as label and drops duplicates', () => {
    expect(
      parseCharacterFields([
        { key: 'lema', label: 'Lema', type: 'text' },
        { key: 'sin_label' },
        { key: 'lema', label: 'Otra vez' },
        { key: '  ', label: 'vacía' },
        { label: 'sin key' },
        null,
        'texto',
      ]),
    ).toEqual([
      { key: 'lema', label: 'Lema' },
      { key: 'sin_label', label: 'sin_label' },
    ])
  })

  it('never accepts a key that names something on Object.prototype', () => {
    expect(parseCharacterFields([{ key: '__proto__', label: 'x' }, { key: 'constructor', label: 'y' }, { key: 'prototype', label: 'z' }])).toEqual([])
  })

  it('anything that is not a list is "no fields"', () => {
    for (const raw of [null, undefined, {}, 'x', 3]) expect(parseCharacterFields(raw)).toEqual([])
  })
})

describe('createHubFormPort (characters)', () => {
  const base = { regions: [], pjs: [] }

  it('a DM owns no character in the form sense; a player owns their ids; there is no password access', () => {
    expect(createHubFormPort({ ...base, isDM: true, myCharacterIds: [4] }).ownCharacterIds).toEqual([])
    const player = createHubFormPort({ ...base, isDM: false, myCharacterIds: [4, 5], characterFields: [{ key: 'a', label: 'A' }] })
    expect(player.ownCharacterIds).toEqual([4, 5])
    expect(player.characterFields).toEqual([{ key: 'a', label: 'A' }])
    expect(player.playerAccess).toBe(false)
  })
})
