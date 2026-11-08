/** S40: Libre and Habilidad tables are edited as a form in a modal; the main form shows only the title, the row count and the button. */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FlatEntity } from '../../../data'
import { FormActionsContext, FormPortContext, type FormActions, type FormPort } from '../../../ports'
import { col, ENTITY, SHEET } from './editorFixture'
import SheetEditor from './SheetEditor'
import { validateSheet, type Sheet } from './sheetModel'

const ATAQUES = {
  categories: [
    {
      key: 'combate', label: 'Combate',
      sections: [
        {
          key: 'armas', label: 'Armas',
          items: [
            {
              kind: 'table', type: 'libre', key: 'ataques', label: 'Ataques', editableBy: 'player',
              columns: [
                col('arma', 'short', { editableBy: 'player' }),
                col('bono', 'number', { editableBy: 'player', reset: { to: 'zero' } }),
                col('tipo', 'options', { editableBy: 'player', display: 'select', options: [{ key: 'corte', label: 'Corte' }, { key: 'golpe', label: 'Golpe' }] }),
                col('notas', 'paragraph', { editableBy: 'player' }),
                col('portando', 'boolean', { editableBy: 'player' }),
                col('doble', 'number', { editableBy: 'player', formula: '{bono} * 2' }),
              ],
            },
            { kind: 'table', type: 'libre', key: 'tesoro', label: 'Tesoro', editableBy: 'dm', columns: [col('item', 'short'), col('valor', 'number')] },
          ],
          blocks: [],
        },
      ],
    },
  ],
  roles: {},
}
const parsed = validateSheet(ATAQUES)
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
const SHEET_ATAQUES: Sheet = parsed.sheet

const PORT = (sheet: Sheet, over: Partial<FormPort> = {}): FormPort => ({ isDM: true, regions: [{ key: 'magral', label: 'Magral' }], characters: [], sesiones: [], sheet, ...over })

function mount(sheet: Sheet, over: Partial<FormPort>, item: Record<string, unknown>) {
  const actions: FormActions = { save: vi.fn(), remove: vi.fn(), closeForm: vi.fn(), activeFieldRef: { current: null } }
  render(
    <FormPortContext.Provider value={PORT(sheet, over)}>
      <FormActionsContext.Provider value={actions}>
        <SheetEditor item={item as unknown as FlatEntity} />
      </FormActionsContext.Provider>
    </FormPortContext.Provider>,
  )
  fireEvent.click(screen.getByRole('button', { name: sheet === SHEET ? 'Mecánicas' : 'Combate' }))
  return actions
}
const AT = [
  { id: 'a', arma: 'Espada', bono: 5, tipo: 'corte', notas: 'Filo largo', portando: true },
  { id: 'b', arma: 'Maza', bono: 2, tipo: 'golpe', notas: '', portando: false },
]
const mountAtaques = (over: Partial<FormPort> = {}, ataques: unknown[] = AT) => mount(SHEET_ATAQUES, over, { ...ENTITY, ataques })
const modal = (name: string) => screen.getByRole('dialog', { name })
const row = (name: string, n: number) => within(modal(name)).getByRole('group', { name: `Fila ${n} de ${name}` })
const saved = (actions: FormActions) => {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  return (actions.save as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
}
const isLocked = (el: HTMLElement) => el.hasAttribute('readonly') || (el as HTMLInputElement).disabled

describe('main form: title, count and a button, no row inputs', () => {
  it('shows the table title, the row count and "Editar <tabla>"', () => {
    mountAtaques()
    const section = screen.getByRole('region', { name: 'Armas' })
    expect(within(section).getByText('Ataques')).toBeInTheDocument()
    expect(within(section).getByText('2 filas')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Editar Ataques' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Arma$/)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says "Sin filas" for an empty table', () => {
    mount(SHEET_ATAQUES, {}, { ...ENTITY, ataques: [], tesoro: [{ id: 1 }] })
    expect(screen.getByText('Sin filas')).toBeInTheDocument()
  })

  it('says "1 fila" for one row', () => {
    mountAtaques({}, [AT[0]])
    expect(screen.getByText('1 fila')).toBeInTheDocument()
  })
})

describe('the modal is a form per row', () => {
  const open = () => {
    const actions = mountAtaques()
    fireEvent.click(screen.getByRole('button', { name: 'Editar Ataques' }))
    return actions
  }

  it('opens titled with the table name and lists a block per row with a labeled control per column', () => {
    open()
    expect(modal('Ataques')).toBeInTheDocument()
    const first = row('Ataques', 1)
    expect(within(first).getByRole('heading', { name: 'Espada' })).toBeInTheDocument() // header: first text column value
    expect(within(first).getByLabelText('Arma')).toHaveValue('Espada')
    expect(within(first).getByLabelText('Bono')).toHaveValue(5)
    expect(within(first).getByLabelText('Tipo')).toHaveValue('corte')
    expect(within(first).getByLabelText('Notas').tagName).toBe('TEXTAREA')
    expect(within(first).getByLabelText('Portando')).toBeChecked()
    const doble = within(first).getByLabelText('Doble')
    expect(doble).toHaveValue('10')
    expect(isLocked(doble)).toBe(true)
    expect(within(row('Ataques', 2)).getByLabelText('Arma')).toHaveValue('Maza')
  })

  it('a row without a text value is headed "Fila N"', () => {
    mountAtaques({}, [{ id: 1 }])
    fireEvent.click(screen.getByRole('button', { name: 'Editar Ataques' }))
    expect(within(row('Ataques', 1)).getByRole('heading', { name: 'Fila 1' })).toBeInTheDocument()
  })

  it('Listo applies the edits to the draft (the character is saved only by Guardar) and closes', () => {
    const actions = open()
    fireEvent.change(within(row('Ataques', 2)).getByLabelText('Arma'), { target: { value: 'Martillo' } })
    fireEvent.change(within(row('Ataques', 1)).getByLabelText('Notas'), { target: { value: 'Nuevo' } })
    fireEvent.click(within(row('Ataques', 1)).getByLabelText('Portando'))
    expect(actions.save).not.toHaveBeenCalled()
    fireEvent.click(within(modal('Ataques')).getByRole('button', { name: 'Listo' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.save).not.toHaveBeenCalled()
    const [, data] = saved(actions)
    expect(data.ataques).toEqual([{ ...AT[0], notas: 'Nuevo', portando: false }, { ...AT[1], arma: 'Martillo' }])
  })

  it('Cancelar, Escape and the close button discard the changes', () => {
    const actions = open()
    const closers = [
      () => fireEvent.click(within(modal('Ataques')).getByRole('button', { name: 'Cancelar' })),
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => fireEvent.click(within(modal('Ataques')).getByRole('button', { name: 'Cerrar' })),
    ]
    for (const close of closers) {
      fireEvent.change(within(row('Ataques', 1)).getByLabelText('Arma'), { target: { value: 'X' } })
      close()
      expect(screen.queryByRole('dialog')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Editar Ataques' }))
      expect(within(row('Ataques', 1)).getByLabelText('Arma')).toHaveValue('Espada')
    }
    fireEvent.click(within(modal('Ataques')).getByRole('button', { name: 'Cancelar' }))
    const [, data] = saved(actions)
    expect(data.ataques).toEqual(AT)
  })

  it('Agregar fila adds an empty row block and focuses its first input; Quitar removes that row', () => {
    const actions = open()
    fireEvent.click(within(modal('Ataques')).getByRole('button', { name: 'Agregar fila' }))
    const added = row('Ataques', 3)
    expect(within(added).getByLabelText('Arma')).toHaveFocus()
    fireEvent.change(within(added).getByLabelText('Arma'), { target: { value: 'Daga' } })
    fireEvent.click(within(row('Ataques', 1)).getByRole('button', { name: 'Quitar fila 1 de Ataques' }))
    expect(within(modal('Ataques')).getAllByRole('group')).toHaveLength(2)
    fireEvent.click(within(modal('Ataques')).getByRole('button', { name: 'Listo' }))
    const rows = (saved(actions)[1].ataques as { id: unknown; arma?: string }[]).map((r) => [r.id, r.arma])
    expect(rows).toEqual([['b', 'Maza'], [1, 'Daga']])
  })

  it('the reset button sits next to its cell and works inside the modal; formulas follow', () => {
    const actions = open()
    fireEvent.click(within(row('Ataques', 1)).getByRole('button', { name: 'Restablecer Bono (fila 1 de Ataques)' }))
    expect(within(row('Ataques', 1)).getByLabelText('Bono')).toHaveValue(0)
    expect(within(row('Ataques', 1)).getByLabelText('Doble')).toHaveValue('0')
    fireEvent.click(within(modal('Ataques')).getByRole('button', { name: 'Listo' }))
    expect((saved(actions)[1].ataques as { bono: number }[])[0].bono).toBe(0)
  })
})

describe('player on a DM-only table', () => {
  it('gets "Editar" on a player table and "Ver" on a DM one', () => {
    mountAtaques({ isDM: false, ownCharacterIds: [1] })
    expect(screen.getByRole('button', { name: 'Editar Ataques' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver Tesoro' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar Tesoro' })).toBeNull()
  })

  it('the read-only modal shows the values locked, with no add, remove, reset or Listo', () => {
    mount(SHEET_ATAQUES, { isDM: false, ownCharacterIds: [1] }, { ...ENTITY, tesoro: [{ id: 1, item: 'Gema', valor: 7 }] })
    fireEvent.click(screen.getByRole('button', { name: 'Ver Tesoro' }))
    const only = row('Tesoro', 1)
    expect(isLocked(within(only).getByLabelText('Item'))).toBe(true)
    expect(within(only).getByLabelText('Valor')).toHaveValue(7)
    expect(within(modal('Tesoro')).queryByRole('button', { name: /Agregar fila|Quitar|Listo/ })).toBeNull()
    fireEvent.click(within(modal('Tesoro')).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('sortBy keeps editing the stored row', () => {
  const rows = [{ id: 'a', nivel: 3, total: 9, gastados: 4 }, { id: 'b', nivel: 1, total: 5, gastados: 2 }, { id: 'c', nivel: 2, total: 7, gastados: 0 }]
  it('shows rows in sorted order and writes the edit to the stored row on Listo', () => {
    const actions = mount(SHEET, {}, { ...ENTITY, espacios: rows })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Espacios' }))
    expect(within(row('Espacios', 1)).getByLabelText('Nivel')).toHaveValue(1)
    fireEvent.change(within(row('Espacios', 1)).getByLabelText('Total'), { target: { value: '6' } })
    fireEvent.click(within(row('Espacios', 1)).getByRole('button', { name: 'Restablecer Gastados (fila 1 de Espacios)' }))
    fireEvent.click(within(modal('Espacios')).getByRole('button', { name: 'Listo' }))
    expect(saved(actions)[1].espacios).toEqual([rows[0], { id: 'b', nivel: 1, total: 6, gastados: 6 }, rows[2]])
  })
})

describe('staging feedback: repeated title and checkbox defaults', () => {
  const SAME = {
    categories: [
      {
        key: 'combate', label: 'Combate',
        sections: [
          {
            key: 'ataques_sec', label: 'Ataques',
            items: [
              {
                kind: 'table', type: 'libre', key: 'ataques', label: 'Ataques', editableBy: 'player',
                columns: [col('arma', 'short', { editableBy: 'player' }), col('portando', 'boolean', { editableBy: 'player', default: true })],
              },
            ],
            blocks: [],
          },
        ],
      },
    ],
    roles: {},
  }
  const parsedSame = validateSheet(SAME)
  if (!parsedSame.ok) throw new Error(JSON.stringify(parsedSame.errors))

  it('does not repeat the table title when its section has the same name', () => {
    mount(parsedSame.sheet, {}, { ...ENTITY, ataques: [] })
    const section = screen.getByRole('region', { name: 'Ataques' })
    expect(within(section).getAllByText('Ataques')).toHaveLength(1)
    expect(within(section).getByText('Sin filas')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Editar Ataques' })).toBeInTheDocument()
  })

  it('keeps the table title when the section has another name', () => {
    mountAtaques()
    expect(within(screen.getByRole('region', { name: 'Armas' })).getByText('Ataques')).toBeInTheDocument()
  })

  it('a new row shows a boolean column with default true as checked, and an explicit false unchecked', () => {
    mount(parsedSame.sheet, {}, { ...ENTITY, ataques: [{ id: 'x', arma: 'Daga', portando: false }] })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Ataques' }))
    expect(within(row('Ataques', 1)).getByLabelText('Portando')).not.toBeChecked()
    fireEvent.click(within(modal('Ataques')).getByRole('button', { name: 'Agregar fila' }))
    expect(within(row('Ataques', 2)).getByLabelText('Portando')).toBeChecked()
  })
})
