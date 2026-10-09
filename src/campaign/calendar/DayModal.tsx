import { Plus } from 'lucide-react'
import { btnPrimary } from '../../constants'
import type { BusySlot, Disponibilidad, PlayerAvailability } from '../../data'
import { asBlock, clipBlockToDay, sessionSlotsOnDay, shortTime, type Block, type MemberMarker } from './availabilityCalc'
import { SESION_COLOR, formatFechaLarga } from './format'
import { ModalShell } from './ModalShell'

const HOUR_MARKS = [6, 9, 12, 15, 18, 21, 0, 3, 6]
const HOUR_LINES = Array.from({ length: 23 }, (_, i) => (i + 1) * 60)
const MIDNIGHT_MIN = 18 * 60 // 00:00 is 18 h after the 06:00 window start
const btnSesion =
  'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-[#d4af37] text-[#241c05] hover:bg-[#e0c04f] border-none'
const BUSY_STYLE = { backgroundImage: 'repeating-linear-gradient(45deg, #52525b, #52525b 4px, #3f3f46 4px, #3f3f46 8px)', color: '#e4e4e7' }

interface TimelineBlock {
  key: string
  block: Block
  color?: string
  textColor?: string
  style?: React.CSSProperties
  label: string
  /** Makes the block a button. */
  onClick?: () => void
  ariaLabel?: string
}

function Timeline({ label, fecha, blocks, unavailable }: { label: React.ReactNode; fecha: string; blocks: TimelineBlock[]; unavailable?: { onClick?: () => void; ariaLabel: string } | null }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-[88px] flex-shrink-0 text-[12px] text-txt-secondary truncate">{label}</div>
      <div className="relative flex-1 h-6 bg-bg-mid border border-border-base">
        {unavailable ? (
          unavailable.onClick ? (
            <button
              type="button"
              aria-label={unavailable.ariaLabel}
              onClick={unavailable.onClick}
              className="absolute inset-0 flex items-center justify-center font-exo text-[10px] tracking-[0.1em] uppercase text-red-400 bg-black/20 cursor-pointer"
            >
              No disponible
            </button>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center font-exo text-[10px] tracking-[0.1em] uppercase text-red-400 bg-black/20">No disponible</div>
          )
        ) : (
          <>
            {HOUR_LINES.map((min) => (
              <div key={min} className={`absolute top-0 h-full w-px ${min === MIDNIGHT_MIN ? 'bg-accent/50' : 'bg-border-base'}`} style={{ left: `${(min / 1440) * 100}%` }} />
            ))}
            {blocks.map((b) => {
              const seg = clipBlockToDay(b.block, fecha)
              if (!seg) return null
              const pos = {
                left: `${(seg.startMin / 1440) * 100}%`,
                width: `${((seg.endMin - seg.startMin) / 1440) * 100}%`,
                backgroundColor: b.color,
                color: b.textColor ?? '#fff',
                ...b.style,
              }
              const cls = 'absolute top-0 h-full flex items-center justify-center overflow-hidden font-exo text-[9px] font-semibold whitespace-nowrap'
              return b.onClick ? (
                <button key={b.key} type="button" aria-label={b.ariaLabel} title={b.label} onClick={b.onClick} className={`${cls} cursor-pointer hover:brightness-110`} style={pos}>
                  {b.label}
                </button>
              ) : (
                <div key={b.key} title={b.label} className={cls} style={pos}>
                  {b.label}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

const range = (b: { hora_inicio: string; hora_fin: string }) => `${shortTime(b.hora_inicio)}–${shortTime(b.hora_fin)}`

interface Props {
  fecha: string
  isDM: boolean
  meId: string
  members: readonly MemberMarker[]
  /** Rows of this campaign's members only (already filtered). */
  rows: readonly PlayerAvailability[]
  busy: readonly BusySlot[]
  slots: readonly Disponibilidad[]
  onClose: () => void
  onAddMine: () => void
  onEditMine: (row: PlayerAvailability) => void
  onAddSession: () => void
  onEditSession: (slot: Disponibilidad) => void
}

/** One day: the session slots and a timeline per member (personal windows, unavailable day, busy slots). */
export function DayModal({ fecha, isDM, meId, members, rows, busy, slots, onClose, onAddMine, onEditMine, onAddSession, onEditSession }: Props) {
  const sessionBlocks: TimelineBlock[] = sessionSlotsOnDay(slots, fecha).flatMap((s) => {
    const block = asBlock(s)
    return block
      ? [{
          key: String(s.id), block, color: SESION_COLOR, textColor: '#241c05', label: range(block),
          ...(isDM ? { onClick: () => onEditSession(s), ariaLabel: `Editar sesión ${range(block)}` } : {}),
        }]
      : []
  })

  return (
    <ModalShell title={formatFechaLarga(fecha)} onClose={onClose}>
      <div className="flex pl-[100px] mb-2">
        <div className="relative flex-1 h-4">
          {HOUR_MARKS.map((h, i) => (
            <span key={i} className="absolute -translate-x-1/2 text-[10px] text-txt-muted font-exo" style={{ left: `${(i / (HOUR_MARKS.length - 1)) * 100}%` }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 mb-3 pb-3 border-b border-border-base">
        <Timeline label="Sesión" fecha={fecha} blocks={sessionBlocks} />
      </div>

      <div className="flex flex-col gap-1">
        {members.map((m) => {
          const own = m.userId === meId
          const mine = rows.filter((r) => r.user_id === m.userId)
          const off = mine.find((r) => r.tipo === 'no_disponible' && r.fecha === fecha)
          const blocks: TimelineBlock[] = [
            ...mine.flatMap((r) => {
              const block = r.tipo === 'personal' ? asBlock(r) : null
              return block
                ? [{
                    key: `p${r.id}`, block, color: m.color, label: range(block),
                    ...(own ? { onClick: () => onEditMine(r), ariaLabel: `Editar mi disponibilidad ${range(block)}${r.campaign_id ? ' (solo esta campaña)' : ''}` } : {}),
                  }]
                : []
            }),
            ...busy
              .filter((s) => s.user_id === m.userId)
              .map((s, i) => ({ key: `b${i}`, block: s, style: BUSY_STYLE, label: `Ocupado ${range(s)}` })),
          ]
          return (
            <Timeline
              key={m.userId}
              label={<span title={m.name}><span className="font-bold" style={{ color: m.color }}>{m.label}</span> {m.name.split(' ')[0]}</span>}
              fecha={fecha}
              blocks={blocks}
              unavailable={off ? { ariaLabel: own ? 'Editar mi día no disponible' : `${m.name}: no disponible`, onClick: own ? () => onEditMine(off) : undefined } : null}
            />
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {isDM && (
          <button type="button" className={btnSesion} onClick={onAddSession}>
            <Plus size={14} aria-hidden="true" /> Agregar sesión
          </button>
        )}
        <button type="button" className={btnPrimary} onClick={onAddMine}>
          <Plus size={14} aria-hidden="true" /> Agregar mi disponibilidad
        </button>
      </div>
    </ModalShell>
  )
}
