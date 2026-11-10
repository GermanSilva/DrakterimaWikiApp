import { useMemo } from 'react'
import { useAuth } from '../../auth'
import type { FlatEntity } from '../../data'
import { shortTime } from '../calendar/availabilityCalc'
import { useCampaign } from '../CampaignContext'
import { canSee, str } from '../sections/format'
import { useRegionInfo } from '../sections/regions'
import { useSystem } from '../system/useSystem'
import {
  availabilityOnDay, daysUntilLabel, entityTitle, localToday, newsSince, nextSessionNumber, nextSessionSlot, openHooks, ownNotes, playerNoteFeed,
  prepItems, sheetChanges, slotDateParts, type Availability, type NewsTable,
} from './dashboardData'
import { economySummary } from './economy'
import { useLastVisit } from './lastVisit'
import { statusOf, useDashboardSources } from './useDashboardSources'

export interface NextSession {
  number: number
  until: string
  day: string
  parts: ReturnType<typeof slotDateParts>
  time: string | null
  /** null while the roster or the availability is loading, or when the campaign has no players. */
  availability: Availability | null
}

const timeRange = (start: string | null, end: string | null): string | null => (start ? (end ? `${shortTime(start)} – ${shortTime(end)}` : shortTime(start)) : null)

/** Everything the panel shows, derived from the live sources and the viewer's last visit. */
export function useDashboardModel() {
  const { campaign, isDM, myCharacterIds } = useCampaign()
  const { user, profile } = useAuth()
  const system = useSystem()
  const regionInfo = useRegionInfo()
  const src = useDashboardSources()
  const visit = useLastVisit(campaign.id, user?.id ?? 'anonymous')
  const { tables } = src
  const lists = {
    sesiones: tables.sesiones.items, pjs: tables.pjs.items, pnjs: tables.pnjs.items, lugares: tables.lugares.items,
    facciones: tables.facciones.items, lore: tables.lore.items, items: tables.items.items,
  }
  const byId = (rows: FlatEntity[]) => new Map(rows.map((r) => [r.id, r]))

  const memberName = useMemo(() => {
    const names = new Map(src.members.data.map((m) => [m.user_id, m.profile?.display_name ?? '']))
    return (userId: string) => names.get(userId) ?? ''
  }, [src.members.data])
  const playerIds = useMemo(() => src.members.data.filter((m) => m.role === 'player').map((m) => m.user_id), [src.members.data])

  const nextSlot = nextSessionSlot(src.slots.items, localToday())
  const availability = nextSlot?.fecha_inicio ? availabilityOnDay(playerIds, src.availability.items, campaign.id, nextSlot.fecha_inicio) : null
  const availabilityStatus = statusOf(src.members, src.availability)
  const next: NextSession | null = nextSlot?.fecha_inicio
    ? {
        number: nextSessionNumber(lists.sesiones),
        until: daysUntilLabel(localToday(), nextSlot.fecha_inicio),
        day: nextSlot.fecha_inicio,
        parts: slotDateParts(nextSlot.fecha_inicio),
        time: timeRange(nextSlot.hora_inicio, nextSlot.hora_fin),
        availability: availabilityStatus === 'ready' && playerIds.length > 0 ? availability : null,
      }
    : null

  const visibleCharacters = lists.pjs.filter((p) => canSee(p, isDM))
  const mine = myCharacterIds.map((id) => byId(lists.pjs).get(id)).find((p): p is FlatEntity => !!p) ?? null
  const playerOf = (pj: FlatEntity) => str(pj.jugador) || (typeof pj.owner_id === 'string' ? memberName(pj.owner_id) : '')

  const prep = prepItems({ missingPlayers: availability && availabilityStatus === 'ready' ? availability.missing.map(memberName).filter(Boolean) : null, sesiones: lists.sesiones, pnjs: lists.pnjs })
  const news = newsSince({ sesiones: lists.sesiones, pnjs: lists.pnjs, lugares: lists.lugares, facciones: lists.facciones, lore: lists.lore, items: lists.items } satisfies Record<NewsTable, FlatEntity[]>, isDM, visit.since)

  const titleOf = (table: string, id: number) => {
    const row = (lists as Record<string, FlatEntity[]>)[table]?.find((e) => e.id === id)
    return row ? entityTitle(table, row) : 'una entrada'
  }
  const noteFeed = playerNoteFeed(
    src.notes.data,
    {
      author: (id) => memberName(id) || 'Alguien',
      character: (id) => (id === null ? '' : str(byId(lists.pjs).get(id)?.nombre)),
      target: (n) => titleOf(n.entity_type, n.entity_id),
    },
    visit.since,
  )

  const entityStatus = statusOf(...Object.values(tables))
  return {
    greetingName: profile?.display_name ?? '',
    visit,
    system,
    regionLabel: (key: unknown) => regionInfo(str(key)).label,
    userId: user?.id ?? '',
    next,
    nextStatus: statusOf(src.slots),
    mine,
    economy: mine ? economySummary(mine, system) : null,
    party: visibleCharacters,
    partyStatus: statusOf(tables.pjs),
    prep,
    prepStatus: statusOf(src.slots, src.members, src.availability, tables.sesiones, tables.pnjs),
    news,
    newsStatus: entityStatus,
    noteFeed,
    noteFeedStatus: statusOf(src.notes, src.members, tables.pjs),
    sheetChanges: sheetChanges(visibleCharacters, playerOf, visit.since),
    sheetChangesStatus: statusOf(tables.pjs, src.members),
    myNotes: ownNotes(src.notes.data, user?.id ?? ''),
    hooks: openHooks(src.hooks.data),
    notesStatus: statusOf(isDM ? src.hooks : src.notes, ...Object.values(tables)),
    titleOf,
  }
}

export type DashboardModel = ReturnType<typeof useDashboardModel>
