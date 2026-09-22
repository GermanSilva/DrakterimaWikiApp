export default function UnreadDot({ unread, className = '', ...rest }) {
  if (!unread) return null
  return <span className={`unread-dot ${className}`} aria-hidden="true" {...rest} />
}
