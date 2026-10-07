import { describe, expect, it } from 'vitest'
import { AVATAR_URL_MAX, DISPLAY_NAME_MAX, validateProfile } from './profileValidation'

describe('validateProfile', () => {
  it('trims and maps an empty avatar to null', () => {
    expect(validateProfile({ display_name: '  Ana ', avatar_url: ' ' })).toEqual({
      ok: true,
      value: { display_name: 'Ana', avatar_url: null },
    })
  })
  it('requires a name and caps it at 80', () => {
    expect(validateProfile({ display_name: ' ', avatar_url: '' })).toMatchObject({ ok: false, errors: { display_name: expect.any(String) } })
    expect(validateProfile({ display_name: 'x'.repeat(DISPLAY_NAME_MAX), avatar_url: '' }).ok).toBe(true)
    expect(validateProfile({ display_name: 'x'.repeat(DISPLAY_NAME_MAX + 1), avatar_url: '' }).ok).toBe(false)
  })
  it('counts code points, not UTF-16 units', () => {
    expect(validateProfile({ display_name: '😀'.repeat(DISPLAY_NAME_MAX), avatar_url: '' }).ok).toBe(true)
    expect(validateProfile({ display_name: '😀'.repeat(DISPLAY_NAME_MAX + 1), avatar_url: '' }).ok).toBe(false)
    const url = 'https://x.test/' + '😀'.repeat(AVATAR_URL_MAX - 15)
    expect(validateProfile({ display_name: 'a', avatar_url: url }).ok).toBe(true)
  })
  it.each(['https://', 'https:// ', 'https://a b', 'https://a.test/a b.png', 'https://user:pw@x.test/a.png', 'https://user@x.test/a.png', 'ftp://x.test', 'x.test/a.png'])(
    'rejects avatar %j',
    (avatar_url) => {
      expect(validateProfile({ display_name: 'a', avatar_url }).ok).toBe(false)
    },
  )
  it('accepts an uppercase https scheme and stores the trimmed input', () => {
    expect(validateProfile({ display_name: 'a', avatar_url: ' HTTPS://X.test/a.png ' })).toEqual({
      ok: true,
      value: { display_name: 'a', avatar_url: 'HTTPS://X.test/a.png' },
    })
  })
  it('accepts only https avatars up to 500 chars', () => {
    expect(validateProfile({ display_name: 'a', avatar_url: 'http://x.com/a.png' }).ok).toBe(false)
    expect(validateProfile({ display_name: 'a', avatar_url: 'javascript:alert(1)' }).ok).toBe(false)
    const ok = `https://x.com/${'a'.repeat(AVATAR_URL_MAX - 14)}`
    expect(ok).toHaveLength(AVATAR_URL_MAX)
    expect(validateProfile({ display_name: 'a', avatar_url: ok }).ok).toBe(true)
    expect(validateProfile({ display_name: 'a', avatar_url: `${ok}a` }).ok).toBe(false)
  })
})
