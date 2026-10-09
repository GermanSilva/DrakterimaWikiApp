import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../AppContext'
import { isVisible, readStateMap, getViewerId } from '../helpers'
import { isPjUnread } from '../helpers/pjSections'
import { PageHeader, EmptyState, RegionTag } from '../components/Shared'
import { btnSecondary, REGION_COLOR } from '../constants'
import { Shield } from 'lucide-react'
import PJCard from './pj/PJCard'
import PJDetail from './pj/PJDetail'

export default function PJs() {
  const { db, openForm, remove, isDM, currentPlayer, pendingDetail, consumePendingDetail } = useApp()
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)
  const [query, setQuery] = useState('')
  const viewerId = getViewerId(isDM, currentPlayer)
  const readState = useMemo(() => readStateMap(db.read_state), [db.read_state])

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  if (selectedId !== null) {
    const pj = db.pjs.find(p => p.id === selectedId)
    if (pj) {
      const isOwnPlayer = !isDM && currentPlayer?.id === pj.id
      return (
        <PJDetail
          pj={pj}
          notas={pj.notas ?? ''}
          isDM={isDM}
          motivoLabel="Motivación · Gremio"
          back={<button className={btnSecondary} onClick={() => setSelectedId(null)}>← Volver</button>}
          actions={
            isDM ? (
              <>
                <button className={btnSecondary} onClick={() => { remove('pjs', pj.id); setSelectedId(null) }}>Eliminar</button>
                <button className={btnSecondary} onClick={() => openForm('pjs', pj.id)}>Editar</button>
              </>
            ) : isOwnPlayer ? (
              <button className={btnSecondary} onClick={() => openForm('pjs', pj.id)}>Editar</button>
            ) : null
          }
          regionTag={<RegionTag region={pj.region} />}
          regionColor={REGION_COLOR[pj.region]}
        />
      )
    }
  }

  const visible = db.pjs.filter(p => isVisible(p, isDM, currentPlayer))
  const lista = query.trim()
    ? visible.filter(p =>
        [p.nombre, p.clase, p.raza, p.jugador].some(v =>
          (v || '').toLowerCase().includes(query.toLowerCase())
        )
      )
    : visible

  return (
    <div>
      <PageHeader eyebrow="Personajes Jugadores" title="El Grupo">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('pjs')}
          >
            + Nuevo PJ
          </button>
        )}
      </PageHeader>
      <div className="mb-5">
        <input
          className="w-full bg-bg-card border border-border-light text-txt-primary px-3.5 py-2.5 font-barlow text-[13px] outline-none transition-colors focus:border-accent-dim placeholder:text-txt-muted"
          placeholder="Buscar por nombre, clase, raza o jugador…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      {lista.length === 0 ? (
        <EmptyState
          icon={<Shield size={40} />}
          title="Sin resultados"
          text={query ? 'No hay PJs que coincidan con la búsqueda.' : 'Agregá los personajes jugadores creados en la sesión cero.'}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map(p => (
            <PJCard key={p.id} pj={p} unread={isPjUnread(p, viewerId, readState)} onClick={() => setSelectedId(p.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
