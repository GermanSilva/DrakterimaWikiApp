import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { retryPolicy } from './useSessionLayout'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'
import { DND5E_SHEET } from '../system/sheet/dnd5eSheet'
import { dnd5eProfile } from '../system/systemProfile'

configure({ asyncUtilTimeout: 5000 })

const DEFAULT_DELAYS = retryPolicy.delays
beforeEach(() => { retryPolicy.delays = [5, 5, 5] })
afterEach(() => { retryPolicy.delays = DEFAULT_DELAYS })

const PATH = '/c/demo/sesion-en-vivo'
const field = (key: string, label: string, extra: Record<string, unknown> = {}) => ({ kind: 'field', key, label, type: 'number', editableBy: 'dm', ...extra })
const sheetOf = (items: unknown[], roles: Record<string, string>) => ({
  categories: [{ key: 'general', label: 'General', sections: [{ key: 'perfil', label: 'Perfil', items, blocks: [] }] }],
  roles,
})
const campaign = (sheet: unknown) => ({ system_profile: { ...dnd5eProfile(), ...(sheet === undefined ? {} : { sheet }) } as unknown as Record<string, unknown> })
const pj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `PJ ${id}`, jugador: '', clase: 'Guerrero', raza: '', region: 'otro', nivel: 1, sections_updated: {}, ...over })

const ELDRIC = pj(1, {
  nombre: 'Eldric', stat_hp: 40, stat_hp_current: 31, stat_hp_temp: 5, stat_ac: 18, stat_ac_temp: 2, stat_speed: 30,
  stat_str: 16, stat_dex: 10, stat_con: 14, stat_int: 8, stat_wis: 12, stat_cha: 15,
  recursos: [{ id: 1, nombre: 'Furia', actual: 0, maximo: 2, recuperacion: 'largo' }],
})
const MAISIE = pj(2, { nombre: 'Maisie', stat_hp: 20 })
// the same character under other keys, with the fixed ones holding values that must never show
const OTHER = pj(1, {
  nombre: 'Eldric', vida: 30, vida_ahora: 12, guardia: 15, stat_hp: 99, stat_hp_current: 98, stat_ac: 97, stat_speed: 96, stat_hp_temp: 4,
  recursos: [{ id: 1, nombre: 'Furia', actual: 0, maximo: 2, recuperacion: 'largo' }],
})
const CUSTOM = sheetOf([field('vida', 'Vida'), field('vida_ahora', 'Vida actual'), field('guardia', 'Guardia')], { hp: 'vida', hp_current: 'vida_ahora', ac: 'guardia' })
const NO_CURRENT = sheetOf([field('vida', 'Vida'), field('guardia', 'Guardia')], { hp: 'vida', ac: 'guardia' })

async function open(sheet: unknown, pjs: ReturnType<typeof pj>[], cards: unknown[]) {
  const fake = createFakeLayer({ entities: { pjs, homebrew_rules: [] }, config: { session_screen: { value: { cards }, updated_at: 'v1' } } })
  renderSection(PATH, { layer: fake.layer, campaign: campaign(sheet) })
  await screen.findByRole('button', { name: '+ Agregar pestaña' })
  return fake
}
const expandAll = async (name: RegExp) => fireEvent.click(await screen.findByRole('button', { name }))
const cardHtml = (id: number) => (document.querySelector(`[data-card-id="${id}"]`) as HTMLElement).innerHTML
const cardOf = (id: number) => within(document.querySelector(`[data-card-id="${id}"]`) as HTMLElement)
const lastWrite = (spies: ReturnType<typeof createFakeLayer>['spies']) => spies.saveEntityWithDmNotes.mock.calls.at(-1)?.[2] as Record<string, unknown>
const miniStats = () => Array.from(document.querySelectorAll('.min-w-\\[48px\\]')).map((e) => e.textContent ?? '').filter((t) => !/^(Bono Prof|Perc\. Pasiva)/.test(t))
type Combatants = { cards: { combatants: Record<string, unknown>[] }[] }

describe('session screen: character cards read the sheet roles (G5c, S22)', () => {
  it.each([
    ['stats', { id: 11, tipo: 'stats' }],
    ['resources', { id: 12, tipo: 'resources' }],
    ['combat', { id: 13, tipo: 'combat', combatants: [] }],
  ])('D&D preset: the %s card is byte-identical to the card without a sheet', async (_n, card) => {
    const html: string[] = []
    for (const sheet of [undefined, DND5E_SHEET]) {
      document.body.innerHTML = ''
      await open(sheet, [ELDRIC, MAISIE], [card])
      if (card.tipo !== 'combat') await expandAll(/Eldric/)
      html.push(cardHtml(card.id))
    }
    expect(html[1]).toEqual(html[0])
    expect(html[0].length).toBeGreaterThan(200)
  })

  it('D&D preset: adding the characters to the combat gives the same combatants as today', async () => {
    const written: unknown[] = []
    for (const sheet of [undefined, DND5E_SHEET]) {
      document.body.innerHTML = ''
      const { spies } = await open(sheet, [ELDRIC, MAISIE], [{ id: 13, tipo: 'combat', combatants: [] }])
      fireEvent.change(cardOf(13).getByRole('combobox'), { target: { value: '__all__' } })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
      await waitFor(() => expect(spies.configPatch).toHaveBeenCalled())
      const { cards } = spies.configPatch.mock.calls.at(-1)?.[2] as Combatants
      written.push(cards[0].combatants.map((c) => ({ ...c, id: 0 })))
    }
    expect(written[1]).toEqual(written[0])
    expect(written[0]).toHaveLength(2)
  })

  it('stats: a bound role shows its value (current / max, temp, AC) and the fixed keys are ignored', async () => {
    await open(CUSTOM, [OTHER], [{ id: 11, tipo: 'stats' }])
    await expandAll(/Eldric/)
    expect(miniStats()).toEqual(['HP12 / 30 (+4)', 'CA15'])
    expect(cardHtml(11)).not.toContain('99')
  })

  it('stats: an unbound role hides its stat', async () => {
    await open(sheetOf([field('vida', 'Vida')], { hp: 'vida' }), [OTHER], [{ id: 11, tipo: 'stats' }])
    await expandAll(/Eldric/)
    expect(miniStats()).toEqual(['HP30 / 30 (+4)'])
  })

  it('a long rest writes the bound current-HP key with the bound max, never the fixed key', async () => {
    const { spies } = await open(CUSTOM, [OTHER], [{ id: 12, tipo: 'resources' }])
    await expandAll(/Eldric/)
    fireEvent.click(await screen.findByRole('button', { name: 'Descanso Largo' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { sections_updated: stamps, ...fields } = lastWrite(spies)
    void stamps
    expect(fields).toEqual({ recursos: [{ id: 1, nombre: 'Furia', actual: 2, maximo: 2, recuperacion: 'largo' }], spell_slots_current: {}, vida_ahora: 30 })
  })

  it('a long rest with the current-HP role unbound never writes a HP key', async () => {
    const { spies } = await open(NO_CURRENT, [OTHER], [{ id: 12, tipo: 'resources' }])
    await expandAll(/Eldric/)
    fireEvent.click(await screen.findByRole('button', { name: 'Descanso Largo' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    expect(Object.keys(lastWrite(spies)).filter((k) => /hp|vida/.test(k))).toEqual([])
  })

  it('combat: a character joins with the role values; unbound speed control is hidden', async () => {
    const { spies } = await open(CUSTOM, [OTHER], [{ id: 13, tipo: 'combat', combatants: [] }])
    fireEvent.change(cardOf(13).getByRole('combobox'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalled())
    const { cards } = spies.configPatch.mock.calls.at(-1)?.[2] as Combatants
    expect(cards[0].combatants[0]).toMatchObject({ hp_actual: 12, hp_max: 30, hp_temp: 4, ac: 15, ac_temp: 0, velocidad: 0 })
    expect(cardOf(13).getByText('HP Actual')).toBeInTheDocument()
    expect(cardOf(13).getByText('AC')).toBeInTheDocument()
    expect(cardOf(13).queryByText('Velocidad')).toBeNull()
    expect(cardOf(13).getByText('Iniciativa')).toBeInTheDocument()
  })

  it('combat: no HP role hides the HP controls and the HP sort', async () => {
    const orc = { id: 5, tipo: 'custom', bando: 'enemigo', nombre: 'Orco', iniciativa: 1, hp_actual: 5, hp_max: 5, hp_temp: 0, ac: 10, ac_temp: 0, velocidad: 30 }
    await open(sheetOf([field('guardia', 'Guardia')], { ac: 'guardia' }), [OTHER], [{ id: 13, tipo: 'combat', combatants: [orc] }])
    expect(cardOf(13).queryByText('HP Actual')).toBeNull()
    expect(cardOf(13).queryByText('HP Máximo')).toBeNull()
    expect(cardOf(13).queryByRole('button', { name: 'Ordenar por HP actual' })).toBeNull()
    expect(cardOf(13).getByText('AC')).toBeInTheDocument()
  })
})
