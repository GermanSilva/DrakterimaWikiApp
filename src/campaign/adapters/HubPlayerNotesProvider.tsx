import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth'
import type { PlayerNote, PlayerNoteType } from '../../data'
import { PlayerNotesPortContext, type PlayerNotesPort } from '../../ports'
import { useCampaign } from '../CampaignContext'
import { useCampaignServices } from '../entities/campaignServicesContext'
import { describeDataError } from '../entities/errorMessages'
import { useWikiIndex } from '../entities/useWikiIndex'
import { useToast } from '../toastContext'

const NOTE_TYPES: readonly string[] = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items']
const isNoteType = (t: string): t is PlayerNoteType => NOTE_TYPES.includes(t)

const sameNote = (n: PlayerNote, userId: string, type: string, id: number) =>
  n.user_id === userId && n.entity_type === type && n.entity_id === id

/**
 * PlayerNotesPort over the `player_notes` repository. RLS: a player receives only their own notes,
 * the DM receives every note of the campaign. Keyed per USER (not per character); the character is
 * stored next to the note only as the label the DM sees. Loaded once per campaign layout (not
 * realtime: a DM sees notes written after they opened the campaign after a reload).
 */
export function HubPlayerNotesProvider({ children }: { children: ReactNode }) {
  const { isDM, myCharacterIds } = useCampaign()
  const { layer, campaignId } = useCampaignServices()
  const { user } = useAuth()
  const { showToast } = useToast()
  const { byTable } = useWikiIndex()
  const me = user?.id ?? null
  const [notes, setNotes] = useState<{ campaignId: string; items: PlayerNote[] } | null>(null)

  useEffect(() => {
    if (!me) return undefined
    let cancelled = false
    layer.playerNotes.list(campaignId).then(
      (items) => {
        if (!cancelled) setNotes({ campaignId, items })
      },
      (err: unknown) => {
        console.error('No se pudieron cargar las notas', err)
        // an empty list lets the editor render; saving still works
        if (!cancelled) setNotes({ campaignId, items: [] })
      },
    )
    return () => {
      cancelled = true
    }
  }, [layer, campaignId, me])

  const items = notes && notes.campaignId === campaignId ? notes.items : null

  const upsertLocal = useCallback((note: PlayerNote) => {
    setNotes((prev) => {
      const rest = (prev?.items ?? []).filter((n) => !sameNote(n, note.user_id, note.entity_type, note.entity_id))
      return { campaignId: note.campaign_id, items: [...rest, note] }
    })
  }, [])

  const port = useMemo<PlayerNotesPort>(() => {
    const labelOf = (n: PlayerNote) =>
      (n.character_id !== null ? byTable.pjs.find((p) => p.id === n.character_id)?.title : undefined) || 'Jugador'
    const all = items ?? []
    return {
      role: me ? (isDM ? 'dm' : 'player') : 'none',
      loading: items === null,
      entriesFor: (type, id) =>
        all.filter((n) => n.entity_type === type && n.entity_id === id).map((n) => ({ key: n.user_id, label: labelOf(n), text: n.text })),
      mine: (type, id) => all.find((n) => me !== null && sameNote(n, me, type, id))?.text ?? '',
      async save(type, id, text, key) {
        if (!me || !isNoteType(type)) return
        try {
          const author = isDM && key ? key : me
          const existing = all.find((n) => sameNote(n, author, type, id))
          // Someone else's note can only be corrected (UPDATE, allowed to the DM); upsert would hit the
          // own-row INSERT policy and fail.
          const saved =
            author !== me
              ? await layer.playerNotes.update(campaignId, author, type, id, text)
              : await layer.playerNotes.upsert({
                  campaignId,
                  entityType: type,
                  entityId: id,
                  text,
                  // a player's note shows their character to the DM; an existing note keeps its own
                  ...(!existing ? { characterId: myCharacterIds[0] ?? null } : {}),
                })
          upsertLocal(saved)
          showToast('Nota guardada')
        } catch (err) {
          console.error('No se pudo guardar la nota', err)
          showToast(describeDataError(err, 'No se pudo guardar la nota'), 'error')
        }
      },
      async remove(type, id, key) {
        if (!me || !isNoteType(type)) return
        const author = isDM && key ? key : me
        try {
          await layer.playerNotes.remove(campaignId, author, type, id)
          setNotes((prev) =>
            prev ? { ...prev, items: prev.items.filter((n) => !sameNote(n, author, type, id)) } : prev,
          )
          showToast('Nota eliminada')
        } catch (err) {
          console.error('No se pudo eliminar la nota', err)
          showToast(describeDataError(err, 'No se pudo eliminar la nota'), 'error')
        }
      },
    }
  }, [items, me, isDM, byTable.pjs, layer, campaignId, myCharacterIds, upsertLocal, showToast])

  return <PlayerNotesPortContext.Provider value={port}>{children}</PlayerNotesPortContext.Provider>
}
