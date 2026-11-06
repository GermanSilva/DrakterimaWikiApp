/** Shared helpers of the builder tests: render with a recorder of the draft and read the sheet it would save. */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect } from 'vitest'
import { validateSheet, type Item, type Sheet } from '../sheet/sheetModel'
import { SheetBuilder } from './SheetBuilder'

export const SMALL = { categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items: [], blocks: [] }] }], roles: {} }

type Scope = Pick<typeof screen, 'getByRole' | 'getByLabelText'>

export function setup(initial: unknown = SMALL) {
  let last: unknown = initial
  render(<SheetBuilder initial={initial} onChange={(d) => void (last = d)} />)
  return {
    draft: () => last,
    /** The sheet the draft validates to; fails the test when it is not valid yet. */
    sheet: (): Sheet => {
      const result = validateSheet(last)
      if (!result.ok) throw new Error(`draft is invalid: ${JSON.stringify(result.errors)}`)
      return result.sheet
    },
  }
}

export const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
export const click = (name: string | RegExp, scope: Scope = screen) => fireEvent.click(scope.getByRole('button', { name }))
export const section = (name: string) => screen.getByRole('group', { name: `Sección ${name}` })
export const item = (name: string) => screen.getByRole('group', { name: `Ítem ${name}` })
export const group = (scope: ReturnType<typeof within>, name: string) => scope.getByRole('group', { name })
export const itemsOf = (sheet: Sheet, sectionIndex = 0): Item[] => sheet.categories[0].sections[sectionIndex].items

/** Adds a field to section S and names it; returns the item group (queried again by its new name). */
export function addField(label: string) {
  click('Agregar campo', within(section('S')))
  type(within(item('Nuevo campo')).getByLabelText('Nombre del ítem'), label)
  return item(label)
}

export function addTable(kind: string, label: string) {
  type(within(section('S')).getByLabelText('Tipo de tabla'), kind)
  click('Agregar tabla', within(section('S')))
  type(within(item('Nueva tabla')).getByLabelText('Nombre del ítem'), label)
  return item(label)
}

export const expectSaved = (sheet: Sheet, key: string, expected: unknown) => expect(itemsOf(sheet).find((i) => i.key === key)).toEqual(expected)
