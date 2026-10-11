import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadTurnstile, resetTurnstileLoaderForTests, TURNSTILE_SCRIPT_ID, TURNSTILE_SCRIPT_URL } from './turnstileLoader'

const tags = () => document.querySelectorAll<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]')
const fakeApi = () => ({ render: () => 'x', reset: () => {}, remove: () => {} })

beforeEach(() => {
  resetTurnstileLoaderForTests()
  delete window.turnstile
  document.head.innerHTML = ''
})
afterEach(() => {
  delete window.turnstile
})

describe('loadTurnstile', () => {
  it('injects one async/defer script and shares it between concurrent callers', async () => {
    const a = loadTurnstile()
    const b = loadTurnstile()
    expect(tags()).toHaveLength(1)
    const script = tags()[0]
    expect(script.id).toBe(TURNSTILE_SCRIPT_ID)
    expect(script.src).toBe(TURNSTILE_SCRIPT_URL)
    expect(script.async).toBe(true)
    expect(script.defer).toBe(true)
    const api = fakeApi()
    window.turnstile = api
    script.dispatchEvent(new Event('load'))
    await expect(a).resolves.toBe(api)
    await expect(b).resolves.toBe(api)
  })

  it('does not inject anything when the API is already there', async () => {
    const api = fakeApi()
    window.turnstile = api
    await expect(loadTurnstile()).resolves.toBe(api)
    expect(tags()).toHaveLength(0)
  })

  it('rejects, removes the tag and allows a retry when the script fails to load', async () => {
    const first = loadTurnstile()
    tags()[0].dispatchEvent(new Event('error'))
    await expect(first).rejects.toThrow()
    expect(tags()).toHaveLength(0)
    const second = loadTurnstile()
    expect(tags()).toHaveLength(1)
    window.turnstile = fakeApi()
    tags()[0].dispatchEvent(new Event('load'))
    await expect(second).resolves.toBeDefined()
  })

  it('treats a script that loaded without defining turnstile as a failure', async () => {
    const p = loadTurnstile()
    tags()[0].dispatchEvent(new Event('load'))
    await expect(p).rejects.toThrow()
    expect(tags()).toHaveLength(0)
  })
})
