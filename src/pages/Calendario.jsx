import { useState, useMemo } from 'react'
import { useApp } from '../AppContext'
import { PageHeader } from '../components/Shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { btnSecondary, PLAYER_MARKERS } from '../constants'
import { buildMonthAvailabilityMap, buildMonthUnavailabilityMap, blockOverlapsDay } from '../helpers/disponibilidadCalc'
import DisponibilidadDayModal from '../components/DisponibilidadDayModal'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function pad(n) { return String(n).padStart(2, '0') }

export default function Calendario() {
  const { db, isDM, currentPlayer } = useApp()
  const now = new Date()
  const [viewDate, setViewDate] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [selectedDay, setSelectedDay] = useState(null)

  const bloques = db.disponibilidad || []
  const pjs = db.pjs || []

  const monthMap = useMemo(() => {
    const personales = bloques.filter(b => b.tipo === 'personal')
    return buildMonthAvailabilityMap(personales, viewDate.year, viewDate.month)
  }, [bloques, viewDate.year, viewDate.month])

  const unavailableMap = useMemo(() => (
    buildMonthUnavailabilityMap(bloques, viewDate.year, viewDate.month)
  ), [bloques, viewDate.year, viewDate.month])

  if (!isDM && !currentPlayer) {
    return (
      <div>
        <PageHeader eyebrow="Agenda" title="Calendario" />
        <div className="text-txt-muted text-[13px] italic mt-8">
          Accedé para ver el calendario de disponibilidad.
        </div>
      </div>
    )
  }

  function prevMonth() {
    setViewDate(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 })
  }
  function nextMonth() {
    setViewDate(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 })
  }

  const firstOfMonth = new Date(viewDate.year, viewDate.month, 1)
  const offset = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate()
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <PageHeader eyebrow="Agenda" title="Calendario" subtitle={`${MESES[viewDate.month]} ${viewDate.year}`}>
        <button className={btnSecondary} onClick={prevMonth}><ChevronLeft size={15} /></button>
        <button className={btnSecondary} onClick={nextMonth}><ChevronRight size={15} /></button>
      </PageHeader>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-2">
        {DIAS.map(d => (
          <div key={d} className="text-center font-exo text-[9px] sm:text-[10px] tracking-[0.1em] sm:tracking-[0.15em] uppercase text-txt-muted py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={`empty-${i}`} />
          const fecha = `${viewDate.year}-${pad(viewDate.month + 1)}-${pad(d)}`
          const isToday = fecha === todayStr
          const availableIds = monthMap[fecha] || []
          const unavailableIds = unavailableMap[fecha] || []
          const hasActivity = availableIds.length > 0 || unavailableIds.length > 0
          const hasSesion = bloques.some(b => b.tipo === 'sesion' && blockOverlapsDay(b, fecha))

          return (
            <div
              key={fecha}
              onClick={() => setSelectedDay(fecha)}
              className={[
                'min-h-[56px] sm:min-h-[72px] border cursor-pointer transition-colors p-1 sm:p-1.5 flex flex-col',
                isToday ? 'border-accent-dim' : 'border-border-base',
                hasActivity ? 'bg-accent/[.08] hover:bg-accent/[.15]' : 'hover:bg-bg-card-hover',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-0.5 sm:gap-1">
                <span className={`flex-1 font-exo text-[13px] sm:text-[18px] ${isToday ? 'text-accent-bright font-bold' : 'text-txt-secondary'}`}>
                  {d}
                </span>
                {hasSesion && (
                  <span
                    className="flex-[2] items-center justify-center font-exo text-center text-[5px] sm:text-[9px] font-bold uppercase tracking-[0.05em] leading-none px-1 py-[3px] sm:py-1"
                    style={{ backgroundColor: '#d4af37', color: '#241c05' }}
                    title="Sesión programada"
                  >
                    Sesión
                  </span>
                )}
              </div>
              <div className="mt-auto grid grid-cols-3 gap-0.5 sm:gap-1">
                {pjs.map(pj => {
                  const marker = PLAYER_MARKERS[pj.id]
                  if (!marker) return null
                  const isUnavailable = unavailableIds.includes(pj.id)
                  const isAvailable = availableIds.includes(pj.id)
                  if (!isUnavailable && !isAvailable) return null
                  return (
                    <span
                      key={pj.id}
                      title={`${pj.nombre} — ${isUnavailable ? 'no disponible' : 'disponible'}`}
                      className="flex items-center justify-center font-exo text-[7px] sm:text-[9px] font-bold leading-none py-[3px] sm:py-1"
                      style={isUnavailable
                        ? { backgroundColor: '#52525b', color: '#ef4444' }
                        : { backgroundColor: marker.color, color: '#fff' }}
                    >
                      {marker.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {selectedDay && (
        <DisponibilidadDayModal fecha={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  )
}
