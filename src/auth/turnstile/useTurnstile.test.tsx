import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeTurnstile } from './fakeTurnstile'
import { resetTurnstileLoaderForTests, TURNSTILE_LOAD_TIMEOUT_MS } from './turnstileLoader'
import { useTurnstile } from './useTurnstile'

function Host({ siteKey }: { siteKey?: string | null }) {
  const { attach, token, status, reset } = useTurnstile({ siteKey })
  return (
    <div>
      <div ref={attach} data-testid="box" />
      <output data-testid="state">{`${status}|${token ?? ''}`}</output>
      <button onClick={reset}>reset</button>
    </div>
  )
}

const state = () => screen.getByTestId('state').textContent
const tags = () => document.querySelectorAll<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]')
let fake: ReturnType<typeof installFakeTurnstile>

beforeEach(() => {
  resetTurnstileLoaderForTests()
  document.head.innerHTML = ''
  fake = installFakeTurnstile()
})
afterEach(() => fake.uninstall())

describe('useTurnstile', () => {
  it('does nothing without a site key', () => {
    render(<Host siteKey="  " />)
    expect(state()).toBe('disabled|')
    expect(fake.api.render).not.toHaveBeenCalled()
    expect(document.querySelectorAll('script')).toHaveLength(0)
  })

  it('renders the widget with the site key, dark theme, Spanish and interaction-only appearance', async () => {
    render(<Host siteKey="site-key" />)
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledTimes(1))
    const [container, options] = fake.api.render.mock.calls[0]
    expect(container).toBe(screen.getByTestId('box'))
    expect(options).toMatchObject({ sitekey: 'site-key', theme: 'dark', language: 'es', appearance: 'interaction-only' })
    await waitFor(() => expect(state()).toBe('waiting|'))
  })

  it('exposes the token once solved, clears it on expiry and on error', async () => {
    render(<Host siteKey="k" />)
    await waitFor(() => expect(state()).toBe('waiting|'))
    act(() => fake.solve('abc'))
    expect(state()).toBe('ready|abc')
    act(() => fake.expire())
    expect(state()).toBe('expired|')
    act(() => fake.solve('def'))
    expect(state()).toBe('ready|def')
    act(() => fake.fail())
    expect(state()).toBe('error|')
  })

  it('reset discards the token and resets the widget', async () => {
    render(<Host siteKey="k" />)
    await waitFor(() => expect(state()).toBe('waiting|'))
    act(() => fake.solve('abc'))
    act(() => screen.getByText('reset').click())
    expect(fake.api.reset).toHaveBeenCalledWith('w1')
    expect(state()).toBe('waiting|')
  })

  it('removes the widget on unmount and ignores a late token', async () => {
    const { unmount } = render(<Host siteKey="k" />)
    await waitFor(() => expect(state()).toBe('waiting|'))
    const late = fake.widgets.get('w1')!.options.callback!
    unmount()
    expect(fake.api.remove).toHaveBeenCalledWith('w1')
    expect(() => late('late')).not.toThrow()
  })

  it('injects the script once even across remounts', () => {
    fake.uninstall()
    const first = render(<Host siteKey="k" />)
    first.unmount()
    render(<Host siteKey="k" />)
    expect(tags()).toHaveLength(1)
  })

  it('reports load_failed with no token, and reset loads the script again', async () => {
    fake.uninstall()
    render(<Host siteKey="k" />)
    await act(async () => {
      tags()[0].dispatchEvent(new Event('error'))
    })
    expect(state()).toBe('load_failed|')
    act(() => screen.getByText('reset').click())
    expect(tags()).toHaveLength(1)
    fake = installFakeTurnstile()
    await act(async () => {
      tags()[0].dispatchEvent(new Event('load'))
    })
    await waitFor(() => expect(state()).toBe('waiting|'))
  })

  it('does not render a widget while there is no container', () => {
    renderHook(() => useTurnstile({ siteKey: 'k' }))
    expect(fake.api.render).not.toHaveBeenCalled()
  })

  it('goes to error (not stuck on loading) when render throws, and reset restarts the widget', async () => {
    fake.api.render.mockImplementationOnce(() => {
      throw new Error('secret-site-key-detail')
    })
    const logs = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')]
    render(<Host siteKey="k" />)
    await waitFor(() => expect(state()).toBe('error|'))
    act(() => screen.getByText('reset').click())
    await waitFor(() => expect(state()).toBe('waiting|'))
    expect(fake.api.render).toHaveBeenCalledTimes(2)
    logs.forEach((spy) => {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  it('routes a stalled script load into load_failed, and reset loads it again without duplicate tags', async () => {
    vi.useFakeTimers()
    try {
      fake.uninstall()
      render(<Host siteKey="k" />)
      expect(tags()).toHaveLength(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(TURNSTILE_LOAD_TIMEOUT_MS)
      })
      expect(state()).toBe('load_failed|')
      expect(tags()).toHaveLength(0)
      act(() => screen.getByText('reset').click())
      expect(tags()).toHaveLength(1)
      fake = installFakeTurnstile()
      await act(async () => {
        tags()[0].dispatchEvent(new Event('load'))
      })
      expect(state()).toBe('waiting|')
    } finally {
      vi.useRealTimers()
    }
  })

  it('timeout-callback clears the token, reports expired, and reset restarts the widget', async () => {
    render(<Host siteKey="k" />)
    await waitFor(() => expect(state()).toBe('waiting|'))
    act(() => fake.solve('abc'))
    act(() => fake.timeout())
    expect(state()).toBe('expired|')
    act(() => screen.getByText('reset').click())
    expect(fake.api.reset).toHaveBeenCalledWith('w1')
    expect(state()).toBe('waiting|')
  })

  it('reports error when render returns no widget id, and reset restarts the widget', async () => {
    fake.uninstall()
    fake = installFakeTurnstile({ noWidgetId: true })
    render(<Host siteKey="k" />)
    await waitFor(() => expect(state()).toBe('error|'))
    expect(fake.api.render).toHaveBeenCalledTimes(1)
    act(() => screen.getByText('reset').click())
    await waitFor(() => expect(fake.api.render).toHaveBeenCalledTimes(2))
    expect(state()).toBe('error|')
  })
})
