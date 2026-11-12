import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'
import { dnd5eProfile } from '../../system/systemProfile'
import { pressBar, saveBar } from './saveBarTestKit'

configure({ asyncUtilTimeout: 10000 })
afterEach(() => vi.restoreAllMocks())

type Json = Record<string, unknown>

const SHEET = (): Json => ({
  categories: [
    {
      key: 'general',
      label: 'General',
      sections: [
        { key: 'perfil', label: 'Perfil', items: [{ kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'dm' }], blocks: [] },
        {
          key: 'equipo',
          label: 'Equipo',
          items: [
            { kind: 'table', type: 'monedas', key: 'bolsa', label: 'Bolsa', rows: [{ key: 'oro', label: 'oro', value: 100 }, { key: 'plata', label: 'plata', value: 10 }, { key: 'bronce', label: 'bronce', value: 1 }], rewardDestination: true },
            { kind: 'table', type: 'economia', key: 'banco_gremio', label: 'Banco del gremio', editableBy: 'dm' },
          ],
          blocks: [{ key: 'dinero', title: 'Dinero', mode: 'plano', items: ['bolsa', 'banco_gremio'] }],
        },
      ],
    },
  ],
  roles: {},
})
const profileWith = (sheet: Json | null) => ({ ...dnd5eProfile(), ...(sheet ? { sheet } : {}) }) as unknown as Record<string, unknown>
const LOTERIA = { loteria: { value: { commonMinRoll: 15, commonPrize: { oro: 2 }, specialPrize: { plata: 1 } }, visibility: 'members' as const, updated_at: 'v1' } }

function setup(sheet: Json | null = SHEET(), config: Record<string, unknown> = {}) {
  const stored = { name: 'Drakterima', system_profile: profileWith(sheet) }
  const made = createFakeLayer({ campaign: stored as never, entities: { pjs: [] }, pot: null, config: config as never })
  const view = renderSection('/c/demo/ajustes?tab=sistema', { layer: made.layer, isDM: true, campaign: stored as never })
  return { ...made, ...view }
}
const economy = async () => within(await screen.findByRole('region', { name: 'Economía' }))
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const click = (name: string | RegExp, scope: { getByRole: (...a: never[]) => HTMLElement } | ReturnType<typeof within>) => fireEvent.click((scope as ReturnType<typeof within>).getByRole('button', { name }))
const written = (spies: ReturnType<typeof setup>['spies']): Json => (spies.setSystemProfile.mock.calls[0] as unknown[])[1] as Json
const itemsOf = (profile: Json, sectionKey: string): Json[] =>
  ((profile.sheet as Json).categories as Json[]).flatMap((c) => c.sections as Json[]).find((s) => s.key === sectionKey)!.items as Json[]

describe('Sistema › Economía: denominations', () => {
  it('lists the denominations (key, name, what each is worth in the base one) and the summary', async () => {
    setup()
    const e = await economy()
    const rows = e.getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell').slice(0, 3).map((c) => c.textContent))).toEqual([
      ['oro', 'oro', '100 bronce'],
      ['plata', 'plata', '10 bronce'],
      ['bronce', 'bronce', '1 bronce'],
    ])
    expect(e.getByText('1 oro = 10 plata = 100 bronce')).toBeInTheDocument()
  })

  it('edits a name and an equivalence and saves them in a single system_profile write; the key stays fixed', async () => {
    const { spies } = setup()
    const e = await economy()
    click('Editar', within(e.getByRole('row', { name: 'Moneda plata' })))
    const row = within(e.getByRole('row', { name: 'Moneda plata' }))
    expect(row.getByLabelText('Clave de la moneda')).toHaveAttribute('readonly')
    type(row.getByLabelText('Nombre de la moneda'), 'Plata fina')
    type(within(e.getByRole('row', { name: 'Moneda Plata fina' })).getByLabelText('Equivale a (en la unidad base)'), '20')
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    const coin = itemsOf(written(spies), 'equipo')[0]
    expect(coin.rows).toEqual([{ key: 'oro', label: 'oro', value: 100 }, { key: 'plata', label: 'Plata fina', value: 20 }, { key: 'bronce', label: 'bronce', value: 1 }])
    expect(coin.rewardDestination).toBe(true)
  })

  it('adds a denomination (its key follows its name), updates the summary live and saves it', async () => {
    const { spies } = setup()
    const e = await economy()
    click('+ Agregar moneda', e)
    type(e.getByLabelText('Nombre de la moneda'), 'Platino')
    expect(e.getByLabelText('Clave de la moneda')).toHaveValue('platino')
    type(e.getByLabelText('Equivale a (en la unidad base)'), '1000')
    expect(e.getByText('1 Platino = 10 oro = 100 plata = 1000 bronce')).toBeInTheDocument()
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect((itemsOf(written(spies), 'equipo')[0].rows as Json[]).map((r) => r.key)).toEqual(['oro', 'plata', 'bronce', 'platino'])
    expect(JSON.stringify(written(spies))).not.toContain('_new')
  })

  it('reorders a denomination', async () => {
    const { spies } = setup()
    const e = await economy()
    click('Editar', within(e.getByRole('row', { name: 'Moneda oro' })))
    click('Bajar moneda', within(e.getByRole('row', { name: 'Moneda oro' })))
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect((itemsOf(written(spies), 'equipo')[0].rows as Json[]).map((r) => r.key)).toEqual(['plata', 'oro', 'bronce'])
  })

  it('removing a saved denomination asks first, and warns when the lottery prizes name it', async () => {
    const { spies } = setup(SHEET(), LOTERIA)
    const e = await economy()
    click('Editar', within(e.getByRole('row', { name: 'Moneda oro' })))
    click('Quitar moneda', within(e.getByRole('row', { name: 'Moneda oro' })))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('los datos ya cargados en los personajes se conservan')
    expect(dialog).toHaveTextContent('Los premios de la lotería nombran «oro»')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(e.getByRole('row', { name: 'Moneda oro' })).toBeInTheDocument()
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
    click('Quitar moneda', within(e.getByRole('row', { name: 'Moneda oro' })))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Quitar' }))
    expect(e.queryByRole('row', { name: 'Moneda oro' })).toBeNull()
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect((itemsOf(written(spies), 'equipo')[0].rows as Json[]).map((r) => r.key)).toEqual(['plata', 'bronce'])
  })

  it('says so when the lottery prizes cannot be read while asking to remove a denomination', async () => {
    const { spies } = setup(SHEET(), LOTERIA)
    spies.configGet.mockRejectedValue(new Error('offline'))
    const e = await economy()
    click('Editar', within(e.getByRole('row', { name: 'Moneda oro' })))
    click('Quitar moneda', within(e.getByRole('row', { name: 'Moneda oro' })))
    expect(await screen.findByRole('dialog')).toHaveTextContent('No pudimos leer los premios de la lotería')
  })

  it('a denomination added in this session is removed without asking', async () => {
    setup()
    const e = await economy()
    click('+ Agregar moneda', e)
    click('Quitar moneda', e)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(e.getAllByRole('row')).toHaveLength(4)
  })

  it('stops adding at the limit of denominations', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ key: `m${i}`, label: `M${i}`, value: i === 0 ? 1 : 10 ** i }))
    const sheet = SHEET()
    ;((((sheet.categories as Json[])[0].sections as Json[])[1].items as Json[])[0] as Json).rows = rows
    setup(sheet)
    expect((await economy()).getByRole('button', { name: '+ Agregar moneda' })).toBeDisabled()
  })

  it('shows the validation errors of the economy in the block and counts them in the bar, without writing', async () => {
    const { spies } = setup()
    const e = await economy()
    click('Editar', within(e.getByRole('row', { name: 'Moneda plata' })))
    type(within(e.getByRole('row', { name: 'Moneda plata' })).getByLabelText('Equivale a (en la unidad base)'), '100')
    const alert = await e.findByRole('alert', { name: 'Errores de economía' })
    expect(alert).toHaveTextContent('La economía tiene 1 error')
    expect(within(await saveBar()).getByText(/1 error impide guardar/)).toBeInTheDocument()
    expect(within(await saveBar()).getByRole('button', { name: 'Guardar sistema' })).toBeDisabled()
    fireEvent.click(within(await saveBar()).getByRole('button', { name: 'Guardar sistema' }))
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('without a template it explains that the classic sheet has no economy to configure', async () => {
    setup(null)
    const e = await economy()
    expect(await e.findByText(/todavía usa la ficha clásica/)).toBeInTheDocument()
    expect(e.queryByRole('button', { name: '+ Agregar moneda' })).toBeNull()
  })
})

describe('Sistema › Economía: instances', () => {
  it('lists each instance with its key, where it sits and the destination mark; the destination cannot be deleted', async () => {
    setup()
    const e = await economy()
    expect(e.getByRole('group', { name: 'Instancia Bolsa' })).toHaveTextContent('bolsa · en General › Equipo · define las monedas · destino de recompensa')
    expect(e.getByRole('group', { name: 'Instancia Banco del gremio' })).toHaveTextContent('banco_gremio · en General › Equipo')
    const destination = within(e.getByRole('group', { name: 'Instancia Bolsa' })).getByRole('button', { name: 'Eliminar' })
    expect(destination).toBeDisabled()
    expect(destination).toHaveAttribute('title', 'Es el destino de recompensa: elegí otro en Juegos antes de eliminarla')
    expect(within(e.getByRole('group', { name: 'Instancia Banco del gremio' })).getByRole('button', { name: 'Eliminar' })).toBeEnabled()
    expect(e.getByText('Eliminar una instancia con montos guardados la pasa a campos descartados por 60 días.')).toBeInTheDocument()
  })

  it('creates an instance in the section picked (default: the one with the coin table) and writes once', async () => {
    const { spies } = setup()
    const e = await economy()
    click('+ Nueva instancia', e)
    const form = within(e.getByRole('group', { name: 'Nueva instancia' }))
    expect(form.getByLabelText('Sección de la nueva instancia')).toHaveValue('equipo')
    expect(form.getByRole('button', { name: 'Crear instancia' })).toBeDisabled()
    type(form.getByLabelText('Nombre de la nueva instancia'), 'Caja fuerte')
    type(form.getByLabelText('Sección de la nueva instancia'), 'perfil')
    click('Crear instancia', form)
    expect(e.getByRole('group', { name: 'Instancia Caja fuerte' })).toHaveTextContent('caja_fuerte · en General › Perfil')
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(itemsOf(written(spies), 'perfil').map((i) => i.key)).toEqual(['edad', 'caja_fuerte'])
    expect(itemsOf(written(spies), 'perfil')[1]).toEqual({ kind: 'table', type: 'economia', key: 'caja_fuerte', label: 'Caja fuerte', editableBy: 'dm' })
  })

  it('renames an instance: the name changes, the saved key does not', async () => {
    const { spies } = setup()
    const e = await economy()
    click('Editar', within(e.getByRole('group', { name: 'Instancia Banco del gremio' })))
    const g = within(e.getByRole('group', { name: 'Instancia Banco del gremio' }))
    expect(g.getByLabelText('Clave de la instancia')).toHaveAttribute('readonly')
    type(g.getByLabelText('Nombre de la instancia'), 'Tesoro')
    expect(e.getByRole('group', { name: 'Instancia Tesoro' })).toHaveTextContent('banco_gremio')
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(itemsOf(written(spies), 'equipo')[1]).toMatchObject({ key: 'banco_gremio', label: 'Tesoro' })
  })

  it('deleting a saved instance goes through the discarded-fields path after a warning', async () => {
    const { spies } = setup()
    const e = await economy()
    click('Eliminar', within(e.getByRole('group', { name: 'Instancia Banco del gremio' })))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Eliminar una instancia con montos guardados la pasa a campos descartados por 60 días.')
    expect(dialog).toHaveTextContent('Lo quitado pasa a «Campos descartados»')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    expect(e.queryByRole('group', { name: 'Instancia Banco del gremio' })).toBeNull()
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    const sheet = written(spies).sheet as Json
    expect(itemsOf(written(spies), 'equipo').map((i) => i.key)).toEqual(['bolsa'])
    expect((sheet.discarded as Json[]).map((d) => (d.item as Json).key)).toEqual(['banco_gremio'])
    expect((sheet.discarded as Json[])[0]).toMatchObject({ section: 'equipo', item: { kind: 'table', type: 'economia', label: 'Banco del gremio' } })
    // the block that showed it stops showing it
    const block = ((((sheet.categories as Json[])[0].sections as Json[])[1].blocks as Json[])[0]).items
    expect(block).toEqual(['bolsa'])
  })

  it('an instance created in this session is deleted without a warning and leaves nothing behind', async () => {
    const { spies } = setup()
    const e = await economy()
    click('+ Nueva instancia', e)
    type(e.getByLabelText('Nombre de la nueva instancia'), 'Temporal')
    click('Crear instancia', e)
    click('Eliminar', within(e.getByRole('group', { name: 'Instancia Temporal' })))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(e.queryByRole('group', { name: 'Instancia Temporal' })).toBeNull()
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('the coin table cannot be deleted while other instances hold amounts in its denominations', async () => {
    const sheet = SHEET()
    ;((((sheet.categories as Json[])[0].sections as Json[])[1].items as Json[])[0] as Json).rewardDestination = false
    setup(sheet)
    const e = await economy()
    const del = within(e.getByRole('group', { name: 'Instancia Bolsa' })).getByRole('button', { name: 'Eliminar' })
    expect(del).toBeDisabled()
    expect(del).toHaveAttribute('title', expect.stringContaining('Eliminá primero las demás instancias'))
  })

  it('a campaign without coins gets its coin table as the first instance', async () => {
    const sheet: Json = { categories: [{ key: 'g', label: 'G', sections: [{ key: 's', label: 'S', items: [], blocks: [] }] }], roles: {} }
    const { spies } = setup(sheet)
    const e = await economy()
    expect(e.getByRole('button', { name: '+ Agregar moneda' })).toBeDisabled()
    click('+ Nueva instancia', e)
    type(e.getByLabelText('Nombre de la nueva instancia'), 'Monedero')
    click('Crear instancia', e)
    click('+ Agregar moneda', e)
    type(e.getByLabelText('Nombre de la moneda'), 'Cobre')
    type(e.getByLabelText('Equivale a (en la unidad base)'), '1')
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(itemsOf(written(spies), 's')[0]).toEqual({ kind: 'table', type: 'monedas', key: 'monedero', label: 'Monedero', rows: [{ key: 'cobre', label: 'Cobre', value: 1 }] })
  })
})

describe('Sistema tab: one system_profile write per save', () => {
  it('a Sistema edit and the economy travel in a single write, over the rest of the document', async () => {
    const { spies } = setup()
    type(within(await screen.findByRole('group', { name: 'Clase' })).getByLabelText('Título'), 'Oficio')
    const e = await economy()
    click('+ Nueva instancia', e)
    type(e.getByLabelText('Nombre de la nueva instancia'), 'Caja')
    click('Crear instancia', e)
    expect(within(await saveBar()).getByText(/2 cambios sin guardar/)).toBeInTheDocument()
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    const profile = written(spies)
    expect(((profile.character as Json).builtins as Json).clase).toMatchObject({ label: 'Oficio' })
    expect(itemsOf(profile, 'equipo').map((i) => i.key)).toEqual(['bolsa', 'banco_gremio', 'caja'])
    expect(await screen.findByText('Sistema guardado.')).toBeInTheDocument()
    expect(spies.setSystemProfile).toHaveBeenCalledTimes(1)
  })

  it('Descartar puts the economy draft back too', async () => {
    const { spies } = setup()
    const e = await economy()
    click('+ Nueva instancia', e)
    type(e.getByLabelText('Nombre de la nueva instancia'), 'Caja')
    click('Crear instancia', e)
    await pressBar('Descartar')
    await waitFor(() => expect(e.queryByRole('group', { name: 'Instancia Caja' })).toBeNull())
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })
})
