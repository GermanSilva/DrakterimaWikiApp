/** G4b: the character editor component, rendered with the form ports (no host): widgets, read-only states, row editors, reset. */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FlatEntity } from '../../../data'
import { FormActionsContext, FormPortContext, type FormActions, type FormPort } from '../../../ports'
import { dnd5eProfile } from '../systemProfile'
import { ENTITY, SHEET } from './editorFixture'
import SheetEditor from './SheetEditor'

const PORT = (over: Partial<FormPort> = {}): FormPort => ({
  isDM: true,
  regions: [{ key: 'magral', label: 'Tierras de Magral' }, { key: 'nezor', label: 'Nezor' }],
  characters: [],
  sesiones: [],
  sheet: SHEET,
  ...over,
})

function mount(over: Partial<FormPort> = {}, item: Record<string, unknown> = ENTITY) {
  const actions: FormActions = { save: vi.fn(), remove: vi.fn(), closeForm: vi.fn(), activeFieldRef: { current: null } }
  render(
    <FormPortContext.Provider value={PORT(over)}>
      <FormActionsContext.Provider value={actions}>
        <SheetEditor item={item as unknown as FlatEntity} />
      </FormActionsContext.Provider>
    </FormPortContext.Provider>,
  )
  return actions
}
const tab = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const saved = (actions: FormActions) => {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  return (actions.save as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
}
const isLocked = (el: HTMLElement) => el.hasAttribute('readonly') || (el as HTMLInputElement).disabled

describe('tabs and identity', () => {
  it('draws one tab per category after Identidad, each with its sections', () => {
    mount()
    expect(screen.getAllByRole('button').map((b) => b.textContent).slice(0, 3)).toEqual(['Identidad', 'General', 'Mecánicas'])
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana')
    tab('General')
    expect(screen.getByRole('region', { name: 'Perfil' })).toBeInTheDocument()
    tab('Mecánicas')
    for (const name of ['Stats', 'Recursos', 'Dinero']) expect(screen.getByRole('region', { name })).toBeInTheDocument()
  })

  it('identity keeps today columns: jugador is read-only, the DM also gets estado and notes', () => {
    mount()
    expect(isLocked(screen.getByLabelText('Jugador'))).toBe(true)
    expect(screen.getByLabelText('Jugador')).toHaveValue('Pepe')
    expect(screen.getByRole('combobox', { name: 'Visibilidad' })).toHaveValue('publicado')
    expect(screen.getByLabelText('Notas del DM (privadas 🔒)')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Nezor' })).toBeInTheDocument()
  })

  it('a player edits nombre, región and imagen only: no estado, no notes', () => {
    mount({ isDM: false, ownCharacterIds: [1] })
    expect(isLocked(screen.getByLabelText('Nombre'))).toBe(false)
    expect(isLocked(screen.getByLabelText('Jugador'))).toBe(true)
    expect(screen.queryByRole('combobox', { name: 'Visibilidad' })).toBeNull()
    expect(screen.queryByLabelText('Notas del DM (privadas 🔒)')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
  })
})

describe('widgets by type (DM)', () => {
  it('draws each field type with its stored value and keeps the typed values in the draft', () => {
    const actions = mount()
    tab('General')
    expect(screen.getByLabelText('Edad')).toHaveValue('30')
    expect(screen.getByLabelText('Bio').tagName).toBe('TEXTAREA')
    const suerte = screen.getByLabelText('Suerte')
    expect(suerte).toHaveAttribute('type', 'number')
    expect(suerte).toHaveAttribute('min', '0')
    expect(suerte).toHaveAttribute('max', '10')
    expect(screen.getByLabelText('Inspirado')).not.toBeChecked()
    expect(screen.getByLabelText('Postura')).toHaveValue('baja')
    expect(within(screen.getByLabelText('Postura')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Baja', 'Alta'])
    // checkbox display of an options field: unchecked = first option, checked = second option's key
    expect(screen.getByLabelText('Modo')).toHaveAttribute('type', 'checkbox')

    fireEvent.change(screen.getByLabelText('Edad'), { target: { value: '31' } })
    fireEvent.change(suerte, { target: { value: '7' } })
    fireEvent.click(screen.getByLabelText('Inspirado'))
    fireEvent.change(screen.getByLabelText('Postura'), { target: { value: 'alta' } })
    fireEvent.click(screen.getByLabelText('Modo'))
    const [type, data] = saved(actions)
    expect(type).toBe('pjs')
    expect(data).toMatchObject({ id: 1, edad: '31', suerte: 7, inspirado: true, postura: 'alta', modo: 'encendido' })
  })

  it('shows formula and calc values read-only (recomputed from the draft) and never draws a hidden field', () => {
    mount()
    tab('General')
    const doble = screen.getByLabelText('Doble')
    expect(doble).toHaveValue('6')
    expect(isLocked(doble)).toBe(true)
    fireEvent.change(screen.getByLabelText('Suerte'), { target: { value: '4' } })
    expect(screen.getByLabelText('Doble')).toHaveValue('8')
    expect(screen.queryByLabelText('Oculto')).toBeNull()
  })

  it('clearing a number stores null, typing keeps a number', () => {
    const actions = mount()
    tab('General')
    fireEvent.change(screen.getByLabelText('Suerte'), { target: { value: '' } })
    expect(saved(actions)[1].suerte).toBeNull()
  })

  it('refuses to save a value the rules reject and names the field', () => {
    const actions = mount()
    tab('General')
    fireEvent.change(screen.getByLabelText('Suerte'), { target: { value: '11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Suerte')
    expect(actions.save).not.toHaveBeenCalled()
  })
})

describe('stat rows, Capacidades and amounts', () => {
  it('edits stat values and Capacidades cells (first column at data[row], the rest at data[row__col]); formula columns are read-only', () => {
    const actions = mount()
    tab('Mecánicas')
    expect(screen.getByLabelText('Fuerza')).toHaveValue(12)
    fireEvent.change(screen.getByLabelText('Fuerza'), { target: { value: '16' } })
    fireEvent.change(screen.getByLabelText('Atletismo Bonus'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Atletismo Nota'), { target: { value: 'm' } })
    // total = bonus + modifier of the linked stat (fue 16 -> +3), recomputed live and read-only
    expect(screen.getByLabelText('Atletismo Total')).toHaveValue('6')
    expect(isLocked(screen.getByLabelText('Atletismo Total'))).toBe(true)
    expect(saved(actions)[1]).toMatchObject({ fue: 16, atl: 3, atl__nota: 'm' })
  })

  it('edits coin and economy amounts per denomination as integers', () => {
    const actions = mount()
    tab('Mecánicas')
    expect(screen.getByLabelText('Oro (en mano) (Monedas)')).toHaveValue(5)
    fireEvent.change(screen.getByLabelText('Oro (en mano) (Monedas)'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Plata (guardado) (Monedas)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Oro (Banco)'), { target: { value: '4' } })
    expect(saved(actions)[1]).toMatchObject({ monedas: { oro: 8, plata: 0 }, monedas_guardado: { plata: 2 }, banco: { oro: 4 } })
  })

  it('refuses a negative or fractional amount', () => {
    const actions = mount()
    tab('Mecánicas')
    fireEvent.change(screen.getByLabelText('Oro (en mano) (Monedas)'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Monedas')
    expect(actions.save).not.toHaveBeenCalled()
  })
})

describe('player: only what the guard allows is editable, the rest is read-only', () => {
  const player = () => mount({ isDM: false, ownCharacterIds: [1] })

  it('fields: their own are editable, DM fields and computed ones are locked', () => {
    player()
    tab('General')
    for (const name of ['Edad', 'Bio', 'Inspirado', 'Postura', 'Modo']) expect(isLocked(screen.getByLabelText(name)), name).toBe(false)
    for (const name of ['Suerte', 'Secreto', 'Doble']) expect(isLocked(screen.getByLabelText(name)), name).toBe(true)
  })

  it('stat rows and Capacidades cells follow the row AND column ownership', () => {
    player()
    tab('Mecánicas')
    expect(isLocked(screen.getByLabelText('Fuerza'))).toBe(false)
    expect(isLocked(screen.getByLabelText('Destreza'))).toBe(true)
    expect(isLocked(screen.getByLabelText('Atletismo Bonus'))).toBe(false)
    expect(isLocked(screen.getByLabelText('Atletismo Nota'))).toBe(true) // DM column
    expect(isLocked(screen.getByLabelText('Sigilo Bonus'))).toBe(true) // DM row
  })

  it('tables: a player table has the row editor, a DM table is read-only with no buttons', () => {
    player()
    tab('Mecánicas')
    expect(screen.getByRole('button', { name: 'Agregar fila a Diario' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar fila a Espacios' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Restablecer Gastados/ })).toBeNull() // gastados is in a DM table
    expect(screen.getByRole('button', { name: 'Restablecer Horas (fila 1 de Diario)' })).toBeInTheDocument()
    expect(isLocked(screen.getByLabelText('Nivel (fila 1 de Espacios)'))).toBe(true)
    expect(screen.getByLabelText('Nivel (fila 1 de Espacios)')).toHaveValue(3)
  })

  it('coin and economy amounts are shown read-only', () => {
    player()
    tab('Mecánicas')
    expect(isLocked(screen.getByLabelText('Oro (en mano) (Monedas)'))).toBe(true)
    expect(isLocked(screen.getByLabelText('Oro (Banco)'))).toBe(true)
  })
})

describe('row editors (S16 A12 reset, sorted display)', () => {
  const rows = [
    { id: 'a', nivel: 3, total: 9, gastados: 4 },
    { id: 'b', nivel: 1, total: 5, gastados: 2 },
    { id: 'c', nivel: 2, total: 7, gastados: 0 },
  ]
  const cells = (name: string) => screen.getAllByLabelText(new RegExp(`^${name} \\(fila \\d+ de Espacios\\)$`)).map((el) => (el as HTMLInputElement).value)

  it('shows the table in its sortBy order but edits and resets the STORED row', () => {
    const actions = mount({}, { ...ENTITY, espacios: rows })
    tab('Mecánicas')
    expect(cells('Nivel')).toEqual(['1', '2', '3']) // sorted by nivel
    // the first DISPLAYED row is stored row 1 (id b): editing it must not touch stored row 0
    fireEvent.change(screen.getByLabelText('Total (fila 1 de Espacios)'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer Gastados (fila 1 de Espacios)' })) // to the total of its OWN row: 6
    const patch = saved(actions)[1].espacios as Record<string, unknown>[]
    expect(patch).toEqual([rows[0], { id: 'b', nivel: 1, total: 6, gastados: 6 }, rows[2]])
  })

  it('reset buttons exist only for number columns with a reset, icon-only with an accessible name', () => {
    mount({}, { ...ENTITY, espacios: rows })
    tab('Mecánicas')
    const resets = screen.getAllByRole('button', { name: /Restablecer/ })
    expect(resets).toHaveLength(3 + 1) // espacios gastados x3, diario horas x1 (no conjuros stored)
    for (const button of resets) expect(button.textContent).toBe('')
  })

  it('reset to zero and to a fixed value', () => {
    const actions = mount({}, { ...ENTITY, diario: [{ id: 1, texto: 'x', horas: 5 }], conjuros: [{ id: 1, nombre: 'Luz', categoria: 'a', mana: 1 }] })
    tab('Mecánicas')
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer Horas (fila 1 de Diario)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer Mana (fila 1 de Conjuros)' }))
    const data = saved(actions)[1]
    expect(data.diario).toEqual([{ id: 1, texto: 'x', horas: 0 }])
    expect(data.conjuros).toEqual([{ id: 1, nombre: 'Luz', categoria: 'a', mana: 9 }])
  })

  it('adds a row with a new unique id and removes the displayed row it was asked to', () => {
    const actions = mount({}, { ...ENTITY, espacios: rows })
    tab('Mecánicas')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar fila a Espacios' }))
    expect(cells('Nivel')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar fila 1 de Espacios' })) // displayed first = stored 'b'
    const draft = saved(actions)[1].espacios as Record<string, unknown>[]
    expect(draft.map((r) => r.id)).toEqual(['a', 'c', 1]) // 'b' gone; the new row got an id none of the others has
  })

  it('formula columns of a row are read-only values', () => {
    mount({}, { ...ENTITY, diario: [{ id: 1, texto: 'x', horas: 5 }] })
    tab('Mecánicas')
    const doble = screen.getByLabelText('Doble (fila 1 de Diario)')
    expect(doble).toHaveValue('10')
    expect(isLocked(doble)).toBe(true)
    fireEvent.change(screen.getByLabelText('Horas (fila 1 de Diario)'), { target: { value: '6' } })
    expect(screen.getByLabelText('Doble (fila 1 de Diario)')).toHaveValue('12')
  })
})

/** G10a: clase, raza and nivel follow the system builtins (enabled, label, range) and the owner rules of today's form. */
describe('identity builtins: clase, raza, nivel', () => {
  const builtins = (over: Record<string, unknown> = {}) => {
    const base = dnd5eProfile()
    return { ...base, character: { ...base.character, builtins: { ...base.character.builtins, ...over } } }
  }
  const item = { ...ENTITY, clase: 'Paladín', raza: 'Humano', nivel: 3 }

  it('the DM sees the three with the stock labels ("Raza / Especie") and a nivel inside the system range', () => {
    mount({}, item)
    expect(screen.getByLabelText('Clase')).toHaveValue('Paladín')
    expect(screen.getByLabelText('Raza / Especie')).toHaveValue('Humano')
    const nivel = screen.getByLabelText('Nivel')
    expect(nivel).toHaveAttribute('type', 'number')
    expect(nivel).toHaveAttribute('min', '1')
    expect(nivel).toHaveAttribute('max', '20')
    expect(nivel).toHaveValue(3)
    expect([screen.getByLabelText('Clase'), screen.getByLabelText('Raza / Especie'), nivel].some(isLocked)).toBe(false)
  })

  it('shows only the enabled builtins, with the label the system gives them and its range', () => {
    mount({ system: builtins({ clase: { enabled: false, label: 'Clase' }, raza: { enabled: true, label: 'Especie' }, nivel: { enabled: true, label: 'Rango', min: 0, max: 5 } }) }, item)
    expect(screen.queryByLabelText('Clase')).toBeNull()
    expect(screen.queryByLabelText('Raza / Especie')).toBeNull()
    expect(screen.getByLabelText('Especie')).toHaveValue('Humano')
    const rango = screen.getByLabelText('Rango')
    expect(rango).toHaveAttribute('min', '0')
    expect(rango).toHaveAttribute('max', '5')
    expect(screen.queryByLabelText('Nivel')).toBeNull()
  })

  it('draws none of them when the system disables all three', () => {
    mount({ system: builtins({ clase: { enabled: false, label: 'Clase' }, raza: { enabled: false, label: 'Raza' }, nivel: { enabled: false, label: 'Nivel', min: 1, max: 20 } }) }, item)
    for (const name of ['Clase', 'Raza / Especie', 'Raza', 'Nivel']) expect(screen.queryByLabelText(name)).toBeNull()
  })

  it('the DM edits them and the typed values reach the save', () => {
    const actions = mount({}, item)
    fireEvent.change(screen.getByLabelText('Clase'), { target: { value: 'Pícaro' } })
    fireEvent.change(screen.getByLabelText('Raza / Especie'), { target: { value: 'Elfo' } })
    fireEvent.change(screen.getByLabelText('Nivel'), { target: { value: '7' } })
    expect(saved(actions)[1]).toMatchObject({ id: 1, clase: 'Pícaro', raza: 'Elfo', nivel: '7' })
  })

  it('the owning player edits clase and raza but sees nivel read-only (or not at all)', () => {
    const actions = mount({ isDM: false, ownCharacterIds: [1] }, item)
    expect(isLocked(screen.getByLabelText('Clase'))).toBe(false)
    expect(isLocked(screen.getByLabelText('Raza / Especie'))).toBe(false)
    expect(isLocked(screen.getByLabelText('Nivel'))).toBe(true)
    fireEvent.change(screen.getByLabelText('Clase'), { target: { value: 'Mago' } })
    expect(saved(actions)[1]).toMatchObject({ clase: 'Mago', nivel: 3 })
  })
})
