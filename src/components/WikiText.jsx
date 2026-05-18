import { useApp } from '../AppContext'
import WikiLink from './WikiLink'
import { LETTER_COLLECTION } from './wikiHelpers'

// Re-export so consumers (pages, Dashboard) can still import from WikiText
export { COLLECTION_LETTER, LETTER_COLLECTION, findEntity } from './wikiHelpers'

/**
 * Renderiza texto con soporte de wiki-links.
 * Sintaxis válida:  [[{3P}Texto del enlace]]  (número + letra mayúscula)
 * Sintaxis inválida: [[{3}Texto]]              → muestra "[[ID incorrecto]]"
 */
export default function WikiText({ text }) {
  const { db, goToDetail } = useApp()
  if (!text) return null

  // Captura formato válido {NL} e inválido {N} (sin letra)
  const segments = text.split(/(\[\[\{\d+[A-Z]?\}[^\]]*\]\])/g)

  return (
    <>
      {segments.map((seg, i) => {
        // Formato válido: [[{3P}Texto]]
        const valid = seg.match(/^\[\[\{(\d+)([A-Z])\}([^\]]*)\]\]$/)
        if (valid) {
          const id = parseInt(valid[1], 10)
          const letter = valid[2]
          const displayText = valid[3]
          const coll = LETTER_COLLECTION[letter]
          const entity = coll ? (db[coll] || []).find(e => e.id === id) : null

          if (entity) {
            return (
              <WikiLink
                key={i}
                id={id}
                letter={letter}
                displayText={displayText}
                entity={entity}
                page={coll}
                goToDetail={goToDetail}
              />
            )
          }
          // ID no encontrado en la colección indicada
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

        // Formato inválido: [[{3}Texto]] sin letra
        const invalid = seg.match(/^\[\[\{(\d+)\}([^\]]*)\]\]$/)
        if (invalid) {
          return (
            <span
              key={i}
              className="font-mono text-[11px] text-txt-muted opacity-40 cursor-default"
              title="Formato de wiki-link inválido: falta la letra de sección"
            >
              [[ID incorrecto]]
            </span>
          )
        }

        // Texto plano con saltos de línea
        return seg.split('\n').map((line, j, arr) => (
          <span key={`${i}-${j}`}>{line}{j < arr.length - 1 ? <br /> : null}</span>
        ))
      })}
    </>
  )
}
