/**
 * Who may write which `pjs.data` key, derived from the sheet (odd/design/sheet-builder.md sections 5 and 8). The database
 * derives the same list in `sheet_guard_access()` (migration 20261028140000); pgTAP 21 and the parity test in
 * dnd5eSheet.test.ts keep the two from drifting apart. The DM is never restricted by the sheet.
 *
 * Where a value lives in `data`:
 *  - field: `data[field.key]`
 *  - Stat row: `data[row.key]` (the value); the name and the modifier formula are structural and never written on a character
 *  - Capacidades row: `data[row.key]` (first value column) and `data[row.key + '__' + column.key]` for the others;
 *    a row value is writable only when the row AND its column allow the player (S11)
 *  - Habilidad / Libre table: `data[table.key]`, an array of rows owned by the character
 *  - coins: never (credited by the server, written by the DM; S12)
 *  - economy table: never (G2c: `data[table.key]` is an amounts object the SQL guard does not derive; DM only, so the
 *    validators reject `editableBy: 'player'` on it)
 */
import type { Sheet } from './sheetModel'

export function playerWritableKeys(sheet: Sheet): string[] {
  const keys = new Set<string>()
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.kind === 'field') {
          if (item.editableBy === 'player' && item.formula === undefined) keys.add(item.key)
        } else if (item.type === 'stat') {
          for (const row of item.rows) if (row.editableBy === 'player') keys.add(row.key)
        } else if (item.type === 'capacidades') {
          for (const row of item.rows) {
            if (row.editableBy !== 'player') continue
            item.columns.forEach((column, index) => {
              if (column.editableBy !== 'player' || column.formula !== undefined) return
              keys.add(index === 0 ? row.key : `${row.key}__${column.key}`)
            })
          }
        } else if (item.type === 'habilidad' || item.type === 'libre') {
          if (item.editableBy === 'player') keys.add(item.key)
        }
      }
    }
  }
  return [...keys].sort()
}
