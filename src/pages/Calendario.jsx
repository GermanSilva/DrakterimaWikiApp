import { useState, useMemo } from 'react'
import { useApp } from '../AppContext'
import { PageHeader } from '../components/Shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { btnSecondary } from '../constants'
import { buildMonthAvailabilityMap, blockOverlapsDay } from '../helpers/disponibilidadCalc'
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

  const monthMap = useMemo(() => {
    const personales = bloques.filter(b => b.tipo !== 'sesion')
    return buildMonthAvailabilityMap(personales, viewDate.year, viewDate.month)
  }, [bloques, viewDate.year, viewDate.month])

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

      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {DIAS.map(d => (
          <div key={d} className="text-center font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={`empty-${i}`} />
          const fecha = `${viewDate.year}-${pad(viewDate.month + 1)}-${pad(d)}`
          const isToday = fecha === todayStr
          const ids = monthMap[fecha] || []
          const ownAvailable = !isDM && currentPlayer &&
            bloques.some(b => b.pj_id === currentPlayer.id && blockOverlapsDay(b, fecha))
          const hasActivity = isDM ? ids.length > 0 : ownAvailable
          const hasSesion = bloques.some(b => b.tipo === 'sesion' && blockOverlapsDay(b, fecha))

          return (
            <div
              key={fecha}
              onClick={() => setSelectedDay(fecha)}
              className={[
                'aspect-square min-h-[64px] border cursor-pointer transition-colors p-1.5 flex flex-col',
                isToday ? 'border-accent-dim' : 'border-border-base',
                hasActivity ? 'bg-accent/[.08] hover:bg-accent/[.15]' : 'hover:bg-bg-card-hover',
              ].join(' ')}
            >
              <div className="flex items-start justify-between">
                <span className={`font-exo text-[18px] ${isToday ? 'text-accent-bright font-bold' : 'text-txt-secondary'}`}>
                  {d}
                </span>
                {hasSesion && (
                  <span className="w-3 h-3 rounded-full bg-[#8850c0] mt-1.5" title="Sesión programada" />
                )}
              </div>
              {isDM && ids.length > 0 && (
                <span className="mt-auto self-end font-exo text-[16px] font-semibold text-accent-bright bg-accent/20 px-1.5 rounded-sm">
                  {ids.length}
                </span>
              )}
              {!isDM && ownAvailable && (
                <span className="mt-auto self-end w-3 h-3 rounded-full bg-accent-bright" />
              )}
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
