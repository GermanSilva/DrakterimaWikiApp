import { describe, expect, it } from 'vitest'
import { assertLocal } from './integration/assertLocal'

// Lives in the unit run (not src/data/integration/**, which the default vitest config excludes) so it
// executes in `npm test` without needing the local Supabase stack.
describe('assertLocal', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54324', 'http://127.0.0.1', 'https://localhost/'])('accepts %s', (url) => {
    expect(() => assertLocal('API', url)).not.toThrow()
  })

  it.each([
    'http://127.0.0.1:80@evil.com',
    'http://user:pass@127.0.0.1:54321',
    'http://127.0.0.1.evil.com',
    'http://localhost.evil.com:54321',
    'http://evil.com/?h=127.0.0.1',
    'ftp://127.0.0.1',
    'not a url',
    '',
  ])('rejects %j', (url) => {
    expect(() => assertLocal('API', url)).toThrow(/non-local API/)
  })

  it('never prints credentials', () => {
    try {
      assertLocal('API', 'http://admin:s3cret@evil.com')
    } catch (e) {
      expect((e as Error).message).not.toContain('s3cret')
      expect((e as Error).message).not.toContain('admin')
      return
    }
    throw new Error('should have thrown')
  })
})
