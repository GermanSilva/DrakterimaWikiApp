import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'
import { DND5E_SHEET } from '../system/sheet/dnd5eSheet'
import { dnd5eProfile } from '../system/systemProfile'

configure({ asyncUtilTimeout: 10000 })

const COINS0 = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
const pj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, {
    nombre: `PJ ${id}`, jugador: '', clase: 'Guerrero', raza: '', region: 'magral', nivel: 1, imagen_url: '',
    sections_updated: {}, monedas: COINS0, monedas_guardado: {}, ...over,
  })

// the sheet of the campaign: the D&D 5e document plus the sheet as data
const withSheet = (sheet: unknown = DND5E_SHEET) => ({ system_profile: { ...dnd5eProfile(), sheet } as unknown as Record<string, unknown> })

const ELDRIC = pj(1, {
  nombre: 'Eldric', jugador: 'Ana', clase: 'Paladín', raza: 'Humano', nivel: 5, alineamiento: 'Leal Bueno',
  stat_hp: 40, stat_hp_current: 31, stat_ac: 18, stat_speed: 30, stat_initiative: 2,
  stat_str: 16, stat_dex: 10, stat_con: 14, stat_int: 8, stat_wis: 12, stat_cha: 15, stat_proficiency_bonus: 3,
  save_str: true, skill_athletics: 'competente', skill_perception: 'experto',
  ataques: [
    { id: 1, nombre: 'Espada larga', bono_ataque: '+6', dano: '1d8+3', tipo_dano: 'Cortante', portando: true },
    { id: 2, nombre: 'Daga', bono_ataque: '+4', dano: '1d4+1', tipo_dano: 'Perforante', portando: false },
  ],
  monedas: { cp: 7, sp: 0, ep: 0, gp: 120, pp: 2 },
  monedas_guardado: { cp: 0, sp: 30, ep: 0, gp: 0, pp: 0 },
  // `categoria` is the declared category key the modal block groups by (preset v2: trucos, nivel_1...)
  hechizos: [
    { id: 1, nombre: 'Luz', categoria: 'trucos', escuela: 'Evocación', a_niveles_superiores: 'Una luz.' },
    { id: 2, nombre: 'Bendecir', categoria: 'nivel_1', preparado: true, a_niveles_superiores: 'Bendice a tus aliados.' },
  ],
  rasgos_clase: 'Sentido divino', idiomas: 'Común, Celestial',
  edad: '30', personalidad: 'Calmo y paciente',
})

const SHEET_URL = '/c/demo/pjs/1'
const section = (key: string) => {
  const el = document.getElementById(`pj-section-${key}`)
  if (!el) throw new Error(`no section ${key}`)
  return within(el)
}
const titleOf = (key: string) => (document.getElementById(`pj-section-${key}`) as HTMLElement).firstElementChild as HTMLElement
// the marker is what tells the two renderers apart: today's detail already shows many of the same numbers
const sheetView = () => document.querySelector('[data-sheet-view]')
const open = async (pjs = [ELDRIC], url = SHEET_URL, campaign: Record<string, unknown> = withSheet(), expectSheet = true) => {
  const { layer } = createFakeLayer({ entities: { pjs } })
  renderSection(url, { layer, campaign, regions: [{ key: 'magral', label: 'Tierras de Magral' }] })
  await screen.findByRole('heading', { level: 1, name: 'Eldric' })
  if (expectSheet) expect(sheetView(), 'the sheet renderer is mounted').not.toBeNull()
  else expect(sheetView(), 'today detail is mounted').toBeNull()
}

describe('PJ detail drawn from the sheet (default for a valid stored sheet)', () => {
  it('draws the sheet without any URL flag and keeps the header', async () => {
    await open([ELDRIC], '/c/demo/pjs/1', withSheet(), true)
    expect(screen.getByText('Percepción pasiva')).toBeInTheDocument()
    expect(screen.queryByText('Perc. Pasiva')).toBeNull() // today label
  })

  it('draws the sheet sections under the same ids and keys as today, with a nav button per non-empty section', async () => {
    await open()
    for (const key of ['stats', 'habilidades', 'hechizos', 'ataques', 'rasgos', 'apariencia']) expect(document.getElementById(`pj-section-${key}`), key).not.toBeNull()
    const nav = screen.getAllByRole('button').map((b) => b.textContent)
    expect(nav).toEqual(expect.arrayContaining(['Salvaciones y habilidades', 'Ataques', 'Hechizos']))
    expect(nav).not.toContain('Recursos') // no resources: the section is empty and hidden
    expect(document.getElementById('pj-section-recursos')).toBeNull()
  })

  it('draws every ability as a vertical tile: label, signed modifier, value', async () => {
    await open()
    const stats = section('stats')
    const fue = stats.getByText('FUE').parentElement as HTMLElement
    expect(fue).toHaveTextContent('+3')
    expect(fue).toHaveTextContent('16')
    expect((stats.getByText('DES').parentElement as HTMLElement)).toHaveTextContent('+0')
    expect((stats.getByText('INT').parentElement as HTMLElement)).toHaveTextContent('-1')
  })

  it('draws the combat fields as tiles and the passive perception from the formula', async () => {
    await open()
    const stats = section('stats')
    expect(stats.getByText('AC').parentElement).toHaveTextContent('18')
    expect(stats.getByText('Velocidad (ft)').parentElement).toHaveTextContent('30')
    expect(stats.getByText('Iniciativa').parentElement).toHaveTextContent('+2')
    expect(stats.getByText('Bono de competencia').parentElement).toHaveTextContent('+3')
    expect(stats.getByText('Percepción pasiva').parentElement).toHaveTextContent('17') // 10 + 1 + 3 + 3
  })

  it('draws one tile per ability headed by its modifier, with the save and the skills as rows', async () => {
    await open()
    const skills = section('habilidades')
    const fue = skills.getByTestId('capacidades-stat_str')
    expect(within(fue).getByText('FUE')).toBeInTheDocument()
    expect(fue).toHaveTextContent('+3')
    expect(within(fue).getByText('Salvación').parentElement).toHaveTextContent('+6') // 3 + proficiency 3
    expect(within(fue).getByText('Atletismo').parentElement).toHaveTextContent('+6') // 3 + proficiency 3
    const sab = skills.getByTestId('capacidades-stat_wis')
    expect(within(sab).getByText('Percepción').parentElement).toHaveTextContent('+7') // 1 + 3 + 3 (expertise)
    expect(within(sab).getByText('Salvación').parentElement).toHaveTextContent('+1') // not proficient
  })

  it('draws the free tables with their columns and rows', async () => {
    await open()
    const attacks = section('ataques')
    const header = attacks.getAllByRole('columnheader').map((h) => h.textContent)
    expect(header).toEqual(expect.arrayContaining(['Arma', 'Daño', 'Tipo']))
    const row = attacks.getByText('Espada larga').closest('tr') as HTMLElement
    expect(row).toHaveTextContent('1d8+3')
    expect(row).toHaveTextContent('Cortante')
    expect(attacks.getByText('Daga')).toBeInTheDocument()
  })

  it('does not repeat the section title as the label of its only table', async () => {
    await open()
    expect(section('ataques').getAllByText('Ataques')).toHaveLength(1)
    expect(section('equipo').getAllByText('Equipo')).toHaveLength(1)
  })

  it('still labels a table whose name differs from the section title', async () => {
    await open()
    expect(section('habilidades').queryByText('Habilidades')).toBeNull() // the section is 'Salvaciones y habilidades' and has no table label to repeat
    expect(section('hechizos').getAllByText('Hechizos')).toHaveLength(1)
  })

  it('draws the coins by denomination, carried and stored, with the base unit total', async () => {
    await open([pj(1, { ...ELDRIC, equipo: [{ id: 1, nombre: 'Cuerda', cantidad: 2, portando: true }] })])
    const equipo = section('equipo')
    const carried = equipo.getByText('En mano').parentElement as HTMLElement
    expect(carried).toHaveTextContent('Platino')
    expect(carried).toHaveTextContent('2')
    expect(carried).toHaveTextContent('Oro')
    expect(carried).toHaveTextContent('120')
    const stored = equipo.getByText('Guardadas').parentElement as HTMLElement
    expect(stored).toHaveTextContent('Plata')
    expect(stored).toHaveTextContent('30')
    expect(stored).not.toHaveTextContent('Oro')
  })

  it('draws the appearance fields as horizontal tiles and the long texts as blocks', async () => {
    await open()
    const looks = section('apariencia')
    expect(looks.getByText('Edad').parentElement).toHaveTextContent('30')
    expect(looks.getByText('Calmo y paciente')).toBeInTheDocument()
    expect(looks.queryByText('Peso')).toBeNull() // empty fields are not drawn
  })

  it('lists the spells by category and opens one in a dialog with its fields', async () => {
    await open()
    const spells = section('hechizos')
    expect(spells.getByText('Trucos')).toBeInTheDocument()
    expect(spells.getByText('Nivel 1')).toBeInTheDocument()
    fireEvent.click(spells.getByRole('button', { name: 'Bendecir' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Bendecir')).toBeInTheDocument()
    expect(within(dialog).getByText('Bendice a tus aliados.')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the unread dot of a section by the same key as today', async () => {
    const stamped = pj(1, { ...ELDRIC, sections_updated: { ataques: '2099-01-01T00:00:00.000Z' } })
    await open([stamped])
    const nav = screen.getAllByRole('button').find((b) => b.textContent === 'Ataques') as HTMLElement
    expect(nav.querySelector('.unread-dot')).not.toBeNull()
  })

  it.each(['stats', 'habilidades', 'ataques', 'hechizos', 'recursos', 'equipo', 'rasgos', 'narrativa', 'apariencia'])(
    'the D&D preset section %s shows its unread dot when that stamp is newer, and only it (S13)',
    async (key) => {
      const full = pj(1, {
        ...ELDRIC,
        recursos: [{ id: 1, nombre: 'Furia', actual: 1, maximo: 2, recuperacion: 'largo' }],
        trasfondo: 'Un soldado retirado.',
        equipo: [{ id: 1, nombre: 'Soga', cantidad: 1 }],
        sections_updated: { [key]: '2099-01-01T00:00:00.000Z' },
      })
      await open([full])
      const navDots = screen.getAllByRole('button').filter((b) => b.querySelector('.unread-dot'))
      expect(navDots).toHaveLength(1)
      expect(document.querySelectorAll('[data-sheet-view] .unread-dot')).toHaveLength(1)
      expect(titleOf(key).querySelector('.unread-dot')).not.toBeNull()
    },
  )

  it('a section of a custom sheet gets its dot by its own key', async () => {
    const custom = {
      categories: [{ key: 'g', label: 'G', sections: [
        { key: 'bestiario', label: 'Bestiario', items: [{ kind: 'field', key: 'nota', label: 'Nota', type: 'short', editableBy: 'dm' }], blocks: [{ key: 'b', mode: 'tile', items: ['nota'] }] },
        { key: 'otra', label: 'Otra', items: [{ kind: 'field', key: 'x', label: 'X', type: 'short', editableBy: 'dm' }], blocks: [{ key: 'c', mode: 'tile', items: ['x'] }] },
      ] }],
      roles: {},
    }
    const stamped = pj(1, { nombre: 'Eldric', nota: 'Dragon', x: 'y', sections_updated: { bestiario: '2099-01-01T00:00:00.000Z' } })
    await open([stamped], SHEET_URL, withSheet(custom))
    expect(titleOf('bestiario').querySelector('.unread-dot')).not.toBeNull()
    expect(titleOf('otra').querySelector('.unread-dot')).toBeNull()
  })

  it.each([
    ['a campaign with no sheet', { system_profile: dnd5eProfile() as unknown as Record<string, unknown> }],
    ['a sheet that does not validate', withSheet({ categories: 'nope' })],
  ])('falls back to today detail for %s', async (_label, campaign) => {
    await open([ELDRIC], SHEET_URL, campaign, false)
    expect(screen.getByText('Perc. Pasiva')).toBeInTheDocument()
  })
})
