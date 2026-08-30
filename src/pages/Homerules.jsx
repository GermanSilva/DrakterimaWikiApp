import { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, PageHeader, EmptyState } from '../components/Shared'
import { isVisible, plainText } from '../helpers'
import WikiText, { COLLECTION_LETTER } from '../components/WikiText'
import { Hammer } from 'lucide-react'
import { sectionTitleCls, detailTextCls, detailSectionCls, btnSecondary } from '../constants'

function HomeruleDetailInline({ regla, onBack }) {
  const { openForm, isDM } = useApp()
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
  const icon = <Hammer size={18} className="inline mr-1 text-accent-bright" />
  return (
    <div>
      <div ref={backBarRef} className="flex justify-between items-center mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        <span
          className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary leading-none truncate px-4 pointer-events-none"
          style={{ opacity: showNameInHeader ? 1 : 0, transition: 'opacity 0.2s ease' }}
        >
          {icon}{regla.nombre}
        </span>
        {isDM && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${regla.id}${COLLECTION_LETTER['homebrew_rules']}}`}</span>
            <button className={btnSecondary} onClick={() => openForm('homebrew_rules', regla.id)}>Editar</button>
          </div>
        )}
      </div>

      <div className="mb-8 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
          Homebrew · Regla
        </div>
        <div ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {regla.nombre}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {regla.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {regla.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {regla.texto && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Texto</div>
          <div className={detailTextCls}><WikiText text={regla.texto} /></div>
        </div>
      )}
    </div>
  )
}

export default function Homerules() {
  const { db, openForm, isDM, currentPlayer, pendingDetail, consumePendingDetail } = useApp()
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  const reglas = db.homebrew_rules || []

  if (selectedId !== null) {
    const regla = reglas.find(r => r.id === selectedId)
    if (regla) return <HomeruleDetailInline regla={regla} onBack={() => setSelectedId(null)} />
  }

  const visibles = reglas.filter(r => isVisible(r, isDM, currentPlayer))

  return (
    <div>
      <PageHeader eyebrow="Homebrew" title="Homerules">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('homebrew_rules')}
          >
            + Nueva Regla
          </button>
        )}
      </PageHeader>

      {visibles.length === 0 ? (
        <EmptyState icon={<Hammer size={40} />} title="Sin reglas" text="Agregá reglas homebrew para documentar las variantes de la mesa." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {visibles.map(r => (
            <div
              key={r.id}
              className="bg-bg-card border border-border-base p-[18px] cursor-pointer transition-all relative overflow-hidden animate-card-in before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:content-[''] before:bg-border-light before:transition-colors hover:bg-bg-card-hover hover:border-accent-dim hover:before:bg-accent"
              onClick={() => setSelectedId(r.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
                  {r.nombre}
                </div>
                <Hammer size={16} className="opacity-55 flex-shrink-0" />
              </div>
              {(r.estado === 'borrador' || r.estado === 'secreto') && (
                <div className="flex flex-wrap gap-[5px] mb-2.5">
                  {r.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                  {r.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
                </div>
              )}
              <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">
                {plainText(r.texto)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
