import { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, PageHeader, FilterPills, EmptyState } from '../components/Shared'
import { regionLabel, regionOptions, isVisible, plainText } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText, { COLLECTION_LETTER } from '../components/WikiText'
import ImageLightbox from '../components/ImageLightbox'
import LazyImg from '../components/LazyImg'
import { Map, Lock } from 'lucide-react'
import { sectionTitleCls, detailTextCls, detailSectionCls, dmSectionCls, dmTitleCls, btnSecondary, REGION_COLOR } from '../constants'

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  ...regionOptions.map(r => ({ value: r, label: regionLabel[r] })),
]

function LugarDetailInline({ lugar, onBack }) {
  const { openForm, isDM } = useApp()
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
  const icon = <Map size={18} className="inline mr-1 text-accent-bright" />
  return (
    <div>
      <div ref={backBarRef} className="flex justify-between items-center mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        <span
          className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary leading-none truncate px-4 pointer-events-none"
          style={{ opacity: showNameInHeader ? 1 : 0, transition: 'opacity 0.2s ease' }}
        >
          {icon}{lugar.nombre}
        </span>
        {isDM && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${lugar.id}${COLLECTION_LETTER['lugares']}}`}</span>
            <button className={btnSecondary} onClick={() => openForm('lugares', lugar.id)}>Editar</button>
          </div>
        )}
      </div>

      <div className="mb-8 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: REGION_COLOR[lugar.region] || '#6e6e6e' }}>
          {lugar.tipo || 'Lugar'} · {regionLabel[lugar.region] || lugar.region}
        </div>
        <div ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {lugar.nombre}
        </div>
        {lugar.subtitulo && (
          <div className="font-exo text-[13px] text-txt-muted italic mt-1.5">{lugar.subtitulo}</div>
        )}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <RegionTag region={lugar.region} />
          {lugar.tipo && <Tag cls="neutral" text={lugar.tipo} />}
          {lugar.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {lugar.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {lugar.imagen_url && (
        <LazyImg
          src={lugar.imagen_url}
          alt={lugar.nombre}
          className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base cursor-zoom-in"
          containerCls="my-4 h-[280px] flex items-center justify-center text-center"
          onClick={() => setLightbox(true)}
        />
      )}
      {lightbox && <ImageLightbox src={lugar.imagen_url} alt={lugar.nombre} onClose={() => setLightbox(false)} />}

      {lugar.descripcion && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Descripción</div>
          <div className={detailTextCls}><WikiText text={lugar.descripcion} /></div>
        </div>
      )}
      {isDM && lugar.notas && (
        <div className={dmSectionCls}>
          <div className={dmTitleCls}><Lock size={12} className="inline mr-1" />Notas DM</div>
          <div className={detailTextCls}><WikiText text={lugar.notas} /></div>
        </div>
      )}
      <PlayerNotes entityType="lugares" entityId={lugar.id} />
    </div>
  )
}

export default function Lugares() {
  const { db, openForm, isDM, currentPlayer, pendingDetail, consumePendingDetail } = useApp()
  const [filtro, setFiltro] = useState('todos')
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  if (selectedId !== null) {
    const lugar = db.lugares.find(l => l.id === selectedId)
    if (lugar) return <LugarDetailInline lugar={lugar} onBack={() => setSelectedId(null)} />
  }

  const lista = db.lugares
    .filter(l => isVisible(l, isDM, currentPlayer))
    .filter(l => filtro === 'todos' || l.region === filtro)

  return (
    <div>
      <PageHeader eyebrow="Geografía" title="Lugares">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('lugares')}
          >
            + Nuevo Lugar
          </button>
        )}
      </PageHeader>

      <FilterPills options={FILTROS} value={filtro} onChange={setFiltro} />

      {lista.length === 0 ? (
        <EmptyState icon={<Map size={40} />} title="Sin lugares" text="Agregá lugares para poblar el mundo de Drakterima." />
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
                  {l.nombre}
                </div>
                <Map size={16} className="opacity-55 flex-shrink-0" />
              </div>
              <div className="flex flex-wrap gap-[5px] mb-2.5">
                {l.tipo && <Tag cls="neutral" text={l.tipo} />}
                <RegionTag region={l.region} />
                {l.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                {l.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
              </div>
              {l.subtitulo && (
                <div className="font-exo text-[11px] text-accent-dim italic mb-2">{l.subtitulo}</div>
              )}
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
