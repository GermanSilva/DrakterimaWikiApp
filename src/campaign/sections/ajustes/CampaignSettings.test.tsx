import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, DataError } from '../../../data'
import { makeCampaign } from '../../../app/testing/renderApp'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })
afterEach(() => vi.restoreAllMocks())

const STORED = {
  name: 'Drakterima',
  branding: { logo_url: 'https://x.test/old.png', accent_color: '#dc2626', tagline: 'Old tagline', future_key: 'keep' },
}

function setup({ isDM = true, campaign = STORED }: { isDM?: boolean; campaign?: Partial<typeof STORED> } = {}) {
  const made = createFakeLayer({ campaign: { ...STORED, ...campaign } as never })
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, isDM, campaign: { ...STORED, ...campaign } as never })
  return { ...made, ...view }
}
const section = () => screen.findByRole('region', { name: 'Campaña' })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const field = async (label: string) => within(await section()).getByLabelText(label)

describe('Ajustes: campaign section', () => {
  it('is not shown to a player', async () => {
    const { spies } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Campaña' })).not.toBeInTheDocument()
    expect(spies.updateCampaign).not.toHaveBeenCalled()
  })

  it('shows the stored values and a read-only slug', async () => {
    setup()
    expect(await field('Nombre')).toHaveValue('Drakterima')
    expect(await field('Lema (opcional)')).toHaveValue('Old tagline')
    expect(await field('Logo (URL https, opcional)')).toHaveValue('https://x.test/old.png')
    expect(await field('Color de acento (opcional)')).toHaveValue('#dc2626')
    const slug = await field('Identificador (slug)')
    expect(slug).toHaveValue('demo')
    expect(slug).toHaveAttribute('readonly')
  })

  it('previews the typed name, tagline and accent, ignoring an invalid colour', async () => {
    setup()
    const preview = within(await section()).getByRole('group', { name: 'Vista previa' })
    type(await field('Nombre'), 'Nueva')
    type(await field('Lema (opcional)'), 'Un lema')
    type(await field('Color de acento (opcional)'), '#00ff00')
    expect(within(preview).getByText('Nueva')).toBeInTheDocument()
    expect(within(preview).getByText('Un lema')).toBeInTheDocument()
    expect(preview.style.getPropertyValue('--accent')).toBe('#00ff00')
    type(await field('Color de acento (opcional)'), 'red')
    expect(preview.style.getPropertyValue('--accent')).toBe('')
  })

  it('saves trimmed values, keeps unknown branding keys, and reloads the header', async () => {
    const { spies, data } = setup()
    type(await field('Nombre'), '  Leyendas  ')
    type(await field('Lema (opcional)'), '')
    type(await field('Color de acento (opcional)'), '#0EA5E9')
    // the loader returns the saved campaign on reload
    const saved = makeCampaign({ name: 'Leyendas', branding: { ...STORED.branding, accent_color: '#0ea5e9' }, updated_at: 'u1' })
    vi.mocked(data.listMyCampaigns).mockResolvedValue([saved])
    fireEvent.click(within(await section()).getByRole('button', { name: 'Guardar campaña' }))

    expect(await within(await section()).findByText('Campaña guardada.')).toBeInTheDocument()
    expect(spies.updateCampaign).toHaveBeenCalledWith(
      'c1',
      { name: 'Leyendas', branding: { logo_url: 'https://x.test/old.png', accent_color: '#0ea5e9', tagline: null } },
      '2026-01-01T00:00:00Z',
    )
    // header refreshed without a page reload
    await waitFor(() => expect(screen.getByRole('link', { name: 'Leyendas: panel' })).toBeInTheDocument())
    expect(data.listMyCampaigns).toHaveBeenCalledTimes(2)
  })

  it('shows Spanish field errors with aria wiring and does not write', async () => {
    const { spies } = setup()
    type(await field('Nombre'), '   ')
    type(await field('Logo (URL https, opcional)'), 'javascript:alert(1)')
    type(await field('Color de acento (opcional)'), 'red')
    type(await field('Lema (opcional)'), 'x'.repeat(141))
    fireEvent.click(within(await section()).getByRole('button', { name: 'Guardar campaña' }))

    const name = await field('Nombre')
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(name).toHaveAccessibleDescription('El nombre es obligatorio.')
    expect(await field('Logo (URL https, opcional)')).toHaveAccessibleDescription(expect.stringContaining('URL https válida'))
    expect(await field('Color de acento (opcional)')).toHaveAccessibleDescription(expect.stringContaining('#rrggbb'))
    expect(await field('Lema (opcional)')).toHaveAccessibleDescription(expect.stringContaining('140'))
    expect(spies.updateCampaign).not.toHaveBeenCalled()
  })

  it('on a conflict re-reads the campaign, shows the new values and never overwrites', async () => {
    const { spies, data } = setup()
    await section()
    const theirs = makeCampaign({ name: 'Renamed by another DM', branding: STORED.branding, updated_at: 'u9' })
    // someone else saved first: our base (the loaded version) is stale
    spies.updateCampaign.mockRejectedValueOnce(new ConflictError())
    vi.mocked(data.listMyCampaigns).mockResolvedValue([theirs])
    type(await field('Nombre'), 'Mine')
    fireEvent.click(within(await section()).getByRole('button', { name: 'Guardar campaña' }))

    expect(await within(await section()).findByText(/cambió mientras la editabas/)).toBeInTheDocument()
    await waitFor(async () => expect(await field('Nombre')).toHaveValue('Renamed by another DM'))
    expect(spies.updateCampaign).toHaveBeenCalledTimes(1)
  })

  it('shows a generic message for other failures and keeps the typed values', async () => {
    const { spies } = setup()
    spies.updateCampaign.mockRejectedValueOnce(new DataError('permission', 'nope'))
    type(await field('Nombre'), 'Mine')
    fireEvent.click(within(await section()).getByRole('button', { name: 'Guardar campaña' }))
    expect(await within(await section()).findByText('No tenés permiso para hacer esto.')).toBeInTheDocument()
    expect(await field('Nombre')).toHaveValue('Mine')
  })

  it('a second save uses the version returned by the first one', async () => {
    const { spies, data } = setup()
    await section()
    vi.mocked(data.listMyCampaigns).mockResolvedValue([makeCampaign({ name: 'One', branding: STORED.branding, updated_at: 'u1' })])
    type(await field('Nombre'), 'One')
    fireEvent.click(within(await section()).getByRole('button', { name: 'Guardar campaña' }))
    await within(await section()).findByText('Campaña guardada.')
    type(await field('Nombre'), 'Two')
    fireEvent.click(within(await section()).getByRole('button', { name: 'Guardar campaña' }))
    await waitFor(() => expect(spies.updateCampaign).toHaveBeenCalledTimes(2))
    expect(spies.updateCampaign.mock.calls[1][2]).toBe('u1')
  })
})
