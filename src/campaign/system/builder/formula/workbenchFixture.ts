/** A small valid sheet (every item open) and test characters for the formula workbench tests. */
export const WORKBENCH_SHEET = {
  categories: [
    {
      key: 'c',
      label: 'C',
      sections: [
        {
          key: 's',
          label: 'S',
          items: [
            { _open: true, kind: 'field', key: 'fuerza', label: 'Fuerza', type: 'number', editableBy: 'dm' },
            { _open: true, kind: 'field', key: 'percepcion', label: 'Percepción', type: 'number', editableBy: 'dm', formula: '{fuerza} + 1' },
            { _open: true, kind: 'field', key: 'iniciativa', label: 'Iniciativa', type: 'number', editableBy: 'dm', formula: '{percepcion} * 2' },
            { _open: true, kind: 'field', key: 'bono', label: 'Bono', type: 'number', editableBy: 'dm', formula: '{fuerza}', format: 'signed' },
            {
              _open: true,
              kind: 'table',
              type: 'stat',
              key: 'atributos',
              label: 'Atributos',
              rows: [{ key: 'fue', label: 'Fuerza', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'dm' }],
            },
            {
              _open: true,
              kind: 'table',
              type: 'libre',
              key: 'equipo',
              label: 'Equipo',
              editableBy: 'dm',
              columns: [
                { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' },
                { key: 'peso', label: 'Peso', type: 'number', editableBy: 'dm' },
                { key: 'doble', label: 'Doble', type: 'number', editableBy: 'dm', formula: '{peso} * 2' },
              ],
            },
          ],
          blocks: [],
        },
      ],
    },
  ],
  roles: {},
}

export const TEST_CHARACTERS = [
  { id: 'liria', label: 'Liria Vantor', data: { fuerza: 14, fue: 16, equipo: [{ nombre: 'Daga', peso: 3 }] } },
  { id: 'borin', label: 'Borin Ferrohondo', data: { fuerza: 8, fue: 8 } },
]
