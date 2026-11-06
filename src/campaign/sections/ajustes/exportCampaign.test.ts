import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCampaign } from '../../../app/testing/renderApp'
import { createFakeLayer } from '../../testing/fakeLayer'
import { buildCampaignExport, downloadJson, exportFilename } from './exportCampaign'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('exportFilename', () => {
  it('is <slug>-YYYY-MM-DD.json with zero-padded local date parts', () => {
    expect(exportFilename('leyendas', new Date(2026, 0, 5, 10, 30))).toBe('leyendas-2026-01-05.json')
    expect(exportFilename('demo', new Date(2026, 11, 31, 23, 59))).toBe('demo-2026-12-31.json')
  })
})

describe('downloadJson', () => {
  it('hands a pretty-printed JSON blob to the browser as a named download and releases the URL afterwards', async () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:fake')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('demo-2026-10-09.json')
      expect(this.href).toBe('blob:fake')
    })

    downloadJson('demo-2026-10-09.json', { a: 1 })

    expect(click).toHaveBeenCalledTimes(1)
    const blob = (create.mock.calls[0] as unknown as [Blob])[0]
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe('{\n  "a": 1\n}')
    expect(document.querySelector('a[download]')).toBeNull() // the temporary link is removed
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledWith('blob:fake')
  })
})

describe('buildCampaignExport', () => {
  it('carries the system document of the campaign, so a backup keeps the system definition', async () => {
    const { layer } = createFakeLayer()
    const profile = { version: 1, currency: { enabled: false } }
    const campaign = makeCampaign({ system: 'mi-sistema', system_profile: profile })
    const out = await buildCampaignExport(layer, campaign)
    expect(out.campaign.system).toBe('mi-sistema')
    expect(out.campaign.system_profile).toEqual(profile)
  })
})

describe('buildCampaignExport: action collection (G6b)', () => {
  const action = { id: 5, campaign_id: 'c1', table_key: 'hechizos', category: 'trucos', name: 'Rayo', description: '', extras: {}, private_to_pj: null, function: null, created_by: null, created_at: '', updated_at: '' }
  const link = { pj_id: 1, action_id: 5, campaign_id: 'c1', state: { prep: true }, created_at: '', updated_at: '' }

  it('includes the entries and the links as a new part, and keeps every earlier key', async () => {
    const { layer } = createFakeLayer({ actions: [action], actionLinks: [link] })
    const out = await buildCampaignExport(layer, makeCampaign({ id: 'c1' }))
    expect(out.actions).toEqual({ entries: [action], links: [link] })
    expect(Object.keys(out).sort()).toEqual(
      ['actions', 'campaign', 'config', 'dmNotes', 'entities', 'exportedAt', 'format', 'games', 'playerNotes', 'version', 'visibility'],
    )
    expect(out.version).toBe(1) // additive part: readers that ignore unknown keys keep working
  })

  it('exports an empty part for a campaign without actions', async () => {
    const { layer } = createFakeLayer()
    const out = await buildCampaignExport(layer, makeCampaign({ id: 'c1' }))
    expect(out.actions).toEqual({ entries: [], links: [] })
  })

  it('aborts naming the part when the collection cannot be read', async () => {
    const { layer, spies } = createFakeLayer()
    spies.actionLinksList.mockRejectedValueOnce(new Error('boom'))
    await expect(buildCampaignExport(layer, makeCampaign({ id: 'c1' }))).rejects.toMatchObject({ name: 'ExportError', part: 'acciones (vínculos)' })
  })
})
