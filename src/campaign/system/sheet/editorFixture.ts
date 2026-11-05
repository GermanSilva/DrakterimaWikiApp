/** One sheet and one character shared by the editor tests (model and component). */
import { validateSheet, type Sheet } from './sheetModel'

export type Loose = Record<string, unknown>
export const col = (key: string, type: string, extra: Loose = {}) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), type, editableBy: 'dm', ...extra })
const opts = [{ key: 'baja', label: 'Baja' }, { key: 'alta', label: 'Alta' }]

const RAW = {
  categories: [
    {
      key: 'general', label: 'General',
      sections: [
        {
          key: 'perfil', label: 'Perfil',
          items: [
            { kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'player' },
            { kind: 'field', key: 'bio', label: 'Bio', type: 'paragraph', editableBy: 'player' },
            { kind: 'field', key: 'suerte', label: 'Suerte', type: 'number', editableBy: 'dm', min: 0, max: 10 },
            { kind: 'field', key: 'inspirado', label: 'Inspirado', type: 'boolean', editableBy: 'player' },
            { kind: 'field', key: 'postura', label: 'Postura', type: 'options', display: 'select', editableBy: 'player', options: opts },
            { kind: 'field', key: 'secreto_dm', label: 'Secreto', type: 'short', editableBy: 'dm' },
            { kind: 'field', key: 'modo', label: 'Modo', type: 'options', display: 'checkbox', editableBy: 'player', options: [{ key: 'apagado', label: 'Apagado' }, { key: 'encendido', label: 'Encendido' }] },
            { kind: 'field', key: 'oculto', label: 'Oculto', type: 'number', editableBy: 'dm', formula: '{suerte} + 100', hidden: true },
            { kind: 'field', key: 'doble_suerte', label: 'Doble', type: 'number', editableBy: 'dm', formula: '{suerte} * 2' },
          ],
          blocks: [],
        },
      ],
    },
    {
      key: 'mecanicas', label: 'Mecánicas',
      sections: [
        {
          key: 'stats', label: 'Stats',
          items: [
            { kind: 'table', type: 'stat', key: 'atributos', label: 'Atributos', rows: [
              { key: 'fue', label: 'Fuerza', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'player' },
              { key: 'des', label: 'Destreza', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'dm' },
            ] },
            { kind: 'table', type: 'capacidades', key: 'habs', label: 'Habilidades',
              columns: [col('bonus', 'number', { editableBy: 'player' }), col('nota', 'short'), col('total', 'number', { formula: '{bonus} + {modificador}' })],
              rows: [
                { key: 'atl', label: 'Atletismo', stat: 'fue', use: 'modificador', editableBy: 'player' },
                { key: 'sig', label: 'Sigilo', stat: 'des', use: 'modificador', editableBy: 'dm' },
              ] },
          ],
          blocks: [],
        },
        {
          key: 'recursos', label: 'Recursos',
          items: [
            { kind: 'table', type: 'libre', key: 'espacios', label: 'Espacios', editableBy: 'dm', sortBy: { column: 'nivel', direction: 'asc' },
              columns: [col('nivel', 'number'), col('total', 'number'), col('gastados', 'number', { reset: { to: 'column', column: 'total' } }), col('nota', 'short')] },
            { kind: 'table', type: 'libre', key: 'diario', label: 'Diario', editableBy: 'player',
              columns: [col('texto', 'short', { editableBy: 'player' }), col('horas', 'number', { editableBy: 'player', reset: { to: 'zero' } }), col('doble', 'number', { editableBy: 'player', formula: '{horas} * 2' })] },
            { kind: 'table', type: 'habilidad', key: 'conjuros', label: 'Conjuros', editableBy: 'dm', columns: [col('nombre', 'short'), col('categoria', 'short'), col('mana', 'number', { reset: { to: 'value', value: 9 } })] },
          ],
          blocks: [],
        },
        {
          key: 'dinero', label: 'Dinero',
          items: [
            { kind: 'table', type: 'monedas', key: 'monedero', label: 'Monedas', rows: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'plata', label: 'Plata', value: 1 }] },
            { kind: 'table', type: 'economia', key: 'banco', label: 'Banco', editableBy: 'dm' },
          ],
          blocks: [],
        },
      ],
    },
  ],
  roles: {},
}
const parsed = validateSheet(RAW)
if (!parsed.ok) throw new Error(`fixture sheet invalid: ${JSON.stringify(parsed.errors)}`)
export const SHEET: Sheet = parsed.sheet

export const ENTITY: Loose = {
  id: 1, nombre: 'Ana', jugador: 'Pepe', imagen_url: '', region: 'magral', estado: 'publicado',
  edad: '30', bio: '', suerte: 3, inspirado: false, postura: 'baja', secreto_dm: 'x', fue: 12, des: 14,
  atl: 2, atl__nota: 'n', sig: 1,
  espacios: [{ id: 1, nivel: 3, total: 3, gastados: 1 }],
  diario: [{ id: 1, texto: 'hola', horas: 2 }],
  monedas: { oro: 5, plata: 0 }, monedas_guardado: {}, banco: { oro: 1 },
}
