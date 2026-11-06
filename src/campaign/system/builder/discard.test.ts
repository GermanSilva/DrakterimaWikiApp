import { describe, expect, it } from 'vitest'
import { validateSheet } from '../sheet/sheetModel'
import { STORED_SHEET } from './builderFixture'
import { planRestore } from './discard'
import type { Node, Path } from './draft'
import { removalConflict, removeNode } from './removal'

const NOW = new Date('2026-11-06T10:00:00.000Z')
const AT = '2026-11-06T10:00:00.000Z'
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const draft = (): Node => clone(STORED_SHEET) as unknown as Node
const discardedOf = (d: Node) => (d.discarded ?? []) as { item: Record<string, unknown>; section: string; at: string }[]
const keysOf = (d: Node) => discardedOf(d).map((e) => e.item.key)
const sectionsOf = (d: Node, c: number) => (d.categories as Node[])[c].sections as Node[]
const itemsOf = (d: Node, c = 0, s = 0) => sectionsOf(d, c)[s].items as Node[]
const PERFIL_ITEMS: Path = ['categories', 0, 'sections', 0, 'items']

/** The fixture plus a Stat table and a Capacidades table in the second section of the first category. */
function withTables(): Node {
  const d = draft()
  sectionsOf(d, 0)[1].items = [
    { kind: 'table', type: 'stat', key: 'atrib', label: 'Atributos', rows: [{ key: 'fue', label: 'FUE', modifier: '{valor}', editableBy: 'dm' }, { key: 'des', label: 'DES', modifier: '{valor}', editableBy: 'dm' }] },
    {
      kind: 'table',
      type: 'capacidades',
      key: 'habs',
      label: 'Habs',
      columns: [{ key: 'prof', label: 'Prof', type: 'number', editableBy: 'dm' }, { key: 'nota', label: 'Nota', type: 'short', editableBy: 'dm' }],
      rows: [{ key: 'ath', label: 'Atletismo', stat: 'fue', use: 'valor', editableBy: 'dm' }],
    },
  ]
  return d
}

describe('removing a stored part moves it to discarded', () => {
  it('a stored field keeps its definition, its section and the date; the live sheet no longer has it', () => {
    const next = removeNode(draft(), PERFIL_ITEMS, 1, NOW)
    expect(discardedOf(next)).toEqual([{ item: { kind: 'field', key: 'vida', label: 'Vida', type: 'number', editableBy: 'dm' }, section: 'perfil', at: AT }])
    expect(itemsOf(next).map((i) => i.key)).toEqual(['edad', 'notas_pj'])
  })

  it('blocks and roles that pointed at it are cleaned as before', () => {
    const next = removeNode(draft(), PERFIL_ITEMS, 1, NOW)
    expect(next.roles).toEqual({})
    expect((sectionsOf(next, 0)[0].blocks as Node[])[0].items).toEqual(['edad'])
    expect(keysOf(next)).toEqual(['vida'])
  })

  it('an item added in this session is not kept: it never held data', () => {
    const d = draft()
    itemsOf(d).push({ kind: 'field', key: 'nuevo', label: 'N', type: 'short', editableBy: 'dm', _new: true })
    expect(removeNode(d, PERFIL_ITEMS, 3, NOW).discarded).toBeUndefined()
  })

  it('builder-only properties are not kept', () => {
    const d = draft()
    itemsOf(d)[1]._open = true
    expect(discardedOf(removeNode(d, PERFIL_ITEMS, 1, NOW))[0].item).not.toHaveProperty('_open')
  })

  it('a section discards every stored item it held, remembering the section; a category all of them', () => {
    const section = removeNode(draft(), ['categories', 0, 'sections'], 0, NOW)
    expect(discardedOf(section).map((e) => [e.item.key, e.section])).toEqual([['edad', 'perfil'], ['vida', 'perfil'], ['notas_pj', 'perfil']])
    const category = removeNode(draft(), ['categories'], 1, NOW)
    expect(discardedOf(category).map((e) => [e.item.key, e.section])).toEqual([['conjuros', 'magia']])
  })

  it('a removed Stat or Capacidades row is kept with its table and, for capacidades, the columns of the table', () => {
    const stat = removeNode(withTables(), ['categories', 0, 'sections', 1, 'items', 0, 'rows'], 0, NOW)
    expect(discardedOf(stat)).toEqual([{ item: { kind: 'row', type: 'stat', table: 'atrib', key: 'fue', label: 'FUE', modifier: '{valor}', editableBy: 'dm' }, section: 'extra', at: AT }])
    const capacidades = removeNode(withTables(), ['categories', 0, 'sections', 1, 'items', 1, 'rows'], 0, NOW)
    expect(discardedOf(capacidades)[0].item).toEqual({
      kind: 'row', type: 'capacidades', table: 'habs', key: 'ath', label: 'Atletismo', stat: 'fue', use: 'valor', editableBy: 'dm', columns: ['prof', 'nota'],
    })
  })

  it('a removed column is NOT discarded (its values live inside the rows of the table)', () => {
    expect(removeNode(draft(), ['categories', 1, 'sections', 0, 'items', 0, 'columns'], 1, NOW).discarded).toBeUndefined()
  })

  it('the draft with discarded entries still validates and the list survives', () => {
    const result = validateSheet(removeNode(draft(), PERFIL_ITEMS, 1, NOW))
    expect(result.ok && result.sheet.discarded?.map((e) => e.item.key)).toEqual(['vida'])
  })
})

describe('planRestore', () => {
  const discardedDraft = (): Node => removeNode(draft(), PERFIL_ITEMS, 1, NOW)

  it('puts the item back at the END of its original section and drops the entry', () => {
    const plan = planRestore(discardedDraft(), 'vida')
    if (!plan.ok) throw new Error(plan.message)
    expect(plan.renames).toEqual({})
    expect(plan.warning).toBeNull()
    expect(itemsOf(plan.draft).map((i) => i.key)).toEqual(['edad', 'notas_pj', 'vida'])
    expect(plan.draft.discarded).toBeUndefined()
    expect(itemsOf(plan.draft)[2]).toEqual({ kind: 'field', key: 'vida', label: 'Vida', type: 'number', editableBy: 'dm' })
  })

  it('goes to the last section when the original one is gone', () => {
    const plan = planRestore(removeNode(discardedDraft(), ['categories', 0, 'sections'], 0, NOW), 'vida')
    if (!plan.ok) throw new Error(plan.message)
    expect(itemsOf(plan.draft, 1, 0).map((i) => i.key)).toEqual(['conjuros', 'vida'])
  })

  it('a reused key gets key_2 and a warning naming both', () => {
    const d = discardedDraft()
    itemsOf(d).push({ kind: 'field', key: 'vida', label: 'Vida nueva', type: 'number', editableBy: 'dm' })
    const plan = planRestore(d, 'vida')
    if (!plan.ok) throw new Error(plan.message)
    expect(plan.renames).toEqual({ vida: 'vida_2' })
    expect(plan.warning).toBe('La clave «vida» ya la usa otro campo de la plantilla: se restauró como «vida_2».')
    expect(itemsOf(plan.draft).at(-1)).toMatchObject({ key: 'vida_2', label: 'Vida' })
    expect(itemsOf(plan.draft).find((i) => i.key === 'vida')).toMatchObject({ label: 'Vida nueva' })
  })

  it('walks to the next free key (_3)', () => {
    const d = discardedDraft()
    itemsOf(d).push({ kind: 'field', key: 'vida', label: 'Vida nueva', type: 'number', editableBy: 'dm' }, { kind: 'field', key: 'vida_2', label: 'Otra', type: 'number', editableBy: 'dm' })
    const plan = planRestore(d, 'vida')
    expect(plan.ok && plan.renames).toEqual({ vida: 'vida_3' })
  })

  it('a key that other discarded items hold is not handed out either', () => {
    const d = discardedDraft()
    itemsOf(d).push({ kind: 'field', key: 'vida', label: 'Vida nueva', type: 'number', editableBy: 'dm' })
    d.discarded = [...discardedOf(d), { item: { kind: 'field', key: 'vida_2', label: 'X', type: 'short', editableBy: 'dm' }, section: 'perfil', at: AT }]
    const plan = planRestore(d, 'vida')
    expect(plan.ok && plan.renames).toEqual({ vida: 'vida_3' })
  })

  it('a removed row goes back to the end of its table; with the table gone it cannot be restored', () => {
    const removed = removeNode(withTables(), ['categories', 0, 'sections', 1, 'items', 0, 'rows'], 0, NOW)
    const plan = planRestore(removed, 'fue')
    if (!plan.ok) throw new Error(plan.message)
    const table = itemsOf(plan.draft, 0, 1)[0]
    expect((table.rows as Node[]).map((r) => r.key)).toEqual(['des', 'fue'])
    expect((table.rows as Node[]).at(-1)).toEqual({ key: 'fue', label: 'FUE', modifier: '{valor}', editableBy: 'dm' })

    const noTable = removeNode(removed, ['categories', 0, 'sections', 1, 'items'], 0, NOW)
    expect(planRestore(noTable, 'fue')).toEqual({ ok: false, message: 'No se puede restaurar «FUE»: su tabla «atrib» ya no está en la plantilla. Restaurala primero.' })
  })

  it('an unknown key is refused', () => {
    expect(planRestore(draft(), 'nope').ok).toBe(false)
  })
})

describe('big tables (G7b fix 1)', () => {
  it.each([80, 100])('removing a saved capacidades table of %i rows keeps it and the draft validates', (rows) => {
    const d = draft()
    sectionsOf(d, 0)[1].items = [
      { kind: 'table', type: 'stat', key: 'atrib', label: 'Atributos', rows: [{ key: 'fue', label: 'FUE', modifier: '{valor}', editableBy: 'dm' }] },
      {
        kind: 'table', type: 'capacidades', key: 'habs', label: 'Habs',
        columns: [{ key: 'prof', label: 'Prof', type: 'number', editableBy: 'dm' }],
        rows: Array.from({ length: rows }, (_, n) => ({ key: `hab_${n}`, label: `Habilidad número ${n} con un nombre bastante largo para pesar`, stat: 'fue', use: 'valor', editableBy: 'dm' })),
      },
    ]
    expect(validateSheet(d).ok).toBe(true)
    const next = removeNode(d, ['categories', 0, 'sections', 1, 'items'], 1, NOW)
    expect(keysOf(next)).toEqual(['habs'])
    expect(validateSheet(next).ok).toBe(true)
  })
})

describe('removing something that overlaps a discarded entry (G7b fix 4)', () => {
  it('is refused with a message naming the entry that is already discarded, and nothing changes', () => {
    const first = removeNode(draft(), PERFIL_ITEMS, 1, NOW)
    itemsOf(first).push({ kind: 'field', key: 'vida', label: 'Vida otra vez', type: 'number', editableBy: 'dm' })
    expect(removalConflict(first, PERFIL_ITEMS, 2)).toBe('Ya hay un campo descartado con los mismos datos («Vida»). Restauralo o eliminalo antes de quitar «Vida otra vez».')
  })

  it('also when a table is removed after one of its rows (same data keys)', () => {
    const d = withTables()
    const rowRemoved = removeNode(d, ['categories', 0, 'sections', 1, 'items', 0, 'rows'], 0, NOW)
    expect(keysOf(rowRemoved)).toEqual(['fue'])
    ;(itemsOf(rowRemoved, 0, 1)[0].rows as Node[]).push({ key: 'fue', label: 'FUE', modifier: '{valor}', editableBy: 'dm' }) // the key came back (stored)
    expect(removalConflict(rowRemoved, ['categories', 0, 'sections', 1, 'items'], 0)).toContain('«FUE»')
  })

  it('does not trip on removals that do not overlap, or on parts added in this session', () => {
    const first = removeNode(draft(), PERFIL_ITEMS, 1, NOW)
    expect(removalConflict(first, PERFIL_ITEMS, 0)).toBeNull()
    itemsOf(first).push({ kind: 'field', key: 'vida', label: 'Nueva', type: 'number', editableBy: 'dm', _new: true })
    expect(removalConflict(first, PERFIL_ITEMS, 2)).toBeNull()
  })

  it('remove -> restore -> remove gives one entry with the newest date', () => {
    const first = removeNode(draft(), PERFIL_ITEMS, 1, new Date('2026-10-01T00:00:00.000Z'))
    const plan = planRestore(first, 'vida')
    if (!plan.ok) throw new Error(plan.message)
    const again = removeNode(plan.draft, PERFIL_ITEMS, 2, NOW)
    expect(discardedOf(again).map((e) => [e.item.key, e.at])).toEqual([['vida', AT]])
  })

  it('removeNode itself never drops an older entry: the older definition stays', () => {
    const first = removeNode(draft(), PERFIL_ITEMS, 1, new Date('2026-10-01T00:00:00.000Z'))
    itemsOf(first).push({ kind: 'field', key: 'vida', label: 'Vida otra vez', type: 'number', editableBy: 'dm' })
    const twice = removeNode(first, PERFIL_ITEMS, 2, NOW)
    expect(discardedOf(twice).map((e) => [e.item.label, e.at])).toEqual([['Vida', '2026-10-01T00:00:00.000Z']])
  })
})
