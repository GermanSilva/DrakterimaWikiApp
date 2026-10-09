import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignTestProviders, createFakeLayer } from '../testing/fakeLayer'
import { PRESENCE_CLIENT_THROTTLE_MS, usePresenceBeacon } from './usePresenceBeacon'

const MINUTE = 60_000

function setup(touch?: (campaignId?: string) => Promise<undefined>) {
  const fake = createFakeLayer()
  if (touch) fake.spies.presenceTouch.mockImplementation(touch)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CampaignTestProviders layer={fake.layer} isDM={false}>
      {children}
    </CampaignTestProviders>
  )
  const view = renderHook(() => usePresenceBeacon(), { wrapper })
  return { ...fake, ...view }
}

const flush = () => act(async () => { await Promise.resolve() })
const focus = () => act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve() })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('presence beacon', () => {
  it('touches the campaign once when it opens', async () => {
    const { spies } = setup()
    await flush()
    expect(spies.presenceTouch).toHaveBeenCalledTimes(1)
    expect(spies.presenceTouch).toHaveBeenCalledWith('c1')
  })

  it('ignores focus / visibility events inside the throttle window', async () => {
    const { spies } = setup()
    await flush()
    vi.setSystemTime(Date.now() + 4 * MINUTE)
    await focus()
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(spies.presenceTouch).toHaveBeenCalledTimes(1)
  })

  it('touches again on focus once the window has passed', async () => {
    const { spies } = setup()
    await flush()
    vi.setSystemTime(Date.now() + PRESENCE_CLIENT_THROTTLE_MS)
    await focus()
    expect(spies.presenceTouch).toHaveBeenCalledTimes(2)
  })

  it('touches again when the tab becomes visible, but not while it is hidden', async () => {
    const { spies } = setup()
    await flush()
    vi.setSystemTime(Date.now() + 6 * MINUTE)
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(spies.presenceTouch).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(spies.presenceTouch).toHaveBeenCalledTimes(2)
  })

  it('fails silently and retries on the next focus, without waiting for the window', async () => {
    const touch = vi.fn<(campaignId?: string) => Promise<undefined>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { spies } = setup(touch)
    await flush()
    await flush()
    expect(spies.presenceTouch).toHaveBeenCalledTimes(1)
    await focus()
    expect(spies.presenceTouch).toHaveBeenCalledTimes(2)
  })

  it('does not break when the layer cannot touch at all', async () => {
    const touch = () => { throw new Error('rpc missing') }
    const { result } = setup(touch as never)
    await flush()
    await flush()
    expect(result.current).toBeUndefined()
  })

  it('does not stack a second request while one is still in flight', async () => {
    let resolve: () => void = () => undefined
    const touch = () => new Promise<undefined>((r) => { resolve = () => r(undefined) })
    const { spies } = setup(touch)
    await flush()
    vi.setSystemTime(Date.now() + 10 * MINUTE)
    await focus()
    expect(spies.presenceTouch).toHaveBeenCalledTimes(1)
    resolve()
    await flush()
  })

  it('stops listening after unmount', async () => {
    const { spies, unmount } = setup()
    await flush()
    unmount()
    vi.setSystemTime(Date.now() + 10 * MINUTE)
    await focus()
    expect(spies.presenceTouch).toHaveBeenCalledTimes(1)
  })
})
