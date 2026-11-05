import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'
import { dnd5eProfile } from '../system/systemProfile'

configure({ asyncUtilTimeout: 5000 })

const field = (key: string, label: string, type: string, extra: Record<string, unknown> = {}) => ({ kind: 'field', key, label, type, editableBy: 'dm', ...extra })
const sheetOf = (items: unknown[]) => ({
  categories: [{ key: 'general', label: 'General', sections: [{ key: 'perfil', label: 'Perfil', items, blocks: [] }] }],
  roles: {},
})
const SEARCHABLE = sheetOf([
  field('arma', 'Arma', 'short', { searchable: true }),
  field('edad', 'Edad', 'short'),
  field('suerte', 'Suerte', 'number', { searchable: true }),
  field('doble', 'Doble', 'number', { formula: '{suerte} * 2', searchable: true }),
  field('oculto', 'Oculto', 'number', { formula: '{suerte} + 100', hidden: true, searchable: true }),
])
const NOT_SEARCHABLE = sheetOf([field('arma', 'Arma', 'short'), field('suerte', 'Suerte', 'number')])
const campaign = (sheet: unknown) => ({ system_profile: { ...dnd5eProfile(), ...(sheet === undefined ? {} : { sheet }) } as unknown as Record<string, unknown> })

const pj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `PJ ${id}`, jugador: '', clase: 'Guerrero', raza: '', region: 'magral', nivel: 1, imagen_url: '', sections_updated: {}, ...over })
const ELDRIC = pj(1, { nombre: 'Eldric', arma: 'Espada larga', edad: '30', suerte: 3 })
const MAISIE = pj(2, { nombre: 'Maisie', arma: 'Bastón', suerte: 0 })
const KAYLINX = pj(3, { nombre: 'Kaylinx', arma: 'Daga', estado: 'borrador' })
const PJS = [ELDRIC, MAISIE, KAYLINX]

const main = () => within(screen.getByRole('main'))
const cards = () => main().queryAllByRole('link').filter((a) => /\/pjs\/\d+(\?.*)?$/.test(a.getAttribute('href') ?? ''))
const names = () => cards().map((a) => within(a).getByText(/^(Eldric|Maisie|Kaylinx)$/).textContent)
const open = async (sheet: unknown, isDM: boolean, expected: number) => {
  const { layer } = createFakeLayer({ entities: { pjs: PJS } })
  renderSection('/c/demo/pjs', { layer, isDM, campaign: campaign(sheet) })
  await waitFor(() => expect(cards()).toHaveLength(expected))
}
const type = (value: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar PJs' }), { target: { value } })

describe('PJ list: searchable fields (S27, S32)', () => {
  it('DM: cards carry the searchable values as tags, in sheet order, after the existing content', async () => {
    await open(SEARCHABLE, true, 3)
    const first = within(cards()[0])
    const tags = first.getAllByTestId('pj-searchable-tag').map((t) => t.textContent)
    expect(tags).toEqual(['Arma: Espada larga', 'Suerte: 3', 'Doble: 6'])
    expect(first.getByText('Guerrero - Nv. 1')).toBeInTheDocument() // today's badges stay
    const all = cards()[0].textContent ?? ''
    expect(all.indexOf('Sin trasfondo registrado.')).toBeLessThan(all.indexOf('Arma: Espada larga'))
  })

  it('leaves out empty values and never tags a hidden formula', async () => {
    await open(SEARCHABLE, true, 3)
    expect(within(cards()[1]).getAllByTestId('pj-searchable-tag').map((t) => t.textContent)).toEqual(['Arma: Bastón', 'Suerte: 0', 'Doble: 0'])
    expect(within(cards()[2]).getAllByTestId('pj-searchable-tag').map((t) => t.textContent)).toEqual(['Arma: Daga'])
    expect(main().queryByText(/Oculto/)).toBeNull()
    expect(main().queryByText(/Edad/)).toBeNull()
  })

  it('finds a character by the value of a searchable field, case-insensitive', async () => {
    await open(SEARCHABLE, true, 3)
    type('ESPADA')
    await waitFor(() => expect(names()).toEqual(['Eldric']))
    type('bastón')
    await waitFor(() => expect(names()).toEqual(['Maisie']))
  })

  it('does not match through a field that is not searchable or a hidden formula', async () => {
    await open(SEARCHABLE, true, 3)
    type('30') // edad, not searchable
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument()
    type('103') // oculto (suerte 3 + 100), hidden
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument()
  })

  it('player: matches only characters already visible, so a draft is never found', async () => {
    await open(SEARCHABLE, false, 2)
    expect(names()).toEqual(['Eldric', 'Maisie'])
    type('daga')
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument()
    type('espada')
    await waitFor(() => expect(names()).toEqual(['Eldric']))
  })

  it('the search box hints the searchable fields', async () => {
    await open(SEARCHABLE, true, 3)
    expect(screen.getByPlaceholderText('Buscar por nombre, clase, raza, jugador, Arma, Suerte o Doble…')).toBeInTheDocument()
  })

  it.each([
    ['a sheet with no searchable field', NOT_SEARCHABLE],
    ['no sheet', undefined],
    ['an invalid sheet', { categories: 'x' }],
  ])('%s: no tags, today search and hint', async (_name, sheet) => {
    await open(sheet, true, 3)
    expect(screen.queryAllByTestId('pj-searchable-tag')).toHaveLength(0)
    expect(screen.getByPlaceholderText('Buscar por nombre, clase, raza o jugador…')).toBeInTheDocument()
    type('espada')
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument()
    type('guerrero')
    await waitFor(() => expect(names()).toEqual(['Eldric', 'Maisie', 'Kaylinx']))
  })
})
