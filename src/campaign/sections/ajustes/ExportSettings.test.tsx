import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCampaignExport, downloadJson } from './exportCampaign'
import { ExportSettings } from './ExportSettings'

// React 18 no longer warns about a state update after unmount, so count the setter calls instead
const setters = vi.hoisted(() => ({ calls: 0 }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [value, set] = actual.useState(initial)
      return [value, (next: unknown) => { setters.calls++; set(next as never) }]
    },
  }
})
vi.mock('../../CampaignContext', () => ({ useCampaign: () => ({ campaign: { slug: 'demo' } }) }))
vi.mock('../../entities/campaignServicesContext', () => ({ useCampaignServices: () => ({ layer: {} }) }))
vi.mock('./exportCampaign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./exportCampaign')>()),
  buildCampaignExport: vi.fn(),
  downloadJson: vi.fn(),
}))

afterEach(() => vi.restoreAllMocks())

/** Starts an export whose read stays pending until the returned `finish` / `fail` is called. */
function startPendingExport() {
  let finish: () => void = () => undefined
  let fail: (e: Error) => void = () => undefined
  vi.mocked(buildCampaignExport).mockReturnValue(new Promise((resolve, reject) => { finish = () => resolve({} as never); fail = reject }))
  const view = render(<ExportSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Exportar' }))
  return { ...view, finish, fail }
}

describe('ExportSettings', () => {
  it('reports the download when the export finishes while mounted', async () => {
    const { finish } = startPendingExport()
    expect(screen.getByRole('button', { name: /^Exportando/ })).toBeDisabled()
    await act(async () => finish())
    expect(screen.getByRole('status')).toHaveTextContent(/Se descargó demo-/)
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeEnabled()
  })

  it.each([
    ['succeeds', (p: ReturnType<typeof startPendingExport>) => p.finish()],
    ['fails', (p: ReturnType<typeof startPendingExport>) => p.fail(new Error('down'))],
  ])('leaving the page mid-export and the export then %s touches no state and raises nothing', async (_name, settle) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(downloadJson).mockClear()
    const pending = startPendingExport()
    pending.unmount()
    const before = setters.calls
    await act(async () => settle(pending))
    expect(setters.calls).toBe(before)
    expect(errors).not.toHaveBeenCalled()
  })
})
