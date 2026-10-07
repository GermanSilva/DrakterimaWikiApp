import { describe, expect, it } from 'vitest'
import { DataError, toDataError } from '../data'
import {
  acceptInviteErrorMessage,
  createCampaignErrorMessage,
  normalizeInviteCode,
  suggestSlug,
  validateCampaignForm,
} from './campaignSlug'

const business = (message: string) => toDataError({ code: 'P0001', message })

describe('suggestSlug', () => {
  it('folds accents, lowercases and dashes separators', () => {
    expect(suggestSlug('Leyendas de Drakterima')).toBe('leyendas-de-drakterima')
    expect(suggestSlug('  ¡Ñandú & Cía!  ')).toBe('nandu-cia')
    expect(suggestSlug('')).toBe('')
  })
  it('caps at 40 characters without a trailing dash', () => {
    const slug = suggestSlug(`${'a'.repeat(39)} bbbb`)
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('validateCampaignForm', () => {
  it('accepts a valid pair', () => {
    expect(validateCampaignForm({ name: 'Demo', slug: 'demo-1' })).toEqual({})
  })
  it.each(['ab', 'a'.repeat(41), 'Demo', 'de mo', '-demo', 'demo-', 'de--mo', 'dé-mo'])('rejects slug %j', (slug) => {
    expect(validateCampaignForm({ name: 'Demo', slug }).slug).toBeTruthy()
  })
  it.each(['admin', 'api', 'login', 'new', 'www', 'assets'])('rejects reserved slug %s', (slug) => {
    expect(validateCampaignForm({ name: 'Demo', slug }).slug).toMatch(/reservada/)
  })
  it('requires a name of at most 120 characters', () => {
    expect(validateCampaignForm({ name: '   ', slug: 'demo' }).name).toBeTruthy()
    expect(validateCampaignForm({ name: 'x'.repeat(121), slug: 'demo' }).name).toBeTruthy()
  })
})

describe('error messages', () => {
  it('maps create_campaign reasons and duplicates', () => {
    expect(createCampaignErrorMessage(business('reserved_slug'))).toMatch(/reservada/)
    expect(createCampaignErrorMessage(business('campaign_limit_reached'))).toMatch(/máximo/)
    expect(createCampaignErrorMessage(toDataError({ code: '23505', message: 'duplicate key' }))).toMatch(/Ya existe/)
    expect(createCampaignErrorMessage(new Error('boom'))).toMatch(/No pudimos crear/)
    expect(createCampaignErrorMessage(new DataError('unknown', 'x'))).toMatch(/No pudimos crear/)
  })
  it('maps accept_invite reasons without echoing server text', () => {
    expect(acceptInviteErrorMessage(business('invite_not_found'))).toMatch(/No encontramos/)
    expect(acceptInviteErrorMessage(business('invite_expired'))).toMatch(/venció/)
    expect(acceptInviteErrorMessage(business('invite_exhausted'))).toMatch(/máximo de veces/)
    expect(acceptInviteErrorMessage(business('character_already_claimed'))).toMatch(/reclamado/)
    expect(acceptInviteErrorMessage(new Error('secret internals'))).not.toMatch(/secret/)
  })
})

describe('normalizeInviteCode', () => {
  it('trims and accepts opaque codes, rejects anything else', () => {
    expect(normalizeInviteCode('  abc123 ')).toBe('abc123')
    expect(normalizeInviteCode('')).toBeNull()
    expect(normalizeInviteCode('a b')).toBeNull()
    expect(normalizeInviteCode("x'; drop table")).toBeNull()
    expect(normalizeInviteCode('a'.repeat(65))).toBeNull()
  })
})
