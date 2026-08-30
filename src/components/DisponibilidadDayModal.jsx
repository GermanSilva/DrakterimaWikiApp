import { useEffect } from 'react'
import { useApp } from '../AppContext'
import { X, Plus } from 'lucide-react'
import { clipBlockToDay } from '../helpers/disponibilidadCalc'
import { btnPrimary, btnDanger, btnSecondary, PLAYER_MARKERS } from '../constants'

const HOUR_MARKS = [6, 9, 12, 15, 18, 21, 0, 3, 6]
const HOUR_LINES = Array.from({ length: 23 }, (_, i) => (i + 1) * 60)
const MIDNIGHT_MIN = 18 * 60 // 00:00 cae 18hs después de las 06:00, inicio de la ventana
const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const SESION_COLOR = '#d4af37' // dorado
const SESION_TEXT_COLOR = '#ffffff' // texto oscuro por contraste sobre el dorado

// Nota: el color va hardcodeado como clase Tailwind literal (bg-[#d4af37]) porque
// el compilador no detecta clases arbitrarias armadas por interpolación de variables JS.
const btnSesion = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-[#d4af37] text-[#241c05] hover:bg-[#e0c04f] border-none'

function firstName(nombre) {
  return (nombre || '').split(' ')[0]
}

function formatFechaLarga(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${DIAS_LARGO[date.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

function TimelineRow({ label, blocks, fecha, onBlockClick, color = SESION_COLOR, textColor = '#fff', unavailable = false }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-[50px] flex-shrink-0 text-[12px] text-txt-secondary truncate" title={label}>{label}</div>
      <div className="relative flex-1 h-6 bg-bg-mid border border-border-base">
        {unavailable ? (
          <div className="absolute inset-0 flex items-center justify-center font-exo text-[10px] tracking-[0.1em] uppercase text-red-400 bg-black/20">
            No disponible
          </div>
        ) : (
          <>
            {HOUR_LINES.map(min => (
              <div
                key={min}
                className={`absolute top-0 h-full w-px ${min === MIDNIGHT_MIN ? 'bg-accent/50' : 'bg-border-base'}`}
                style={{ left: `${(min / 1440) * 100}%` }}
              />
            ))}
            {blocks.map(b => {
              const seg = clipBlockToDay(b, fecha)
              if (!seg) return null
              return (
                <div
                  key={b.id}
                  onClick={onBlockClick ? () => onBlockClick(b) : undefined}
                  className={`absolute top-0 h-full flex items-center justify-center overflow-visible font-exo text-[9px] font-semibold whitespace-nowrap ${onBlockClick ? 'cursor-pointer hover:brightness-110' : ''}`}
                  style={{
                    left: `${(seg.startMin / 1440) * 100}%`,
                    width: `${((seg.endMin - seg.startMin) / 1440) * 100}%`,
                    backgroundColor: color,
                    color: textColor,
                  }}
                  title={`${b.hora_inicio} - ${b.hora_fin}`}
                >
                  {b.hora_inicio}–{b.hora_fin}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

export default function DisponibilidadDayModal({ fecha, onClose }) {
  const { db, isDM, currentPlayer, openForm, save, remove } = useApp()
  const bloques = db.disponibilidad || []
  const sesionBlocks = bloques.filter(b => b.tipo === 'sesion')
  const isPjUnavailable = pjId => bloques.some(b => b.tipo === 'no_disponible' && b.pj_id === pjId && b.fecha === fecha)
  const ownUnavailableBlock = currentPlayer
    ? bloques.find(b => b.tipo === 'no_disponible' && b.pj_id === currentPlayer.id && b.fecha === fecha)
    : null

  function toggleUnavailable() {
    if (ownUnavailableBlock) {
      remove('disponibilidad', ownUnavailableBlock.id)
    } else {
      save('disponibilidad', { tipo: 'no_disponible', pj_id: currentPlayer.id, fecha })
    }
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/[.82] z-[250] backdrop-blur-[4px] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[min(760px,92vw)] max-h-[85vh] overflow-y-auto bg-bg-card border border-border-light p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="font-exo text-[16px] font-bold text-txt-primary uppercase tracking-[0.05em]">
            {formatFechaLarga(fecha)}
          </div>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-primary transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex pl-[64px] mb-2">
          <div className="relative flex-1 h-4">
            {HOUR_MARKS.map((h, i) => (
              <span
                key={i}
                className="absolute -translate-x-1/2 text-[10px] text-txt-muted font-exo"
                style={{ left: `${(i / (HOUR_MARKS.length - 1)) * 100}%` }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 mb-3 pb-3 border-b border-border-base">
          <TimelineRow
            label="Sesión"
            blocks={sesionBlocks}
            fecha={fecha}
            color={SESION_COLOR}
            textColor={SESION_TEXT_COLOR}
            onBlockClick={isDM ? b => openForm('disponibilidad', b.id) : undefined}
          />
        </div>

        <div className="flex flex-col gap-1">
          {(db.pjs || []).map(pj => (
            <TimelineRow
              key={pj.id}
              label={firstName(pj.nombre)}
              blocks={bloques.filter(b => b.pj_id === pj.id && b.tipo === 'personal')}
              fecha={fecha}
              color={PLAYER_MARKERS[pj.id]?.color}
              unavailable={isPjUnavailable(pj.id)}
              onBlockClick={currentPlayer && pj.id === currentPlayer.id ? b => openForm('disponibilidad', b.id) : undefined}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {isDM && (
            <button
              className={btnSesion}
              onClick={() => openForm('disponibilidad', null, { fecha, tipo: 'sesion' })}
            >
              <Plus size={14} /> Agregar sesión
            </button>
          )}
          {!isDM && currentPlayer && (
            <>
              <button
                className={ownUnavailableBlock ? btnSecondary : btnDanger}
                onClick={toggleUnavailable}
              >
                {ownUnavailableBlock ? 'Quitar "no disponible"' : 'Marcar como no disponible'}
              </button>
              <button
                className={`${btnPrimary} flex items-center gap-1.5`}
                onClick={() => openForm('disponibilidad', null, { fecha })}
              >
                <Plus size={14} /> Agregar disponibilidad
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
