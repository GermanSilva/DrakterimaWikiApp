import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { toDataError, type CampaignRequestWithRequester } from '../data'
import { deferred } from '../auth/testing/deferred'
import { makeCampaign, makeData, makeRequest, renderApp } from '../app/testing/renderApp'

const business = (message: string, code = 'P0001') => toDataError({ code, message })

const ownerData = (over: Parameters<typeof makeData>[0] = {}) => makeData({ isHubOwner: vi.fn(async () => true), ...over })

const inboxRow = (over: Partial<CampaignRequestWithRequester> = {}): CampaignRequestWithRequester => ({
  ...makeRequest({ id: 7, requester_id: 'u-9', name: 'La Corona Rota', slug_wanted: 'corona-rota', message: 'Campaña nueva de D&D' }),
  requester: { id: 'u-9', display_name: 'Beto', avatar_url: null },
  ...over,
})

async function fill(label: RegExp, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  })
}
async function click(name: RegExp | string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('hub home: ordinary user', () => {
  it('requests a campaign instead of creating one', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Solicitar campaña' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Crear campaña' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Solicitudes pendientes/ })).not.toBeInTheDocument()
  })

  it('does not load the owner inbox', async () => {
    const data = makeData()
    renderApp('/', { data })
    await screen.findByRole('heading', { name: 'Solicitar campaña' })
    expect(data.listAllCampaignRequests).not.toHaveBeenCalled()
  })

  it('falls back to the request form when the owner check fails (the database enforces anyway)', async () => {
    renderApp('/', { data: makeData({ isHubOwner: vi.fn().mockRejectedValue(new Error('boom')) }) })
    expect(await screen.findByRole('heading', { name: 'Solicitar campaña' })).toBeInTheDocument()
  })

  it('shows a neutral empty state that points to requesting', async () => {
    renderApp('/', { data: makeData({ listMyCampaigns: vi.fn(async () => []) }) })
    expect(await screen.findByText(/Solicitá una o unite con un código/)).toBeInTheDocument()
  })

  it('sends the normalised request, confirms it and reloads "Mis solicitudes"', async () => {
    const data = makeData()
    renderApp('/', { data })
    await screen.findByRole('heading', { name: 'Solicitar campaña' })
    await fill(/^Nombre$/, '  La Corona Rota ')
    expect(screen.getByLabelText(/Dirección preferida/)).toHaveValue('la-corona-rota')
    await fill(/Dirección preferida/, 'corona-rota')
    await fill(/Mensaje/, ' hola ')
    await click(/^Enviar solicitud$/)
    expect(data.createCampaignRequest).toHaveBeenCalledWith({ name: 'La Corona Rota', slug_wanted: 'corona-rota', message: 'hola' })
    expect(await screen.findByText(/Solicitud enviada/)).toBeInTheDocument()
    await waitFor(() => expect(data.listMyCampaignRequests).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText(/^Nombre$/)).toHaveValue('')
  })

  it('treats the address as optional but validates it when present; the name is required', async () => {
    const data = makeData()
    renderApp('/', { data })
    await screen.findByRole('heading', { name: 'Solicitar campaña' })
    await click(/^Enviar solicitud$/)
    expect(screen.getByText('Ingresá un nombre.')).toBeInTheDocument()
    await fill(/^Nombre$/, 'Demo')
    await fill(/Dirección preferida/, 'Bad Slug')
    await click(/^Enviar solicitud$/)
    expect(screen.getByText(/minúsculas, números y guiones/i, { selector: '[role=alert]' })).toBeInTheDocument()
    await fill(/Dirección preferida/, 'admin')
    await click(/^Enviar solicitud$/)
    expect(screen.getByText(/reservada/, { selector: '[role=alert]' })).toBeInTheDocument()
    expect(data.createCampaignRequest).not.toHaveBeenCalled()
    await fill(/Dirección preferida/, '')
    await click(/^Enviar solicitud$/)
    expect(data.createCampaignRequest).toHaveBeenCalledWith({ name: 'Demo', slug_wanted: null, message: null })
  })

  it.each([
    ['too_many_pending_requests', business('too_many_pending_requests'), /3 solicitudes pendientes/],
    ['reserved_slug', business('reserved_slug'), /reservada/],
    ['unexpected', new Error('boom'), /No pudimos enviar la solicitud/],
  ])('maps %s to a Spanish message and allows retrying', async (_name, error, message) => {
    const create = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(makeRequest())
    renderApp('/', { data: makeData({ createCampaignRequest: create }) })
    await screen.findByRole('heading', { name: 'Solicitar campaña' })
    await fill(/^Nombre$/, 'Demo')
    await click(/^Enviar solicitud$/)
    expect(await screen.findByText(message, { selector: '[role=alert]' })).toBeInTheDocument()
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Nombre$/)).toHaveValue('Demo')
    await click(/^Enviar solicitud$/)
    expect(await screen.findByText(/Solicitud enviada/)).toBeInTheDocument()
  })

  it('sends once on a double submit', async () => {
    const pending = deferred<ReturnType<typeof makeRequest>>()
    const create = vi.fn(() => pending.promise)
    renderApp('/', { data: makeData({ createCampaignRequest: create }) })
    await screen.findByRole('heading', { name: 'Solicitar campaña' })
    await fill(/^Nombre$/, 'Demo')
    const button = screen.getByRole('button', { name: /^Enviar solicitud$/ })
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    expect(create).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(makeRequest()))
  })
})

describe('Mis solicitudes', () => {
  it('shows each status: pending (cancellable), approved (link to the campaign), rejected (with the note)', async () => {
    const data = makeData({
      listMyCampaigns: vi.fn(async () => [makeCampaign({ id: 'cid', slug: 'corona', name: 'La Corona' })]),
      listMyCampaignRequests: vi.fn(async () => [
        makeRequest({ id: 1, name: 'Pendiente uno', status: 'pending' }),
        makeRequest({ id: 2, name: 'Aprobada uno', status: 'approved', campaign_id: 'cid' }),
        makeRequest({ id: 3, name: 'Rechazada uno', status: 'rejected', decision_note: 'Ahora no' }),
      ]),
    })
    renderApp('/', { data })
    const section = (await screen.findByRole('heading', { name: 'Mis solicitudes' })).closest('section') as HTMLElement
    expect(within(section).getByText('Pendiente')).toBeInTheDocument()
    expect(within(section).getByText('Aprobada')).toBeInTheDocument()
    expect(within(section).getByText('Rechazada')).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: /abrir La Corona/ })).toHaveAttribute('href', '/c/corona')
    expect(within(section).getByText(/Rechazada: Ahora no/)).toBeInTheDocument()
    expect(within(section).getAllByRole('button', { name: /Cancelar solicitud/ })).toHaveLength(1)
  })

  it('cancels a pending request and reloads; an error is explained', async () => {
    const list = vi.fn(async () => [makeRequest({ id: 5, name: 'Para cancelar' })])
    const cancel = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(true)
    renderApp('/', { data: makeData({ listMyCampaignRequests: list, cancelCampaignRequest: cancel }) })
    await screen.findByRole('heading', { name: 'Mis solicitudes' })
    await click(/Cancelar solicitud/)
    expect(await screen.findByText(/No pudimos cancelar la solicitud/, { selector: '[role=alert]' })).toBeInTheDocument()
    await click(/Cancelar solicitud/)
    expect(cancel).toHaveBeenCalledWith(5)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/No pudimos cancelar/)).not.toBeInTheDocument())
  })

  it('is hidden when there are no requests', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: 'Solicitar campaña' })
    expect(screen.queryByRole('heading', { name: 'Mis solicitudes' })).not.toBeInTheDocument()
  })
})

describe('hub home: hub owner', () => {
  it('keeps the direct create form and shows the inbox with a count badge (pending only)', async () => {
    const data = ownerData({
      listAllCampaignRequests: vi.fn(async () => [
        inboxRow(),
        inboxRow({ id: 8, name: 'Otra', status: 'pending', message: null, slug_wanted: null }),
        inboxRow({ id: 9, name: 'Ya aprobada', status: 'approved' }),
      ]),
    })
    renderApp('/', { data })
    expect(await screen.findByRole('heading', { name: 'Crear campaña' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Solicitar campaña' })).not.toBeInTheDocument()
    const inbox = (await screen.findByRole('heading', { name: /Solicitudes pendientes/ })).closest('section') as HTMLElement
    expect(within(inbox).getByLabelText('2 pendientes')).toBeInTheDocument()
    expect(within(inbox).getByText('La Corona Rota')).toBeInTheDocument()
    expect(within(inbox).getAllByText(/Beto/)).toHaveLength(2)
    expect(within(inbox).getByText('Campaña nueva de D&D')).toBeInTheDocument()
    expect(within(inbox).queryByText('Ya aprobada')).not.toBeInTheDocument()
  })

  it('approves with an editable address and name, then refreshes the inbox', async () => {
    const list = vi.fn().mockResolvedValueOnce([inboxRow()]).mockResolvedValue([])
    const data = ownerData({ listAllCampaignRequests: list, approveCampaignRequest: vi.fn(async () => 'corona-nueva') })
    renderApp('/', { data })
    await screen.findByText('La Corona Rota')
    await click(/^Aprobar$/)
    const dialog = await screen.findByRole('dialog', { name: 'Aprobar solicitud' })
    expect(within(dialog).getByLabelText('Dirección')).toHaveValue('corona-rota')
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText('Dirección'), { target: { value: 'corona-nueva' } })
    })
    await click(/Aprobar y crear/)
    expect(data.approveCampaignRequest).toHaveBeenCalledWith(7, { slug: 'corona-nueva', name: 'La Corona Rota' })
    expect(await screen.findByText(/Campaña \/corona-nueva creada\. Beto es su DM/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('No hay solicitudes pendientes.')).toBeInTheDocument())
  })

  it('keeps the dialog open and explains a taken address; validates locally', async () => {
    const approve = vi.fn().mockRejectedValueOnce(business('slug_taken', '23505')).mockResolvedValue('otra')
    renderApp('/', { data: ownerData({ listAllCampaignRequests: vi.fn(async () => [inboxRow()]), approveCampaignRequest: approve }) })
    await screen.findByText('La Corona Rota')
    await click(/^Aprobar$/)
    const dialog = await screen.findByRole('dialog')
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText('Dirección'), { target: { value: 'Mal Slug' } })
    })
    await click(/Aprobar y crear/)
    expect(approve).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText('Dirección'), { target: { value: 'ocupada' } })
    })
    await click(/Aprobar y crear/)
    expect(await within(dialog).findByText(/Ya existe una campaña con esa dirección/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText('Dirección'), { target: { value: 'otra' } })
    })
    await click(/Aprobar y crear/)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(approve).toHaveBeenLastCalledWith(7, { slug: 'otra', name: 'La Corona Rota' })
  })

  it('approves once on a double click', async () => {
    const pending = deferred<string>()
    const approve = vi.fn(() => pending.promise)
    renderApp('/', { data: ownerData({ listAllCampaignRequests: vi.fn(async () => [inboxRow()]), approveCampaignRequest: approve }) })
    await screen.findByText('La Corona Rota')
    await click(/^Aprobar$/)
    const button = await screen.findByRole('button', { name: /Aprobar y crear/ })
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    expect(approve).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve('corona-rota'))
  })

  it('rejects with an optional note', async () => {
    const data = ownerData({ listAllCampaignRequests: vi.fn(async () => [inboxRow()]) })
    renderApp('/', { data })
    await screen.findByText('La Corona Rota')
    await click(/^Rechazar$/)
    const dialog = await screen.findByRole('dialog', { name: 'Rechazar solicitud' })
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/Nota/), { target: { value: ' Ahora no ' } })
    })
    await click(/Rechazar solicitud$/)
    expect(data.rejectCampaignRequest).toHaveBeenCalledWith(7, 'Ahora no')
    expect(await screen.findByText('Solicitud rechazada.')).toBeInTheDocument()
  })

  it('rejects without a note and reports a request that was already decided', async () => {
    const reject = vi.fn().mockRejectedValueOnce(business('request_not_pending')).mockResolvedValue(undefined)
    const list = vi.fn(async () => [inboxRow()])
    renderApp('/', { data: ownerData({ listAllCampaignRequests: list, rejectCampaignRequest: reject }) })
    await screen.findByText('La Corona Rota')
    await click(/^Rechazar$/)
    await click(/Rechazar solicitud$/)
    expect(reject).toHaveBeenCalledWith(7, undefined)
    expect(await screen.findByText(/ya fue resuelta o cancelada/, { selector: '[role=alert]' })).toBeInTheDocument()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  it('closes the dialogs with the visible close button, Escape and the backdrop', async () => {
    renderApp('/', { data: ownerData({ listAllCampaignRequests: vi.fn(async () => [inboxRow()]) }) })
    await screen.findByText('La Corona Rota')
    await click(/^Aprobar$/)
    await click('Cerrar')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await click(/^Rechazar$/)
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await click(/^Rechazar$/)
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement
    await act(async () => {
      fireEvent.pointerDown(backdrop)
      fireEvent.pointerUp(backdrop)
      fireEvent.click(backdrop)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a retry when the inbox fails to load', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue([])
    renderApp('/', { data: ownerData({ listAllCampaignRequests: list }) })
    expect(await screen.findByText(/No pudimos cargar las solicitudes pendientes/)).toBeInTheDocument()
    await click(/Reintentar/)
    expect(await screen.findByText('No hay solicitudes pendientes.')).toBeInTheDocument()
  })
})
