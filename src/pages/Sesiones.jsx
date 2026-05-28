import { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, PageHeader, EmptyState } from '../components/Shared'
import { DateTimeFormat, isVisible, plainText } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText, { COLLECTION_LETTER } from '../components/WikiText'
import ImageLightbox from '../components/ImageLightbox'
import LazyImg from '../components/LazyImg'
import { Scroll } from 'lucide-react'
import { sectionTitleCls, detailTextCls, btnSecondary } from '../constants'


function SesionDetailInline({ sesion, onBack }) {
  const { openForm, isDM } = useApp()
  const isPlanned = !sesion.logros?.trim()
  const [lightbox, setLightbox] = useState(false)
  const backBarRef = useRef(null)
  const nameRef = useRef(null)
  const [showNameInHeader, setShowNameInHeader] = useState(false)
  const HEADER_H = 60
  useEffect(() => {
    if (!nameRef.current) return
    const backBarH = backBarRef.current?.offsetHeight ?? 0
    const observer = new IntersectionObserver(
      ([entry]) => setShowNameInHeader(!entry.isIntersecting),
      { threshold: 0, rootMargin: `-${HEADER_H + backBarH}px 0px 0px 0px` }
    )
    observer.observe(nameRef.current)
    return () => observer.disconnect()
  }, [])
  const icon = <Scroll size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <div ref={backBarRef} className="flex justify-between items-center mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        <span
          className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary leading-none truncate px-4 pointer-events-none"
          style={{ opacity: showNameInHeader ? 1 : 0, transition: 'opacity 0.2s ease' }}
        >
          {icon}{sesion.titulo || 'Sin título'}
        </span>
        {isDM && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${sesion.id}${COLLECTION_LETTER['sesiones']}}`}</span>
            <button className={btnSecondary} onClick={() => openForm('sesiones', sesion.id)}>Editar</button>
          </div>
        )}
      </div>

      <div className="flex w-full gap-4 max-sm:flex-col">
        <div className='flex-1 flex flex-col gap-2 h-fit'>
          <div className="pb-4 border-b border-border-base">
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
            <div ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
              {sesion.titulo || 'Sin título'}
            </div>
          </div>

          <div>
            <div className={'text-txt-muted text-xs flex flex-wrap max-sm:flex-col'}>
              <div className="flex items-center gap-1"><span className="font-bold text-txt-secondary">Creado:</span> <span className="whitespace-nowrap">{DateTimeFormat(sesion.createdAt)}</span></div>
              <span className="mx-4 text-accent-dim max-sm:hidden">♦</span>
              <div className="flex items-center gap-1"><span className="font-bold text-txt-secondary">Última modificación:</span> <span className="whitespace-nowrap">{DateTimeFormat(sesion.updatedAt)}</span></div>
            </div>
          </div>
        </div>

        {sesion.imagen_url && (
          <LazyImg
            src={sesion.imagen_url}
            alt={sesion.titulo || ''}
            className="max-w-full max-h-[120px] rounded-lg object-cover border border-border-base cursor-zoom-in"
            containerCls="my-1 shrink-0 max-w-[200px] h-[120px] flex items-center justify-center"
            onClick={() => setLightbox(true)}
          />
        )}
        {lightbox && <ImageLightbox src={sesion.imagen_url} alt={sesion.titulo || ''} onClose={() => setLightbox(false)} />}
      </div>

      {sesion.resumen && (
        <div className="mb-7 pb-6 border-b border-border-base">
          <div className={sectionTitleCls}>Resumen</div>
          <div className={detailTextCls}><WikiText text={sesion.resumen} /></div>
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
                className="relative mb-5 cursor-pointer flex gap-3"
                onClick={() => setSelectedId(s.id)}
              >
                <div className={`absolute left-[-21px] top-[5px] w-2.5 h-2.5 border-2 border-bg-mid ${isPlanned ? 'bg-transparent border-txt-muted' : 'bg-border-light'}`} />
                <div className="w-32 shrink-0 self-stretch min-h-[64px] bg-bg-mid overflow-hidden">
                  {s.imagen_url && (
                    <img
                      src={s.imagen_url}
                      alt={s.titulo || ''}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={e => e.target.style.display = 'none'}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-exo text-[10px] font-medium text-txt-muted mb-1.5 tracking-[0.1em] uppercase">
                    Sesión {s.numero} · {s.fecha || 'Sin fecha'}
                    {s.estado === 'borrador' && <> <Tag cls="borrador" text="Borrador" /></>}
                    {s.estado === 'secreto' && <> <Tag cls="secreto" text="Secreto" /></>}
                  </div>
                  <div className={`font-exo text-[12px] font-semibold tracking-[0.04em] mb-1 uppercase ${isPlanned ? 'text-txt-secondary' : 'text-txt-primary'}`}>
                    {s.titulo || 'Sin título'}
                  </div>
                  <div className="text-[13px] text-txt-secondary leading-relaxed">
                    {(() => { const t = plainText(s.resumen); return t.length > 180 ? t.substring(0, 180) + '…' : t })()}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
