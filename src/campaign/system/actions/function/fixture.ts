/** A small sheet for the action function tests: numbers, a role pair, a Libre slots table and a Habilidad table with per-character state. */
import { validateSheet, type Sheet } from '../../sheet/sheetModel'

type Loose = Record<string, unknown>
const field = (key: string, type: string, extra: Loose = {}) => ({ kind: 'field', key, label: key, type, editableBy: 'dm', ...extra })
const column = (key: string, type: string, extra: Loose = {}) => ({ key, label: key, type, editableBy: 'dm', ...extra })

export const FUNCTION_SHEET_RAW = {
  categories: [
    {
      key: 'mecanicas',
      label: 'Mecánicas',
      sections: [
        {
          key: 'general',
          label: 'General',
          items: [
            field('hp', 'number', { min: 0 }),
            field('hp_current', 'number', { min: 0 }),
            field('guardia', 'number', { formula: '{hp} / 2' }),
            field('bendicion', 'boolean'),
            field('titulo', 'short'),
            field('forma', 'options', { display: 'select', options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] }),
            field('oro', 'number', { min: -10 }),
            {
              kind: 'table', type: 'libre', key: 'espacios_conjuro', label: 'Espacios de conjuro', editableBy: 'dm',
              columns: [column('nivel', 'number'), column('total', 'number'), column('gastados', 'number'), column('nota', 'short'), column('doble', 'number', { formula: '{total} * 2' })],
            },
            {
              kind: 'table', type: 'habilidad', key: 'rasgos', label: 'Rasgos', editableBy: 'dm',
              columns: [column('nombre', 'short'), column('categoria', 'short'), column('fuente', 'short', { scope: 'entry' }), column('reserva', 'number', { scope: 'character' }), column('usos', 'number', { scope: 'character' }), column('activo', 'boolean', { scope: 'character' }), column('modo', 'short', { scope: 'character' })],
            },
          ],
          blocks: [],
        },
      ],
    },
  ],
  roles: { hp: 'hp', hp_current: 'hp_current' },
}

const checked = validateSheet(FUNCTION_SHEET_RAW)
if (!checked.ok) throw new Error(JSON.stringify(checked.errors))
export const FUNCTION_SHEET: Sheet = checked.sheet

/** The action table the functions of the tests belong to. */
export const ACTION_TABLE = 'rasgos'

// The three examples of the spec, as raw functions.
export const LANZAR_HECHIZO = {
  steps: [
    { kind: 'param', key: 'nivel', label: 'Nivel del espacio', input: { type: 'number', min: 1, max: 9 } },
    {
      kind: 'effect',
      label: 'Gastar espacio',
      target: { type: 'row', table: 'espacios_conjuro', match: { column: 'nivel', value: '{nivel}' }, column: 'gastados' },
      op: 'add',
      value: '1',
      max: '{total}',
    },
  ],
}
export const IMPONER_MANOS = {
  steps: [
    { kind: 'param', key: 'puntos', label: 'Puntos', input: { type: 'number', min: 1, max: '{reserva}' } },
    { kind: 'effect', label: 'Gastar reserva', target: { type: 'state', column: 'reserva' }, op: 'subtract', value: '{puntos}' },
    { kind: 'effect', label: 'Curar', target: { type: 'field', key: 'hp_current' }, op: 'add', value: '{puntos}', max: '{hp}' },
  ],
}
export const BENDICION = {
  steps: [
    { kind: 'param', key: 'flag', label: 'Con bendición', input: { type: 'checkbox' } },
    { kind: 'effect', target: { type: 'field', key: 'oro' }, op: 'add', value: 'si({flag}, 2, 0)' },
  ],
}
