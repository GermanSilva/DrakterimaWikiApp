import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, RelacionTag, PageHeader, EmptyState } from '../components/Shared'
import { isVisible } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText from '../components/WikiText'
import { Landmark, Lock } from 'lucide-react'

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

function FaccionDetailInline({ faccion, onBack }) {
  const { openForm, isDM } = useApp()
  return (
    <div>
      <div className="flex justify-between mb-7">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        {isDM && <button className={btnSecondary} onClick={() => openForm('facciones', faccion.id)}>Editar</button>}
      </div>

      <div className="mb-8 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: REGION_COLOR[faccion.region] || '#6e6e6e' }}>
          Facción · {faccion.tipo || 'Organización'}
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {faccion.nombre}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {faccion.region && <RegionTag region={faccion.region} />}
          {faccion.relacion && <RelacionTag relacion={faccion.relacion} />}
          {faccion.tipo && <Tag cls="neutral" text={faccion.tipo} />}
          {faccion.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {faccion.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {faccion.imagen_url && (
        <div className="my-4 text-center">
          <img src={faccion.imagen_url} alt={faccion.nombre} className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base" onError={e => e.target.style.display = 'none'} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-0 gap-x-8 max-md:grid-cols-1">
        <div>
          {faccion.descripcion && (
            <div className={detailSectionCls}>
              <div className={sectionTitleCls}>Descripción</div>
              <div className={detailTextCls}><WikiText text={faccion.descripcion} /></div>
            </div>
          )}
        </div>
        <div>
          {isDM && faccion.secreto && (
            <div className={dmSectionCls}>
              <div className={dmTitleCls}><Lock size={10} className="inline mr-1" />Objetivos secretos</div>
              <div className={detailTextCls}><WikiText text={faccion.secreto} /></div>
            </div>
          )}
          {isDM && faccion.notas && (
            <div className={dmSectionCls}>
              <div className={dmTitleCls}><Lock size={10} className="inline mr-1" />Notas DM</div>
              <div className={detailTextCls}><WikiText text={faccion.notas} /></div>
            </div>
          )}
        </div>
      </div>
      <PlayerNotes entityType="facciones" entityId={faccion.id} />
    </div>
  )
}

export default function Facciones() {
  const { db, openForm, isDM, currentPlayer } = useApp()
  const [selectedId, setSelectedId] = useState(null)

  if (selectedId !== null) {
    const faccion = db.facciones.find(f => f.id === selectedId)
    if (faccion) return <FaccionDetailInline faccion={faccion} onBack={() => setSelectedId(null)} />
  }

  const lista = db.facciones.filter(f => isVisible(f, isDM, currentPlayer))

  return (
    <div>
      <PageHeader eyebrow="Política y Poder" title="Facciones">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('facciones')}
          >
            + Nueva Facción
          </button>
        )}
      </PageHeader>

      {lista.length === 0 ? (
        <EmptyState icon={<Landmark size={40} />} title="Sin facciones" text="Agregá facciones para definir el poder en Drakterima." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map(f => (
            <div
              key={f.id}
              className="bg-bg-card border border-border-base p-[18px] cursor-pointer transition-all relative overflow-hidden animate-card-in before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:content-[''] before:bg-border-light before:transition-colors hover:bg-bg-card-hover hover:border-accent-dim hover:before:bg-accent"
              onClick={() => setSelectedId(f.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
                  {f.nombre}
                </div>
                <Landmark size={16} className="opacity-55 flex-shrink-0" />
              </div>
              <div className="flex flex-wrap gap-[5px] mb-2.5">
                {f.tipo && <Tag cls="neutral" text={f.tipo} />}
                {f.region && <RegionTag region={f.region} />}
                {f.relacion && <RelacionTag relacion={f.relacion} />}
                {f.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                {f.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
              </div>
              <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">
                {f.descripcion || ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
