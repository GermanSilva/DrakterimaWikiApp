import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, DataError } from '../../../../data'
import { makeCampaign } from '../../../../app/testing/renderApp'
import { createFakeLayer } from '../../../testing/fakeLayer'
import { renderSection } from '../../../testing/renderSection'
import { STORED_SHEET } from '../../../system/builder/builderFixture'
import { DND5E_PROFILE } from '../../../system/systemProfile'
import { pressBar, saveBar } from '../saveBarTestKit'

configure({ asyncUtilTimeout: 10000 })
afterEach(() => vi.restoreAllMocks())

const REGIONS = [{ key: 'norte', label: 'Norte' }, { key: 'otro', label: 'Otro' }]
const FIELDS = [{ key: 'lema', label: 'Lema', type: 'text' }]
const STORED = {
  name: 'Drakterima',
  regions: REGIONS,
  character_custom_fields: FIELDS,
  system_profile: { ...JSON.parse(JSON.stringify(DND5E_PROFILE)), sheet: STORED_SHEET },
  updated_at: '2026-01-01T00:00:00Z',
}

function setup(tab = 'campana') {
  const made = createFakeLayer({ campaign: STORED as never })
  const view = renderSection(`/c/demo/ajustes?tab=${tab}`, { layer: made.layer, regions: REGIONS, customFields: FIELDS, campaign: STORED as never })
  return { ...made, ...view }
}

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
/** The short status the bar announces once a tab is saved (the always-present live region also exists empty, hence the text). */
const saved = async (what: string) => expect(await screen.findByText(`Cambios de ${what} guardados.`)).toHaveAttribute('role', 'status')
/** The fake loader never returns newer data, so a reload would bring back the stale campaign: keep the saved row as the freshest, as the shared-version test does. */
const freezeReload = async (data: ReturnType<typeof setup>['data']) => {
  await screen.findByRole('tablist', { name: 'Secciones de ajustes' })
  vi.mocked(data.listMyCampaigns).mockImplementation(() => new Promise(() => undefined))
}
const openTab = (name: RegExp | string) => fireEvent.click(screen.getByRole('tab', { name }))
const campaignName = () => screen.findByLabelText('Nombre', { selector: '#campaign-name' }) as Promise<HTMLInputElement>
const regionRow = async (name: string) => within(await screen.findByRole('listitem', { name }))
const renameRegion = async (from: string, to: string) => type((await regionRow(from)).getByLabelText('Nombre'), to)
const claseLabel = async () => within(await screen.findByRole('group', { name: 'Clase' })).getByLabelText('Título') as HTMLInputElement
const razaLabel = async () => within(await screen.findByRole('group', { name: 'Raza' })).getByLabelText('Título') as HTMLInputElement
const addAltura = async () => {
  fireEvent.click(within(await screen.findByRole('group', { name: 'Sección Extra' })).getByRole('button', { name: 'Agregar campo' }))
  type(within(screen.getByRole('group', { name: 'Ítem Nuevo campo' })).getByLabelText('Nombre del ítem'), 'Altura')
}
type Sent = { sheet: { categories: { sections: { items: { key: string }[] }[] }[] }; character: { builtins: { clase: { label: string }; raza: { label: string } } } }
const sentOf = (spies: ReturnType<typeof setup>['spies'], call: number) => spies.setSystemProfile.mock.calls[call][1] as unknown as Sent
const itemKeys = (sent: Sent) => sent.sheet.categories.flatMap((c) => c.sections.flatMap((s) => s.items.map((i) => i.key)))

describe('Ajustes: one save per tab', () => {
  it('saves every modified block of the tab with one click, each against the version the previous one returned', async () => {
    const { spies } = setup()
    type(await campaignName(), 'Leyendas')
    await renameRegion('Norte', 'Norte 2')
    const bar = await saveBar()
    expect(within(bar).getByText('Campaña')).toBeInTheDocument()
    expect(bar).toHaveTextContent('2 cambios sin guardar')

    // the blocks keep no buttons of their own: the bar has the only "Guardar campaña"
    expect(screen.getAllByRole('button', { name: 'Guardar campaña' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Guardar regiones' })).toBeNull()

    await pressBar('Guardar campaña')
    await saved('Campaña')
    expect(spies.updateCampaign).toHaveBeenCalledTimes(2)
    expect((spies.updateCampaign.mock.calls[0][1] as { name: string }).name).toBe('Leyendas')
    expect((spies.updateCampaign.mock.calls[1][1] as { regions: { label: string }[] }).regions[0].label).toBe('Norte 2')
    expect(spies.updateCampaign.mock.calls.map((c) => c[2])).toEqual(['2026-01-01T00:00:00Z', 'u1'])
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Guardar cambios' })).toBeNull()) // nothing left to save: the bar leaves
  })

  it('writes only the blocks that changed', async () => {
    const { spies } = setup()
    await renameRegion('Norte', 'Norte 2')
    await pressBar('Guardar campaña')
    await waitFor(() => expect(spies.updateCampaign).toHaveBeenCalledTimes(1))
    expect(Object.keys(spies.updateCampaign.mock.calls[0][1])).toEqual(['regions'])
  })

  it('says which block failed and keeps the others saved; a retry writes only the one that failed', async () => {
    const { spies, data } = setup()
    const real = spies.updateCampaign.getMockImplementation() as (...args: unknown[]) => Promise<unknown>
    let calls = 0
    spies.updateCampaign.mockImplementation((async (...args: unknown[]) => {
      calls += 1
      if (calls === 2) throw new DataError('permission', 'nope')
      const row = await real(...args)
      // the reload that follows the identity save brings the campaign as saved
      if (calls === 1) vi.mocked(data.listMyCampaigns).mockResolvedValue([makeCampaign({ ...STORED, name: 'Leyendas', updated_at: 'u1' } as never)])
      return row
    }) as never)
    type(await campaignName(), 'Leyendas')
    await renameRegion('Norte', 'Norte 2')
    await pressBar('Guardar campaña')

    const failed = within(await screen.findByRole('list', { name: 'No se guardó' }))
    expect(failed.getByText('No se guardó Regiones:')).toBeInTheDocument()
    expect(failed.getByText('No tenés permiso para hacer esto.')).toBeInTheDocument()
    expect(screen.queryByText('Cambios de Campaña guardados.')).toBeNull()
    // the identity was saved and keeps showing what was typed; the regions are still pending
    expect((await campaignName()).value).toBe('Leyendas')
    expect(within(await saveBar()).getByText(/1 cambio sin guardar/)).toBeInTheDocument()

    await pressBar('Guardar campaña')
    await saved('Campaña')
    expect(spies.updateCampaign).toHaveBeenCalledTimes(3)
    expect(Object.keys(spies.updateCampaign.mock.calls[2][1])).toEqual(['regions'])
    expect(spies.updateCampaign.mock.calls[2][2]).toBe('u1') // the version the identity save returned
    expect(screen.queryByRole('list', { name: 'No se guardó' })).toBeNull()
  })

  it('a block with invalid fields keeps its draft and its field errors while the others are saved', async () => {
    const { spies } = setup()
    type(await campaignName(), '   ')
    await renameRegion('Norte', 'Norte 2')
    await pressBar('Guardar campaña')

    const failed = within(await screen.findByRole('list', { name: 'No se guardó' }))
    expect(failed.getByText('No se guardó Identidad y marca:')).toBeInTheDocument()
    expect(failed.getByText('Revisá los campos marcados.')).toBeInTheDocument()
    expect(spies.updateCampaign).toHaveBeenCalledTimes(1) // only the regions were written
    expect(Object.keys(spies.updateCampaign.mock.calls[0][1])).toEqual(['regions'])
    // the saved regions changed the campaign row, not what the identity form shows: the typed draft is still there
    const name = await campaignName()
    expect(name.value).toBe('   ')
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(within(await saveBar()).getByText(/1 cambio sin guardar/)).toBeInTheDocument()
  })

  it('keeps the conflict message and the draft when the document changed under the DM', async () => {
    const { spies } = setup('ficha')
    spies.setSystemProfile.mockRejectedValueOnce(new ConflictError())
    await addAltura()
    await pressBar('Guardar plantilla')
    const failed = within(await screen.findByRole('list', { name: 'No se guardó' }))
    expect(failed.getByText('No se guardó Plantilla de ficha:')).toBeInTheDocument()
    expect(failed.getByText(/La campaña cambió mientras la editabas/)).toBeInTheDocument()
    expect(spies.setSystemProfile).toHaveBeenCalledTimes(1)
  })

  it('discards the drafts of the tab, writes nothing and hides the bar', async () => {
    const { spies } = setup()
    type(await campaignName(), 'Leyendas')
    await renameRegion('Norte', 'Norte 2')
    await pressBar('Descartar')
    expect((await campaignName()).value).toBe('Drakterima')
    expect((await regionRow('Norte')).getByLabelText('Nombre')).toHaveValue('Norte')
    expect(await screen.findByText('Cambios descartados.')).toHaveAttribute('role', 'status')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Guardar cambios' })).toBeNull())
    expect(spies.updateCampaign).not.toHaveBeenCalled()
  })

  it('discards the template draft of the Ficha tab', async () => {
    setup('ficha')
    await addAltura()
    expect(within(await saveBar()).getByText(/1 cambio sin guardar/)).toBeInTheDocument()
    await pressBar('Descartar')
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Ítem Altura' })).toBeNull())
    expect(within(await saveBar()).getByText('Sin cambios')).toBeInTheDocument()
  })
})

describe('Ajustes: unsaved changes of the other tabs', () => {
  it('marks the tab with a dot and lists the other tabs with changes as links that switch to them', async () => {
    setup()
    type(await campaignName(), 'Leyendas')
    openTab(/^Sistema/)
    type(await claseLabel(), 'Oficio')

    const campana = screen.getByRole('tab', { name: /^Campaña/ })
    expect(campana).toHaveAccessibleName('Campaña, cambios sin guardar')
    expect(screen.getByRole('tab', { name: /^Sistema/ })).toHaveAccessibleName('Sistema, cambios sin guardar')
    expect(screen.getByRole('tab', { name: 'Ficha' })).toBeInTheDocument() // clean tabs read as before

    const bar = within(await saveBar())
    expect(bar.getByText(/También sin guardar:/)).toBeInTheDocument()
    expect(bar.queryByRole('button', { name: 'Sistema' })).toBeNull() // not the active tab
    fireEvent.click(bar.getByRole('button', { name: 'Campaña' }))
    await waitFor(() => expect(campana).toHaveAttribute('aria-selected', 'true'))
    expect(within(await saveBar()).getByRole('button', { name: 'Sistema' })).toBeInTheDocument()
    expect((await campaignName()).value).toBe('Leyendas') // the draft survived the switch
  })

  it('has no bar on the tabs whose blocks act immediately', async () => {
    setup('jugadores')
    await screen.findByRole('region', { name: 'Jugadores' })
    expect(screen.queryByRole('region', { name: 'Guardar cambios' })).toBeNull()
  })

  it('asks before the page is left with unsaved changes, and not otherwise', async () => {
    setup()
    await campaignName()
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    type(await campaignName(), 'Leyendas')
    await saveBar()
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
  })
})

describe('Ajustes: the Ficha bar', () => {
  it('is always there, "Sin cambios" with nothing to save, and the builder has no save button of its own', async () => {
    setup('ficha')
    const bar = within(await saveBar())
    expect(bar.getByText('Sin cambios')).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Guardar plantilla' })).toBeDisabled()
    expect(within(await screen.findByRole('group', { name: 'Estado de la plantilla' })).queryByRole('button')).toBeNull()
  })

  it('blocks saving while the template has errors, with the reason, and flags the tab', async () => {
    const { spies } = setup('ficha')
    await addAltura()
    type(within(screen.getByRole('group', { name: 'Ítem Altura' })).getByLabelText('Nombre del ítem'), '  ')
    const bar = within(await saveBar())
    await waitFor(() => expect(bar.getByText(/impide guardar|impiden guardar/)).toBeInTheDocument())
    const save = bar.getByRole('button', { name: 'Guardar plantilla' })
    expect(save).toBeDisabled()
    expect(save).toHaveAccessibleDescription(/Corregí/)
    expect(save).toHaveAttribute('title', expect.stringMatching(/Corregí/))
    expect(screen.getByRole('tab', { name: /^Ficha/ })).toHaveAccessibleName('Ficha, cambios sin guardar, con errores')
    fireEvent.click(save)
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })
})

describe('Ajustes: one write of the system document per tab save', () => {
  it('a Sistema save does not drop the Ficha draft, and the Ficha save then keeps what Sistema wrote', async () => {
    const { spies, data } = setup('ficha')
    await freezeReload(data)
    await addAltura()
    openTab(/^Sistema/)
    type(await claseLabel(), 'Oficio')
    await pressBar('Guardar sistema')
    await saved('Sistema')
    expect(spies.setSystemProfile).toHaveBeenCalledTimes(1)
    expect(sentOf(spies, 0).character.builtins.clase.label).toBe('Oficio')
    expect(itemKeys(sentOf(spies, 0))).not.toContain('altura') // the unsaved template is not written by the Sistema save

    openTab(/^Ficha/)
    expect(screen.getByRole('group', { name: 'Ítem Altura' })).toBeInTheDocument() // still being edited
    expect(within(await saveBar()).getByText(/1 cambio sin guardar/)).toBeInTheDocument()
    await pressBar('Guardar plantilla')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(2))
    expect(itemKeys(sentOf(spies, 1))).toContain('altura')
    expect(sentOf(spies, 1).character.builtins.clase.label).toBe('Oficio') // rebased on the document as Sistema saved it
    expect(spies.setSystemProfile.mock.calls[1][2]).toBe('u1')
  })

  it('a Ficha save does not drop the Sistema draft, and the Sistema save then keeps the template Ficha wrote', async () => {
    const { spies, data } = setup('ficha')
    await freezeReload(data)
    await addAltura()
    openTab(/^Sistema/)
    type(await razaLabel(), 'Linaje')
    openTab(/^Ficha/)
    await pressBar('Guardar plantilla')
    await saved('Ficha')
    expect(spies.setSystemProfile).toHaveBeenCalledTimes(1)
    expect(itemKeys(sentOf(spies, 0))).toContain('altura')
    expect(sentOf(spies, 0).character.builtins.raza.label).not.toBe('Linaje') // the unsaved Sistema draft is not written by the Ficha save

    openTab(/^Sistema/)
    expect(await razaLabel()).toHaveValue('Linaje') // not rebuilt by the other tab's save
    expect(within(await saveBar()).getByText(/1 cambio sin guardar/)).toBeInTheDocument()
    await pressBar('Guardar sistema')
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(2))
    expect(sentOf(spies, 1).character.builtins.raza.label).toBe('Linaje')
    expect(itemKeys(sentOf(spies, 1))).toContain('altura') // the template saved meanwhile is not overwritten with the old one
    expect(spies.setSystemProfile.mock.calls[1][2]).toBe('u1')
  })
})
