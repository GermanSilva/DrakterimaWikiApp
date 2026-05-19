import { useState } from 'react'
import { useApp } from '../AppContext'
import { isVisible } from '../helpers'
import { PageHeader, EmptyState } from '../components/Shared'
import { Shield } from 'lucide-react'
import PJCard from './pj/PJCard'
import PJDetail from './pj/PJDetail'

export default function PJs() {
  const { db, openForm, remove, isDM, currentPlayer } = useApp()
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')

  if (selectedId !== null) {
    const pj = db.pjs.find(p => p.id === selectedId)
    if (pj) return (
      <PJDetail
        pj={pj}
        onBack={() => setSelectedId(null)}
        onEdit={() => openForm('pjs', pj.id)}
        onDelete={() => { remove('pjs', pj.id); setSelectedId(null) }}
      />
    )
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
            <PJCard key={p.id} pj={p} onClick={() => setSelectedId(p.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
