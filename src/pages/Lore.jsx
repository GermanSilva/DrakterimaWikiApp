import { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, PageHeader, FilterPills, EmptyState } from '../components/Shared'
import { isVisible, plainText } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText, { COLLECTION_LETTER } from '../components/WikiText'
import { BookOpen, Lock } from 'lucide-react'
import { sectionTitleCls, detailTextCls, detailSectionCls, dmSectionCls, dmTitleCls, btnSecondary } from '../constants'

function LoreDetailInline({ entrada, onBack }) {
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
  const icon = <BookOpen size={18} className="inline mr-1 text-accent-bright" />
  return (
    <div>
      <div ref={backBarRef} className="flex justify-between items-center mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        <span
          className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary leading-none truncate px-4 pointer-events-none"
          style={{ opacity: showNameInHeader ? 1 : 0, transition: 'opacity 0.2s ease' }}
        >
          {icon}{entrada.titulo}
        </span>
        {isDM && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${entrada.id}${COLLECTION_LETTER['lore']}}`}</span>
            <button className={btnSecondary} onClick={() => openForm('lore', entrada.id)}>Editar</button>
          </div>
        )}
      </div>

      <div className="mb-8 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
          Lore · {entrada.categoria || 'General'}
        </div>
        <div ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {entrada.titulo}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {entrada.categoria && <Tag cls="neutral" text={entrada.categoria} />}
          {entrada.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {entrada.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {entrada.descripcion && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Descripción</div>
          <div className={detailTextCls}><WikiText text={entrada.descripcion} /></div>
        </div>
      )}
      {isDM && entrada.notas && (
        <div className={dmSectionCls}>
          <div className={dmTitleCls}><Lock size={12} className="inline mr-1" />Secretos DM</div>
          <div className={detailTextCls}><WikiText text={entrada.notas} /></div>
        </div>
      )}
      <PlayerNotes entityType="lore" entityId={entrada.id} />
    </div>
  )
}

export default function Lore() {
  const { db, openForm, isDM, currentPlayer, pendingDetail, consumePendingDetail } = useApp()
  const [filtro, setFiltro] = useState('todos')
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  if (selectedId !== null) {
    const entrada = db.lore.find(l => l.id === selectedId)
    if (entrada) return <LoreDetailInline entrada={entrada} onBack={() => setSelectedId(null)} />
  }

  const visibles = db.lore.filter(l => isVisible(l, isDM, currentPlayer))
  const cats = [...new Set(visibles.map(l => l.categoria).filter(Boolean))]
  const filtros = [
    { value: 'todos', label: 'Todos' },
    ...cats.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
  ]
  const lista = filtro === 'todos' ? visibles : visibles.filter(l => l.categoria === filtro)

  return (
    <div>
      <PageHeader eyebrow="Historia y Conocimiento" title="Lore del Mundo">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('lore')}
          >
            + Nueva Entrada
          </button>
        )}
      </PageHeader>

      <FilterPills options={filtros} value={filtro} onChange={setFiltro} />

      {lista.length === 0 ? (
        <EmptyState icon={<BookOpen size={40} />} title="Sin entradas" text="Agregá entradas de lore para documentar el mundo." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map(l => (
            <div
              key={l.id}
              className="bg-bg-card border border-border-base p-[18px] cursor-pointer transition-all relative overflow-hidden animate-card-in before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:content-[''] before:bg-border-light before:transition-colors hover:bg-bg-card-hover hover:border-accent-dim hover:before:bg-accent"
              onClick={() => setSelectedId(l.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
                  {l.titulo}
                </div>
                <BookOpen size={16} className="opacity-55 flex-shrink-0" />
              </div>
              <div className="flex flex-wrap gap-[5px] mb-2.5">
                {l.categoria && <Tag cls="neutral" text={l.categoria} />}
                {l.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                {l.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
              </div>
              <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">
                {plainText(l.descripcion)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
