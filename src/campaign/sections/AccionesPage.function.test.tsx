import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { action, withActionSheet } from '../system/actions/actionsFixture'
import { BENDICION, FUNCTION_SHEET_RAW, IMPONER_MANOS, LANZAR_HECHIZO } from '../system/actions/function/fixture'
import { validateActionFunction } from '../system/actions/function/validate'
import { FUNCTION_SHEET } from '../system/actions/function/fixture'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })
afterEach(() => vi.restoreAllMocks())

const PJS = [entity(1, { nombre: 'Eldric', jugador: '', region: 'magral' })]
const normalised = (raw: unknown) => {
  const checked = validateActionFunction(raw, FUNCTION_SHEET, 'rasgos')
  if (!checked.ok) throw new Error(JSON.stringify(checked.errors))
  return checked.fn
}

function open(entries = [action(1, { table_key: 'rasgos', category: 'Clase', name: 'Lanzar hechizo' })], isDM = true) {
  const made = createFakeLayer({ entities: { pjs: PJS }, actions: entries })
  renderSection('/c/demo/acciones', { layer: made.layer, isDM, campaign: withActionSheet(FUNCTION_SHEET_RAW) })
  return made
}
const editForm = async (name = 'Lanzar hechizo') => {
  fireEvent.click(await screen.findByRole('button', { name: `Editar ${name}` }))
  return screen.getByRole('form', { name: 'Acción' })
}
const step = (n: number) => within(screen.getByRole('group', { name: `Paso ${n}` }))
const set = (control: HTMLElement, value: string) => fireEvent.change(control, { target: { value } })
const save = () => fireEvent.click(within(screen.getByRole('form', { name: 'Acción' })).getByRole('button', { name: 'Guardar' }))

describe('Acciones: function editor', () => {
  it('builds a function with a parameter step and a row effect, and saves the normalised function', async () => {
    const { spies } = open()
    const form = await editForm()
    expect(within(form).getByText('Sin función.')).toBeInTheDocument()
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar función' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar parámetro' }))
    set(step(1).getByLabelText('Clave'), 'nivel')
    set(step(1).getByLabelText('Etiqueta'), 'Nivel del espacio')
    set(step(1).getByLabelText('Mínimo'), '1')
    set(step(1).getByLabelText('Máximo'), '9')
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar efecto' }))
    set(step(2).getByLabelText('Etiqueta'), 'Gastar espacio')
    set(step(2).getByLabelText('Destino'), 'row')
    set(step(2).getByLabelText('Tabla'), 'espacios_conjuro')
    set(step(2).getByLabelText('Columna de coincidencia'), 'nivel')
    set(step(2).getByLabelText('Valor de coincidencia'), '{nivel}')
    set(step(2).getByLabelText('Columna'), 'gastados')
    set(step(2).getByLabelText('Operación'), 'add')
    set(step(2).getByLabelText('Valor'), '1')
    set(step(2).getByLabelText('Máximo'), '{total}')
    expect(within(form).queryByRole('list', { name: 'Errores de la función' })).toBeNull()
    save()
    await waitFor(() => expect(spies.updateAction).toHaveBeenCalledTimes(1))
    const [id, patch] = spies.updateAction.mock.calls[0]
    expect(id).toBe(1)
    expect(patch.function).toEqual(normalised(LANZAR_HECHIZO))
  })

  it('builds a field effect, an options parameter and a state effect', async () => {
    const { spies } = open()
    const form = await editForm()
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar función' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar parámetro' }))
    set(step(1).getByLabelText('Clave'), 'modo')
    set(step(1).getByLabelText('Etiqueta'), 'Modo')
    set(step(1).getByLabelText('Tipo de entrada'), 'options')
    fireEvent.click(step(1).getByRole('button', { name: 'Agregar opción' }))
    set(step(1).getByLabelText('Etiqueta de la opción 1'), 'Pequeño')
    set(step(1).getByLabelText('Valor de la opción 1'), '1')
    fireEvent.click(step(1).getByRole('button', { name: 'Agregar opción' }))
    set(step(1).getByLabelText('Etiqueta de la opción 2'), 'Grande')
    set(step(1).getByLabelText('Valor de la opción 2'), 'grande')
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar efecto' }))
    set(step(2).getByLabelText('Destino'), 'state')
    set(step(2).getByLabelText('Columna'), 'reserva')
    set(step(2).getByLabelText('Operación'), 'subtract')
    set(step(2).getByLabelText('Valor'), '{modo}')
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar efecto' }))
    set(step(3).getByLabelText('Campo o rol'), 'hp_current')
    set(step(3).getByLabelText('Valor'), '2')
    save()
    await waitFor(() => expect(spies.updateAction).toHaveBeenCalledTimes(1))
    expect(spies.updateAction.mock.calls[0][1].function).toEqual({
      steps: [
        { kind: 'param', key: 'modo', label: 'Modo', input: { type: 'options', options: [{ label: 'Pequeño', value: 1 }, { label: 'Grande', value: 'grande' }] } },
        { kind: 'effect', target: { type: 'state', column: 'reserva' }, op: 'subtract', value: '{modo}' },
        { kind: 'effect', target: { type: 'field', key: 'hp_current' }, op: 'add', value: '2' },
      ],
    })
  })

  it('shows the stored function, lets the DM reorder and remove steps, and saves the new order', async () => {
    const { spies } = open([action(1, { table_key: 'rasgos', category: 'Clase', name: 'Imponer manos', function: normalised(IMPONER_MANOS) })])
    await editForm('Imponer manos')
    expect(step(1).getByLabelText('Clave')).toHaveValue('puntos')
    expect(step(3).getByLabelText('Campo o rol')).toHaveValue('hp_current')
    fireEvent.click(step(3).getByRole('button', { name: 'Subir' }))
    expect(step(2).getByLabelText('Campo o rol')).toHaveValue('hp_current')
    fireEvent.click(step(2).getByRole('button', { name: 'Quitar paso' }))
    expect(screen.queryByRole('group', { name: 'Paso 3' })).toBeNull()
    save()
    await waitFor(() => expect(spies.updateAction).toHaveBeenCalledTimes(1))
    expect(spies.updateAction.mock.calls[0][1].function).toEqual({
      steps: [normalised(IMPONER_MANOS).steps[0], normalised(IMPONER_MANOS).steps[1]],
    })
  })

  it('quitar función clears it (null)', async () => {
    const { spies } = open([action(1, { table_key: 'rasgos', category: 'Clase', name: 'Bendición', function: normalised(BENDICION) })])
    const form = await editForm('Bendición')
    fireEvent.click(within(form).getByRole('button', { name: 'Quitar función' }))
    expect(within(form).getByText('Sin función.')).toBeInTheDocument()
    save()
    await waitFor(() => expect(spies.updateAction).toHaveBeenCalledTimes(1))
    expect(spies.updateAction.mock.calls[0][1].function).toBeNull()
  })

  it('validates live with Spanish path-addressed errors and does not save while there are errors', async () => {
    const { spies } = open()
    const form = await editForm()
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar función' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar efecto' }))
    set(step(1).getByLabelText('Campo o rol'), 'hp_current')
    set(step(1).getByLabelText('Valor'), '2 +')
    const errors = within(form).getByRole('list', { name: 'Errores de la función' })
    expect(within(errors).getByText('Paso 1 › valor: La fórmula no es válida.')).toBeInTheDocument()
    set(step(1).getByLabelText('Valor'), '{zzz}')
    expect(within(errors).getByText('Paso 1 › valor: Referencia desconocida {zzz}.')).toBeInTheDocument()
    set(step(1).getByLabelText('Campo o rol'), 'titulo')
    expect(within(errors).getByText('Paso 1 › destino › clave: titulo no es un campo numérico guardado.')).toBeInTheDocument()
    save()
    expect(await within(form).findByRole('alert')).toHaveTextContent('Corregí los errores de la función antes de guardar.')
    expect(spies.updateAction).not.toHaveBeenCalled()
    set(step(1).getByLabelText('Campo o rol'), 'hp_current')
    set(step(1).getByLabelText('Valor'), '2')
    expect(within(form).queryByRole('list', { name: 'Errores de la función' })).toBeNull()
  })

  it('a function with no steps cannot be saved', async () => {
    const { spies } = open()
    const form = await editForm()
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar función' }))
    expect(within(form).getByText('Pasos: Una función necesita entre 1 y 20 pasos.')).toBeInTheDocument()
    save()
    await within(form).findByRole('alert')
    expect(spies.updateAction).not.toHaveBeenCalled()
  })

  it('creates a new entry with its function', async () => {
    const { spies } = open([])
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva acción' }))
    const form = screen.getByRole('form', { name: 'Acción' })
    set(within(form).getByLabelText('Tabla'), 'rasgos')
    set(within(form).getByLabelText('Categoría'), 'Clase')
    set(within(form).getByLabelText('Nombre'), 'Bendición')
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar función' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Agregar efecto' }))
    set(step(1).getByLabelText('Campo o rol'), 'oro')
    set(step(1).getByLabelText('Valor'), '1')
    save()
    await waitFor(() => expect(spies.createAction).toHaveBeenCalledTimes(1))
    expect(spies.createAction.mock.calls[0][1]).toMatchObject({ table_key: 'rasgos', name: 'Bendición', function: { steps: [{ kind: 'effect', target: { type: 'field', key: 'oro' }, op: 'add', value: '1' }] } })
  })

  it('PRESERVE: saving an entry without touching the function sends no function key', async () => {
    const { spies } = open([action(1, { table_key: 'rasgos', category: 'Clase', name: 'Bendición', function: normalised(BENDICION) })])
    await editForm('Bendición')
    set(screen.getByLabelText('Nombre'), 'Bendición mayor')
    save()
    await waitFor(() => expect(spies.updateAction).toHaveBeenCalledTimes(1))
    expect(spies.updateAction.mock.calls[0][1]).toEqual({ category: 'Clase', name: 'Bendición mayor', description: '', extras: {}, private_to_pj: null })
  })

  it('a player never gets the catalogue (so no editor)', async () => {
    open(undefined, false)
    expect(await screen.findByRole('heading', { name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar función' })).toBeNull()
  })
})
