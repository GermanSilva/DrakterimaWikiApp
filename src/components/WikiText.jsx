import { useApp } from '../AppContext'

const COLLECTIONS = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items']

function findEntity(db, id) {
  for (const coll of COLLECTIONS) {
    const entity = (db[coll] || []).find(e => e.id === id)
    if (entity) return { entity, page: coll }
  }
  return null
}

/**
 * Renderiza texto con soporte de wiki-links.
 * Sintaxis: [[{id}Texto del enlace]]
 * Ejemplo:  [[{3}Magrales del este]] → enlace clickeable al artículo con id=3
 */
export default function WikiText({ text }) {
  const { db, goToDetail } = useApp()
  if (!text) return null

  // Divide el texto en segmentos: texto plano y wiki-links [[{id}texto]]
  const segments = text.split(/(\[\[\{\d+\}[^\]]*\]\])/g)

  return (
    <>
      {segments.map((seg, i) => {
        const m = seg.match(/^\[\[\{(\d+)\}([^\]]*)\]\]$/)
        if (m) {
          const id = parseInt(m[1], 10)
          const displayText = m[2]
          const found = findEntity(db, id)
          if (found) {
            return (
              <span
                key={i}
                className="wiki-link"
                onClick={e => { e.stopPropagation(); goToDetail(found.page, id) }}
                title={`Ir a: ${found.entity.nombre || found.entity.titulo || `#${id}`}`}
              >
                {displayText}
              </span>
            )
          }
          // Artículo no encontrado o no visible
          return (
            <span key={i} className="wiki-link-broken" title={`Artículo #${id} no encontrado`}>
              {displayText}
            </span>
          )
        }
        // Texto plano — preservar saltos de línea como <br>
        return seg.split('\n').map((line, j, arr) => (
          <span key={`${i}-${j}`}>{line}{j < arr.length - 1 ? <br /> : null}</span>
        ))
      })}
    </>
  )
}
