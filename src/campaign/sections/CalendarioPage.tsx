import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '../../components/Shared'
import UnreadDot from '../../components/UnreadDot'
import { btnSecondary } from '../../constants'
import type { Disponibilidad, PlayerAvailability } from '../../data'
import { useAuth } from '../../auth/useAuth'
import { clickable } from '../../helpers/a11y'
import { useUnreadPort } from '../../ports'
import { AvailabilityForm } from '../calendar/AvailabilityForm'
import {
  buildMemberMarkers, buildMonthCells, rowsForCampaign, sessionSlotsOnDay, type DayCell, type MemberMarker,
} from '../calendar/availabilityCalc'
import { DayModal } from '../calendar/DayModal'
import { SESION_COLOR, formatFechaLarga } from '../calendar/format'
import { SessionSlotForm } from '../calendar/SessionSlotForm'
import { useCampaign } from '../CampaignContext'
import { useBusySlots } from '../entities/useBusySlots'
import { useCampaignMembers } from '../entities/useCampaignMembers'
import { useDisponibilidad } from '../entities/useDisponibilidad'
import { useEntities } from '../entities/useEntities'
import { usePlayerAvailability } from '../entities/usePlayerAvailability'
import { Loading } from './DetailNotice'
import { canSee, str } from './format'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const EMPTY_CELL: DayCell = { available: [], unavailable: [], busy: [] }
const BUSY_CELL_STYLE = { backgroundImage: 'repeating-linear-gradient(45deg, #52525b, #52525b 3px, #3f3f46 3px, #3f3f46 6px)', color: '#e4e4e7' }

const pad = (n: number) => String(n).padStart(2, '0')

type Modal =
  | { kind: 'day'; fecha: string }
  | { kind: 'mine'; fecha: string; row?: PlayerAvailability }
  | { kind: 'session'; fecha: string; slot?: Disponibilidad }

/** `/c/:slug/calendario`: month grid of session slots and of the members' availability. */
export function CalendarioPage() {
  const { campaign, isDM } = useCampaign()
  const meId = useAuth().user?.id ?? ''
  const unread = useUnreadPort()
  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [modal, setModal] = useState<Modal | null>(null)

  const membersLoad = useCampaignMembers()
  const availability = usePlayerAvailability()
  const slots = useDisponibilidad()
  const busyLoad = useBusySlots()
  const sesiones = useEntities('sesiones')

  const markers = useMemo<MemberMarker[]>(
    () => [
      ...buildMemberMarkers(
        (membersLoad.data ?? []).map((m) => ({ user_id: m.user_id, name: m.profile?.display_name?.trim() || 'Miembro' })),
      ).values(),
    ],
    [membersLoad.data],
  )
  const markerById = useMemo(() => new Map(markers.map((m) => [m.userId, m])), [markers])
  const rows = useMemo(
    () => rowsForCampaign(availability.items, campaign.id, new Set(markers.map((m) => m.userId))),
    [availability.items, campaign.id, markers],
  )
  const busy = useMemo(() => (busyLoad.data ?? []).filter((s) => markerById.has(s.user_id)), [busyLoad.data, markerById])
  const cells = useMemo(() => buildMonthCells(rows, busy, view.year, view.month), [rows, busy, view.year, view.month])

  // Planned/held sessions with a date that the viewer has not read yet: a dot on their day.
  const unreadFechas = useMemo(
    () =>
      new Set(
        sesiones.items
          .filter((s) => canSee(s, isDM) && str(s.fecha) && unread.isUnread('sesiones', s.id, s.updated_at))
          .map((s) => str(s.fecha)),
      ),
    [sesiones.items, isDM, unread],
  )

  const header = (
    <PageHeader eyebrow="Agenda" title="Calendario" titleAs="h1" subtitle={`${MESES[view.month]} ${view.year}`}>
      <button
        type="button"
        className={btnSecondary}
        aria-label="Mes anterior"
        onClick={() => setView((p) => (p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 }))}
      >
        <ChevronLeft size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={btnSecondary}
        aria-label="Mes siguiente"
        onClick={() => setView((p) => (p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 }))}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </PageHeader>
  )

  if (membersLoad.status === 'error' || (availability.error && availability.items.length === 0) || (slots.error && slots.items.length === 0)) {
    return (
      <div>
        {header}
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar el calendario.{' '}
          <button
            type="button"
            className={btnSecondary}
            onClick={() => {
              membersLoad.refresh()
              availability.reload()
              slots.reload()
              busyLoad.refresh()
            }}
          >
            Reintentar
          </button>
        </p>
      </div>
    )
  }
  if (membersLoad.status !== 'ready' || availability.loading || slots.loading) {
    return (
      <div>
        {header}
        <Loading />
      </div>
    )
  }

  const offset = (new Date(view.year, view.month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const day = (d: number) => `${view.year}-${pad(view.month + 1)}-${pad(d)}`
  const openDay = (fecha: string) => {
    busyLoad.refresh() // other campaigns may have confirmed a session since the page loaded
    setModal({ kind: 'day', fecha })
  }
  const backToDay = () => setModal((m) => (m ? { kind: 'day', fecha: m.fecha } : null))

  return (
    <div>
      {header}

      {busyLoad.status === 'error' && (
        <p role="status" className="text-xs text-txt-muted mb-3">
          No pudimos cargar los horarios ocupados en otras campañas; el calendario puede no mostrarlos.
        </p>
      )}

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-2" aria-hidden="true">
        {DIAS.map((d) => (
          <div key={d} className="text-center font-exo text-[9px] sm:text-[10px] tracking-[0.1em] sm:tracking-[0.15em] uppercase text-txt-muted py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: offset }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1
          const fecha = day(d)
          const cell = cells[fecha] ?? EMPTY_CELL
          const hasSession = sessionSlotsOnDay(slots.items, fecha).length > 0
          const hasActivity = cell.available.length + cell.unavailable.length + cell.busy.length > 0
          const isToday = fecha === todayStr
          return (
            <div
              key={fecha}
              {...clickable(() => openDay(fecha))}
              aria-label={`${formatFechaLarga(fecha)}${hasSession ? ', sesión programada' : ''}`}
              className={[
                'min-h-[56px] sm:min-h-[72px] border cursor-pointer transition-colors p-1 sm:p-1.5 flex flex-col',
                isToday ? 'border-accent-dim' : 'border-border-base',
                hasActivity ? 'bg-accent/[.08] hover:bg-accent/[.15]' : 'hover:bg-bg-card-hover',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-0.5 sm:gap-1">
                <span className={`flex-1 font-exo text-[13px] sm:text-[18px] flex items-center gap-1 ${isToday ? 'text-accent-bright font-bold' : 'text-txt-secondary'}`}>
                  {d}
                  {unreadFechas.has(fecha) && <UnreadDot unread title="Sesión sin leer" />}
                </span>
                {hasSession && (
                  <span
                    className="flex-[2] items-center justify-center font-exo text-center text-[5px] sm:text-[9px] font-bold uppercase tracking-[0.05em] leading-none px-1 py-[3px] sm:py-1"
                    style={{ backgroundColor: SESION_COLOR, color: '#241c05' }}
                    title="Sesión programada"
                  >
                    Sesión
                  </span>
                )}
              </div>
              <div className="mt-auto grid grid-cols-3 gap-0.5 sm:gap-1">
                {markers.map((m) => {
                  // priority: booked elsewhere > full day unavailable > available window
                  const state = cell.busy.includes(m.userId) ? 'busy' : cell.unavailable.includes(m.userId) ? 'unavailable' : cell.available.includes(m.userId) ? 'available' : null
                  if (!state) return null
                  const text = { busy: 'ocupado', unavailable: 'no disponible', available: 'disponible' }[state]
                  const style = state === 'busy' ? BUSY_CELL_STYLE : state === 'unavailable' ? { backgroundColor: '#52525b', color: '#ef4444' } : { backgroundColor: m.color, color: '#fff' }
                  return (
                    <span
                      key={m.userId}
                      data-state={state}
                      title={`${m.name} — ${text}`}
                      className="flex items-center justify-center font-exo text-[7px] sm:text-[9px] font-bold leading-none py-[3px] sm:py-1"
                      style={style}
                    >
                      {m.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-4 p-0 list-none text-[12px] text-txt-secondary" aria-label="Referencias">
        {markers.map((m) => (
          <li key={m.userId} className="flex items-center gap-1.5">
            <span className="font-exo text-[9px] font-bold px-1.5 py-[3px] leading-none text-white" style={{ backgroundColor: m.color }}>{m.label}</span>
            {m.name}
            {m.userId === meId ? ' (vos)' : ''}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="font-exo text-[9px] font-bold px-1.5 py-[3px] leading-none" style={BUSY_CELL_STYLE}>··</span>
          Ocupado (compromiso en otra campaña)
        </li>
      </ul>

      {modal?.kind === 'day' && (
        <DayModal
          fecha={modal.fecha}
          isDM={isDM}
          meId={meId}
          members={markers}
          rows={rows}
          busy={busy}
          slots={slots.items}
          onClose={() => setModal(null)}
          onAddMine={() => setModal({ kind: 'mine', fecha: modal.fecha })}
          onEditMine={(row) => setModal({ kind: 'mine', fecha: modal.fecha, row })}
          onAddSession={() => setModal({ kind: 'session', fecha: modal.fecha })}
          onEditSession={(slot) => setModal({ kind: 'session', fecha: modal.fecha, slot })}
        />
      )}
      {modal?.kind === 'mine' && (
        <AvailabilityForm campaignId={campaign.id} userId={meId} fecha={modal.fecha} row={modal.row} busy={busy} onClose={backToDay} />
      )}
      {modal?.kind === 'session' && isDM && (
        <SessionSlotForm fecha={modal.fecha} slot={modal.slot} busy={busy} members={markers} onClose={backToDay} />
      )}
    </div>
  )
}
