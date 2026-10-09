import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Member, PlayerNote, WikiIndexItem } from '../../data'
import { createFakeLayer } from '../testing/fakeLayer'
import { renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

const idx = (id: number, title: string): WikiIndexItem => ({ id, title, imagen_url: null, estado: 'publicado' })
const note = (over: Partial<PlayerNote>): PlayerNote => ({
  campaign_id: 'c1', user_id: 'u2', entity_type: 'lore', entity_id: 1, character_id: null, text: 'texto', created_at: '', updated_at: '', ...over,
})
const member = (user_id: string, display_name: string): Member => ({
  campaign_id: 'c1', user_id, role: 'player', created_at: '', updated_at: '', profile: { id: user_id, display_name, avatar_url: null },
})

const INDEX = {
  lore: [idx(1, 'El Cisma')],
  pnjs: [idx(2, 'Ana la Bruja')],
  pjs: [idx(10, 'Eldric'), idx(11, 'Mara')],
  sesiones: [idx(3, '')], // a session without a title
}
const NOTES = [
  note({ user_id: 'u2', entity_type: 'lore', entity_id: 1, character_id: 10, text: 'Algo sobre la guerra' }),
  note({ user_id: 'u2', entity_type: 'pnjs', entity_id: 2, character_id: 10, text: 'Miente mucho' }),
  note({ user_id: 'u3', entity_type: 'sesiones', entity_id: 3, character_id: 11, text: 'Llegamos tarde' }),
  note({ user_id: 'u3', entity_type: 'lore', entity_id: 1, text: '   ' }), // blank: not listed
]
const MEMBERS = [member('u2', 'Pepe'), member('u3', 'Lola')]

const setup = (over: { isDM?: boolean; notes?: PlayerNote[] } = {}) => {
  const made = createFakeLayer({ index: INDEX, playerNotes: over.notes ?? NOTES, members: MEMBERS })
  const view = renderSection('/c/demo/notas', { layer: made.layer, isDM: over.isDM ?? true, characterIds: [10] })
  return { ...made, ...view }
}
const main = () => within(screen.getByRole('main'))
const cardButtons = () => main().getAllByRole('button').filter((b) => b.className.includes('text-left'))
const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const openCard = async (text: string) => fireEvent.click((await screen.findByText(text)).closest('button') as HTMLElement)

describe('Notas (DM)', () => {
  it('groups notes by author display name with the character as secondary label', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Notas' })).toBeInTheDocument()
    const pepe = await screen.findByRole('region', { name: 'Notas de Pepe' })
    expect(within(pepe).getByRole('heading', { level: 2 })).toHaveTextContent('Pepe· Eldric')
    expect(within(pepe).getByText('El Cisma')).toBeInTheDocument()
    expect(within(pepe).getByText('Ana la Bruja')).toBeInTheDocument()
    const lola = screen.getByRole('region', { name: 'Notas de Lola' })
    expect(within(lola).getByText('Sesión #3')).toBeInTheDocument() // untitled session falls back
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Notas de Lola', 'Notas de Pepe'])
  })

  it('filters by author with the chips', async () => {
    setup()
    const chips = await screen.findByRole('group', { name: 'Filtrar por autor' })
    fireEvent.click(within(chips).getByRole('button', { name: 'Lola' }))
    expect(screen.queryByRole('region', { name: 'Notas de Pepe' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Notas de Lola' })).toBeInTheDocument()
    fireEvent.click(within(chips).getByRole('button', { name: 'Todas' }))
    expect(screen.getByRole('region', { name: 'Notas de Pepe' })).toBeInTheDocument()
  })

  it('supports [tipo] and text search, highlights matches and offers type chips', async () => {
    setup()
    const input = await screen.findByLabelText('Buscar notas')
    fireEvent.change(input, { target: { value: '[pnj]' } })
    expect(cardButtons()).toHaveLength(1)
    fireEvent.change(input, { target: { value: 'GUERRA' } })
    expect(cardButtons()).toHaveLength(1)
    expect(main().getByText('guerra', { selector: 'mark' })).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(main().getByRole('button', { name: 'Lore', pressed: false }))
    expect(input).toHaveValue('[lore]')
    expect(cardButtons()).toHaveLength(1)
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(main().getByText(/No hay notas que coincidan con «zzz»/)).toBeInTheDocument()
  })

  it('opens the note, links to the article, and closes with the visible button or Escape', async () => {
    setup()
    await openCard('Llegamos tarde')
    const dialog = screen.getByRole('dialog', { name: 'Sesión #3' })
    expect(within(dialog).getByText('Lola · Mara')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Ir al artículo' })).toHaveAttribute('href', '/c/demo/sesiones/3')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await openCard('Miente mucho')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('corrects another author note with UPDATE and shows the new text', async () => {
    const { layer } = setup()
    mocked(layer.playerNotes.update).mockResolvedValue(note({ user_id: 'u2', entity_type: 'pnjs', entity_id: 2, character_id: 10, text: 'Dice la verdad' }))
    await openCard('Miente mucho')
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Texto de la nota'), { target: { value: 'Dice la verdad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    await waitFor(() => expect(layer.playerNotes.update).toHaveBeenCalledWith('c1', 'u2', 'pnjs', 2, 'Dice la verdad'))
    expect(await within(screen.getByRole('dialog')).findByText('Dice la verdad')).toBeInTheDocument()
    expect(screen.queryByLabelText('Texto de la nota')).toBeNull()
  })

  it('keeps the modal open in edit mode with the draft when saving fails', async () => {
    const { layer } = setup()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocked(layer.playerNotes.update).mockRejectedValue(new Error('down'))
    await openCard('Miente mucho')
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Texto de la nota'), { target: { value: 'Borrador' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    await waitFor(() => expect(layer.playerNotes.update).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeEnabled())
    expect(screen.getByLabelText('Texto de la nota')).toHaveValue('Borrador')
    errorSpy.mockRestore()
  })

  it('asks for confirmation before deleting; cancel keeps the note, confirm removes it', async () => {
    const { layer } = setup()
    mocked(layer.playerNotes.remove).mockResolvedValue(undefined)
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar nota de Ana la Bruja' }))
    const confirm = screen.getByRole('dialog', { name: '¿Eliminar esta nota?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(layer.playerNotes.remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar nota de Ana la Bruja' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(layer.playerNotes.remove).toHaveBeenCalledWith('c1', 'u2', 'pnjs', 2))
    await waitFor(() => expect(screen.queryByText('Miente mucho')).toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancelling a delete started from the detail goes back to the detail; a failed delete keeps the confirm open', async () => {
    const { layer } = setup()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocked(layer.playerNotes.remove).mockRejectedValue(new Error('down'))
    await openCard('Miente mucho')
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '¿Eliminar esta nota?' })).getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('dialog', { name: 'Ana la Bruja' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(layer.playerNotes.remove).toHaveBeenCalled())
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' })).toBeEnabled())
    expect(screen.getByRole('dialog', { name: '¿Eliminar esta nota?' })).toBeInTheDocument()
    expect(screen.getByText('Miente mucho')).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('shows the empty state when nobody wrote anything', async () => {
    setup({ notes: [] })
    expect(await screen.findByText('No hay notas de jugadores todavía.')).toBeInTheDocument()
  })
})

describe('Notas (player)', () => {
  const MINE = note({ user_id: 'user-1', entity_type: 'lore', entity_id: 1, character_id: 10, text: 'mi apunte' })

  it('shows only the notes the server returned, flat (no author groups or chips) and without asking for members', async () => {
    const { spies } = setup({ isDM: false, notes: [MINE] })
    expect(await screen.findByText('mi apunte')).toBeInTheDocument()
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Filtrar por autor' })).toBeNull()
    expect(spies.membersList).not.toHaveBeenCalled()
  })

  it('edits and deletes their own note through upsert / remove of their own row', async () => {
    const { layer } = setup({ isDM: false, notes: [MINE] })
    mocked(layer.playerNotes.upsert).mockResolvedValue({ ...MINE, text: 'cambiado' })
    mocked(layer.playerNotes.remove).mockResolvedValue(undefined)
    await openCard('mi apunte')
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Texto de la nota'), { target: { value: 'cambiado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    await waitFor(() => expect(layer.playerNotes.upsert).toHaveBeenCalledWith({ campaignId: 'c1', entityType: 'lore', entityId: 1, text: 'cambiado' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(layer.playerNotes.remove).toHaveBeenCalledWith('c1', 'user-1', 'lore', 1))
    expect(await screen.findByText('Todavía no tenés notas guardadas.')).toBeInTheDocument()
  })
})

describe('Notas load states', () => {
  it('shows a retryable error instead of an empty list when the notes cannot load', async () => {
    const made = createFakeLayer({ index: INDEX, playerNotes: NOTES, members: MEMBERS })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    made.spies.playerNotesList.mockRejectedValueOnce(new Error('down'))
    renderSection('/c/demo/notas', { layer: made.layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las notas')
    expect(screen.queryByText('No hay notas de jugadores todavía.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('region', { name: 'Notas de Pepe' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})
