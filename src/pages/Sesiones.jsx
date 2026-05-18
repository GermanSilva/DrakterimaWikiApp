import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, PageHeader, EmptyState } from '../components/Shared'
import { isVisible } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText, { COLLECTION_LETTER } from '../components/WikiText'
import { Scroll } from 'lucide-react'

const sectionTitleCls = 'font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-dim uppercase mb-3.5'
const detailTextCls = 'text-sm leading-7 text-txt-secondary'
const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'

function renderResumen(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    if (/^\d+\./.test(line.trim())) {
      return (
        <div key={i} className="py-1.5 pl-3.5 border-l-2 border-border-base mb-1.5 text-sm text-txt-secondary hover:border-l-accent-dim transition-colors">
          {line}
        </div>
      )
    }
    return <span key={i}>{line}<br /></span>
  })
}

function SesionDetailInline({ sesion, onBack }) {
  const { openForm, isDM } = useApp()
  const isPlanned = !sesion.logros?.trim()

  return (
    <div>
      <div className="flex justify-between mb-7">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        {isDM && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${sesion.id}${COLLECTION_LETTER['sesiones']}}`}</span>
            <button className={btnSecondary} onClick={() => openForm('sesiones', sesion.id)}>Editar</button>
          </div>
        )}
      </div>

      <div className="mb-8 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
          Sesión {sesion.numero}
          {sesion.fecha && <> · {sesion.fecha}</>}
          {isPlanned && (
            <span className="font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted border border-border-light px-2 py-0.5 ml-2.5 align-middle">
              Planificada
            </span>
          )}
          {sesion.estado === 'borrador' && <> <Tag cls="borrador" text="Borrador" /></>}
          {sesion.estado === 'secreto' && <> <Tag cls="secreto" text="Secreto" /></>}
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {sesion.titulo || 'Sin título'}
        </div>
      </div>

      {sesion.resumen && (
        <div className="mb-7 pb-6 border-b border-border-base">
          <div className={sectionTitleCls}>Resumen</div>
          <div className={detailTextCls}>{renderResumen(sesion.resumen)}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
        {sesion.logros && (
          <div className="mb-7 pb-6">
            <div className={sectionTitleCls}>Momentos importantes</div>
            <div className={detailTextCls}><WikiText text={sesion.logros} /></div>
          </div>
        )}
        {isDM && sesion.ganchos && (
          <div className="mb-7 pb-6">
            <div className={sectionTitleCls}>Ganchos pendientes</div>
            <div className={detailTextCls}><WikiText text={sesion.ganchos} /></div>
          </div>
        )}
      </div>
      <PlayerNotes entityType="sesiones" entityId={sesion.id} />
    </div>
  )
}

export default function Sesiones() {
  const { db, openForm, pendingDetail, consumePendingDetail, isDM, currentPlayer } = useApp()
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  if (selectedId !== null) {
    const sesion = db.sesiones.find(s => s.id === selectedId)
    if (sesion) {
      return <SesionDetailInline sesion={sesion} onBack={() => setSelectedId(null)} />
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Crónica" title="Sesiones">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('sesiones')}
          >
            + Nueva Sesión
          </button>
        )}
      </PageHeader>

      {db.sesiones.length === 0 ? (
        <EmptyState icon={<Scroll size={40} />} title="Sin sesiones registradas" text="Registrá tu primera sesión para comenzar la crónica de Drakterima." />
      ) : (
        <div className="relative pl-6 timeline-wrap">
          {[...db.sesiones].filter(s => isVisible(s, isDM, currentPlayer)).reverse().map(s => {
            const isPlanned = !s.logros?.trim()
            return (
              <div
                key={s.id}
                className="relative mb-5 cursor-pointer"
                onClick={() => setSelectedId(s.id)}
              >
                <div className={`absolute left-[-21px] top-[5px] w-2.5 h-2.5 border-2 border-bg-mid ${isPlanned ? 'bg-transparent border-txt-muted' : 'bg-border-light'}`} />
                <div className="font-exo text-[10px] font-medium text-txt-muted mb-1.5 tracking-[0.1em] uppercase">
                  Sesión {s.numero} · {s.fecha || 'Sin fecha'}
                  {s.estado === 'borrador' && <> <Tag cls="borrador" text="Borrador" /></>}
                  {s.estado === 'secreto' && <> <Tag cls="secreto" text="Secreto" /></>}
                </div>
                <div className={`font-exo text-[12px] font-semibold tracking-[0.04em] mb-1 uppercase ${isPlanned ? 'text-txt-secondary' : 'text-txt-primary'}`}>
                  {s.titulo || 'Sin título'}
                </div>
                <div className="text-[13px] text-txt-secondary leading-relaxed">
                  {(s.resumen || '').substring(0, 180)}{(s.resumen || '').length > 180 ? '...' : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
