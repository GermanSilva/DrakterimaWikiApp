import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, PageHeader, FilterPills, EmptyState } from '../components/Shared'
import { regionLabel, regionOptions, isVisible } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText, { COLLECTION_LETTER } from '../components/WikiText'
import ImageLightbox from '../components/ImageLightbox'
import { Map, Lock } from 'lucide-react'

const REGION_COLOR = {
  magral:  '#7aad82',
  nezor:   '#c4834a',
  heladas: '#7aaad0',
  islas:   '#9090c0',
}

const sectionTitleCls = 'font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-dim uppercase mb-2'
const detailTextCls = 'text-sm leading-7 text-txt-secondary'
const detailSectionCls = 'mt-5 pt-4 border-t border-border-base'
const dmSectionCls = 'mt-5 pt-4 border-t-2 border-t-accent'
const dmTitleCls = 'font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-bright uppercase mb-2'
const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  ...regionOptions.map(r => ({ value: r, label: regionLabel[r] })),
]

function LugarDetailInline({ lugar, onBack }) {
  const { openForm, isDM } = useApp()
  const [lightbox, setLightbox] = useState(false)
  return (
    <div>
      <div className="flex justify-between mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
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
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
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
        <div className="my-4 text-center">
          <img src={lugar.imagen_url} alt={lugar.nombre} className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base cursor-zoom-in" onError={e => e.target.style.display = 'none'} onClick={() => setLightbox(true)} />
        </div>
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
          <div className={dmTitleCls}><Lock size={10} className="inline mr-1" />Notas DM</div>
          <div className={detailTextCls}><WikiText text={lugar.notas} /></div>
        </div>
      )}
      <PlayerNotes entityType="lugares" entityId={lugar.id} />
    </div>
  )
}

export default function Lugares() {
  const { db, openForm, isDM, currentPlayer } = useApp()
  const [filtro, setFiltro] = useState('todos')
  const [selectedId, setSelectedId] = useState(null)

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
                {l.descripcion || ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
