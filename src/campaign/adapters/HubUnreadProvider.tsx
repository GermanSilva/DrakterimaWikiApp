import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { UnreadPortContext, type UnreadPort } from '../../ports'
import { useCampaignServices } from '../entities/campaignServicesContext'
import { isReadStateType, ReadStateCache, seenAtFor } from './readStateCache'

/**
 * UnreadPort over the `read_state` repository (strictly the caller's own rows, RLS). The rows load
 * once per campaign layout; marks are applied locally at once and written in the background (a
 * failed write is logged, never surfaced: a stale dot is not worth a toast). Not realtime: a second
 * tab of the same user sees the other tab's marks after a reload.
 */
export function HubUnreadProvider({ children }: { children: ReactNode }) {
  const { layer, campaignId } = useCampaignServices()
  // one cache per campaign (and per data layer): a different campaign never sees these marks
  const state = useMemo(() => new ReadStateCache(), [layer, campaignId]) // eslint-disable-line react-hooks/exhaustive-deps -- the deps ARE the identity of the cache
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    layer.readState.list(campaignId).then(
      (rows) => {
        if (cancelled) return
        state.load(rows)
        setVersion((v) => v + 1)
      },
      (err: unknown) => {
        console.error('No se pudo cargar el estado de lectura', err)
        // `loaded` stays false: keep "nothing unread" rather than marking the whole wiki unread
      },
    )
    return () => {
      cancelled = true
    }
  }, [layer, campaignId, state])

  const port = useMemo<UnreadPort>(
    () => {
      void version // a new port identity tells consumers to re-read the cache
      return {
        isUnread: (type, id, updatedAt, section) => state.isUnread(type, id, updatedAt, section),
        markRead(type, id, updatedAt, section = '') {
          if (!isReadStateType(type)) return
          if (state.isCovered(type, id, updatedAt, section)) return
          const seenAt = seenAtFor(updatedAt)
          if (!state.mark(type, id, section, seenAt)) return // would not raise seen_at: nothing to write
          setVersion((v) => v + 1)
          layer.readState.markSeen(campaignId, type, id, section, seenAt).catch((err: unknown) => {
            console.error('No se pudo marcar como leído', err)
          })
        },
      }
    },
    [state, version, layer, campaignId],
  )

  return <UnreadPortContext.Provider value={port}>{children}</UnreadPortContext.Provider>
}
