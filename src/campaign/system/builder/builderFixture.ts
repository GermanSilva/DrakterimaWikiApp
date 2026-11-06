/** A small stored sheet the builder tests start from (it validates: see SheetBuilder.tree.test). */
export const STORED_SHEET = {
  categories: [
    {
      key: 'general',
      label: 'General',
      sections: [
        {
          key: 'perfil',
          label: 'Perfil',
          items: [
            { kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'player' },
            { kind: 'field', key: 'vida', label: 'Vida', type: 'number', editableBy: 'dm' },
            { kind: 'field', key: 'notas_pj', label: 'Notas', type: 'paragraph', editableBy: 'player' },
          ],
          blocks: [{ key: 'datos', title: 'Datos', mode: 'tile', items: ['edad', 'vida'] }],
        },
        { key: 'extra', label: 'Extra', items: [], blocks: [] },
      ],
    },
    {
      key: 'mecanicas',
      label: 'Mecánicas',
      sections: [
        {
          key: 'magia',
          label: 'Magia',
          items: [
            {
              kind: 'table',
              type: 'habilidad',
              key: 'conjuros',
              label: 'Conjuros',
              editableBy: 'dm',
              columns: [
                { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' },
                { key: 'categoria', label: 'Categoría', type: 'short', editableBy: 'dm' },
              ],
              categories: [
                { key: 'trucos', label: 'Trucos' },
                { key: 'nivel_1', label: 'Nivel 1' },
              ],
            },
          ],
          blocks: [{ key: 'lista', mode: 'modal', items: ['conjuros'], filterCategories: ['trucos'] }],
        },
      ],
    },
  ],
  roles: { hp: 'vida' },
}
