import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FORMULA_FUNCTIONS } from '../../formula/functionCatalogue'
import { addField, group, item, setup, SMALL, type } from '../builderTestKit'
import { TEST_CHARACTERS, WORKBENCH_SHEET } from './workbenchFixture'

const bench = (name: string) => item(name)
const fx = (scope: HTMLElement, label = 'Fórmula') => within(scope).getByLabelText(label) as HTMLTextAreaElement
/** The options of the open autocomplete (not the native options of the test character select). */
const listOptions = () => {
  const list = screen.queryByRole('listbox')
  return list ? within(list).queryAllByRole('option') : []
}
const optionRefs = () => listOptions().map((o) => o.getAttribute('data-ref'))
const statRow = () => group(within(item('Atributos')), 'Fila Fuerza')
const column = (name: string) => group(within(item('Equipo')), `Columna ${name}`)
const renderSheet = (props = {}) => setup(WORKBENCH_SHEET, { testCharacters: TEST_CHARACTERS, ...props })
const key = (el: HTMLElement, k: string) => fireEvent.keyDown(el, { key: k })
const result = (scope: HTMLElement) => within(scope).getByRole('group', { name: 'Resultado' })

describe('FormulaWorkbench: editor', () => {
  it('is a labelled combobox textarea with a highlight overlay of its tokens', () => {
    renderSheet()
    const el = fx(bench('Percepción'))
    expect(el.tagName).toBe('TEXTAREA')
    expect(el).toHaveAttribute('role', 'combobox')
    type(el, 'floor({fuerza}) & "a" + 2')
    const overlay = bench('Percepción').querySelector('[data-formula-highlight]') as HTMLElement
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    const kinds = (kind: string) => [...overlay.querySelectorAll(`[data-token="${kind}"]`)].map((n) => n.textContent)
    expect(kinds('fn')).toEqual(['floor'])
    expect(kinds('ref')).toEqual(['{fuerza}'])
    expect(kinds('str')).toEqual(['"a"'])
    expect(kinds('num')).toEqual(['2'])
    expect(kinds('op')).toContain('&')
  })

  it('marks the span of the parse error', () => {
    renderSheet()
    type(fx(bench('Percepción')), '{fuerza} + * 2')
    const marked = bench('Percepción').querySelector('[data-formula-error]')
    expect(marked?.textContent).toBe('*')
  })

  it('underlines an unknown reference in the error colour', () => {
    renderSheet()
    type(fx(bench('Percepción')), '{fuerzza} + 1')
    expect(bench('Percepción').querySelector('[data-formula-unknown]')?.textContent).toBe('{fuerzza}')
  })
})

describe('FormulaWorkbench: autocomplete', () => {
  it('typing { lists only the references valid for a field (no itself, no cycle, no tables)', () => {
    renderSheet()
    type(fx(bench('Percepción')), '{')
    expect(fx(bench('Percepción'))).toHaveAttribute('aria-expanded', 'true')
    const refs = optionRefs()
    expect(refs).toEqual(expect.arrayContaining(['nivel', 'fuerza', 'bono', 'fue.valor', 'fue.modificador']))
    expect(refs).not.toContain('percepcion')
    expect(refs).not.toContain('iniciativa')
    expect(refs).not.toContain('equipo')
    expect(refs).not.toContain('valor')
  })

  it('lists the local value of a Stat modifier and groups the options', () => {
    renderSheet()
    type(fx(statRow(), 'Fórmula del modificador'), '{')
    const refs = optionRefs()
    expect(refs).toContain('valor')
    expect(refs).not.toContain('fue.modificador')
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'Campos' })).toBeInTheDocument()
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'De esta fila (locales)' })).toBeInTheDocument()
  })

  it('lists the sibling columns of a table column as locals and keeps the column out', () => {
    renderSheet()
    type(fx(column('Doble'), 'Fórmula de la columna'), '{')
    const refs = optionRefs()
    expect(refs).toEqual(expect.arrayContaining(['nombre', 'peso']))
    expect(refs).not.toContain('doble')
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'Columnas de esta fila (locales)' })).toBeInTheDocument()
  })

  it('offers tables only inside a table function, marked as such', () => {
    renderSheet()
    type(fx(bench('Percepción')), 'suma({')
    expect(optionRefs()).toContain('equipo')
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'Tablas' })).toBeInTheDocument()
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /Equipo/ })).toHaveTextContent('tabla')
  })

  it('filters by what was typed (reference or label) and shows each value for the test character', () => {
    renderSheet()
    type(fx(bench('Percepción')), '{fue')
    expect(optionRefs()).toEqual(['fuerza', 'fue.valor', 'fue.modificador', 'fue'])
    expect(within(listOptions()[0]).getByText('14')).toBeInTheDocument()
    expect(within(listOptions()[1]).getByText('16')).toBeInTheDocument()
    type(fx(bench('Percepción')), '{modif')
    expect(optionRefs()).toEqual(['fue.modificador'])
    type(fx(bench('Percepción')), '{pod')
    expect(listOptions()).toHaveLength(0)
  })

  it('inserts with Enter, closing the brace and moving the caret after it', () => {
    renderSheet()
    const el = fx(bench('Percepción'))
    type(el, '{fuer')
    expect(el).toHaveAttribute('aria-activedescendant', listOptions()[0].id)
    key(el, 'Enter')
    expect(el).toHaveValue('{fuerza}')
    expect(el.selectionStart).toBe('{fuerza}'.length)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('moves with the arrows, inserts with Tab and does not duplicate an existing }', async () => {
    renderSheet()
    const el = fx(bench('Percepción'))
    type(el, '{fue} + 1')
    await act(async () => el.setSelectionRange(4, 4)) // jsdom reports the move as a (late) select event
    fireEvent.select(el)
    key(el, 'ArrowDown')
    expect(listOptions()[1]).toHaveAttribute('aria-selected', 'true')
    key(el, 'Tab')
    expect(el).toHaveValue('{fue.valor} + 1')
    await act(async () => {}) // jsdom reports the caret move of the insertion as a late select event
    type(el, '{fue')
    key(el, 'ArrowDown')
    key(el, 'ArrowUp')
    expect(listOptions()[0]).toHaveAttribute('aria-selected', 'true')
    await act(async () => {})
  })

  it('Escape closes the list without changing the text; a click inserts', () => {
    renderSheet()
    const el = fx(bench('Percepción'))
    type(el, '{fu')
    key(el, 'Escape')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(el).toHaveValue('{fu')
    type(el, '{fue.m')
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Fuerza \(modificador\)/ }))
    expect(el).toHaveValue('{fue.modificador}')
  })
})

describe('FormulaWorkbench: no match, one line, look', () => {
  it('keeps the popup with a note while the caret is inside an open brace that matches nothing', () => {
    renderSheet()
    const el = fx(bench('Percepción'))
    type(el, '{zzz')
    expect(el).toHaveAttribute('aria-expanded', 'true')
    expect(listOptions()).toHaveLength(0)
    expect(within(screen.getByRole('listbox')).getByText('Nada coincide con «zzz». Las claves usan minúsculas y _.')).toBeInTheDocument()
    type(el, '{zzz} + 1')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(el).toHaveAttribute('aria-expanded', 'false')
  })

  it('Enter with no open list does not insert a newline, and pasted newlines become spaces', () => {
    renderSheet()
    const el = fx(bench('Percepción'))
    type(el, '1 + 2')
    expect(fireEvent.keyDown(el, { key: 'Enter' })).toBe(false) // default prevented
    type(el, '1 +\n2\r\n+ 3')
    expect(el).toHaveValue('1 + 2 + 3')
  })

  it('has no native resize grip', () => {
    renderSheet()
    expect(fx(bench('Percepción')).className).toContain('resize-none')
    expect(fx(bench('Percepción')).className).not.toContain('resize-y')
  })

  it('keeps the help tablist on one row (scrolls sideways instead of wrapping)', () => {
    renderSheet()
    const tabs = within(bench('Percepción')).getByRole('tablist')
    expect(tabs.className).not.toContain('flex-wrap')
    expect(tabs.closest('[data-testid="scroll-strip"]')?.className).toContain('overflow-x-auto')
  })
})

describe('FormulaWorkbench: insert chips', () => {
  it('inserts a function at the caret and a reference chip opens the autocomplete', () => {
    renderSheet()
    const el = fx(bench('Percepción'))
    type(el, '1 + ')
    fireEvent.click(within(bench('Percepción')).getByRole('button', { name: 'signo()' }))
    expect(el).toHaveValue('1 + signo()')
    expect(el.selectionStart).toBe('1 + signo('.length)
    fireEvent.click(within(bench('Percepción')).getByRole('button', { name: '{ referencia }' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(el).toHaveValue('1 + signo({})')
  })

  it('has the conditional, table sum and text chips', () => {
    renderSheet()
    const el = fx(bench('Percepción'))
    type(el, '')
    for (const name of ['si(cond, sí, no)', 'suma(tabla, col)', '& texto', 'floor()']) expect(within(bench('Percepción')).getByRole('button', { name })).toBeInTheDocument()
    fireEvent.click(within(bench('Percepción')).getByRole('button', { name: 'si(cond, sí, no)' }))
    expect(el).toHaveValue('si(, , )')
  })
})

describe('FormulaWorkbench: result and test character', () => {
  it('shows the value, its type and how it is shown, for the chosen test character', () => {
    renderSheet()
    const g = bench('Bono')
    expect(result(g)).toHaveTextContent('14')
    expect(result(g)).toHaveTextContent('Número')
    expect(result(g)).toHaveTextContent('se muestra como +14')
    type(within(g).getByLabelText('Probar con'), 'borin')
    expect(result(g)).toHaveTextContent('se muestra como +8')
  })

  it('offers the example character, with default values, and works without characters', () => {
    setup(WORKBENCH_SHEET)
    const select = within(bench('Percepción')).getByLabelText('Probar con')
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Personaje de ejemplo'])
    expect(result(bench('Percepción'))).toHaveTextContent('1')
    expect(result(statRow())).toHaveTextContent('0')
    type(fx(statRow(), 'Fórmula del modificador'), '{valor}')
    expect(result(statRow())).toHaveTextContent('+10')
  })

  it('evaluates a table column against the first row, or says there are none', () => {
    renderSheet()
    const g = column('Doble')
    expect(result(g)).toHaveTextContent('6')
    type(within(g).getByLabelText('Probar con'), 'borin')
    expect(result(g)).toHaveTextContent('Sin filas para probar')
  })

  it('reflects the unsaved draft, even when it does not validate', () => {
    renderSheet()
    type(fx(bench('Percepción')), '{fuerza} * 2 + {fuerza}')
    expect(result(bench('Percepción'))).toHaveTextContent('42')
    type(fx(bench('Percepción')), '{zzz} + 1')
    expect(result(bench('Percepción'))).toHaveTextContent('—')
  })
})

describe('FormulaWorkbench: message', () => {
  it('a valid formula says how many references it uses and who uses it (role status)', () => {
    renderSheet()
    const status = within(bench('Percepción')).getByRole('status')
    expect(status).toHaveTextContent('Fórmula válida')
    expect(status).toHaveTextContent('Usa 1 referencia.')
    expect(status).toHaveTextContent('Lo usan: Iniciativa')
  })

  it('a syntax error says it cannot be calculated, in Spanish (role alert)', () => {
    renderSheet()
    type(fx(bench('Percepción')), '{fuerza} +')
    const alert = within(bench('Percepción')).getByRole('alert')
    expect(alert).toHaveTextContent('No se puede calcular')
    expect(alert).toHaveTextContent('La fórmula termina antes de tiempo')
  })

  it('an unknown reference offers "¿Quisiste decir…?" and the button fixes it', () => {
    renderSheet()
    type(fx(bench('Percepción')), '{fuerzza} + 1')
    const alert = within(bench('Percepción')).getByRole('alert')
    expect(alert).toHaveTextContent('La referencia {fuerzza} no existe.')
    fireEvent.click(within(alert).getByRole('button', { name: '¿Quisiste decir {fuerza}?' }))
    expect(fx(bench('Percepción'))).toHaveValue('{fuerza} + 1')
    expect(within(bench('Percepción')).getByRole('status')).toHaveTextContent('Fórmula válida')
  })

  it('a cycle names its path with the labels', () => {
    renderSheet()
    type(fx(bench('Percepción')), '{iniciativa}')
    const alert = within(bench('Percepción')).getByRole('alert')
    expect(alert).toHaveTextContent('Las fórmulas se llaman en círculo')
    expect(alert).toHaveTextContent(/Percepción → Iniciativa → Percepción|Iniciativa → Percepción → Iniciativa/)
  })

  it('a field added to a draft that does not validate still gets its references', () => {
    setup(SMALL)
    const f = addField('Vida')
    type(within(f).getByLabelText('Tipo'), 'number')
    type(within(f).getByLabelText('Origen del valor'), 'formula')
    type(fx(item('Vida')), '{')
    expect(optionRefs()).toContain('nivel')
  })

  it('says so when no valid template is available to suggest references', () => {
    const broken = {
      categories: [
        {
          key: 'c',
          label: 'C',
          sections: [
            {
              key: 's',
              label: 'S',
              items: [
                { _open: true, kind: 'field', key: 'vida', label: 'Vida', type: 'number', editableBy: 'dm', formula: '' },
                { kind: 'field', key: 'otro', label: '', type: 'short', editableBy: 'dm' },
              ],
              blocks: [],
            },
          ],
        },
      ],
      roles: {},
    }
    setup(broken)
    type(fx(item('Vida')), '{')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(within(item('Vida')).getByText(/No hay una plantilla válida/)).toBeInTheDocument()
    expect(result(item('Vida'))).toHaveTextContent('—')
  })
})

describe('FormulaWorkbench: tabs', () => {
  it('is an ARIA tablist with arrow keys, starting on "Explicar el resultado"', () => {
    renderSheet()
    const g = bench('Percepción')
    const tabs = within(g).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Explicar el resultado', 'Funciones', 'Dependencias'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    key(tabs[0], 'ArrowRight')
    expect(within(g).getByRole('tab', { name: 'Funciones' })).toHaveAttribute('aria-selected', 'true')
    expect(within(g).getByRole('tabpanel')).toHaveAttribute('aria-labelledby', within(g).getByRole('tab', { name: 'Funciones' }).id)
    key(within(g).getByRole('tab', { name: 'Funciones' }), 'ArrowLeft')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('explains the result as a nested tree with each value', () => {
    renderSheet()
    const tree = within(bench('Percepción')).getByRole('tree', { name: 'Paso a paso' })
    expect(within(tree).getAllByRole('treeitem')[0]).toHaveTextContent('{fuerza} + 1')
    expect(within(tree).getByText('14')).toBeInTheDocument()
    expect(within(tree).getByText('15')).toBeInTheDocument()
  })

  it('lists the functions with syntax, description and example, and searches them', () => {
    renderSheet()
    const g = bench('Percepción')
    fireEvent.click(within(g).getByRole('tab', { name: 'Funciones' }))
    expect(within(g).getAllByRole('listitem')).toHaveLength(FORMULA_FUNCTIONS.length)
    type(within(g).getByLabelText('Buscar función'), 'lookup')
    expect(within(g).getAllByRole('listitem')).toHaveLength(1)
    expect(within(g).getByRole('listitem')).toHaveTextContent('Busca la fila de una tabla')
    expect(within(g).getByRole('listitem')).toHaveTextContent('lookup({precios}, "objeto", "Daga", "oro", 0)')
    type(within(g).getByLabelText('Buscar función'), 'redondea')
    expect(within(g).getAllByRole('listitem').length).toBeGreaterThan(1)
    type(within(g).getByLabelText('Buscar función'), 'zzzz')
    expect(within(g).getByText('Ninguna función coincide.')).toBeInTheDocument()
  })

  it('lists what the formula uses (with values) and who uses it', () => {
    renderSheet()
    const g = bench('Percepción')
    fireEvent.click(within(g).getByRole('tab', { name: 'Dependencias' }))
    const uses = within(g).getByRole('list', { name: 'Usa' })
    expect(uses).toHaveTextContent('{fuerza}')
    expect(uses).toHaveTextContent('14')
    expect(within(g).getByRole('list', { name: 'Lo usan' })).toHaveTextContent('Iniciativa')
  })
})
