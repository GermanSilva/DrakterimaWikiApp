import { describe, expect, it } from 'vitest'
import { changes } from './changeCount'

const sheet = (items: unknown[], extra: Record<string, unknown> = {}) => ({ categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items, blocks: [] }] }], roles: {}, ...extra })
const field = (key: string, extra: Record<string, unknown> = {}) => ({ kind: 'field', key, label: key, type: 'number', ...extra })

describe('changes', () => {
  it('is 0 for equal drafts and ignores editor-only properties', () => {
    expect(changes(sheet([field('a')]), sheet([field('a', { _open: true })]))).toBe(0)
  })
  it('counts each changed value, added and removed item', () => {
    expect(changes(sheet([field('a')]), sheet([field('a', { label: 'Otra', formula: '1' })]))).toBe(2)
    expect(changes(sheet([field('a')]), sheet([field('a'), field('b')]))).toBe(1)
    expect(changes(sheet([field('a'), field('b')]), sheet([field('a')]))).toBe(1)
  })
  it('counts a reorder once', () => {
    expect(changes(sheet([field('a'), field('b')]), sheet([field('b'), field('a')]))).toBe(1)
  })
})
