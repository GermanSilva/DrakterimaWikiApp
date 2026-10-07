import { describe, expect, it } from 'vitest'
import { WIKI_INDEX_COLUMNS, WIKI_INDEX_TABLES, join } from './columns'
import { createWikiIndexRepository, toWikiIndexItem, wikiIndexSource } from './wikiIndexRepository'
import { createFakeClient, opsNamed } from './testing/fakeClient'

describe('wiki index repository', () => {
  it('selects only the explicit index columns (no data, no wildcard) filtered by campaign', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [{ id: 1, titulo: 'Cisma', estado: 'secreto' }] }, { data: [] })
    const rows = await createWikiIndexRepository(fake.db, 'lore').list('camp-1')
    expect(opsNamed(fake.calls[0], 'select')[0]).toEqual([join(WIKI_INDEX_COLUMNS.lore)])
    expect(opsNamed(fake.calls[0], 'eq')[0]).toEqual(['campaign_id', 'camp-1'])
    expect(rows).toEqual([{ id: 1, title: 'Cisma', estado: 'secreto' }])
  })

  it('never lists data-bearing or DM columns for any table', () => {
    for (const table of WIKI_INDEX_TABLES) {
      const cols = WIKI_INDEX_COLUMNS[table]
      for (const forbidden of ['data', 'notas', 'secreto', 'ganchos', 'visible_to', '*']) expect(cols).not.toContain(forbidden)
    }
  })

  it('maps rows by their own title column and keeps only index fields, even from a wide Realtime payload', () => {
    expect(toWikiIndexItem('pnjs', { id: 2, nombre: 'Ana', imagen_url: 'https://x', estado: null, data: { secreto: 'x' }, notas: 'dm' })).toEqual({
      id: 2,
      title: 'Ana',
      imagen_url: 'https://x',
      estado: 'publicado',
    })
  })

  it('a partial UPDATE payload only carries the columns it has (so merging keeps the rest)', () => {
    const source = wikiIndexSource(createWikiIndexRepository(createFakeClient().db, 'lugares'))
    expect(source.fromRow({ id: 4, nombre: 'Nuevo' })).toEqual({ id: 4, title: 'Nuevo' })
    expect(source.keyOfRow({ id: 4 })).toBe('4')
    expect(source.table).toBe('lugares')
  })
})
