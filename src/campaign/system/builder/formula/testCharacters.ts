/** The characters a formula is tried on in the builder (S42 d): the campaign's own, plus a built-in example that always exists. */
import type { Sheet } from '../../sheet/sheetModel'

/** A character to try formulas on. `data` is what the sheet reads: flattened values by key (see sheetAccess). */
export interface TestCharacter {
  id: string
  label: string
  data: Record<string, unknown>
}

export const EXAMPLE_CHARACTER_ID = '__ejemplo__'
export const EXAMPLE_CHARACTER_LABEL = 'Personaje de ejemplo'

/** What a character that has nothing stored reads: numbers 0 (a Stat value 10, level 1), flags off, texts and tables empty. */
export function defaultValues(sheet: Sheet): Record<string, unknown> {
  const values: Record<string, unknown> = { nivel: 1 }
  const zero = (key: string, type: string, computed: boolean, fallback?: unknown) => {
    if (computed) return
    if (type === 'number') values[key] = typeof fallback === 'number' ? fallback : 0
    else if (type === 'boolean') values[key] = fallback === true
  }
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.kind === 'field') {
          zero(item.key, item.type, item.formula !== undefined || item.calc !== undefined, item.default)
        } else if (item.type === 'stat') {
          for (const row of item.rows) values[row.key] = 10
        } else if (item.type === 'capacidades') {
          for (const row of item.rows) {
            item.columns.forEach((column, index) => zero(index === 0 ? row.key : `${row.key}__${column.key}`, column.type, column.formula !== undefined, column.default))
          }
        }
      }
    }
  }
  return values
}

/** A character's data over the defaults, so a formula can be tried even when the character lacks some value. */
export const withDefaults = (sheet: Sheet, data: Record<string, unknown>): Record<string, unknown> => ({ ...defaultValues(sheet), ...data })

export const exampleCharacter = (sheet: Sheet): TestCharacter => ({ id: EXAMPLE_CHARACTER_ID, label: EXAMPLE_CHARACTER_LABEL, data: defaultValues(sheet) })
