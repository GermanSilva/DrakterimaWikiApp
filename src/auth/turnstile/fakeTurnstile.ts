import { vi } from 'vitest'
import type { TurnstileApi, TurnstileRenderOptions } from './turnstileLoader'

/** Installs a fake window.turnstile. Tests drive the widget through `solve`, `expire`, `fail`. */
export function installFakeTurnstile() {
  let next = 0
  const widgets = new Map<string, { container: HTMLElement; options: TurnstileRenderOptions }>()
  const api = {
    render: vi.fn((container: HTMLElement, options: TurnstileRenderOptions) => {
      const id = `w${++next}`
      widgets.set(id, { container, options })
      return id
    }),
    reset: vi.fn(),
    remove: vi.fn((id: string) => {
      widgets.delete(id)
    }),
  } satisfies TurnstileApi
  window.turnstile = api
  const last = () => [...widgets.values()].at(-1)!.options
  return {
    api,
    widgets,
    solve: (token = 'tok-1') => last().callback?.(token),
    expire: () => last()['expired-callback']?.(),
    fail: () => last()['error-callback']?.('300030'),
    uninstall: () => {
      delete window.turnstile
    },
  }
}
