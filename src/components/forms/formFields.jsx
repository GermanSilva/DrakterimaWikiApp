import { Lock } from 'lucide-react'
import { useApp } from '../../AppContext'
import { inputCls, labelCls } from '../../constants'

export function LockIcon() {
  return <Lock size={12} className="text-accent-bright" />
}

export function FormGroup({ children, className = '' }) {
  return <div className={`mb-[18px] px-8 ${className}`}>{children}</div>
}

export function FormRow({ children }) {
  return <div className="grid grid-cols-2 gap-3.5 px-8 mb-[18px] max-md:grid-cols-1">{children}</div>
}

export function EstadoField({ estado, visibilidad, setF }) {
  const { db } = useApp()
  return (
    <FormGroup>
      <label className={labelCls}>Visibilidad</label>
      <select
        className={inputCls}
        value={estado}
        onChange={e => setF(p => ({ ...p, estado: e.target.value }))}
      >
        <option value="publicado">Publicado</option>
        <option value="secreto">Secreto (jugadores seleccionados)</option>
        <option value="borrador">Borrador (solo DM)</option>
      </select>
      {estado === 'secreto' && db.pjs.length > 0 && (
        <div className="mt-2">
          <div className="text-[12px] text-txt-muted mb-1.5">Visible para:</div>
          <div className="flex flex-col gap-1.5">
            {db.pjs.map(pj => (
              <label key={pj.id} className="flex items-center gap-2 text-[13px] cursor-pointer text-txt-primary">
                <input
                  type="checkbox"
                  checked={(visibilidad ?? []).includes(pj.id)}
                  onChange={e => {
                    const cur = visibilidad ?? []
                    const next = e.target.checked ? [...cur, pj.id] : cur.filter(id => id !== pj.id)
                    setF(p => ({ ...p, visibilidad: next }))
                  }}
                />
                {pj.nombre}{pj.jugador ? ` (${pj.jugador})` : ''}
              </label>
            ))}
          </div>
        </div>
      )}
    </FormGroup>
  )
}
