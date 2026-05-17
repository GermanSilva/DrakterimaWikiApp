import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, RelacionTag, PageHeader, EmptyState, FilterPills } from '../components/Shared'
import { isVisible } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText, { COLLECTION_LETTER } from '../components/WikiText'
import { Users, Lock } from 'lucide-react'

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
  { value: 'aliado', label: 'Aliados' },
  { value: 'neutral', label: 'Neutrales' },
  { value: 'enemigo', label: 'Enemigos' },
]

function PNJDetailInline({ pnj, onBack }) {
  const { openForm, isDM } = useApp()
  return (
    <div>
      <div className="flex justify-between mb-7">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        {isDM && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">{`{${pnj.id}${COLLECTION_LETTER['pnjs']}}`}</span>
            <button className={btnSecondary} onClick={() => openForm('pnjs', pnj.id)}>Editar</button>
          </div>
        )}
      </div>

      <div className="mb-8 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: REGION_COLOR[pnj.region] || '#6e6e6e' }}>
          PNJ · {pnj.rol || 'Personaje'}
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {pnj.nombre}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {pnj.region && <RegionTag region={pnj.region} />}
          {pnj.relacion && <RelacionTag relacion={pnj.relacion} />}
          {pnj.faccion && <Tag cls="orden" text={pnj.faccion} />}
          {pnj.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {pnj.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {pnj.imagen_url && (
        <div className="my-4 text-center">
          <img src={pnj.imagen_url} alt={pnj.nombre} className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base" onError={e => e.target.style.display = 'none'} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-0 gap-x-8 max-md:grid-cols-1">
        <div>
          {pnj.descripcion && (
            <div className={detailSectionCls}>
              <div className={sectionTitleCls}>Descripción</div>
              <div className={detailTextCls}><WikiText text={pnj.descripcion} /></div>
            </div>
          )}
          {pnj.historia && (
            <div className={detailSectionCls}>
              <div className={sectionTitleCls}>Historia</div>
              <div className={detailTextCls}><WikiText text={pnj.historia} /></div>
            </div>
          )}
        </div>
        <div>
          {isDM && pnj.secreto && (
            <div className={dmSectionCls}>
              <div className={dmTitleCls}><Lock size={10} className="inline mr-1" />Motivaciones secretas</div>
              <div className={detailTextCls}><WikiText text={pnj.secreto} /></div>
            </div>
          )}
          {isDM && pnj.notas && (
            <div className={dmSectionCls}>
              <div className={dmTitleCls}><Lock size={10} className="inline mr-1" />Notas DM</div>
              <div className={detailTextCls}><WikiText text={pnj.notas} /></div>
            </div>
          )}
        </div>
      </div>
      <PlayerNotes entityType="pnjs" entityId={pnj.id} />
    </div>
  )
}

export default function PNJs() {
  const { db, openForm, pendingDetail, consumePendingDetail, isDM, currentPlayer } = useApp()
  const [filtro, setFiltro] = useState('todos')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  if (selectedId !== null) {
    const pnj = db.pnjs.find(p => p.id === selectedId)
    if (pnj) return <PNJDetailInline pnj={pnj} onBack={() => setSelectedId(null)} />
  }

  const lista = db.pnjs
    .filter(p => isVisible(p, isDM, currentPlayer))
    .filter(p => filtro === 'todos' || p.relacion === filtro)
    .filter(p => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return [p.nombre, p.rol, p.faccion].some(v => (v || '').toLowerCase().includes(q))
    })

  return (
    <div>
      <PageHeader eyebrow="Personajes No Jugadores" title="PNJs">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('pnjs')}
          >
            + Nuevo PNJ
          </button>
        )}
      </PageHeader>

      <FilterPills options={FILTROS} value={filtro} onChange={setFiltro} />

      <div className="mb-5">
        <input
          className="w-full bg-bg-card border border-border-light text-txt-primary px-3.5 py-2.5 font-barlow text-[13px] outline-none transition-colors focus:border-accent-dim placeholder:text-txt-muted"
          placeholder="Buscar por nombre, rol o facción…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={<Users size={40} />}
          title="Sin resultados"
          text={query ? 'No hay PNJs que coincidan con la búsqueda.' : 'Agregá personajes no jugadores para poblar Drakterima.'}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map(p => (
            <div
              key={p.id}
              className="bg-bg-card border border-border-base p-[18px] cursor-pointer transition-all relative overflow-hidden animate-card-in before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:content-[''] before:bg-border-light before:transition-colors hover:bg-bg-card-hover hover:border-accent-dim hover:before:bg-accent"
              onClick={() => setSelectedId(p.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
                  {p.nombre}
                </div>
                <div className="flex items-center gap-1.5">
                  {isDM && p.secreto && <Lock size={10} className="opacity-45" title="Tiene secreto DM" />}
                  <Users size={16} className="opacity-55" />
                </div>
              </div>
              <div className="flex flex-wrap gap-[5px] mb-2.5">
                {p.rol && <Tag cls="neutral" text={p.rol} />}
                {p.region && <RegionTag region={p.region} />}
                {p.relacion && <RelacionTag relacion={p.relacion} />}
                {p.faccion && <Tag cls="orden" text={p.faccion} />}
                {p.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                {p.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
              </div>
              <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">
                {p.descripcion || 'Sin descripción.'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
