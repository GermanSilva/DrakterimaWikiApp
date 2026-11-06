import { configure, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'
import { DND5E_SHEET } from '../system/sheet/dnd5eSheet'
import { dnd5eProfile } from '../system/systemProfile'

configure({ asyncUtilTimeout: 5000 })

const field = (key: string, label: string, extra: Record<string, unknown> = {}) => ({ kind: 'field', key, label, type: 'number', editableBy: 'dm', ...extra })
const sheetOf = (items: unknown[], roles: Record<string, string>) => ({
  categories: [{ key: 'general', label: 'General', sections: [{ key: 'perfil', label: 'Perfil', items, blocks: [] }] }],
  roles,
})
const campaign = (sheet: unknown) => ({ system_profile: { ...dnd5eProfile(), ...(sheet === undefined ? {} : { sheet }) } as unknown as Record<string, unknown> })

const pj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `PJ ${id}`, jugador: '', clase: 'Guerrero', raza: '', region: 'magral', nivel: 1, imagen_url: '', sections_updated: {}, ...over })
const FULL = pj(1, {
  nombre: 'Eldric', stat_hp: 40, stat_hp_temp: 5, stat_ac: 18, stat_ac_temp: 2, stat_speed: 30, stat_initiative: 2,
  stat_str: 16, stat_dex: 10, stat_con: 14, stat_int: 8, stat_wis: 12, stat_cha: 15,
})
const SPARSE = pj(2, { nombre: 'Maisie', stat_hp: 20, stat_initiative: -1 })
const BARE = pj(3, { nombre: 'Kaylinx' })
const PJS = [FULL, SPARSE, BARE]

const cards = () => within(screen.getByRole('main')).queryAllByRole('link').filter((a) => /\/pjs\/\d+(\?.*)?$/.test(a.getAttribute('href') ?? ''))
const render = async (sheet: unknown, pjs = PJS, isDM = true) => {
  const { layer } = createFakeLayer({ entities: { pjs } })
  renderSection('/c/demo/pjs', { layer, isDM, campaign: campaign(sheet) })
  await waitFor(() => expect(cards()).toHaveLength(pjs.length))
  return cards()
}
const badges = (card: HTMLElement) => Array.from(card.querySelectorAll('.border-t .flex-col')).map((b) => b.textContent)

// vida/guardia/rapidez under other keys, so reading the fixed ones would show the wrong numbers
const CUSTOM = sheetOf(
  [field('vida', 'Vida'), field('guardia', 'Guardia'), field('rapidez', 'Rapidez'), field('iniciativa', 'Iniciativa')],
  { hp: 'vida', ac: 'guardia', speed: 'rapidez', initiative: 'iniciativa' },
)
const OTHER = (over: Record<string, unknown> = {}) => pj(1, { nombre: 'Eldric', vida: 30, guardia: 15, rapidez: 25, iniciativa: 3, stat_hp: 99, stat_ac: 99, stat_speed: 99, stat_initiative: 9, ...over })

describe('PJ list card badges read the sheet roles (G5c, S5)', () => {
  it.each([true, false])('D&D preset: every card is byte-identical to the card without a sheet (isDM %s)', async (isDM) => {
    const legacy = (await render(undefined, PJS, isDM)).map((c) => c.innerHTML)
    document.body.innerHTML = ''
    const preset = (await render(DND5E_SHEET, PJS, isDM)).map((c) => c.innerHTML)
    expect(preset).toEqual(legacy)
    expect(legacy[0]).toContain('HP')
  })

  it('shows today badges for the fixed keys when there is no sheet', async () => {
    const [first] = await render(undefined)
    expect(badges(first as HTMLElement).slice(0, 5)).toEqual(['HP40', 'HP Temp.5', 'AC18', 'AC Temp.2', 'Vel.30ft'])
  })

  it('a bound role shows its badge with the role value, not the fixed key', async () => {
    const [card] = await render(CUSTOM, [OTHER()])
    expect(badges(card as HTMLElement)).toEqual(['HP30', 'AC15', 'Vel.25ft', 'Init.+3'])
    expect(card.textContent).not.toContain('99')
  })

  it('an unbound role hides its badge even when the character stores the fixed key', async () => {
    const sheet = sheetOf([field('vida', 'Vida'), field('guardia', 'Guardia')], { hp: 'vida', ac: 'guardia' })
    const [card] = await render(sheet, [OTHER()])
    expect(badges(card as HTMLElement)).toEqual(['HP30', 'AC15'])
  })

  it('temporary HP / AC show only when their base role is bound', async () => {
    const sheet = sheetOf([field('vida', 'Vida')], { hp: 'vida' })
    const [card] = await render(sheet, [OTHER({ stat_hp_temp: 4, stat_ac_temp: 3 })])
    expect(badges(card as HTMLElement)).toEqual(['HP30', 'HP Temp.4'])
  })

  it('a computed role shows its computed value', async () => {
    const sheet = sheetOf([field('base', 'Base'), field('guardia', 'Guardia', { formula: '{base} + 10' })], { ac: 'guardia' })
    const [card] = await render(sheet, [pj(1, { nombre: 'Eldric', base: 5 })])
    expect(badges(card as HTMLElement)).toEqual(['AC15'])
  })

  it('a sheet with no roles draws no badge block and no ability row of fixed keys', async () => {
    const [card] = await render(sheetOf([field('x', 'X')], {}), [OTHER()])
    expect(card.querySelector('.border-t')).toBeNull()
  })
})
