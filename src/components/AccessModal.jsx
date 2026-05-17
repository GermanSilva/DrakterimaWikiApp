import { useRef, useState, useEffect } from 'react'
import DragonIcon from '../svgs/dragonIcon'

function EyeToggle({ show, onToggle }) {
  return (
    <button type="button" className="pwd-toggle" onClick={onToggle} tabIndex={-1} title={show ? 'Ocultar' : 'Mostrar'}>
      {show ? '🙈' : '👁'}
    </button>
  )
}

export default function AccessModal({ onClose, onAccess }) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function handleAccess() {
    const result = onAccess(pwd)
    if (!result.success) {
      setError('Contraseña incorrecta.')
      setPwd('')
      inputRef.current?.focus()
      return
    }
    onClose()
  }

  return (
    <div className="dm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dm-modal">
        <div className="dm-modal-icon">
          <DragonIcon width={150} height={150} fill="var(--accent)" />
        </div>
        <div className="dm-modal-title">Drakterima</div>
        <div className="dm-modal-subtitle">Ingresá tu contraseña para acceder</div>
        <div className="pwd-field">
          <input
            ref={inputRef}
            className="dm-modal-input"
            type={showPwd ? 'text' : 'password'}
            placeholder="Contraseña"
            value={pwd}
            onChange={e => { setPwd(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAccess()}
          />
          <EyeToggle show={showPwd} onToggle={() => setShowPwd(v => !v)} />
        </div>
        {error && <div className="dm-modal-error">{error}</div>}
        <div className="dm-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleAccess}>Entrar</button>
        </div>
      </div>
    </div>
  )
}
