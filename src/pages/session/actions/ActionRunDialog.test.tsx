import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LinkedAction } from '../../../data'
import { ActionRunDialog } from './ActionRunDialog'
import { SessionActionsContext, type ApplyOutcome, type SessionActions } from './sessionActions'

const source = { pj: { id: 1, updated_at: 'p1' }, linked: { action: { id: 2, name: 'Curar' }, link: { updated_at: 'l1', state: {} } } }
const result = { patch: { pj: { hp: 3 } }, applied: [{ step: 0, label: 'Curar', target: { type: 'field', key: 'hp' }, before: 0, after: 3, delta: 3 }], warnings: [] }

/** An api whose identity differs on every call, like the host's when the sheet or the services change. */
function makeApi(apply: SessionActions['apply']): SessionActions {
  return {
    parse: () => ({ ok: true, fn: { steps: [] } }),
    read: async () => source,
    run: () => result,
    apply,
  } as unknown as SessionActions
}

describe('ActionRunDialog: the api changes while a save is in flight', () => {
  it('a read that resolves before the save ends does not re-arm Aplicar: one apply only', async () => {
    let finish: (outcome: ApplyOutcome) => void = () => undefined
    const apply = vi.fn(() => new Promise<ApplyOutcome>((resolve) => (finish = resolve)))
    const onClose = vi.fn()
    const linked = source.linked as unknown as LinkedAction
    const view = (api: SessionActions) => (
      <SessionActionsContext.Provider value={api}>
        <ActionRunDialog pj={{ id: 1, nombre: 'Eldric' }} linked={linked} onClose={onClose} />
      </SessionActionsContext.Provider>
    )
    const { rerender } = render(view(makeApi(apply)))
    const button = await screen.findByRole('button', { name: 'Aplicar' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    expect(apply).toHaveBeenCalledTimes(1)
    rerender(view(makeApi(apply))) // new api identity: load() runs again and its read resolves at once
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(apply).toHaveBeenCalledTimes(1)
    finish({ status: 'ok' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
