import { useContext } from 'react'
import { UnreadPortContext } from '../ports'

/**
 * Dot de "no leído". Dos formas de uso:
 *  - `unread` explícito (booleano ya calculado por la página);
 *  - `type` + `id` + `updatedAt` (+ `section`): lo calcula el UnreadPort de la app anfitriona.
 */
/** @param {{ unread?: boolean, type?: string, id?: number, updatedAt?: string | null, section?: string, className?: string, [k: string]: unknown }} props */
export default function UnreadDot({ unread, type, id, updatedAt, section, className = '', ...rest }) {
  const port = useContext(UnreadPortContext)
  let isUnread = unread
  if (isUnread === undefined && (type === undefined || id === undefined)) return null // nothing to ask: not unread
  if (isUnread === undefined) {
    if (!port) throw new Error('UnreadDot needs an UnreadPort provider when "unread" is not given')
    isUnread = port.isUnread(type, id, updatedAt, section)
  }
  if (!isUnread) return null
  return <span className={`unread-dot ${className}`} aria-hidden="true" {...rest} />
}
