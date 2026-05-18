import Tooltip from './Tooltip'
import { LETTER_COLLECTION, COLLECTION_DISPLAY } from './wikiHelpers'

/**
 * Enlace individual de wiki-link con tooltip al hover.
 * Props:
 *   id          — id numérico del artículo
 *   letter      — letra de sección ('P', 'N', 'G', etc.)
 *   displayText — texto visible del enlace
 *   entity      — objeto de la entidad destino
 *   page        — nombre de la colección ('pjs', 'lugares', etc.)
 *   goToDetail  — función de navegación del contexto
 */
export default function WikiLink({ id, letter, displayText, entity, page, goToDetail }) {
  const title = entity.nombre || entity.titulo || `#${id}`
  const section = COLLECTION_DISPLAY[LETTER_COLLECTION[letter]] || letter

  return (
    <span className="group relative inline-block">
      <span
        className="text-accent-bright cursor-pointer border-b border-dashed border-accent-dim hover:text-accent hover:border-b-solid transition-colors"
        onClick={e => { e.stopPropagation(); goToDetail(page, id) }}
      >
        {displayText}
      </span>
      <Tooltip title={title} section={section} />
    </span>
  )
}
