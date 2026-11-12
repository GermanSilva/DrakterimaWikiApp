/** G9 (S26, S32): Ajustes shows one notice when any discarded entry is within 7 days of its automatic deletion. */
import { configure, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'
import { STORED_SHEET } from '../../system/builder/builderFixture'
import { DND5E_PROFILE } from '../../system/systemProfile'

configure({ asyncUtilTimeout: 10000 })

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const entry = (key: string, at: string) => ({ item: { kind: 'field', key, label: key, type: 'short', editableBy: 'dm' }, section: 'perfil', at })

function setup(discarded: unknown[]) {
  const system = { ...clone(DND5E_PROFILE), sheet: { ...clone(STORED_SHEET), discarded }, distance: { main: 'ft', units: [{ key: 'ft', label: 'Pies', value: 1, decimals: 0 }] } }
  const stored = { name: 'Drakterima', system_profile: system }
  const made = createFakeLayer({ campaign: stored as never, entities: { pjs: [] } })
  renderSection('/c/demo/ajustes?tab=ficha', { layer: made.layer, isDM: true, campaign: stored as never })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T10:00:00.000Z')) // 7 days before 31/10/2026
})
afterEach(() => vi.useRealTimers())

describe('Ajustes: automatic deletion notice', () => {
  it('summarises the entries within 7 days of deletion', async () => {
    setup([entry('cerca', '2026-09-01T10:00:00.000Z'), entry('lejos', '2026-10-01T10:00:00.000Z')])
    const notice = await screen.findByRole('status', { name: 'Eliminación automática de campos descartados' })
    expect(notice).toHaveTextContent('1 campo descartado se eliminará automáticamente en los próximos 7 días (el 31/10/2026).')
  })

  it('counts several and names the earliest date', async () => {
    setup([entry('a', '2026-09-01T05:00:00.000Z'), entry('b', '2026-09-01T10:00:00.000Z')])
    const notice = await screen.findByRole('status', { name: 'Eliminación automática de campos descartados' })
    expect(notice).toHaveTextContent('2 campos descartados se eliminarán automáticamente en los próximos 7 días (el primero, el 31/10/2026).')
  })

  it('shows nothing when no entry is that close', async () => {
    setup([entry('lejos', '2026-10-01T10:00:00.000Z')])
    await screen.findByRole('region', { name: 'Campos descartados' })
    expect(screen.queryByRole('status', { name: 'Eliminación automática de campos descartados' })).not.toBeInTheDocument()
  })

  it('shows nothing without discarded entries', async () => {
    setup([])
    await screen.findByRole('region', { name: 'Plantilla de ficha' })
    expect(screen.queryByRole('status', { name: 'Eliminación automática de campos descartados' })).not.toBeInTheDocument()
  })
})
