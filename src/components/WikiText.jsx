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
 */
export default function WikiText({ text }) {
  const { db, goToDetail } = useApp()
  if (!text) return null

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
                className="text-accent-bright cursor-pointer border-b border-dashed border-accent-dim hover:text-accent hover:border-b-solid transition-colors"
                onClick={e => { e.stopPropagation(); goToDetail(found.page, id) }}
                title={`Ir a: ${found.entity.nombre || found.entity.titulo || `#${id}`}`}
              >
                {displayText}
              </span>
            )
          }
          return (
            <span
              key={i}
              className="text-txt-muted border-b border-dashed border-txt-muted opacity-55 cursor-default"
              title={`Artículo #${id} no encontrado`}
            >
              {displayText}
            </span>
          )
        }
        return seg.split('\n').map((line, j, arr) => (
          <span key={`${i}-${j}`}>{line}{j < arr.length - 1 ? <br /> : null}</span>
        ))
      })}
    </>
  )
}
