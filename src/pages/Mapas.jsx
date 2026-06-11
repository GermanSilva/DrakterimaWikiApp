import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { isVisible } from '../helpers'
import MapViewer from '../components/MapViewer'
import { btnPrimary, btnSecondary, btnFilled } from '../constants'
import { Map } from 'lucide-react'

function MapCard({ mapa, onSelect }) {
  return (
    <div
      className="bg-bg-mid border border-border-base rounded cursor-pointer hover:border-accent transition-colors overflow-hidden"
      onClick={() => onSelect(mapa)}
    >
      {mapa.imagen_url
        ? <img src={mapa.imagen_url} alt={mapa.nombre} className="w-full h-32 object-cover" onError={e => e.target.style.display = 'none'} />
        : <div className="w-full h-32 bg-[#111] flex items-center justify-center text-3xl">🗺</div>
      }
      <div className="px-3 py-2">
        <div className="font-exo text-sm font-semibold text-txt-primary">{mapa.nombre}</div>
        {mapa.descripcion && <div className="text-xs text-txt-muted mt-0.5 line-clamp-1">{mapa.descripcion}</div>}
      </div>
    </div>
  )
}

export default function Mapas() {
  const { db, isDM, currentPlayer, openForm } = useApp()
  const [stack, setStack] = useState([])

  const allMapas = db.mapas ?? []
  const visibleMapas = allMapas.filter(m => isVisible(m, isDM, currentPlayer))

  useEffect(() => {
    if (stack.length > 0) return
    const def = visibleMapas.find(m => m.is_default)
    if (def) setStack([{ id: def.id, nombre: def.nombre }])
  }, [visibleMapas.length])  // eslint-disable-line

  const currentMapId = stack.length > 0 ? stack[stack.length - 1].id : null
  const activeMap = currentMapId ? visibleMapas.find(m => m.id === currentMapId) : null

  const points = (db.map_points ?? []).filter(p => p.map_id === activeMap?.id)

  function navigateTo(mapId, nombre) {
    setStack(prev => [...prev, { id: mapId, nombre }])
  }

  function onBreadcrumbClick(index) {
    setStack(prev => prev.slice(0, index + 1))
  }

  function selectMap(mapa) {
    setStack([{ id: mapa.id, nombre: mapa.nombre }])
  }

  if (!activeMap) {
    return (
      <div className="">
        <div className="flex justify-between items-center mb-6">
          <h1 className="font-exo text-2xl font-bold text-txt-primary uppercase tracking-wide flex items-center gap-2">
            <Map size={22} className="text-accent-bright" /> Mapas
          </h1>
          {isDM && (
            <button className={btnPrimary} onClick={() => openForm('mapas')}>+ Nuevo mapa</button>
          )}
        </div>
        {visibleMapas.length === 0
          ? <div className="text-txt-muted text-sm">{isDM ? 'No hay mapas. Creá el primero.' : 'No hay mapas disponibles.'}</div>
          : <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {visibleMapas.map(m => <MapCard key={m.id} mapa={m} onSelect={selectMap} />)}
          </div>
        }
      </div>
    )
  }

  return (
    <div className='-m-8' style={{ height: 'calc(100vh - 60px)', overflow: 'hidden', position: 'relative' }}>
      <MapViewer
        mapa={activeMap}
        points={points}
        isDM={isDM}
        db={db}
        currentPlayer={currentPlayer}
        onNavigateToMap={navigateTo}
        onEditMap={() => openForm('mapas', activeMap.id)}
        onAddPoint={() => { }}
        breadcrumb={stack}
        onBreadcrumbClick={onBreadcrumbClick}
      />
      {stack.length === 1 && (
        <button
          className={btnFilled + ' ' + btnSecondary}
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 900, fontSize: 11 }}
          onClick={() => setStack([])}
        >
          ← Lista de mapas
        </button>
      )}
    </div>
  )
}
