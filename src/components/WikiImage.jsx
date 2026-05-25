import { useState } from 'react'

export default function WikiImage({ url }) {
  const [error, setError] = useState(false)
  if (!url) return null
  if (error) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-bright underline"
      >
        [Error al cargar imagen]
      </a>
    )
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setError(true)}
      style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
    />
  )
}
