import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, PageHeader, EmptyState } from '../components/Shared'
import { isVisible } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText from '../components/WikiText'
import { Gem } from 'lucide-react'

const sectionTitleCls = 'font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-dim uppercase mb-2'
const detailTextCls = 'text-sm leading-7 text-txt-secondary'
const detailSectionCls = 'mt-5 pt-4 border-t border-border-base'
const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'

function ItemDetailInline({ item, onBack }) {
  const { openForm, isDM } = useApp()
  return (
    <div>
      <div className="flex justify-between mb-7">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        {isDM && <button className={btnSecondary} onClick={() => openForm('items', item.id)}>Editar</button>}
      </div>

      <div className="mb-8 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
          {item.tipo || 'Ítem'} · {item.rareza || ''}
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {item.nombre}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {item.rareza && <Tag cls="neutral" text={item.rareza} />}
          {item.tipo && <Tag cls="orden" text={item.tipo} />}
          {item.requiere_sintonia && <Tag cls="culto" text="Sintonía" />}
          {item.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {item.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {item.imagen_url && (
        <div className="my-4 text-center">
          <img src={item.imagen_url} alt={item.nombre} className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base" onError={e => e.target.style.display = 'none'} />
        </div>
      )}

      {item.poseedor && (
        <div className="mb-3 mt-3">
          <label className="block font-exo text-[9px] font-medium tracking-[0.2em] text-txt-muted uppercase mb-0.5">Poseedor actual</label>
          <span className="text-sm text-txt-primary">{item.poseedor}</span>
        </div>
      )}
      {item.descripcion && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Propiedades</div>
          <div className={detailTextCls}><WikiText text={item.descripcion} /></div>
        </div>
      )}
      {item.lore && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Historia</div>
          <div className={detailTextCls}><WikiText text={item.lore} /></div>
        </div>
      )}
      <PlayerNotes entityType="items" entityId={item.id} />
    </div>
  )
}

export default function Items() {
  const { db, openForm, isDM, currentPlayer, pendingDetail, consumePendingDetail } = useApp()
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  if (selectedId !== null) {
    const item = db.items.find(it => it.id === selectedId)
    if (item) return <ItemDetailInline item={item} onBack={() => setSelectedId(null)} />
  }

  const lista = db.items.filter(it => isVisible(it, isDM, currentPlayer))

  return (
    <div>
      <PageHeader eyebrow="Homebrew · Tesoros" title="Ítems">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('items')}
          >
            + Nuevo Ítem
          </button>
        )}
      </PageHeader>

      {lista.length === 0 ? (
        <EmptyState icon={<Gem size={40} />} title="Sin ítems registrados" text="Agregá ítems mágicos, objetos especiales o reglas homebrew de tu campaña." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map(it => (
            <div
              key={it.id}
              className="bg-bg-card border border-border-base p-[18px] cursor-pointer transition-all relative overflow-hidden animate-card-in before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:content-[''] before:bg-border-light before:transition-colors hover:bg-bg-card-hover hover:border-accent-dim hover:before:bg-accent"
              onClick={() => setSelectedId(it.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
                  {it.nombre}
                </div>
                <Gem size={16} className="opacity-55 flex-shrink-0" />
              </div>
              <div className="flex flex-wrap gap-[5px] mb-2.5">
                {it.rareza && <Tag cls="neutral" text={it.rareza} />}
                {it.tipo && <Tag cls="orden" text={it.tipo} />}
                {it.requiere_sintonia && <Tag cls="culto" text="Sintonía" />}
                {it.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                {it.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
              </div>
              <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">
                {it.descripcion || ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
