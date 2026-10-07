import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConflictError, DataError, type FlatEntity, type WikiIndexItem } from '../../data'
import { CampaignTestProviders, createFakeLayer, fakeUnread } from '../testing/fakeLayer'
import { describeDataError } from './errorMessages'
import { bySesionOrden } from './sort'
import { useDmNotes } from './useDmNotes'
import { useEntities } from './useEntities'
import { useEntity } from './useEntity'
import { useEntityActions } from './useEntityActions'
import { useVisibility } from './useVisibility'
import { useWikiIndex } from './useWikiIndex'
import { useToast } from '../toastContext'

const pnj = (id: number, over: Partial<FlatEntity> = {}): FlatEntity => ({ id, campaign_id: 'c1', nombre: `P${id}`, updated_at: '2026-01-01T00:00:00Z', ...over })

function setup(options: Parameters<typeof createFakeLayer>[0] = {}, props: { isDM?: boolean } = {}) {
  const made = createFakeLayer(options)
  const unread = fakeUnread()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CampaignTestProviders layer={made.layer} isDM={props.isDM ?? true} unread={unread}>
      {children}
    </CampaignTestProviders>
  )
  return { ...made, unread, wrapper }
}

describe('shared table store', () => {
  it('opens ONE realtime channel per table however many components read it', async () => {
    const { wrapper, fake, spies } = setup({ entities: { pnjs: [pnj(1)] } })
    const { result } = renderHook(() => ({ a: useEntities('pnjs'), b: useEntities('pnjs'), c: useEntity('pnjs', 1) }), { wrapper })
    await waitFor(() => expect(result.current.a.loading).toBe(false))
    expect(result.current.b.items).toHaveLength(1)
    expect(result.current.c.entity?.nombre).toBe('P1')
    const entityChannels = fake.channels.filter((c) => c.name.startsWith('campaign:pnjs:'))
    expect(entityChannels).toHaveLength(1)
    expect(spies.entityList).toHaveBeenCalledTimes(1)
  })

  it('removes the channel when the last reader unmounts', async () => {
    const { wrapper, fake } = setup({ entities: { lugares: [] } })
    const { unmount, result } = renderHook(() => useEntities('lugares'), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fake.removed).toHaveLength(0)
    const view = renderHook(() => useEntities('pnjs'), { wrapper })
    view.unmount()
    unmount()
    await waitFor(() => expect(fake.removed.length).toBeGreaterThan(0))
  })

  it('does not subscribe when disabled', () => {
    const { wrapper, fake } = setup()
    renderHook(() => useEntities('pnjs', { enabled: false }), { wrapper })
    expect(fake.channels).toHaveLength(0)
  })

  it('sorts sesiones by timeline position and the rest by id', async () => {
    const { wrapper } = setup({
      entities: {
        sesiones: [
          { id: 1, campaign_id: 'c1', numero: 3 } as FlatEntity,
          { id: 2, campaign_id: 'c1', numero: 1, orden: 250 } as FlatEntity,
          { id: 3, campaign_id: 'c1', numero: 2 } as FlatEntity,
        ],
        pnjs: [pnj(5), pnj(2)],
      },
    })
    const { result } = renderHook(() => ({ s: useEntities('sesiones'), p: useEntities('pnjs') }), { wrapper })
    await waitFor(() => expect(result.current.s.loading || result.current.p.loading).toBe(false))
    expect(result.current.s.items.map((e) => e.id)).toEqual([3, 2, 1]) // 200, 250, 300
    expect(result.current.p.items.map((e) => e.id)).toEqual([2, 5])
    expect(bySesionOrden({ id: 1, campaign_id: 'c', numero: 1 }, { id: 2, campaign_id: 'c', numero: 1 })).toBeLessThan(0)
  })

  it('reports not found once loaded', async () => {
    const { wrapper } = setup({ entities: { pnjs: [pnj(1)] } })
    const { result } = renderHook(() => useEntity('pnjs', 7), { wrapper })
    await waitFor(() => expect(result.current.notFound).toBe(true))
    expect(result.current.entity).toBeNull()
  })

  it('throws a clear error outside the providers', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useEntities('pnjs'))).toThrow(/CampaignServicesProvider/)
    spy.mockRestore()
  })
})

describe('wiki index', () => {
  it('loads only index tables (one channel each) and exposes them by table', async () => {
    const item: WikiIndexItem = { id: 4, title: 'Kardevir', imagen_url: null, estado: 'publicado' }
    const { wrapper, fake } = setup({ index: { lugares: [item] } })
    const { result } = renderHook(() => useWikiIndex(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.byTable.lugares).toEqual([item])
    const names = fake.channels.map((c) => c.name.split(':')[1]).sort()
    expect(new Set(names).size).toBe(names.length) // one channel per table
    expect(fake.channels).toHaveLength(9)
  })
})

describe('useDmNotes and useVisibility', () => {
  it('reads DM notes for a DM', async () => {
    const { wrapper, spies } = setup({ dmNotes: { 'lore:1': { notas: 'secreto', secreto: '', ganchos: '' } } })
    const { result } = renderHook(() => useDmNotes('lore', 1), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.fields.notas).toBe('secreto')
    expect(spies.dmNotesGet).toHaveBeenCalledWith('lore', 1)
  })

  it('never calls the DM-only reads for a player', async () => {
    const { wrapper, spies } = setup({}, { isDM: false })
    const { result } = renderHook(() => ({ n: useDmNotes('lore', 1), v: useVisibility('pnjs', [1, 2]) }), { wrapper })
    await act(async () => undefined)
    expect(result.current.n.status).toBe('idle')
    expect(result.current.v.status).toBe('idle')
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('makes no request for tables without DM notes and reads visibility for the DM', async () => {
    const { wrapper, spies } = setup({ visibility: { 1: [10] } })
    const { result } = renderHook(() => ({ n: useDmNotes('homebrew_rules', 1), v: useVisibility('pnjs', [1]) }), { wrapper })
    await waitFor(() => expect(result.current.v.status).toBe('ready'))
    expect(result.current.n.status).toBe('idle')
    expect(result.current.v.visibility).toEqual({ 1: [10] })
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
  })
})

function useActionsWithToast(table: Parameters<typeof useEntityActions>[0]) {
  return { actions: useEntityActions(table), toast: useToast() }
}

describe('useEntityActions', () => {
  it('create: entity row without DM fields, notes and visibility as follow-ups (DM)', async () => {
    const { wrapper, spies, unread } = setup()
    const { result } = renderHook(() => useEntityActions('pnjs'), { wrapper })
    let out: Awaited<ReturnType<typeof result.current.create>> = null
    await act(async () => {
      out = await result.current.create({ nombre: 'Nuevo' }, { dmNotes: { secreto: 'traidor' }, visibleTo: [5] })
    })
    expect(spies.saveEntityWithDmNotes).toHaveBeenCalledWith('pnjs', { campaignId: 'c1' }, { nombre: 'Nuevo' })
    expect(spies.dmNotesUpsert).toHaveBeenCalledWith('c1', 'pnjs', 99, { secreto: 'traidor' })
    expect(spies.setVisibility).toHaveBeenCalledWith('pnjs', 99, [5])
    expect(out).toMatchObject({ warnings: [] })
    expect(unread.markRead).toHaveBeenCalledWith('pnjs', 99, '2026-01-01T00:00:00Z')
  })

  it('create: a failed notes write keeps the saved entity and warns instead of failing', async () => {
    const { wrapper, spies } = setup()
    spies.dmNotesUpsert.mockRejectedValueOnce(new DataError('permission', 'x'))
    const { result } = renderHook(() => useEntityActions('pnjs'), { wrapper })
    let out: Awaited<ReturnType<typeof result.current.create>> = null
    await act(async () => {
      out = await result.current.create({ nombre: 'N' }, { dmNotes: { notas: 'a' } })
    })
    expect(out).toMatchObject({ entity: { id: 99 }, warnings: ['No se pudieron guardar las notas del DM.'] })
  })

  it('update: entity row first and alone, notes separately, optimistic base sent, unchanged visibility skipped', async () => {
    const { wrapper, spies } = setup()
    const base = { updated_at: 'v1' }
    const { result } = renderHook(() => useEntityActions('pnjs'), { wrapper })
    await act(async () => {
      await result.current.update(7, { rol: 'x' }, { base, dmNotes: { notas: 'n' }, visibleTo: [2, 1], currentVisibleTo: [1, 2] })
    })
    expect(spies.saveEntityWithDmNotes).toHaveBeenCalledWith('pnjs', { campaignId: 'c1', id: 7, base }, { rol: 'x' })
    expect(spies.dmNotesUpsert).toHaveBeenCalledWith('c1', 'pnjs', 7, { notas: 'n' })
    expect(spies.setVisibility).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.update(7, { rol: 'y' }, { visibleTo: [3], currentVisibleTo: [1] })
    })
    expect(spies.setVisibility).toHaveBeenCalledWith('pnjs', 7, [3])
  })

  it('update: a conflict is shown as a typed toast and resolves null', async () => {
    const { wrapper, spies } = setup()
    spies.saveEntityWithDmNotes.mockRejectedValueOnce(new ConflictError())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => ({ ...useActionsWithToast('pnjs') }), { wrapper })
    let out: unknown = 'unset'
    await act(async () => {
      out = await result.current.actions.update(1, { rol: 'x' }, { base: { updated_at: 'old' } })
    })
    expect(out).toBeNull()
    errorSpy.mockRestore()
  })

  it('a player cannot send DM notes or visibility: nothing is written', async () => {
    const { wrapper, spies } = setup({}, { isDM: false })
    const { result } = renderHook(() => useEntityActions('pnjs'), { wrapper })
    let out: unknown = 'unset'
    await act(async () => {
      out = await result.current.update(1, { rol: 'x' }, { dmNotes: { notas: 'n' } })
      await result.current.create({ nombre: 'x' }, { visibleTo: [1] })
    })
    expect(out).toBeNull()
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
    expect(spies.setVisibility).not.toHaveBeenCalled()
  })

  it('remove resolves true, and an already-deleted row counts as removed', async () => {
    const { wrapper, spies } = setup()
    const { result } = renderHook(() => useEntityActions('lore'), { wrapper })
    let ok = false
    await act(async () => {
      ok = await result.current.remove(3)
    })
    expect(ok).toBe(true)
    spies.entityRemove.mockRejectedValueOnce(new DataError('not_found', 'gone'))
    await act(async () => {
      ok = await result.current.remove(3)
    })
    expect(ok).toBe(true)
    spies.entityRemove.mockRejectedValueOnce(new DataError('permission', 'no'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      ok = await result.current.remove(3)
    })
    expect(ok).toBe(false)
    errorSpy.mockRestore()
  })
})

describe('describeDataError', () => {
  it('maps typed errors to user messages without leaking database text', () => {
    expect(describeDataError(new ConflictError())).toMatch(/Alguien más/)
    expect(describeDataError(new DataError('permission', 'raw sql text', undefined, 'dm_only'))).toBe('Solo el DM puede hacer esto.')
    expect(describeDataError(new DataError('permission', 'raw sql text'))).not.toMatch(/raw/)
    expect(describeDataError(new Error('boom'))).toMatch(/Intentá/)
  })
})

describe('useEntityActions: partial failures, fresh versions and invalidation', () => {
  it('update: a failed notes write keeps the saved entity, warns, and leaves the retry possible', async () => {
    const { wrapper, spies } = setup()
    spies.dmNotesUpsert.mockRejectedValueOnce(new DataError('permission', 'x'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useEntityActions('pnjs'), { wrapper })
    let out: Awaited<ReturnType<typeof result.current.update>> = null
    await act(async () => {
      out = await result.current.update(7, { rol: 'x' }, { dmNotes: { notas: 'n' } })
    })
    errorSpy.mockRestore()
    expect(out).toMatchObject({ entity: { id: 7, rol: 'x' }, warnings: ['No se pudieron guardar las notas del DM.'] })
  })

  it('re-reads the entity after the visibility RPC so the returned version is fresh (and markRead uses it)', async () => {
    const stale = pnj(7, { updated_at: 'v1' })
    const { wrapper, spies, unread } = setup({ entities: { pnjs: [{ ...stale, updated_at: 'v2-after-rpc' }] } })
    const { result } = renderHook(() => useEntityActions('pnjs'), { wrapper })
    let out: Awaited<ReturnType<typeof result.current.update>> = null
    await act(async () => {
      out = await result.current.update(7, {}, { visibleTo: [3], currentVisibleTo: [] })
    })
    expect(spies.setVisibility).toHaveBeenCalled()
    expect(spies.entityGet).toHaveBeenCalledWith('pnjs', 7)
    expect(out).toMatchObject({ entity: { updated_at: 'v2-after-rpc' } })
    expect(unread.markRead).toHaveBeenCalledWith('pnjs', 7, 'v2-after-rpc')
  })

  it('does not re-read when visibility was not written', async () => {
    const { wrapper, spies } = setup()
    const { result } = renderHook(() => useEntityActions('pnjs'), { wrapper })
    await act(async () => {
      await result.current.update(7, { rol: 'x' })
    })
    expect(spies.entityGet).not.toHaveBeenCalled()
  })

  it('refreshes useDmNotes and useVisibility of that entity after a successful save', async () => {
    const { wrapper, spies } = setup({ dmNotes: { 'lore:1': { notas: 'v1', secreto: '', ganchos: '' } } })
    const { result } = renderHook(() => ({ n: useDmNotes('lore', 1), v: useVisibility('lore', [1]), a: useEntityActions('lore') }), { wrapper })
    await waitFor(() => expect(result.current.n.fields.notas).toBe('v1'))
    expect(spies.dmNotesGet).toHaveBeenCalledTimes(1)
    spies.dmNotesGet.mockResolvedValueOnce({ id: 1, campaign_id: 'c1', entity_type: 'lore', entity_id: 1, notas: 'v2', secreto: '', ganchos: '', created_at: '', updated_at: '' })
    await act(async () => {
      await result.current.a.update(1, {}, { dmNotes: { notas: 'v2' }, visibleTo: [4], currentVisibleTo: [] })
    })
    await waitFor(() => expect(result.current.n.fields.notas).toBe('v2'))
    expect(spies.getVisibility).toHaveBeenCalledTimes(2)
    expect(result.current.n.status).toBe('ready') // refreshed in place, never dropped back to loading
  })
})

describe('refresh on focus / visibility', () => {
  it('re-lists open tables in place when the tab returns, at most every 30 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const { wrapper, spies } = setup({ entities: { pnjs: [pnj(1)] } })
      const { result } = renderHook(() => useEntities('pnjs'), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(spies.entityList).toHaveBeenCalledTimes(1)

      vi.setSystemTime(Date.now() + 10_000)
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
      })
      expect(spies.entityList).toHaveBeenCalledTimes(1) // throttled

      vi.setSystemTime(Date.now() + 31_000)
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await waitFor(() => expect(spies.entityList).toHaveBeenCalledTimes(2))
      expect(result.current.loading).toBe(false) // no flash back to loading
    } finally {
      vi.useRealTimers()
    }
  })
})
