import { describe, expect, it } from 'vitest'
import { campaignFormInput, validateCampaignForm, NAME_MAX, TAGLINE_MAX } from './campaignForm'

const valid = { name: 'Drakterima', logoUrl: '', bannerUrl: '', accentColor: '', tagline: '' }

describe('validateCampaignForm', () => {
  it('accepts a minimal form and maps empty optional fields to "remove"', () => {
    expect(validateCampaignForm(valid)).toEqual({
      ok: true,
      values: { name: 'Drakterima', branding: { logo_url: null, banner_url: null, accent_color: null, tagline: null } },
    })
  })

  it('trims everything and normalises the colour and logo through the strict parsers', () => {
    const out = validateCampaignForm({ name: '  Leyendas  ', logoUrl: ' https://x.test/a.png ', bannerUrl: ' https://x.test/b.jpg ', accentColor: ' #DC2626 ', tagline: '  El fin  ' })
    expect(out).toEqual({
      ok: true,
      values: { name: 'Leyendas', branding: { logo_url: 'https://x.test/a.png', banner_url: 'https://x.test/b.jpg', accent_color: '#dc2626', tagline: 'El fin' } },
    })
  })

  it('requires a name and limits it', () => {
    expect(validateCampaignForm({ ...valid, name: '   ' })).toMatchObject({ ok: false, errors: { name: 'El nombre es obligatorio.' } })
    expect(validateCampaignForm({ ...valid, name: 'x'.repeat(NAME_MAX) }).ok).toBe(true)
    expect(validateCampaignForm({ ...valid, name: 'x'.repeat(NAME_MAX + 1) })).toMatchObject({ ok: false, errors: { name: expect.stringContaining('120') } })
    expect(validateCampaignForm({ ...valid, name: 'a\nb' })).toMatchObject({ ok: false, errors: { name: expect.any(String) } })
  })

  it.each(['javascript:alert(1)', 'http://x.test/a.png', 'data:image/png;base64,AAAA', '//x.test/a.png', '/a.png', 'not a url', 'https://'])(
    'rejects the logo %s',
    (logoUrl) => {
      expect(validateCampaignForm({ ...valid, logoUrl })).toMatchObject({ ok: false, errors: { logoUrl: expect.stringContaining('https') } })
    },
  )

  it.each(['javascript:alert(1)', 'http://x.test/b.jpg', 'data:image/png;base64,AAAA', '/b.jpg', 'not a url'])('rejects the banner %s', (bannerUrl) => {
    expect(validateCampaignForm({ ...valid, bannerUrl })).toMatchObject({ ok: false, errors: { bannerUrl: expect.stringContaining('https') } })
  })

  it('rejects an over-long banner URL with its own message', () => {
    expect(validateCampaignForm({ ...valid, bannerUrl: `https://x.test/${'a'.repeat(500)}` })).toMatchObject({
      ok: false,
      errors: { bannerUrl: expect.stringContaining('500') },
    })
  })

  it('rejects an over-long logo URL with its own message', () => {
    expect(validateCampaignForm({ ...valid, logoUrl: `https://x.test/${'a'.repeat(500)}` })).toMatchObject({
      ok: false,
      errors: { logoUrl: expect.stringContaining('500') },
    })
  })

  it.each(['red', '#fff', '#12345', '#1234567', 'dc2626', 'url(x)', 'var(--x)', '#gggggg'])('rejects the colour %s', (accentColor) => {
    expect(validateCampaignForm({ ...valid, accentColor })).toMatchObject({ ok: false, errors: { accentColor: expect.stringContaining('#rrggbb') } })
  })

  it('limits the tagline and rejects control characters', () => {
    expect(validateCampaignForm({ ...valid, tagline: 'x'.repeat(TAGLINE_MAX) }).ok).toBe(true)
    expect(validateCampaignForm({ ...valid, tagline: 'x'.repeat(TAGLINE_MAX + 1) })).toMatchObject({ ok: false, errors: { tagline: expect.stringContaining('35') } })
    expect(validateCampaignForm({ ...valid, tagline: 'a\tb' })).toMatchObject({ ok: false, errors: { tagline: expect.any(String) } })
  })

  it('reports every invalid field at once', () => {
    const out = validateCampaignForm({ name: '', logoUrl: 'http://x', bannerUrl: 'http://y', accentColor: 'red', tagline: 'x'.repeat(200) })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(Object.keys(out.errors).sort()).toEqual(['accentColor', 'bannerUrl', 'logoUrl', 'name', 'tagline'])
  })
})

describe('campaignFormInput', () => {
  it('reads the stored strings and ignores non-strings', () => {
    expect(campaignFormInput({ name: 'A', branding: { logo_url: 'https://x.test/a.png', banner_url: 'https://x.test/b.jpg', accent_color: 5, tagline: 'T' } })).toEqual({
      name: 'A',
      logoUrl: 'https://x.test/a.png',
      bannerUrl: 'https://x.test/b.jpg',
      accentColor: '',
      tagline: 'T',
    })
  })
})
