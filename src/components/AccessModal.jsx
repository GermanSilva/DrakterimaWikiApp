import { useRef, useState, useEffect } from 'react'
import DragonIcon from '../svgs/dragonIcon'
import { Eye, EyeOff } from 'lucide-react'

function EyeToggle({ show, onToggle }) {
  return (
    <button
      type="button"
      className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-txt-muted hover:text-txt-primary transition-colors p-0.5"
      onClick={onToggle}
      tabIndex={-1}
      title={show ? 'Ocultar' : 'Mostrar'}
    >
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
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
    <div
      className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center backdrop-blur-[2px]"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-bg-card border border-border-base rounded-[14px] px-8 py-9 pb-7 w-[360px] max-w-[calc(100vw-32px)] flex flex-col items-center gap-2 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        <div className="mb-1">
          <DragonIcon width={80} height={80} fill="#dc2626" />
        </div>
        <div className="font-cinzel text-[20px] text-txt-primary tracking-[0.06em]">
          Drakterima
        </div>
        <div className="text-[12px] text-txt-muted text-center mb-2 leading-relaxed">
          Ingresá tu contraseña para acceder
        </div>
        <div className="relative w-full">
          <input
            ref={inputRef}
            className="w-full bg-bg-mid border border-border-base rounded-lg text-txt-primary text-[15px] px-3.5 py-2.5 outline-none transition-colors focus:border-accent-dim mt-1 tracking-[0.1em] pr-10"
            type={showPwd ? 'text' : 'password'}
            placeholder="Contraseña"
            value={pwd}
            onChange={e => { setPwd(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAccess()}
          />
          <EyeToggle show={showPwd} onToggle={() => setShowPwd(v => !v)} />
        </div>
        {error && (
          <div className="text-[12px] text-accent self-start -mt-1">{error}</div>
        )}
        <div className="flex gap-2.5 w-full mt-2">
          <button
            className="flex-1 flex justify-center items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="flex-1 flex justify-center items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright"
            onClick={handleAccess}
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  )
}
