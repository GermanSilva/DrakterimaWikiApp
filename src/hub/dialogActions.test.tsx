import { fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ProfileForm } from '../auth'
import { profileRow } from '../auth/testing/fakeAuth'
import { DialogActions } from '../components/DialogActions'
import { makeData, makeRequest, renderApp } from '../app/testing/renderApp'
import type { CampaignRequestWithRequester } from '../data'
import { MyCampaignRequests } from './MyCampaignRequests'
import { RequestsInbox } from './RequestsInbox'

const row = (): CampaignRequestWithRequester => ({
  ...makeRequest({ id: 7, name: 'La Corona Rota', slug_wanted: 'corona-rota', accent_color: '#d4145a' }),
  requester: { id: 'u-9', display_name: 'Beto', avatar_url: null },
})
const classesOf = (el: Element) => el.className.split(/\s+/)
const index = (parent: Element, button: HTMLElement) => [...parent.children].indexOf(button)

async function open(name: string) {
  const opener = await screen.findByRole('button', { name })
  await act(async () => {
    fireEvent.click(opener)
  })
  return screen.findByRole('dialog', { name })
}

describe('DialogActions', () => {
  it('aligns to the right by default and centres a lone final button', () => {
    const { rerender } = render(
      <DialogActions>
        <button>Cancelar</button>
        <button>Guardar</button>
      </DialogActions>,
    )
    expect(classesOf(screen.getByRole('button', { name: 'Guardar' }).parentElement as Element)).toContain('justify-end')
    rerender(
      <DialogActions align="center">
        <button>Guardar</button>
      </DialogActions>,
    )
    expect(classesOf(screen.getByRole('button', { name: 'Guardar' }).parentElement as Element)).toContain('justify-center')
  })
})

describe('tile buttons keep a neutral hover', () => {
  it('Rechazar and Cancelar solicitud do not take the colour of the tile on hover', () => {
    render(
      <MemoryRouter>
        <RequestsInbox requests={[row()]} onApprove={vi.fn()} onReject={vi.fn()} onChanged={vi.fn()} />
        <MyCampaignRequests requests={[makeRequest({ id: 3 })]} campaigns={[]} onCancel={vi.fn()} onChanged={vi.fn()} />
      </MemoryRouter>,
    )
    for (const name of ['Rechazar', 'Cancelar solicitud']) {
      const classes = classesOf(screen.getByRole('button', { name }))
      expect(classes).toContain('text-txt-secondary')
      expect(classes.some((c) => c.includes('accent'))).toBe(false)
    }
  })
})

describe('the decision dialogs of the owner inbox', () => {
  it.each([
    ['Aprobar', 'Aprobar y crear'],
    ['Rechazar', 'Rechazar solicitud'],
  ])('%s: the actions sit on the right, with Cancelar before the confirming button', async (opener, confirm) => {
    render(<RequestsInbox requests={[row()]} onApprove={vi.fn()} onReject={vi.fn()} onChanged={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: opener }))
    })
    const dialog = await screen.findByRole('dialog')
    const confirmButton = within(dialog).getByRole('button', { name: confirm })
    const cancel = within(dialog).getByRole('button', { name: 'Cancelar' })
    const actions = confirmButton.parentElement as HTMLElement
    expect(cancel.parentElement).toBe(actions)
    expect(classesOf(actions)).toContain('justify-end')
    expect(index(actions, cancel)).toBeLessThan(index(actions, confirmButton))
  })
})

describe('forms whose only action is the final button', () => {
  it('centres Enviar solicitud in the request dialog', async () => {
    renderApp('/', { data: makeData() })
    const dialog = await open('Solicitar campaña')
    const submit = within(dialog).getByRole('button', { name: 'Enviar solicitud' })
    expect(classesOf(submit.parentElement as Element)).toContain('justify-center')
    expect(submit.parentElement?.querySelectorAll('button')).toHaveLength(1)
  })

  it('centres Crear in the create dialog', async () => {
    renderApp('/', { data: makeData({ isHubOwner: vi.fn(async () => true) }) })
    const dialog = await open('Crear campaña')
    const submit = within(dialog).getByRole('button', { name: 'Crear' })
    expect(classesOf(submit.parentElement as Element)).toContain('justify-center')
  })

  it('centres Ver invitación in the join dialog', async () => {
    renderApp('/')
    const dialog = await open('Unirme a campaña')
    const submit = within(dialog).getByRole('button', { name: 'Ver invitación' })
    expect(classesOf(submit.parentElement as Element)).toContain('justify-center')
  })

  it('centres Guardar in the profile form', () => {
    render(<ProfileForm profile={profileRow()} repository={{ update: vi.fn() }} />)
    const save = screen.getByRole('button', { name: 'Guardar' })
    expect(classesOf(save.parentElement as Element)).toContain('justify-center')
  })
})
