import Tooltip from './Tooltip'
import { clickable } from '../helpers/a11y'
import { useWikiPort } from '../ports'

/**
 * Enlace individual de wiki-link con tooltip al hover.
 * Props:
 *   id          — id numérico del artículo
 *   displayText — texto visible del enlace
 *   target      — destino resuelto por el WikiPort ({ title, section, imagenUrl, table })
 * La navegación sale del WikiPort: este componente no conoce la app anfitriona.
 */
export default function WikiLink({ id, displayText, target }) {
  const { navigate } = useWikiPort()
  return (
    <span className="group relative inline-block">
      <span
        className="text-accent-bright cursor-pointer border-b border-dashed border-accent-dim hover:text-accent hover:border-b-solid transition-colors"
        {...clickable(e => { e.stopPropagation(); navigate(target.table, id) })}
      >
        {displayText}
      </span>
      <Tooltip title={target.title} section={target.section} imagenUrl={target.imagenUrl} />
    </span>
  )
}
