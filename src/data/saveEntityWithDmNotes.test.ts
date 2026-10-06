import { describe, expect, it } from 'vitest'
import { createDmNotesRepository } from './dmNotesRepository'
import { createEntityRepository } from './entityRepository'
import { createFakeClient, opsNamed } from './testing/fakeClient'
import { saveEntityWithDmNotes } from './saveEntityWithDmNotes'

function setup(table: 'pnjs' | 'homebrew_rules' = 'pnjs') {
  const fake = createFakeClient()
  return {
    fake,
    repo: createEntityRepository(fake.db, table),
    notes: createDmNotesRepository(fake.db),
  }
}

describe('saveEntityWithDmNotes', () => {
  it('creates the entity without DM fields, then upserts them keyed by the new id', async () => {
    const { fake, repo, notes } = setup()
    fake.enqueue({ data: { id: 11, campaign_id: 'c1', nombre: 'A', data: {} } })
    fake.enqueue({ data: { entity_id: 11, secreto: 's' } })
    const out = await saveEntityWithDmNotes(repo, notes, { campaignId: 'c1' }, { nombre: 'A', secreto: 's' })
    expect(opsNamed(fake.calls[0], 'insert')[0][0]).toEqual({ nombre: 'A', data: {}, campaign_id: 'c1' })
    expect(opsNamed(fake.calls[1], 'upsert')[0][0]).toEqual({
      campaign_id: 'c1',
      entity_type: 'pnjs',
      entity_id: 11,
      secreto: 's',
    })
    expect(out.entity.id).toBe(11)
    expect(out.dmNotes).toMatchObject({ entity_id: 11 })
  })

  it('updates as a patch and skips the notes write when no DM field is present', async () => {
    const { fake, repo, notes } = setup()
    fake.enqueue({ data: { id: 5, campaign_id: 'c1', nombre: 'B', data: {} } })
    const out = await saveEntityWithDmNotes(repo, notes, { campaignId: 'c1', id: 5 }, { nombre: 'B' })
    expect(fake.calls).toHaveLength(1)
    expect(out.dmNotes).toBeNull()
  })

  it('rejects DM fields for types that have no notes row', async () => {
    const { fake, repo, notes } = setup('homebrew_rules')
    await expect(saveEntityWithDmNotes(repo, notes, { campaignId: 'c1' }, { nombre: 'x', notas: 'n' })).rejects.toMatchObject({
      kind: 'validation',
    })
    expect(fake.calls).toHaveLength(0)
  })

  it('rethrows a notes failure after the entity was saved', async () => {
    const { fake, repo, notes } = setup()
    fake.enqueue({ data: { id: 11, campaign_id: 'c1', data: {} } })
    fake.enqueue({ error: { message: 'dm_only', code: '42501' } })
    await expect(saveEntityWithDmNotes(repo, notes, { campaignId: 'c1' }, { nombre: 'A', notas: 'n' })).rejects.toMatchObject({
      kind: 'permission',
      reason: 'dm_only',
    })
    expect(fake.calls).toHaveLength(2)
  })
})
