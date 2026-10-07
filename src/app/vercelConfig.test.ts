import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface HeaderRule {
  source: string
  headers: { key: string; value: string }[]
}
interface VercelConfig {
  rewrites: { source: string; destination: string }[]
  headers: HeaderRule[]
}

const config: VercelConfig = JSON.parse(readFileSync(join(__dirname, '..', '..', 'vercel.json'), 'utf8'))
const headerValue = (rule: HeaderRule, key: string) => rule.headers.find((h) => h.key === key)?.value

describe('vercel.json', () => {
  it('is valid JSON with a SPA rewrite that every rule regex compiles', () => {
    expect(config.rewrites).toEqual([{ source: expect.any(String), destination: '/index.html' }])
    for (const { source } of [...config.rewrites, ...config.headers]) {
      // Vercel sources are path-to-regexp; the groups used here are plain regexes too.
      expect(() => new RegExp(`^${source}$`)).not.toThrow()
    }
    const spa = new RegExp(`^${config.rewrites[0].source}$`)
    expect(spa.test('/c/demo/pnjs/3')).toBe(true)
    expect(spa.test('/assets/index-abc.js')).toBe(false)
  })

  it('sets baseline security headers, and no-referrer on invite links', () => {
    const [general, invite] = config.headers
    for (const rule of config.headers) {
      expect(headerValue(rule, 'X-Content-Type-Options')).toBe('nosniff')
      expect(headerValue(rule, 'X-Frame-Options')).toBe('DENY')
    }
    expect(headerValue(general, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headerValue(invite, 'Referrer-Policy')).toBe('no-referrer')
    expect(new RegExp(`^${general.source}$`).test('/invite/abc')).toBe(false)
    expect(new RegExp(`^${general.source}$`).test('/c/demo')).toBe(true)
  })
})
